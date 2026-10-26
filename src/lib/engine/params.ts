// Assumptions <-> URL query string, so every scenario is a shareable link and the
// tear sheet renders exactly what the workbench shows.

import type { Assumptions, AssumptionKey } from './model.ts';

export const PARAM_KEYS: Record<AssumptionKey, string> = {
  wacc: 'w',
  terminalGrowth: 'g',
  exitMultiple: 'm',
  revenueGrowth: 'rg',
  ebitMargin: 'em',
  taxRate: 'tx',
  controlPremium: 'cp',
  lboLeverage: 'lv',
  lboTargetIrr: 'irr',
  lboInterestRate: 'ir',
  riskFree: 'rf',
  erp: 'erp',
};

export function readOverrides(params: Record<string, string | string[] | undefined>): Partial<Assumptions> {
  const out: Partial<Assumptions> = {};
  for (const [k, short] of Object.entries(PARAM_KEYS) as [AssumptionKey, string][]) {
    const raw = params[short];
    const v = Number(Array.isArray(raw) ? raw[0] : raw);
    if (raw !== undefined && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function toQuery(a: Assumptions, defaults: Assumptions): string {
  const q = new URLSearchParams();
  for (const [k, short] of Object.entries(PARAM_KEYS) as [AssumptionKey, string][]) {
    if (Math.abs(a[k] - defaults[k]) > 1e-9) q.set(short, String(+a[k].toFixed(5)));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Defaults overlaid with (range-clamped) overrides, e.g. from a URL or an API request body. */
export function resolveAssumptions(defaults: Assumptions, ranges: Record<AssumptionKey, { min: number; max: number }>, overrides: Partial<Assumptions>): Assumptions {
  const out = { ...defaults };
  for (const k of Object.keys(PARAM_KEYS) as AssumptionKey[]) {
    const v = overrides[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(ranges[k].max, Math.max(ranges[k].min, v));
  }
  return out;
}
