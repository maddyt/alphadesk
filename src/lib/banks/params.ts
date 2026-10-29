// Scenario <-> URL query string, so every BankVal scenario is a shareable link.

import type { BankAssumptions } from './engine.ts';

const NUM: [keyof BankAssumptions, string][] = [
  ['roatce', 'r'],
  ['targetCet1', 'tc'],
  ['loanGrowth', 'g'],
  ['ke', 'ke'],
  ['terminalGrowth', 'gt'],
  ['rateShockBps', 'sh'],
  ['duration', 'dur'],
  ['outflowPct', 'out'],
];

const LIMITS: Partial<Record<keyof BankAssumptions, [number, number]>> = {
  roatce: [-0.1, 0.35],
  targetCet1: [0.09, 0.13],
  loanGrowth: [-0.05, 0.15],
  ke: [0.06, 0.2],
  terminalGrowth: [0, 0.05],
  rateShockBps: [-300, 500],
  duration: [1, 10],
  outflowPct: [0, 0.6],
};

export function readBankOverrides(params: Record<string, string | string[] | undefined>): Partial<BankAssumptions> {
  const out: Partial<BankAssumptions> = {};
  const get = (k: string) => {
    const raw = params[k];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  for (const [k, short] of NUM) {
    const raw = get(short);
    const v = Number(raw);
    if (raw === undefined || raw === '' || !Number.isFinite(v)) continue;
    const [lo, hi] = LIMITS[k]!;
    (out as Record<string, number>)[k] = Math.min(hi, Math.max(lo, v));
  }
  const aoci = get('aoci');
  if (aoci === '0' || aoci === '1') out.aociInCet1 = aoci === '1';
  const ex = get('ex');
  if (ex !== undefined) out.excluded = ex.split(',').filter((t) => /^[A-Z][A-Z0-9.\-]{0,5}$/.test(t)).slice(0, 40);
  return out;
}

/** Only the assumptions that differ from the defaults, as "?r=0.12&tc=0.11". */
export function bankQuery(a: BankAssumptions, d: BankAssumptions): string {
  const q = new URLSearchParams();
  for (const [k, short] of NUM) {
    const x = a[k] as number;
    if (Math.abs(x - (d[k] as number)) > 1e-9) q.set(short, String(Math.round(x * 1e6) / 1e6));
  }
  if (a.aociInCet1 !== d.aociInCet1) q.set('aoci', a.aociInCet1 ? '1' : '0');
  if ([...a.excluded].sort().join(',') !== [...d.excluded].sort().join(',')) q.set('ex', a.excluded.join(','));
  const s = q.toString();
  return s ? `?${s}` : '';
}
