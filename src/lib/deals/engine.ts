// DealPulse accretion/dilution engine (PRD section 4). Pure functions, no I/O:
// the browser reruns it on every slider move and the server reruns it for the
// API, the teaser and the AI memo, so every surface shows the same numbers.

import type { CompanyFinancials, Fact, LineItem, MarketData } from '../types.ts';
import { adjustedEbit } from '../engine/model.ts';
import { bisect, clamp } from '../engine/stats.ts';

export interface DealCompany {
  ticker: string;
  name: string;
  cik: string;
  sic: string | null;
  sicDescription: string | null;
  source: 'sec-live' | 'snapshot';
  ltmLabel: string;
  price: number;
  priceSource: string;
  priceAsOf: string;
  shares: number;
  marketCap: number;
  netIncome: number;
  revenue: number;
  ebitda: number;
  cash: number;
  debt: number;
  netDebt: number;
  enterpriseValue: number;
  eps: number;
  taxRate: number;
  /** XBRL provenance for the audit trail, keyed by line. */
  audit: Record<'netIncome' | 'revenue' | 'ebitda' | 'cash' | 'debt' | 'shares', LineItem | undefined>;
}

const val = (it: LineItem | undefined) => it?.value;

export function toDealCompany(c: CompanyFinancials, m: MarketData): DealCompany {
  const ltm = c.ltm.items;
  const bal = c.balance.items;
  const last = c.years[c.years.length - 1]?.items ?? {};
  const shares = val(bal.sharesOutstanding) ?? val(last.sharesDiluted);
  const netIncome = val(ltm.netIncome) ?? val(last.netIncome);
  const revenue = val(ltm.revenue) ?? val(last.revenue);
  if (!shares) throw new Error(`${c.ticker}: no share count in SEC filings`);
  if (netIncome === undefined) throw new Error(`${c.ticker}: no net income (NetIncomeLoss) in SEC filings`);
  if (revenue === undefined) throw new Error(`${c.ticker}: no revenue in SEC filings`);
  const ebit = adjustedEbit(ltm) ?? adjustedEbit(last) ?? 0;
  const da = val(ltm.da) ?? val(last.da) ?? 0;
  const cash = (val(bal.cash) ?? 0) + (val(bal.securities) ?? 0);
  const debt = val(bal.debt) ?? 0;
  const pretax = val(last.pretax);
  const tax = val(last.taxExpense);
  const marketCap = m.price * shares;
  // EBITDA's audit line combines its EBIT and D&A facts.
  const ebitdaFacts: Fact[] = [...(ltm.ebit?.facts ?? []), ...(ltm.impairment?.facts ?? []), ...(ltm.da?.facts ?? [])];
  return {
    ticker: c.ticker,
    name: c.name,
    cik: c.cik,
    sic: c.sic,
    sicDescription: c.sicDescription,
    source: c.source,
    ltmLabel: c.ltm.label,
    price: m.price,
    priceSource: m.source,
    priceAsOf: m.asOf,
    shares,
    marketCap,
    netIncome,
    revenue,
    ebitda: ebit + da,
    cash,
    debt,
    netDebt: debt - cash,
    enterpriseValue: marketCap + debt - cash,
    eps: netIncome / shares,
    taxRate: pretax && tax !== undefined && pretax > 0 ? clamp(tax / pretax, 0.12, 0.28) : 0.21,
    audit: {
      netIncome: ltm.netIncome ?? last.netIncome,
      revenue: ltm.revenue ?? last.revenue,
      ebitda: ltm.ebit ? { key: 'ebit', label: 'EBITDA (EBIT + D&A)', value: ebit + da, facts: ebitdaFacts, formula: 'Operating income + restructuring & impairment + D&A' } : undefined,
      cash: bal.cash,
      debt: bal.debt,
      shares: bal.sharesOutstanding ?? last.sharesDiluted,
    },
  };
}

export interface DealAssumptions {
  premium: number; // offer premium over target market price
  cashPct: number;
  stockPct: number;
  debtPct: number; // cash + stock + debt = 1
  synergies: number; // pre-tax run-rate cost synergies, USD
  debtRate: number; // r_d on new acquisition debt
  cashRate: number; // r_c interest forgone on cash used
  taxRate: number;
}

