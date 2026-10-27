import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { MODEL } from '../ai/memo.ts';
import { extractParachutes, type ProxyResult } from '../ai/proxy.ts';
import { cacheGet, cachePut } from '../data/cache.ts';
import { getIntel } from '../data/intel.ts';
import { normalizeTicker } from '../data/dataset.ts';
import { hasResults, type SavedRun } from './room-state.ts';
import { buildDealFacts } from '../deals/facts.ts';
import { readDealOverrides } from '../deals/params.ts';
import { dealRun } from '../deals/run.ts';
import { getFilingDoc, type FilingDoc } from '../sec/documents.ts';
import { auditAgent, riskAgent, synergyAgent, synergyInputChars, type Mode, type ToolCall } from './agents.ts';
import { estimateTokens } from './filing-text.ts';
import type { AuditOut, DocId, RiskOut } from './schemas.ts';
import { cleanRisk, cleanSynergy, costUsd, emptyUsage, phaseInSchedule, PRICE_PER_MTOK, verifyCite, type PhaseRow, type SourceDoc, type Usage, type VerifiedCite } from './verify.ts';

// Deal Room orchestrator: three Claude agents in parallel, streamed to the browser
// as NDJSON events. Results are cached for 24 hours per deal, scenario and mode.

export type AgentId = 'audit' | 'synergy' | 'risk';

export type SynergyReport = Omit<ReturnType<typeof cleanSynergy>, 'costSynergies' | 'revenueSynergies'> & {
  costSynergies: (ReturnType<typeof cleanSynergy>['costSynergies'][number] & { cite: VerifiedCite })[];
  revenueSynergies: (ReturnType<typeof cleanSynergy>['revenueSynergies'][number] & { cite: VerifiedCite })[];
  totalCost: number;
  totalRevenue: number;
};
export type RiskReport = Omit<RiskOut, 'risks'> & { risks: (RiskOut['risks'][number] & { cite: VerifiedCite })[]; parachutes: ProxyResult | null };

export type RoomEvent =
  | { type: 'needs_key'; message: string }
  | { type: 'start'; mode: Mode; cached: boolean; acquirer: string; target: string; docs: { id: DocId; label: string; form: string; accessionNumber: string; filingDate: string; url: string; chars: number }[]; estimate: { inputTokens: number; costUsd: number } }
  | { type: 'agent'; agent: AgentId; status: 'running' | 'done' | 'error'; message?: string; ms?: number }
  | { type: 'tool'; agent: AgentId; call: ToolCall }
  | { type: 'audit'; data: AuditOut }
  | { type: 'synergy'; data: SynergyReport; phase: PhaseRow[] }
  | { type: 'risk'; data: RiskReport }
  | { type: 'usage'; usage: Usage; costUsd: number; model: string }
  | { type: 'done'; ms: number }
  | { type: 'error'; message: string };

const TTL = 24 * 3600_000;
const SAVED_TTL = 30 * 24 * 3600_000;
const latestKey = (a: string, t: string) => `room:latest:${a}:${t}`;

/** The most recent saved Deal Room run for a pair (memory, or Supabase feed_cache when configured). */
export async function latestRun(acquirer: string, target: string): Promise<SavedRun | null> {
  return (await cacheGet<SavedRun>(latestKey(normalizeTicker(acquirer), normalizeTicker(target)), SAVED_TTL)) ?? null;
}

function sourceDoc(d: FilingDoc | null, label: string): SourceDoc | undefined {
  return d ? { text: d.text, label, form: d.form, accessionNumber: d.accessionNumber, filingDate: d.filingDate, url: d.url } : undefined;
}

