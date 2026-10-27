// The "fact sheet": every number the AI memo is allowed to use, computed by the
// deterministic engine. The model receives only these figures and must cite them
// by id; the verifier then checks every number in the prose against this list.

import type { Assumptions, BaseInputs, WaccBuild } from '../engine/model.ts';
import { evToPrice } from '../engine/model.ts';
import type { ValuationRun } from '../engine/valuation.ts';

export type Unit = 'usd' | 'usd_ps' | 'pct' | 'x' | 'num';

export interface FactEntry {
  id: string;
  label: string;
  value: number;
  unit: Unit;
  display: string;
}

export function show(v: number, unit: Unit, digits = 1): string {
  switch (unit) {
    case 'usd': {
      const a = Math.abs(v);
      const s = v < 0 ? '-' : '';
      return a >= 1e12 ? `${s}$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${s}$${(a / 1e9).toFixed(1)}B` : `${s}$${(a / 1e6).toFixed(0)}M`;
    }
    case 'usd_ps':
      return `$${v.toFixed(2)}`;
    case 'pct':
      return `${(v * 100).toFixed(digits)}%`;
    case 'x':
      return `${v.toFixed(1)}x`;
    case 'num':
      return v.toFixed(2);
  }
}

const SLUG: Record<string, string> = {
  '52-Week Range': 'w52',
  'Public Comps (EV/EBITDA)': 'comps',
  'Precedent Transactions': 'precedents',
  'Discounted Cash Flow': 'dcf',
  'LBO Floor Valuation': 'lbo',
};

export function buildFactSheet(b: BaseInputs, a: Assumptions, run: ValuationRun, wacc: WaccBuild): FactEntry[] {
  const f: FactEntry[] = [];
  const add = (id: string, label: string, value: number, unit: Unit, digits = 1) => {
    if (Number.isFinite(value)) f.push({ id, label, value, unit, display: show(value, unit, digits) });
  };
  add('price', 'Current share price', b.price, 'usd_ps');
  add('market_cap', 'Market capitalization', b.marketCap, 'usd');
  add('current_ev', 'Current enterprise value', b.currentEV, 'usd');
  add('net_debt', 'Net debt (negative = net cash)', b.netDebt, 'usd');
  add('ltm_revenue', `${b.ltmLabel} revenue`, b.ltmRevenue, 'usd');
  add('ltm_ebitda', `${b.ltmLabel} EBITDA`, b.ltmEbitda, 'usd');
  add('ltm_ebitda_margin', `${b.ltmLabel} EBITDA margin`, b.ltmEbitda / b.ltmRevenue, 'pct');
  add('current_ev_ebitda', 'Current EV / LTM EBITDA', b.currentEV / b.ltmEbitda, 'x');
  add('base_revenue', `${b.baseLabel} revenue`, b.revenue0, 'usd');
  add('base_ebit_margin', `${b.baseLabel} EBIT margin`, b.ebitMargin0, 'pct');
  add('hist_growth', 'Blended historical revenue growth', b.histGrowth, 'pct');
  add('beta', 'Levered beta', b.beta, 'num');
  add('wacc_computed', 'Computed WACC', wacc.wacc, 'pct', 2);
  add('cost_of_equity', 'Cost of equity', wacc.costOfEquity, 'pct', 2);
  add('wacc', 'WACC used', a.wacc, 'pct', 2);
  add('terminal_growth', 'Perpetuity growth rate', a.terminalGrowth, 'pct', 2);
  add('exit_multiple', 'Exit EV/EBITDA multiple', a.exitMultiple, 'x');
  add('revenue_growth_y1', 'Year-1 revenue growth assumption', a.revenueGrowth, 'pct');
  add('ebit_margin', 'EBIT margin assumption', a.ebitMargin, 'pct');
  add('control_premium', 'Control premium', a.controlPremium, 'pct');
  add('lbo_leverage', 'LBO leverage (Debt/EBITDA)', a.lboLeverage, 'x');
  add('lbo_target_irr', 'Sponsor target IRR', a.lboTargetIrr, 'pct');
  add('composite_ev', 'Composite EV (median of methodology medians)', run.compositeEV, 'usd');
  add('composite_price', 'Composite implied share price', run.compositePrice, 'usd_ps');
  add('composite_vs_price', 'Composite implied price vs current price', run.compositePrice / b.price - 1, 'pct');
  add('dcf_tv_share', 'Terminal value share of DCF EV (perpetuity)', run.dcf.pvTvGordon / run.dcf.evGordon, 'pct');
  add('dcf_implied_exit', 'Exit multiple implied by perpetuity method', run.dcf.impliedExitMultiple, 'x');
  if (run.lbo) {
    add('lbo_entry_multiple', 'LBO max entry multiple', run.lbo.entryMultiple, 'x');
    add('lbo_moic', 'LBO MoIC', run.lbo.moic, 'x');
  }
  if (b.peerMultiples.length) {
    const sorted = [...b.peerMultiples].sort((x, y) => x - y);
    add('peer_min_multiple', 'Lowest peer EV/EBITDA', sorted[0], 'x');
    add('peer_max_multiple', 'Highest peer EV/EBITDA', sorted[sorted.length - 1], 'x');
  }
  for (const r of run.ranges) {
    const s = SLUG[r.methodology];
    for (const [k, v] of [
      ['min', r.min],
      ['median', r.median],
      ['max', r.max],
    ] as const) {
      add(`${s}_${k}_ev`, `${r.methodology} ${k} EV`, v, 'usd');
      add(`${s}_${k}_price`, `${r.methodology} ${k} implied share price`, evToPrice(b, v), 'usd_ps');
    }
    add(`${s}_median_vs_price`, `${r.methodology} median implied price vs current price`, evToPrice(b, r.median) / b.price - 1, 'pct');
  }
  return f;
}

