// Base inputs, default assumptions, WACC build, and the unlevered DCF.
// Pure functions only: the same code runs on the server (API, tear sheet) and in
// the browser on every slider movement, so on-screen and exported numbers agree.

import type { Dataset, LineItems } from '../types.ts';
import { clamp, percentile } from './stats.ts';

export const RISK_FREE_DEFAULT = 0.0425; // 10-year US Treasury yield
export const ERP_DEFAULT = 0.05; // Kroll recommended U.S. equity risk premium
export const PROJECTION_YEARS = 5;

export interface HistoryRow {
  label: string;
  revenue: number;
  ebit: number;
  ebitda: number;
}

export interface BaseInputs {
  ticker: string;
  name: string;
  baseLabel: string;
  baseFy: number;
  revenue0: number;
  ebit0: number;
  da0: number;
  capex0: number;
  ebitMargin0: number;
  daPct: number;
  capexPct: number;
  nwcPct: number;
  taxRate0: number;
  histGrowth: number;
  history: HistoryRow[];
  ltmLabel: string;
  ltmRevenue: number;
  ltmEbit: number;
  ltmEbitda: number;
  cash: number;
  securities: number;
  debt: number;
  netDebt: number;
  shares: number;
  price: number;
  marketCap: number;
  currentEV: number;
  beta: number;
  preTaxKd: number;
  peerMultiples: number[];
  /** Peers dropped as outliers (more than 3x away from the peer median), shown as "NM". */
  peerExcluded: string[];
  market52: { low: number; p25: number; median: number; p75: number; high: number };
}

export interface Assumptions {
  wacc: number;
  terminalGrowth: number;
  exitMultiple: number;
  revenueGrowth: number;
  ebitMargin: number;
  taxRate: number;
  controlPremium: number;
  lboLeverage: number;
  lboTargetIrr: number;
  lboInterestRate: number;
  riskFree: number;
  erp: number;
}

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export type AssumptionKey = keyof Assumptions;

const v = (items: LineItems, k: keyof LineItems): number | undefined => items[k]?.value;

/** EBIT with restructuring & impairment added back: the "Adj. EBIT" a banker would use. */
export function adjustedEbit(items: LineItems): number | undefined {
  const ebit = v(items, 'ebit');
  if (ebit === undefined) return undefined;
  return ebit + (v(items, 'impairment') ?? 0);
}

export function buildBaseInputs(ds: Dataset): BaseInputs {
  const { company, market } = ds;
  const years = company.years.filter((y) => v(y.items, 'revenue') !== undefined);
  if (years.length === 0) throw new Error(`${company.ticker}: no annual revenue found in XBRL facts`);
  const last = years[years.length - 1];
  const it = last.items;

  const revenue0 = v(it, 'revenue')!;
  const ebit0 = adjustedEbit(it) ?? 0;
  const da0 = v(it, 'da') ?? 0;
  const capex0 = Math.abs(v(it, 'capex') ?? 0);

  const pretax = v(it, 'pretax');
  const tax = v(it, 'taxExpense');
  const taxRate0 = pretax && tax !== undefined && pretax > 0 ? clamp(tax / pretax, 0.12, 0.28) : 0.21;

  const ar = v(it, 'ar') ?? 0;
  const inv = v(it, 'inventory') ?? 0;
  const ap = v(it, 'ap') ?? 0;
  const nwcPct = revenue0 > 0 ? clamp((ar + inv - ap) / revenue0, -0.1, 0.25) : 0;

  const history: HistoryRow[] = years.map((y) => {
    const ebit = adjustedEbit(y.items) ?? 0;
    return {
      label: y.label,
      revenue: v(y.items, 'revenue')!,
      ebit,
      ebitda: ebit + (v(y.items, 'da') ?? 0),
    };
  });

  let histGrowth = 0.04;
  if (history.length >= 2) {
    const n = history.length;
    const yoy = history[n - 1].revenue / history[n - 2].revenue - 1;
    const span = Math.min(3, n - 1);
    const cagr = (history[n - 1].revenue / history[n - 1 - span].revenue) ** (1 / span) - 1;
    histGrowth = clamp(0.5 * yoy + 0.5 * cagr, -0.05, 0.3);
  }

  const ltm = company.ltm.items;
  const ltmRevenue = v(ltm, 'revenue') ?? revenue0;
  const ltmEbit = adjustedEbit(ltm) ?? ebit0;
  const ltmEbitda = ltmEbit + (v(ltm, 'da') ?? da0);

  const bal = company.balance.items;
  const cash = v(bal, 'cash') ?? 0;
  const securities = v(bal, 'securities') ?? 0;
  const debt = v(bal, 'debt') ?? 0;
  const shares = v(bal, 'sharesOutstanding') ?? v(it, 'sharesDiluted') ?? 0;
  if (!shares) throw new Error(`${company.ticker}: no share count found in XBRL facts`);

  const netDebt = debt - cash - securities;
  const marketCap = market.price * shares;
  const interest = v(it, 'interestExpense');
  const preTaxKd =
    interest && debt > 0
      ? clamp(Math.abs(interest) / debt, RISK_FREE_DEFAULT + 0.005, RISK_FREE_DEFAULT + 0.05)
      : RISK_FREE_DEFAULT + 0.0125;

  return {
    ticker: company.ticker,
    name: company.name,
    baseLabel: last.label,
    baseFy: last.fy,
    revenue0,
    ebit0,
    da0,
    capex0,
    ebitMargin0: revenue0 > 0 ? ebit0 / revenue0 : 0,
    daPct: revenue0 > 0 ? da0 / revenue0 : 0,
    capexPct: revenue0 > 0 ? capex0 / revenue0 : 0,
    nwcPct,
    taxRate0,
    histGrowth,
    history,
    ltmLabel: company.ltm.label,
    ltmRevenue,
    ltmEbit,
    ltmEbitda,
    cash,
    securities,
    debt,
    netDebt,
    shares,
    price: market.price,
    marketCap,
    currentEV: marketCap + netDebt,
    beta: market.beta,
    preTaxKd,
    ...screenPeers(ds),
    market52: { low: market.low52, p25: market.p25, median: market.median, p75: market.p75, high: market.high52 },
  };
}

