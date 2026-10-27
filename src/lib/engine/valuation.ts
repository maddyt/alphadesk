// Runs the five methodologies and reduces each to a five-number EV summary
// (min / 25th / median / 75th / max) for the football field.

import type { Assumptions, BaseInputs, DcfResult } from './model.ts';
import { dcf, evToPrice, priceToEv } from './model.ts';
import type { LboResult } from './lbo.ts';
import { solveLboFloor } from './lbo.ts';
import type { FiveNumber } from './stats.ts';
import { clamp, fiveNumber, percentile } from './stats.ts';

export const METHODOLOGIES = [
  '52-Week Range',
  'Public Comps (EV/EBITDA & EV/Revenue)',
  'Precedent Transactions',
  'Discounted Cash Flow',
  'LBO Floor Valuation',
  'Sum-of-the-Parts',
] as const;

export type Methodology = (typeof METHODOLOGIES)[number];

export interface MethodRange extends FiveNumber {
  methodology: Methodology;
  /** What the range is made of, for tooltips and the tear-sheet footnotes. */
  basis: string;
  /** Inputs behind each statistic, in display units (multiples, %, $). */
  detail: { label: string; value: string }[];
}

export interface ValuationRun {
  ranges: MethodRange[];
  dcf: DcfResult;
  lbo: LboResult | null;
  currentEV: number;
  currentPrice: number;
  /** Blended "point" estimate: median of the methodology medians. */
  compositeEV: number;
  compositePrice: number;
  axis: { min: number; max: number };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const mult = (x: number) => `${x.toFixed(1)}x`;

function spread(center: number, step: number, n: number, lo = -Infinity, hi = Infinity): number[] {
  const half = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => clamp(center + (i - half) * step, lo, hi));
}

export function range52(b: BaseInputs): MethodRange {
  const m = b.market52;
  const toEv = (p: number) => priceToEv(b, p);
  return {
    methodology: '52-Week Range',
    min: toEv(m.low),
    p25: toEv(m.p25),
    median: toEv(m.median),
    p75: toEv(m.p75),
    max: toEv(m.high),
    basis: 'Trailing 52-week closing prices x shares outstanding + net debt',
    detail: [
      { label: '52W low', value: `$${m.low.toFixed(2)}` },
      { label: 'Median close', value: `$${m.median.toFixed(2)}` },
      { label: '52W high', value: `$${m.high.toFixed(2)}` },
    ],
  };
}

export function compsRange(b: BaseInputs): MethodRange | null {
  const ms = b.peerMultiples;
  if (ms.length < 2 || !(b.ltmEbitda > 0)) return null;
  // PRD v2: 25th / median / 75th percentile of both EV/EBITDA and EV/Revenue, applied to the target.
  const fe = fiveNumber(ms);
  const evs = [fe.min, fe.p25, fe.median, fe.p75, fe.max].map((m) => m * b.ltmEbitda);
  const rs = b.peerRevMultiples;
  const fr = rs.length >= 2 ? fiveNumber(rs) : null;
  if (fr) evs.push(...[fr.min, fr.p25, fr.median, fr.p75, fr.max].map((m) => m * b.ltmRevenue));
  const f = fiveNumber(evs);
  return {
    methodology: 'Public Comps (EV/EBITDA & EV/Revenue)',
    ...f,
    basis: `Peer EV/${b.ltmLabel} EBITDA${fr ? ' and EV/revenue' : ''} percentiles applied to the target's ${b.ltmLabel} figures`,
    detail: [
      { label: 'EV/EBITDA median', value: mult(fe.median) },
      ...(fr ? [{ label: 'EV/Revenue median', value: mult(fr.median) }] : []),
      { label: 'Peers', value: String(ms.length) },
    ],
  };
}

export function precedentsRange(b: BaseInputs, a: Assumptions): MethodRange | null {
  const ms = b.peerMultiples;
  if (ms.length < 2 || !(b.ltmEbitda > 0)) return null;
  const base = [percentile(ms, 0.25), percentile(ms, 0.5), percentile(ms, 0.75)];
  const premiums = spread(a.controlPremium, 0.075, 3, 0, 0.6);
  // Change-of-control payouts (from the proxy) are a cost to the acquirer, so they come off what it can pay.
  const evs = base.flatMap((m) => premiums.map((p) => m * (1 + p) * b.ltmEbitda - a.cocCost));
  const f = fiveNumber(evs);
  return {
    methodology: 'Precedent Transactions',
    ...f,
    basis: `Trading multiples (25th-75th pct) plus a ${pct(premiums[0], 0)}-${pct(premiums[2], 0)} control premium`,
    detail: [
      { label: 'Control premium', value: pct(a.controlPremium) },
      { label: 'Implied median', value: mult(base[1] * (1 + a.controlPremium)) },
      ...(a.cocCost > 0 ? [{ label: 'Less CoC payouts', value: `$${(a.cocCost / 1e6).toFixed(0)}M` }] : []),
    ],
  };
}