export interface NumberCheck {
  token: string;
  verified: boolean;
  matched?: string;
}

const TOKEN = /(-|\+)?\$?\d[\d,]*(?:\.\d+)?(?: ?(?:trillion|billion|million|bn|T|B|M)(?![A-Za-z])|%|x(?![A-Za-z]))?/g;

/** Find every unit-bearing number in the prose and check it against the fact sheet. */
export function verifyNumbers(text: string, facts: FactEntry[]): NumberCheck[] {
  const out: NumberCheck[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const token = m[0].trim();
    const hasDollar = token.includes('$');
    const unitMatch = token.match(/(trillion|billion|million|T|B|M|bn|%|x)$/);
    const unit = unitMatch?.[1];
    if (!hasDollar && !unit) continue; // bare numbers (years, counts) are not financial claims
    const n = Number(token.replace(/[^0-9.\-+]/g, '').replace(/^\+/, ''));
    if (!Number.isFinite(n)) continue;
    let candidates: FactEntry[];
    let val = n;
    let tol: (fact: number) => number;
    if (unit === '%') {
      val = n / 100;
      candidates = facts.filter((f) => f.unit === 'pct');
      tol = () => 0.0015;
    } else if (unit === 'x') {
      candidates = facts.filter((f) => f.unit === 'x');
      tol = () => 0.15;
    } else if (unit && /^(T|B|M|bn|trillion|billion|million)$/.test(unit)) {
      const scale = /^(T|trillion)$/.test(unit) ? 1e12 : /^(B|bn|billion)$/.test(unit) ? 1e9 : 1e6;
      val = n * scale;
      candidates = facts.filter((f) => f.unit === 'usd');
      tol = (v) => Math.max(Math.abs(v) * 0.015, scale * 0.06);
    } else {
      candidates = facts.filter((f) => f.unit === 'usd_ps');
      tol = (v) => Math.max(0.006, Math.abs(v) * 0.0005);
    }
    const hit = candidates.find((f) => Math.abs(Math.abs(f.value) - Math.abs(val)) <= tol(f.value));
    out.push({ token, verified: !!hit, matched: hit?.label });
  }
  return out;
}