export async function* runDealRoom(input: { acquirer: string; target: string; query: string; mode: Mode; refresh?: boolean }): AsyncGenerator<RoomEvent> {
  const t0 = Date.now();
  if (!process.env.ANTHROPIC_API_KEY) {
    yield { type: 'needs_key', message: 'The AI Deal Room runs Claude agents. Add ANTHROPIC_API_KEY to the Vercel project (Settings → Environment Variables) and redeploy.' };
    return;
  }
  const q = Object.fromEntries(new URLSearchParams(input.query));
  const d = await dealRun(input.acquirer, input.target, readDealOverrides(q));
  const key = `room:v1:${d.A.ticker}:${d.T.ticker}:${input.mode}:${createHash('sha1').update(new URLSearchParams(q).toString()).digest('hex').slice(0, 10)}`;

  if (!input.refresh) {
    const hit = await cacheGet<RoomEvent[]>(key, TTL);
    if (hit) {
      for (const e of hit) yield e.type === 'start' ? { ...e, cached: true } : e;
      return;
    }
  }

  const facts = buildDealFacts(d.A, d.T, d.a, d.r);
  const [acqDoc, tgtDoc, tgtProxy, acqIntel, tgtIntel] = await Promise.all([
    getFilingDoc(d.A.ticker, 'annual_report').catch(() => null),
    getFilingDoc(d.T.ticker, 'annual_report').catch(() => null),
    getFilingDoc(d.T.ticker, 'proxy').catch(() => null),
    getIntel(d.A.ticker).catch(() => null),
    getIntel(d.T.ticker).catch(() => null),
  ]);
  const docs: Partial<Record<DocId, SourceDoc>> = {
    acquirer_annual: sourceDoc(acqDoc, `${d.A.ticker} ${acqDoc?.form}`),
    target_annual: sourceDoc(tgtDoc, `${d.T.ticker} ${tgtDoc?.form}`),
    target_proxy: sourceDoc(tgtProxy, `${d.T.ticker} DEF 14A`),
  };

  const synChars = synergyInputChars([acqDoc, tgtDoc], input.mode);
  const estTokens = estimateTokens(synChars) + 60_000; // + audit, risk tool loop and synthesis
  const log: RoomEvent[] = [];
  const queue: RoomEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (e: RoomEvent) => {
    log.push(e);
    queue.push(e);
    wake?.();
  };

  emit({
    type: 'start',
    mode: input.mode,
    cached: false,
    acquirer: d.A.ticker,
    target: d.T.ticker,
    docs: (Object.entries(docs) as [DocId, SourceDoc | undefined][]).filter(([, v]) => v).map(([id, v]) => ({ id, label: v!.label, form: v!.form, accessionNumber: v!.accessionNumber, filingDate: v!.filingDate, url: v!.url, chars: v!.text.length })),
    estimate: { inputTokens: estTokens, costUsd: (estTokens * PRICE_PER_MTOK.input + 30_000 * PRICE_PER_MTOK.output) / 1e6 },
  });

  const client = new Anthropic({ maxRetries: 2, timeout: 280_000 });
  const usage = emptyUsage();
  const failed: string[] = [];
  const agent = async (id: AgentId, work: () => Promise<void>) => {
    const s = Date.now();
    emit({ type: 'agent', agent: id, status: 'running' });
    try {
      await work();
      emit({ type: 'agent', agent: id, status: 'done', ms: Date.now() - s });
    } catch (e) {
      failed.push(id);
      const message = e instanceof Anthropic.APIError ? `Claude API error ${e.status}: ${e.message}` : (e as Error).message;
      emit({ type: 'agent', agent: id, status: 'error', message, ms: Date.now() - s });
    }
  };

  const all = Promise.all([
    agent('audit', async () => {
      emit({ type: 'audit', data: await auditAgent(client, usage, { A: d.A, T: d.T, facts, warnings: d.warnings }) });
    }),
    agent('synergy', async () => {
      const raw = cleanSynergy(await synergyAgent(client, usage, { A: d.A, T: d.T, facts, acquirerDoc: acqDoc, targetDoc: tgtDoc, segments: { acquirer: acqIntel?.segments, target: tgtIntel?.segments }, mode: input.mode }));
      const data: SynergyReport = {
        ...raw,
        costSynergies: raw.costSynergies.map((c) => ({ ...c, cite: verifyCite(c.cite, docs) })),
        revenueSynergies: raw.revenueSynergies.map((c) => ({ ...c, cite: verifyCite(c.cite, docs) })),
        totalCost: raw.costSynergies.reduce((s, c) => s + c.runRateUsd, 0),
        totalRevenue: raw.revenueSynergies.reduce((s, c) => s + c.runRateUsd, 0),
      };
      emit({ type: 'synergy', data, phase: phaseInSchedule(d.A, d.T, d.a, raw.costSynergies) });
    }),
    agent('risk', async () => {
      let parachutes: ProxyResult | null = null;
      if (tgtIntel?.proxy) {
        const s = Date.now();
        parachutes = await extractParachutes(tgtIntel.proxy).catch(() => null);
        emit({ type: 'tool', agent: 'risk', call: { name: 'extract_golden_parachutes', input: { ticker: d.T.ticker }, ms: Date.now() - s, chars: 0, ok: parachutes?.status === 'ok' } });
      }
      const { out, transcript } = await riskAgent(client, usage, { A: d.A, T: d.T, parachutes, onTool: (call) => emit({ type: 'tool', agent: 'risk', call }) });
      const withTool = { ...docs, tool: { text: transcript, label: 'SEC EDGAR tool results', form: 'MCP', accessionNumber: '', filingDate: '', url: '' } };
      const risk = cleanRisk(out);
      emit({ type: 'risk', data: { ...risk, risks: risk.risks.map((r) => ({ ...r, cite: verifyCite(r.cite, withTool) })), parachutes } });
    }),
  ]).then(() => {
    // Parachute extraction runs its own Claude call; its usage is not itemised here.
    emit({ type: 'usage', usage, costUsd: costUsd(usage), model: MODEL });
    emit({ type: 'done', ms: Date.now() - t0 });
  });

  let finished = false;
  all.finally(() => {
    finished = true;
    wake?.();
  });
  while (true) {
    while (queue.length) yield queue.shift()!;
    if (finished) break;
    await new Promise<void>((r) => (wake = r));
    wake = null;
  }
  // Keep every run that produced something, even if one agent failed, so it can be exported.
  if (hasResults(log)) await cachePut<SavedRun>(latestKey(d.A.ticker, d.T.ticker), { v: 1, acquirer: d.A.ticker, target: d.T.ticker, query: input.query, mode: input.mode, savedAt: new Date().toISOString(), events: log });
  if (!failed.length) await cachePut(key, log);
}