export function defaultDealAssumptions(A: DealCompany, T: DealCompany): DealAssumptions {
  const price = T.marketCap * 1.3;
  // Fund with stock first; use cash only up to ~half of the acquirer's balance sheet cash.
  const cashPct = clamp(Math.floor(((A.cash * 0.5) / price) * 20) / 20, 0, 0.3);
  const debtPct = 0.3;
  return {
    premium: 0.3,
    cashPct,
    debtPct,
    stockPct: +(1 - cashPct - debtPct).toFixed(4),
    synergies: roundSynergy(Math.max(0, T.revenue * 0.03)),
    debtRate: 0.06,
    cashRate: 0.04,
    taxRate: +A.taxRate.toFixed(3),
  };
}

export function roundSynergy(x: number): number {
  const step = synergyStep(x);
  return Math.round(x / step) * step;
}

export function synergyStep(scale: number): number {
  return scale >= 2e9 ? 50e6 : scale >= 2e8 ? 10e6 : 1e6;
}

export function synergyMax(T: DealCompany, A: DealCompany): number {
  return roundSynergy(Math.max(T.revenue * 0.15, Math.min(A.revenue, T.revenue) * 0.05, 50e6));
}

/** Change one leg of the financing mix and rebalance the other two pro rata so the mix still sums to 100%. */
export function setMix(a: DealAssumptions, key: 'cashPct' | 'stockPct' | 'debtPct', value: number): DealAssumptions {
  const v = clamp(value, 0, 1);
  const others = (['cashPct', 'stockPct', 'debtPct'] as const).filter((k) => k !== key);
  const rest = a[others[0]] + a[others[1]];
  const remaining = 1 - v;
  const share0 = rest > 1e-9 ? a[others[0]] / rest : 0.5;
  const o0 = +(remaining * share0).toFixed(4);
  return { ...a, [key]: v, [others[0]]: o0, [others[1]]: +(remaining - o0).toFixed(4) };
}

export interface DealResult {
  offerPrice: number; // per share
  equityPurchasePrice: number; // P_E
  enterprisePurchasePrice: number; // P_E + target net debt
  newDebt: number;
  cashUsed: number;
  stockIssued: number; // USD
  newShares: number;
  preTaxInterest: number;
  afterTaxInterest: number;
  foregoneInterest: number;
  afterTaxSynergies: number;
  proFormaNetIncome: number;
  proFormaShares: number;
  standaloneEps: number;
  proFormaEps: number;
  accretion: number; // fraction, e.g. 0.034 = +3.4%
  epsChange: number; // USD per share
  breakevenSynergies: number; // pre-tax synergies for 0% accretion
  maxPremium: number | null; // highest premium that stays accretive at current synergies
  ownershipAcquirer: number;
  ownershipTarget: number;
  contributionAcquirer: number; // acquirer's share of combined standalone net income
  multiples: { evEbitda: number; evRevenue: number; pe: number };
  leverage: { standalone: number; proForma: number; proFormaDebt: number; proFormaEbitda: number };
  relativeSize: number; // target revenue / acquirer revenue
  cashShortfall: number; // cash used beyond acquirer cash on hand (0 if fine)
}