function screenPeers(ds: Dataset): { peerMultiples: number[]; peerExcluded: string[] } {
  const valid = ds.peers.filter((p) => Number.isFinite(p.evEbitda) && p.evEbitda > 0 && p.evEbitda < 80);
  const med = percentile(
    valid.map((p) => p.evEbitda),
    0.5,
  );
  const keep = valid.filter((p) => p.evEbitda <= med * 3 && p.evEbitda >= med / 3);
  return {
    peerMultiples: keep.map((p) => p.evEbitda),
    peerExcluded: ds.peers.filter((p) => !keep.includes(p)).map((p) => p.ticker),
  };
}

export interface WaccBuild {
  riskFree: number;
  beta: number;
  erp: number;
  costOfEquity: number;
  preTaxKd: number;
  afterTaxKd: number;
  taxRate: number;
  equityValue: number;
  debtValue: number;
  weightEquity: number;
  weightDebt: number;
  wacc: number;
}

export function waccBuild(b: BaseInputs, riskFree: number, erp: number, taxRate: number): WaccBuild {
  const costOfEquity = riskFree + b.beta * erp;
  const preTaxKd = Math.max(b.preTaxKd, riskFree + 0.005);
  const afterTaxKd = preTaxKd * (1 - taxRate);
  const E = b.marketCap;
  const D = Math.max(0, b.debt);
  const wE = E / (E + D);
  const wD = D / (E + D);
  return {
    riskFree,
    beta: b.beta,
    erp,
    costOfEquity,
    preTaxKd,
    afterTaxKd,
    taxRate,
    equityValue: E,
    debtValue: D,
    weightEquity: wE,
    weightDebt: wD,
    wacc: wE * costOfEquity + wD * afterTaxKd,
  };
}

export function peerMedian(b: BaseInputs): number {
  return b.peerMultiples.length ? percentile(b.peerMultiples, 0.5) : 12;
}

export function defaultAssumptions(b: BaseInputs, riskFree = RISK_FREE_DEFAULT, erp = ERP_DEFAULT): Assumptions {
  const w = waccBuild(b, riskFree, erp, b.taxRate0).wacc;
  return {
    wacc: round(clamp(w, 0.06, 0.14), 0.0025),
    terminalGrowth: 0.025,
    exitMultiple: round(clamp(peerMedian(b), 6, 40), 0.5),
    revenueGrowth: round(b.histGrowth, 0.005),
    ebitMargin: round(clamp(b.ebitMargin0, -0.2, 0.75), 0.0025),
    taxRate: round(b.taxRate0, 0.005),
    controlPremium: 0.225,
    lboLeverage: 5.5,
    lboTargetIrr: 0.2,
    lboInterestRate: 0.085,
    riskFree,
    erp,
  };
}