export function dcfRange(b: BaseInputs, a: Assumptions): MethodRange {
  const waccs = spread(a.wacc, 0.005, 5, 0.03);
  const gs = spread(a.terminalGrowth, 0.005, 3, 0, 0.05);
  const ms = spread(a.exitMultiple, 1, 3, 1);
  const evs: number[] = [];
  for (const w of waccs) {
    for (const g of gs) evs.push(dcf(b, a, w, g).evGordon);
    for (const m of ms) evs.push(dcf(b, a, w, a.terminalGrowth, m).evExit);
  }
  const f = fiveNumber(evs);
  return {
    methodology: 'Discounted Cash Flow',
    ...f,
    basis: `5-year unlevered FCF; WACC ${pct(waccs[0])}-${pct(waccs[4])}, perpetuity growth ${pct(gs[0])}-${pct(gs[2])} and exit ${mult(ms[0])}-${mult(ms[2])}`,
    detail: [
      { label: 'WACC', value: pct(a.wacc, 2) },
      { label: 'Terminal growth', value: pct(a.terminalGrowth, 2) },
      { label: 'Exit multiple', value: mult(a.exitMultiple) },
    ],
  };
}

export function lboRange(b: BaseInputs, a: Assumptions): { range: MethodRange; base: LboResult } | null {
  const base = solveLboFloor(b, a);
  if (!base) return null;
  const evs: number[] = [];
  for (const lev of spread(a.lboLeverage, 0.05, 3, 0.1, 0.9)) {
    for (const exit of spread(a.exitMultiple, 1, 3, 1)) {
      const r = solveLboFloor(b, a, lev, exit);
      if (r) evs.push(r.entryEv);
    }
  }
  const f = fiveNumber(evs);
  return {
    base,
    range: {
      methodology: 'LBO Floor Valuation',
      ...f,
      basis: `Max entry price for a ${pct(a.lboTargetIrr, 0)} sponsor IRR over 5 years with debt funding ${pct(a.lboLeverage - 0.05, 0)}-${pct(a.lboLeverage + 0.05, 0)} of the price`,
      detail: [
        { label: 'Entry multiple', value: mult(base.entryMultiple) },
        { label: 'Debt / price', value: pct(base.leverage, 0) },
        { label: 'Debt / EBITDA', value: mult(base.debt / b.ltmEbitda) },
        { label: 'MoIC', value: mult(base.moic) },
        { label: 'IRR', value: pct(base.irr) },
      ],
    },
  };
}

export interface SotpLine {
  label: string;
  revenue: number;
  multiple: number; // EV / revenue applied to this segment
}

export interface SotpInput {
  axisLabel: string;
  fyLabel: string;
  lines: SotpLine[];
}

/**
 * Sum-of-the-parts (PRD v2 appendix A): each segment's revenue x its own EV/revenue
 * multiple. The range flexes every multiple by -20% / -10% / 0 / +10% / +20%.
 */
export function sotpRange(s: SotpInput): MethodRange | null {
  const lines = s.lines.filter((l) => l.revenue > 0 && l.multiple > 0);
  if (lines.length < 2) return null;
  const at = (k: number) => lines.reduce((sum, l) => sum + l.revenue * l.multiple * k, 0);
  const top = [...lines].sort((x, y) => y.revenue * y.multiple - x.revenue * x.multiple).slice(0, 3);
  return {
    methodology: 'Sum-of-the-Parts',
    min: at(0.8),
    p25: at(0.9),
    median: at(1),
    p75: at(1.1),
    max: at(1.2),
    basis: `${s.fyLabel} revenue by ${s.axisLabel} (10-K XBRL) x segment EV/revenue multiples, flexed +/-20%`,
    detail: top.map((l) => ({ label: l.label, value: `${mult(l.multiple)} → $${((l.revenue * l.multiple) / 1e9).toFixed(0)}B` })),
  };
}

export function runValuation(b: BaseInputs, a: Assumptions, sotp?: SotpInput | null): ValuationRun {
  const lbo = lboRange(b, a);
  const ranges = [range52(b), compsRange(b), precedentsRange(b, a), dcfRange(b, a), lbo?.range ?? null, sotp ? sotpRange(sotp) : null].filter(
    (r): r is MethodRange => r !== null && Number.isFinite(r.min) && Number.isFinite(r.max),
  );
  const compositeEV = percentile(
    ranges.map((r) => r.median),
    0.5,
  );
  const lo = Math.min(b.currentEV, ...ranges.map((r) => r.min));
  const hi = Math.max(b.currentEV, ...ranges.map((r) => r.max));
  return {
    ranges,
    dcf: dcf(b, a),
    lbo: lbo?.base ?? null,
    currentEV: b.currentEV,
    currentPrice: b.price,
    compositeEV,
    compositePrice: evToPrice(b, compositeEV),
    axis: { min: lo, max: hi },
  };
}

export interface SensitivityGrid {
  rowLabel: string;
  colLabel: string;
  rows: number[];
  cols: number[];
  /** Implied share price per cell. */
  values: number[][];
}

export function sensitivityWaccGrowth(b: BaseInputs, a: Assumptions): SensitivityGrid {
  const rows = spread(a.wacc, 0.005, 5, 0.03);
  const cols = spread(a.terminalGrowth, 0.005, 5, 0, 0.05);
  return {
    rowLabel: 'WACC',
    colLabel: 'Perpetuity growth',
    rows,
    cols,
    values: rows.map((w) => cols.map((g) => evToPrice(b, dcf(b, a, w, g).evGordon))),
  };
}

export function sensitivityWaccExit(b: BaseInputs, a: Assumptions): SensitivityGrid {
  const rows = spread(a.wacc, 0.005, 5, 0.03);
  const cols = spread(a.exitMultiple, 1, 5, 1);
  return {
    rowLabel: 'WACC',
    colLabel: 'Exit EV/EBITDA',
    rows,
    cols,
    values: rows.map((w) => cols.map((m) => evToPrice(b, dcf(b, a, w, a.terminalGrowth, m).evExit))),
  };
}