export function runDeal(A: DealCompany, T: DealCompany, a: DealAssumptions): DealResult {
  const t = a.taxRate;
  const PE = T.marketCap * (1 + a.premium);
  const newDebt = PE * a.debtPct;
  const cashUsed = PE * a.cashPct;
  const stockIssued = PE * a.stockPct;
  const preTaxInterest = newDebt * a.debtRate;
  const afterTaxInterest = preTaxInterest * (1 - t);
  const foregoneInterest = cashUsed * a.cashRate * (1 - t);
  const afterTaxSynergies = a.synergies * (1 - t);
  const proFormaNetIncome = A.netIncome + T.netIncome + afterTaxSynergies - afterTaxInterest - foregoneInterest;
  const newShares = stockIssued / A.price;
  const proFormaShares = A.shares + newShares;
  const standaloneEps = A.netIncome / A.shares;
  const proFormaEps = proFormaNetIncome / proFormaShares;
  const accretion = (proFormaEps - standaloneEps) / Math.abs(standaloneEps);

  // Pre-tax synergies at which pro-forma EPS equals standalone EPS (linear in synergies).
  const niExSyn = proFormaNetIncome - afterTaxSynergies;
  const breakevenSynergies = Math.max(0, (standaloneEps * proFormaShares - niExSyn) / (1 - t));

  const accretionAt = (premium: number) => {
    const r = runDealCore(A, T, { ...a, premium });
    return r;
  };
  const f0 = accretionAt(0);
  let maxPremium: number | null = null;
  if (f0 >= 0) {
    const p = bisect(accretionAt, 0, 3, 1e-6);
    maxPremium = Number.isFinite(p) ? p : 3;
  }

  const proFormaDebt = A.debt + T.debt + newDebt;
  const proFormaEbitda = A.ebitda + T.ebitda + a.synergies;
  const enterprisePurchasePrice = PE + T.netDebt;

  return {
    offerPrice: T.price * (1 + a.premium),
    equityPurchasePrice: PE,
    enterprisePurchasePrice,
    newDebt,
    cashUsed,
    stockIssued,
    newShares,
    preTaxInterest,
    afterTaxInterest,
    foregoneInterest,
    afterTaxSynergies,
    proFormaNetIncome,
    proFormaShares,
    standaloneEps,
    proFormaEps,
    accretion,
    epsChange: proFormaEps - standaloneEps,
    breakevenSynergies,
    maxPremium,
    ownershipAcquirer: A.shares / proFormaShares,
    ownershipTarget: newShares / proFormaShares,
    contributionAcquirer: A.netIncome / (A.netIncome + T.netIncome),
    multiples: {
      evEbitda: T.ebitda > 0 ? enterprisePurchasePrice / T.ebitda : NaN,
      evRevenue: enterprisePurchasePrice / T.revenue,
      pe: T.netIncome > 0 ? PE / T.netIncome : NaN,
    },
    leverage: {
      standalone: A.ebitda > 0 ? A.debt / A.ebitda : NaN,
      proForma: proFormaEbitda > 0 ? proFormaDebt / proFormaEbitda : NaN,
      proFormaDebt,
      proFormaEbitda,
    },
    relativeSize: T.revenue / A.revenue,
    cashShortfall: Math.max(0, cashUsed - A.cash),
  };
}

/** Accretion only; used by the solvers and sensitivity grids. */
function runDealCore(A: DealCompany, T: DealCompany, a: DealAssumptions): number {
  const t = a.taxRate;
  const PE = T.marketCap * (1 + a.premium);
  const ni = A.netIncome + T.netIncome + a.synergies * (1 - t) - PE * a.debtPct * a.debtRate * (1 - t) - PE * a.cashPct * a.cashRate * (1 - t);
  const shares = A.shares + (PE * a.stockPct) / A.price;
  const eps0 = A.netIncome / A.shares;
  return (ni / shares - eps0) / Math.abs(eps0);
}

export interface DealGrid {
  rowLabel: string;
  colLabel: string;
  rows: number[];
  cols: number[];
  values: number[][]; // accretion fraction
  rowFmt: 'pct' | 'usd';
  colFmt: 'pct' | 'usd';
}

/** Offer premium (rows) x pre-tax synergies (cols). */
export function gridPremiumSynergies(A: DealCompany, T: DealCompany, a: DealAssumptions, max: number): DealGrid {
  const rows = [0.1, 0.2, 0.3, 0.4, 0.5].map((x) => x);
  const step = synergyStep(max);
  const cols = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((f * max) / step) * step);
  return {
    rowLabel: 'Offer premium',
    colLabel: 'Pre-tax synergies',
    rows,
    cols,
    values: rows.map((p) => cols.map((s) => runDealCore(A, T, { ...a, premium: p, synergies: s }))),
    rowFmt: 'pct',
    colFmt: 'usd',
  };
}

