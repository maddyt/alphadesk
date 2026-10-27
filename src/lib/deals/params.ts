// Deal assumptions <-> URL query string, so every scenario is a shareable link.

import type { DealAssumptions } from './engine.ts';
import { clamp } from '../engine/stats.ts';

const KEYS: Record<keyof DealAssumptions, string> = {
  premium: 'p',
  cashPct: 'c',
  stockPct: 's',
  debtPct: 'd',
  synergies: 'syn',
  debtRate: 'rd',
  cashRate: 'rc',
  taxRate: 't',
};

export function readDealOverrides(params: Record<string, string | string[] | undefined>): Partial<DealAssumptions> {
  const out: Partial<DealAssumptions> = {};
  for (const [k, short] of Object.entries(KEYS) as [keyof DealAssumptions, string][]) {
    const raw = params[short];
    const v = Number(Array.isArray(raw) ? raw[0] : raw);
    if (raw !== undefined && Number.isFinite(v)) out[k] = k === 'synergies' ? v * 1e6 : v;
  }
  return out;
}

export function resolveDeal(defaults: DealAssumptions, o: Partial<DealAssumptions>, synMax: number): DealAssumptions {
  const a: DealAssumptions = {
    premium: clamp(o.premium ?? defaults.premium, 0, 1),
    cashPct: clamp(o.cashPct ?? defaults.cashPct, 0, 1),
    stockPct: clamp(o.stockPct ?? defaults.stockPct, 0, 1),
    debtPct: clamp(o.debtPct ?? defaults.debtPct, 0, 1),
    synergies: clamp(o.synergies ?? defaults.synergies, 0, synMax),
    debtRate: clamp(o.debtRate ?? defaults.debtRate, 0, 0.2),
    cashRate: clamp(o.cashRate ?? defaults.cashRate, 0, 0.15),
    taxRate: clamp(o.taxRate ?? defaults.taxRate, 0, 0.4),
  };
  const sum = a.cashPct + a.stockPct + a.debtPct;
  if (Math.abs(sum - 1) > 1e-6) {
    if (sum <= 0) return { ...a, cashPct: defaults.cashPct, stockPct: defaults.stockPct, debtPct: defaults.debtPct };
    a.cashPct /= sum;
    a.stockPct /= sum;
    a.debtPct /= sum;
  }
  return a;
}

export function dealQuery(a: DealAssumptions, defaults: DealAssumptions): string {
  const q = new URLSearchParams();
  for (const [k, short] of Object.entries(KEYS) as [keyof DealAssumptions, string][]) {
    if (Math.abs(a[k] - defaults[k]) > 1e-9) q.set(short, String(k === 'synergies' ? +(a[k] / 1e6).toFixed(1) : +a[k].toFixed(4)));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
