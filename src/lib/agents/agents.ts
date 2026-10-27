import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat, betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { MODEL } from '../ai/memo.ts';
import type { FactEntry } from '../ai/facts.ts';
import type { DealCompany } from '../deals/engine.ts';
import type { FilingDoc } from '../sec/documents.ts';
import { SEC_TOOLS, type SecTool } from '../mcp/tools.ts';
import { extractItem, extractSegmentNote } from './filing-text.ts';
import { AuditSchema, RiskSchema, SynergySchema } from './schemas.ts';
import { addUsage, type Usage } from './verify.ts';

// The three Deal Room agents. Claude reads and judges; the deterministic engine
// still computes every EPS figure, and every quote is checked against the filing.

export type Mode = 'whole' | 'focused';

const BASE = () => ({
  model: MODEL,
  betas: ['server-side-fallback-2026-07-01' as const],
  fallbacks: 'default' as const,
});

/** Characters of filing text per document sent to the synergy agent. */
export const DOC_CAP = { whole: 700_000, focused: 140_000 };

async function parse<S extends z.ZodType>(client: Anthropic, usage: Usage, schema: S, effort: 'low' | 'medium' | 'high', system: string, content: string, max = 16_000): Promise<z.infer<S>> {
  const res = await client.beta.messages.parse({
    ...BASE(),
    max_tokens: max,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content }],
  });
  addUsage(usage, res.usage);
  if (res.stop_reason === 'refusal') throw new Error('The model declined this request.');
  if (!res.parsed_output) throw new Error(`No structured output (stop reason: ${res.stop_reason}).`);
  return res.parsed_output as z.infer<S>;
}

// ------------------------------------------------------------------ Model Audit

function provenance(c: DealCompany) {
  return Object.fromEntries(
    Object.entries(c.audit)
      .filter(([, it]) => it)
      .map(([k, it]) => [k, { value: it!.value, formula: it!.formula ?? null, tags: it!.facts.map((f) => `${f.taxonomy}:${f.tag} ${f.form ?? ''} ${f.start ?? ''}..${f.end} filed ${f.filed}`) }]),
  );
}

export function auditAgent(client: Anthropic, usage: Usage, ctx: { A: DealCompany; T: DealCompany; facts: FactEntry[]; warnings: string[] }) {
  const sheet = ctx.facts.map(({ id, label, display }) => ({ id, label, display }));
  const company = (c: DealCompany) => ({
    ticker: c.ticker,
    name: c.name,
    accounting: c.accounting,
    ltmLabel: c.ltmLabel,
    price: { value: c.price, source: c.priceSource, asOf: c.priceAsOf },
    taxRate: c.taxRate,
    ebitdaReported: c.ebitdaReported,
    leaseAdjustment: c.leaseAdjustment,
    xbrl: provenance(c),
  });
  return parse(
    client,
    usage,
    AuditSchema,
    'low',
    `You are a valuation-model reviewer at an investment bank. Audit the inputs of an accretion/dilution model built from SEC XBRL data before it goes to a managing director.
Look for: stale or mismatched periods, derived figures (formula) that may double count, negative or implausible EBITDA, tax rates outside 0-35%, share counts that look like ADS vs ordinary shares, foreign-currency conversion, IFRS 16 lease effects, leverage above 4x, and anything in the engine warnings.
Refer to figures by their fact-sheet id in factIds. Do not compute new numbers. Be concise; "clean" is a valid verdict.`,
    `Acquirer:\n${JSON.stringify(company(ctx.A))}\n\nTarget:\n${JSON.stringify(company(ctx.T))}\n\nEngine fact sheet:\n${JSON.stringify(sheet)}\n\nEngine warnings:\n${JSON.stringify(ctx.warnings)}`,
    8_000,
  );
}

// --------------------------------------------------------- Synergy & Market

function docBody(doc: FilingDoc, mode: Mode): string {
  if (mode === 'whole') return doc.text.slice(0, DOC_CAP.whole);
  const parts = [extractItem(doc.text, doc.form, 'business'), extractItem(doc.text, doc.form, 'mdna'), extractSegmentNote(doc.text)]
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => s.text.slice(0, DOC_CAP.focused / 3));
  return parts.length ? parts.join('\n\n[...]\n\n') : doc.text.slice(0, DOC_CAP.focused);
}

export function synergyInputChars(docs: (FilingDoc | null)[], mode: Mode) {
  return docs.reduce((s, d) => s + (d ? docBody(d, mode).length : 0), 0);
}