/** Offer premium (rows) x share of the price paid in stock (cols); the remainder keeps the current cash/debt split. */
export function gridPremiumStock(A: DealCompany, T: DealCompany, a: DealAssumptions): DealGrid {
  const rows = [0.1, 0.2, 0.3, 0.4, 0.5];
  const cols = [0, 0.25, 0.5, 0.75, 1];
  return {
    rowLabel: 'Offer premium',
    colLabel: 'Paid in stock',
    rows,
    cols,
    values: rows.map((p) => cols.map((s) => runDealCore(A, T, { ...setMix(a, 'stockPct', s), premium: p }))),
    rowFmt: 'pct',
    colFmt: 'pct',
  };
}

export type Rag = 'green' | 'amber' | 'red';

export interface RiskItem {
  id: 'antitrust' | 'credit' | 'integration' | 'eps';
  title: string;
  rating: Rag;
  headline: string;
  detail: string;
}

// 2025 HSR size-of-transaction threshold (adjusted annually by the FTC).
export const HSR_THRESHOLD = 126.4e6;

export function riskScorecard(A: DealCompany, T: DealCompany, a: DealAssumptions, r: DealResult): RiskItem[] {
  const sic4 = !!A.sic && A.sic === T.sic;
  const sic2 = !!A.sic && !!T.sic && A.sic.slice(0, 2) === T.sic.slice(0, 2);
  const big = r.equityPurchasePrice > 10e9 || A.revenue + T.revenue > 50e9;
  const hsr = r.equityPurchasePrice > HSR_THRESHOLD;
  const antitrust: Rag = sic4 ? (big ? 'red' : 'amber') : sic2 ? (big ? 'amber' : 'green') : 'green';
  const overlap = sic4 ? 'same industry code' : sic2 ? 'related industries' : 'different industries';

  const lev = r.leverage.proForma;
  const credit: Rag = !Number.isFinite(lev) || lev > 4 ? 'red' : lev > 2.5 ? 'amber' : 'green';

  let points = r.relativeSize > 0.5 ? 2 : r.relativeSize > 0.2 ? 1 : 0;
  if (!sic2) points += 1;
  if (a.premium > 0.4) points += 1;
  const integration: Rag = points >= 3 ? 'red' : points >= 1 ? 'amber' : 'green';

  const eps: Rag = r.accretion > 0.005 ? 'green' : r.accretion > -0.02 ? 'amber' : 'red';

  return [
    {
      id: 'antitrust',
      title: 'Regulatory / antitrust',
      rating: antitrust,
      headline: `${hsr ? 'HSR filing required' : 'Below HSR threshold'} · ${overlap}`,
      detail: `Deal value is well ${hsr ? 'above' : 'below'} the ~$126M HSR size-of-transaction threshold. ${A.ticker} (SIC ${A.sic ?? 'n/a'}) and ${T.ticker} (SIC ${T.sic ?? 'n/a'}) are in ${overlap}. Industry-code overlap is a proxy only: a real review needs market-share data.`,
    },
    {
      id: 'credit',
      title: 'Credit rating impact',
      rating: credit,
      headline: `Pro-forma debt / EBITDA ${Number.isFinite(lev) ? lev.toFixed(1) + 'x' : 'n/m'} (from ${Number.isFinite(r.leverage.standalone) ? r.leverage.standalone.toFixed(1) + 'x' : 'n/m'})`,
      detail: 'Investment-grade issuers generally stay below ~2.5x; above ~4x usually means a downgrade toward high yield. Includes both companies’ existing debt plus the new acquisition debt.',
    },
    {
      id: 'integration',
      title: 'Integration friction',
      rating: integration,
      headline: `Target is ${(r.relativeSize * 100).toFixed(0)}% of acquirer revenue${sic2 ? '' : ' · new industry'}`,
      detail: 'Larger targets, unfamiliar industries and rich premiums all raise the bar for delivering synergies on time.',
    },
    {
      id: 'eps',
      title: 'EPS impact',
      rating: eps,
      headline: `${r.accretion >= 0 ? 'Accretive' : 'Dilutive'} ${(r.accretion * 100).toFixed(1)}% in year one`,
      detail: `Breakeven needs $${(r.breakevenSynergies / 1e6).toFixed(0)}M of pre-tax synergies at this price and financing mix.`,
    },
  ];
}