/** Slider bounds. PRD ranges are the defaults, widened only when the company's own data sits outside them. */
export function sliderRanges(a: Assumptions): Record<AssumptionKey, SliderRange> {
  return {
    wacc: { min: Math.min(0.06, a.wacc), max: Math.max(0.12, a.wacc), step: 0.0025 },
    terminalGrowth: { min: 0.01, max: 0.04, step: 0.0025 },
    exitMultiple: { min: Math.min(8, Math.floor(a.exitMultiple * 0.6)), max: Math.max(14, Math.ceil(a.exitMultiple * 1.4)), step: 0.5 },
    revenueGrowth: { min: -0.05, max: Math.max(0.3, a.revenueGrowth), step: 0.005 },
    ebitMargin: { min: Math.min(0, a.ebitMargin), max: Math.max(0.6, a.ebitMargin + 0.1), step: 0.0025 },
    taxRate: { min: 0.1, max: 0.3, step: 0.005 },
    controlPremium: { min: 0.15, max: 0.3, step: 0.0125 },
    lboLeverage: { min: 4, max: 7, step: 0.25 },
    lboTargetIrr: { min: 0.15, max: 0.3, step: 0.0125 },
    lboInterestRate: { min: 0.06, max: 0.12, step: 0.0025 },
    riskFree: { min: 0.02, max: 0.06, step: 0.0025 },
    erp: { min: 0.04, max: 0.07, step: 0.0025 },
  };
}

function round(x: number, step: number): number {
  return Math.round(x / step) * step;
}

export interface ProjectionYear {
  label: string;
  growth: number;
  revenue: number;
  ebit: number;
  da: number;
  ebitda: number;
  taxes: number;
  nopat: number;
  capex: number;
  dNwc: number;
  fcff: number;
  discountFactor: number;
  pvFcff: number;
}

export interface DcfResult {
  wacc: number;
  terminalGrowth: number;
  exitMultiple: number;
  years: ProjectionYear[];
  sumPvFcff: number;
  tvGordon: number;
  tvExit: number;
  pvTvGordon: number;
  pvTvExit: number;
  evGordon: number;
  evExit: number;
  /** Cross-checks bankers always look at. */
  impliedExitMultiple: number;
  impliedPerpetualGrowth: number;
}

export function projectOperations(b: BaseInputs, a: Assumptions): Omit<ProjectionYear, 'discountFactor' | 'pvFcff'>[] {
  const out: Omit<ProjectionYear, 'discountFactor' | 'pvFcff'>[] = [];
  let prevRevenue = b.revenue0;
  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    // Growth fades linearly from the year-1 assumption to terminal growth by the final year.
    const growth = a.revenueGrowth + ((a.terminalGrowth - a.revenueGrowth) * (t - 1)) / (PROJECTION_YEARS - 1);
    const revenue = prevRevenue * (1 + growth);
    const ebit = revenue * a.ebitMargin;
    const da = revenue * b.daPct;
    const taxes = Math.max(0, ebit) * a.taxRate;
    const capex = revenue * b.capexPct;
    const dNwc = (revenue - prevRevenue) * b.nwcPct;
    out.push({
      label: `FY${b.baseFy + t}E`,
      growth,
      revenue,
      ebit,
      da,
      ebitda: ebit + da,
      taxes,
      nopat: ebit - taxes,
      capex,
      dNwc,
      fcff: ebit - taxes + da - capex - dNwc,
    });
    prevRevenue = revenue;
  }
  return out;
}

export function dcf(b: BaseInputs, a: Assumptions, wacc = a.wacc, g = a.terminalGrowth, m = a.exitMultiple): DcfResult {
  const ops = projectOperations(b, a);
  const years: ProjectionYear[] = ops.map((y, i) => {
    const discountFactor = 1 / (1 + wacc) ** (i + 1);
    return { ...y, discountFactor, pvFcff: y.fcff * discountFactor };
  });
  const last = years[years.length - 1];
  const sumPvFcff = years.reduce((s, y) => s + y.pvFcff, 0);
  const gEff = Math.min(g, wacc - 0.005);
  const tvGordon = (last.fcff * (1 + gEff)) / (wacc - gEff);
  const tvExit = last.ebitda * m;
  const df = last.discountFactor;
  return {
    wacc,
    terminalGrowth: g,
    exitMultiple: m,
    years,
    sumPvFcff,
    tvGordon,
    tvExit,
    pvTvGordon: tvGordon * df,
    pvTvExit: tvExit * df,
    evGordon: sumPvFcff + tvGordon * df,
    evExit: sumPvFcff + tvExit * df,
    impliedExitMultiple: last.ebitda > 0 ? tvGordon / last.ebitda : NaN,
    impliedPerpetualGrowth: (tvExit * wacc - last.fcff) / (tvExit + last.fcff),
  };
}

export function evToPrice(b: BaseInputs, ev: number): number {
  return (ev - b.netDebt) / b.shares;
}

export function priceToEv(b: BaseInputs, price: number): number {
  return price * b.shares + b.netDebt;
}
