// Pure post-processing for Deal Room agent output: citation checks against the
// filing text, clamping of scores, the synergy phase-in schedule and cost tracking.
// The engine still owns every EPS number; agents only supply synergy estimates.

import { runDeal, type DealAssumptions, type DealCompany } from '../deals/engine.ts';
import { clamp } from '../engine/stats.ts';
import { findQuote } from './filing-text.ts';
import type { DocId, RiskOut, SynergyOut } from './schemas.ts';

export interface SourceDoc {
  text: string;
  label: string; // e.g. "AAPL 10-K"
  form: string;
  accessionNumber: string;
  filingDate: string;
  url: string;
}

export interface VerifiedCite {
  doc: DocId;
  quote: string;
  verified: boolean;
  line?: number;
  source?: Omit<SourceDoc, 'text'>;
}

export function verifyCite(c: { doc: DocId; quote: string }, docs: Partial<Record<DocId, SourceDoc>>): VerifiedCite {
  const d = docs[c.doc];
  // A quote attributed to the wrong filing still counts if it is in another one we supplied.
  const order = [c.doc, ...(Object.keys(docs) as DocId[]).filter((k) => k !== c.doc)];
  for (const k of order) {
    const doc = docs[k];
    if (!doc) continue;
    const hit = findQuote(doc.text, c.quote);
    if (hit) {
      const { text: _t, ...source } = doc;
      return { doc: k, quote: c.quote, verified: true, line: hit.line, source };
    }
  }
  if (d) {
    const { text: _t, ...source } = d;
    return { doc: c.doc, quote: c.quote, verified: false, source };
  }
  return { doc: c.doc, quote: c.quote, verified: false };
}

const level = (x: number) => Math.round(clamp(Number.isFinite(x) ? x : 3, 1, 5));

export function cleanSynergy(s: SynergyOut) {
  const costSynergies = s.costSynergies
    .filter((c) => Number.isFinite(c.runRateUsd) && c.runRateUsd > 0)
    .map((c) => {
      // Phase-in is a cumulative share of run-rate: 0-1 and never decreasing.
      const y1 = clamp(c.phaseIn.year1 || 0, 0, 1);
      const y2 = clamp(Math.max(c.phaseIn.year2 || 0, y1), 0, 1);
      const y3 = clamp(Math.max(c.phaseIn.year3 || 0, y2), 0, 1);
      return { ...c, phaseIn: { year1: y1, year2: y2, year3: y3 } };
    });
  return {
    ...s,
    costSynergies,
    revenueSynergies: s.revenueSynergies.filter((r) => Number.isFinite(r.runRateUsd) && r.runRateUsd >= 0),
    hsrRisk: { ...s.hsrRisk, score: level(s.hsrRisk.score) },
    confidence: Math.round(clamp(Number.isFinite(s.confidence) ? s.confidence : 50, 0, 100)),
  };
}

export function cleanRisk(r: RiskOut): RiskOut {
  return { ...r, risks: r.risks.map((x) => ({ ...x, likelihood: level(x.likelihood), impact: level(x.impact) })) };
}

export interface PhaseRow {
  year: 1 | 2 | 3;
  phase: number; // run-rate weighted share realised
  agentSynergies: number; // pre-tax USD from the agent's estimate
  agentAccretion: number;
  sliderSynergies: number; // the user's slider run-rate, phased the same way
  sliderAccretion: number;
}

/** Year 1-3 accretion with synergies phased in. Same engine as the sliders; only synergies change. */
export function phaseInSchedule(A: DealCompany, T: DealCompany, a: DealAssumptions, costs: { runRateUsd: number; phaseIn: { year1: number; year2: number; year3: number } }[]): PhaseRow[] {
  const total = costs.reduce((s, c) => s + c.runRateUsd, 0);
  return ([1, 2, 3] as const).map((year) => {
    const key = `year${year}` as const;
    const agentSynergies = costs.reduce((s, c) => s + c.runRateUsd * c.phaseIn[key], 0);
    const phase = total > 0 ? agentSynergies / total : [0.25, 0.6, 1][year - 1];
    const sliderSynergies = a.synergies * phase;
    return {
      year,
      phase,
      agentSynergies,
      agentAccretion: runDeal(A, T, { ...a, synergies: agentSynergies }).accretion,
      sliderSynergies,
      sliderAccretion: runDeal(A, T, { ...a, synergies: sliderSynergies }).accretion,
    };
  });
}

/** Opus-tier list price per million tokens (input, output). */
export const PRICE_PER_MTOK = { input: 4, output: 20 };

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function addUsage(u: Usage, x: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined) {
  if (!x) return u;
  u.input += x.input_tokens ?? 0;
  u.output += x.output_tokens ?? 0;
  u.cacheRead += x.cache_read_input_tokens ?? 0;
  u.cacheWrite += x.cache_creation_input_tokens ?? 0;
  return u;
}

/** Estimated USD cost: cache reads bill at 0.1x input, cache writes at 1.25x. */
export function costUsd(u: Usage): number {
  return (u.input * PRICE_PER_MTOK.input + u.cacheRead * PRICE_PER_MTOK.input * 0.1 + u.cacheWrite * PRICE_PER_MTOK.input * 1.25 + u.output * PRICE_PER_MTOK.output) / 1e6;
}