export function synergyAgent(
  client: Anthropic,
  usage: Usage,
  ctx: { A: DealCompany; T: DealCompany; facts: FactEntry[]; acquirerDoc: FilingDoc | null; targetDoc: FilingDoc | null; segments: unknown; mode: Mode },
) {
  const wrap = (id: string, d: FilingDoc | null, who: DealCompany) =>
    d ? `<document id="${id}" company="${who.ticker}" form="${d.form}" accession="${d.accessionNumber}" filed="${d.filingDate}">\n${docBody(d, ctx.mode)}\n</document>` : `<document id="${id}" company="${who.ticker}">(filing text unavailable)</document>`;
  const sheet = ctx.facts.map(({ id, label, display }) => ({ id, label, display }));
  return parse(
    client,
    usage,
    SynergySchema,
    'medium',
    `You are an M&A integration specialist sizing synergies for a hypothetical acquisition, working from the two companies' latest annual reports.
- Size cost synergies bottom-up from cost bases disclosed in the filings (SG&A, R&D, cost of sales, facilities, headcount). Typical cost synergies are 2-8% of the target's addressable cost base; justify anything higher.
- Revenue synergies only where the filings show a clear cross-sell or channel fit; keep them conservative.
- phaseIn is the cumulative share of run-rate achieved in each of the first three years (e.g. 0.3, 0.7, 1.0).
- Every cite.quote MUST be copied verbatim from the document you name (acquirer_annual or target_annual). Quotes are machine-checked against the filing; paraphrases fail.
- HSR / antitrust risk reflects horizontal overlap in products and regions.
- Figures in USD. Hypothetical analysis only, no recommendation.`,
    `Deal: ${ctx.A.name} (${ctx.A.ticker}) acquires ${ctx.T.name} (${ctx.T.ticker}).\n\nEngine fact sheet:\n${JSON.stringify(sheet)}\n\nXBRL segment data:\n${JSON.stringify(ctx.segments)}\n\n${wrap('acquirer_annual', ctx.acquirerDoc, ctx.A)}\n\n${wrap('target_annual', ctx.targetDoc, ctx.T)}`,
    24_000,
  );
}

// ---------------------------------------------------------- Risk & Governance

export interface ToolCall {
  name: string;
  input: unknown;
  ms: number;
  chars: number;
  ok: boolean;
}

export async function riskAgent(
  client: Anthropic,
  usage: Usage,
  ctx: { A: DealCompany; T: DealCompany; parachutes: unknown; onTool: (c: ToolCall) => void },
): Promise<{ out: z.infer<typeof RiskSchema>; transcript: string }> {
  const log: string[] = [];
  const tools = (SEC_TOOLS as readonly SecTool[]).map((t) =>
    betaZodTool({
      name: t.name,
      description: t.description,
      inputSchema: t.schema,
      run: async (input: unknown) => {
        const t0 = Date.now();
        try {
          const text = await t.run(input);
          const clipped = text.slice(0, 40_000);
          log.push(`### ${t.name} ${JSON.stringify(input)}\n${clipped}`);
          ctx.onTool({ name: t.name, input, ms: Date.now() - t0, chars: text.length, ok: true });
          return clipped;
        } catch (e) {
          ctx.onTool({ name: t.name, input, ms: Date.now() - t0, chars: 0, ok: false });
          return `Tool error: ${(e as Error).message}`;
        }
      },
    }),
  );

  const runner = client.beta.messages.toolRunner({
    ...BASE(),
    max_tokens: 16_000,
    max_iterations: 10,
    output_config: { effort: 'medium' },
    tools,
    system: `You are a deal-risk analyst with read-only SEC EDGAR tools. Investigate ${ctx.T.ticker} as an acquisition target for ${ctx.A.ticker}.
Use the tools before concluding: check governance flags (restatements, auditor changes), insider activity, 13D/13G holders, the target's risk factors (read_filing_section risk_factors) and, where a proxy exists, change-in-control terms. Search the filings for antitrust, litigation and regulatory exposure. Make roughly 5-8 tool calls, then write your findings as notes, quoting key passages verbatim.`,
    messages: [{ role: 'user', content: `Investigate deal risks for ${ctx.A.name} (${ctx.A.ticker}) acquiring ${ctx.T.name} (${ctx.T.ticker}).` }],
  });
  let notes = '';
  for await (const msg of runner) {
    addUsage(usage, msg.usage);
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    if (text) notes = text;
  }
  const transcript = log.join('\n\n');

  const out = await parse(
    client,
    usage,
    RiskSchema,
    'medium',
    `Turn a deal-risk investigation into a structured risk register.
- likelihood and impact are 1-5. Rank the 5-8 most important risks.
- cite.quote must be copied verbatim from the tool results below; use doc "tool" (or target_annual / target_proxy when the passage came from read_filing_section or search_filing on that filing). Quotes are machine-checked.
- governance: 3-5 items (restatements, auditor, insider selling, activists, golden parachutes) with a RAG rating.`,
    `Deal: ${ctx.A.ticker} acquires ${ctx.T.ticker}.\n\nAnalyst notes:\n${notes}\n\nGolden-parachute extraction from the proxy (figures verified against the filing):\n${JSON.stringify(ctx.parachutes)}\n\nTool results:\n${transcript.slice(0, 300_000)}`,
    12_000,
  );
  return { out, transcript };
}
