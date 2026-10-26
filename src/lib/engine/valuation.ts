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
  'Public Comps (EV/EBITDA)',
  'Precedent Transactions',
  'Discounted Cash Flow',
  'LBO Floor Valuation',
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
  const f = fiveNumber(ms);
  return {
    methodology: 'Public Comps (EV/EBITDA)',
    min: f.min * b.ltmEbitda,
    p25: f.p25 * b.ltmEbitda,
    median: f.median * b.ltmEbitda,
    p75: f.p75 * b.ltmEbitda,
    max: f.max * b.ltmEbitda,
    basis: `Peer EV / ${b.ltmLabel} EBITDA multiples applied to target ${b.ltmLabel} EBITDA`,
    detail: [
      { label: '25th pct', value: mult(f.p25) },
      { label: 'Median', value: mult(f.median) },
      { label: '75th pct', value: mult(f.p75) },
      { label: 'Peers', value: String(ms.length) },
    ],
  };
}

export function precedentsRange(b: BaseInputs, a: Assumptions): MethodRange | null {
  const ms = b.peerMultiples;
  if (ms.length < 2 || !(b.ltmEbitda > 0)) return null;
  const base = [percentile(ms, 0.25), percentile(ms, 0.5), percentile(ms, 0.75)];
  const premiums = spread(a.controlPremium, 0.075, 3, 0, 0.6);
  const evs = base.flatMap((m) => premiums.map((p) => m * (1 + p) * b.ltmEbitda));
  const f = fiveNumber(evs);
  return {
    methodology: 'Precedent Transactions',
    ...f,
    basis: `Trading multiples (25th-75th pct) plus a ${pct(premiums[0], 0)}-${pct(premiums[2], 0)} control premium`,
    detail: [
      { label: 'Control premium', value: pct(a.controlPremium) },
      { label: 'Implied median', value: mult(base[1] * (1 + a.controlPremium)) },
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
  for (const lev of spread(a.lboLeverage, 0.5, 3, 1)) {
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
      basis: `Max entry price for a ${pct(a.lboTargetIrr, 0)} sponsor IRR over 5 years at ${mult(a.lboLeverage - 0.5)}-${mult(a.lboLeverage + 0.5)} Debt/EBITDA`,
      detail: [
        { label: 'Entry multiple', value: mult(base.entryMultiple) },
        { label: 'Leverage', value: mult(base.debt / b.ltmEbitda) },
        { label: 'MoIC', value: mult(base.moic) },
        { label: 'IRR', value: pct(base.irr) },
      ],
    },
  };
}

export function runValuation(b: BaseInputs, a: Assumptions): ValuationRun {
  const lbo = lboRange(b, a);
  const ranges = [range52(b), compsRange(b), precedentsRange(b, a), dcfRange(b, a), lbo?.range ?? null].filter(
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
