// BankVal AI engine (PRD section 4). Pure functions, no I/O: the browser reruns it on
// every slider move and the server reruns it for the API, the PDF and the AI memo.

import { clamp } from '../engine/stats.ts';
import type { Bank } from './types.ts';

export const TAX_RATE = 0.21;
export const ERP = 0.05;
/** Basel III minimums plus the 2.5% capital conservation buffer. */
export const BASEL = { cet1Min: 0.045, tier1Min: 0.06, totalMin: 0.08, ccb: 0.025 };

export interface BankInputs {
  ticker: string;
  name: string;
  cik: string;
  price: number;
  beta: number;
  shares: number;
  // tangible equity
  commonEquity: number;
  goodwill: number;
  intangibles: number;
  tce: number;
  tcePrior: number | null;
  avgTce: number;
  tbvps: number;
  // earnings
  niac: number;
  eps: number;
  dps: number | null;
  roatce: number;
  nii: number | null;
  efficiency: number | null;
  nim: number | null; // NII / average assets (proxy for NIM; earning assets are not tagged consistently)
  // balance sheet
  totalAssets: number;
  loans: number | null;
  deposits: number;
  cash: number;
  afs: number;
  htm: number;
  htmUnrealized: number | null; // amortized cost − fair value, if both are tagged
  allowance: number | null;
  npl: number | null;
  // capital
  cet1: number;
  tier1: number;
  totalCapital: number;
  rwa: number;
  capitalEstimated: boolean;
  // ratios
  ptbv: number;
  pe: number;
  divYield: number | null;
  cet1Ratio: number;
  tier1Ratio: number;
  totalCapitalRatio: number;
  tceRatio: number;
  nplRatio: number | null;
  aclRatio: number | null;
  ldr: number | null;
  rorwa: number;
}

const v = (b: Bank, k: keyof Bank['fin']['items']) => b.fin.items[k]?.value;

export function bankInputs(b: Bank): BankInputs {
  const commonEquity = v(b, 'commonEquity') ?? 0;
  const goodwill = v(b, 'goodwill') ?? 0;
  const intangibles = v(b, 'intangibles') ?? 0;
  const tce = commonEquity - goodwill - intangibles;
  const ceP = v(b, 'commonEquityPrior');
  const tcePrior = ceP !== undefined ? ceP - (v(b, 'goodwillPrior') ?? goodwill) - (v(b, 'intangiblesPrior') ?? intangibles) : null;
  const avgTce = tcePrior !== null ? (tce + tcePrior) / 2 : tce;
  const shares = v(b, 'shares') ?? 0;
  const niac = v(b, 'netIncomeToCommon') ?? v(b, 'netIncome') ?? 0;
  const nii = v(b, 'nii') ?? null;
  const nonII = v(b, 'nonInterestIncome');
  const nonIE = v(b, 'nonInterestExpense');
  const totalAssets = v(b, 'totalAssets') ?? 0;
  const taP = v(b, 'totalAssetsPrior');
  const loans = v(b, 'loans') ?? null;
  const deposits = v(b, 'deposits') ?? 0;
  const htm = v(b, 'htm') ?? 0;
  const htmFv = v(b, 'htmFairValue');
  const cet1 = v(b, 'cet1') ?? tce;
  const rwa = v(b, 'rwa') ?? totalAssets * 0.7;
  const tier1 = v(b, 'tier1') ?? cet1;
  const totalCapital = v(b, 'totalCapital') ?? tier1;
  const npl = v(b, 'npl') ?? null;
  const allowance = v(b, 'allowance') ?? null;
  const dps = v(b, 'dividendsPerShare') ?? null;
  const tbvps = shares > 0 ? tce / shares : NaN;
  const eps = shares > 0 ? niac / shares : NaN;
  const price = b.market.price;
  return {
    ticker: b.fin.ticker,
    name: b.fin.name,
    cik: b.fin.cik,
    price,
    beta: b.market.beta,
    shares,
    commonEquity,
    goodwill,
    intangibles,
    tce,
    tcePrior,
    avgTce,
    tbvps,
    niac,
    eps,
    dps,
    roatce: avgTce > 0 ? niac / avgTce : NaN,
    nii,
    efficiency: nonIE !== undefined && nii !== null && nii + (nonII ?? 0) > 0 ? nonIE / (nii + (nonII ?? 0)) : null,
    nim: nii !== null && totalAssets > 0 ? nii / (taP ? (totalAssets + taP) / 2 : totalAssets) : null,
    totalAssets,
    loans,
    deposits,
    cash: v(b, 'cash') ?? 0,
    afs: v(b, 'afs') ?? 0,
    htm,
    htmUnrealized: htmFv !== undefined && htm > 0 ? Math.max(0, htm - htmFv) : null,
    allowance,
    npl,
    cet1,
    tier1,
    totalCapital,
    rwa,
    capitalEstimated: !!(b.fin.items.cet1?.estimated || b.fin.items.rwa?.estimated),
    ptbv: tbvps > 0 ? price / tbvps : NaN,
    pe: eps > 0 ? price / eps : NaN,
    divYield: dps !== null && price > 0 ? dps / price : null,
    cet1Ratio: rwa > 0 ? cet1 / rwa : NaN,
    tier1Ratio: rwa > 0 ? tier1 / rwa : NaN,
    totalCapitalRatio: rwa > 0 ? totalCapital / rwa : NaN,
    tceRatio: totalAssets > 0 ? tce / (totalAssets - goodwill - intangibles) : NaN,
    nplRatio: npl !== null && loans ? npl / loans : null,
    aclRatio: allowance !== null && loans ? allowance / loans : null,
    ldr: loans && deposits ? loans / deposits : null,
    rorwa: rwa > 0 ? niac / rwa : NaN,
  };
}

// ------------------------------------------------------------------ Assumptions

export interface BankAssumptions {
  /** ROATCE used to read the regression line (defaults to the bank's own). */
  roatce: number;
  targetCet1: number; // 9-13%
  loanGrowth: number; // stage-1 RWA / loan growth
  ke: number; // cost of equity
  terminalGrowth: number;
  rateShockBps: number;
  duration: number; // securities portfolio duration, years
  outflowPct: number; // share of deposits that leave
  aociInCet1: boolean; // Basel III endgame: unrealized AFS losses count against CET1
  excluded: string[]; // peers left out of the regression
}

export function costOfEquity(rf: number, beta: number, erp = ERP): number {
  return rf + beta * erp;
}

export function defaultBankAssumptions(i: BankInputs, rf: number): BankAssumptions {
  return {
    roatce: Number.isFinite(i.roatce) ? i.roatce : 0.12,
    targetCet1: 0.105,
    loanGrowth: 0.04,
    ke: clamp(costOfEquity(rf, i.beta || 1.1), 0.07, 0.18),
    terminalGrowth: 0.03,
    rateShockBps: 200,
    duration: 5,
    outflowPct: 0.15,
    aociInCet1: true,
    excluded: [],
  };
}

// ------------------------------------------------------------------ Regression (PRD 4.2)

export interface Fit {
  alpha: number;
  beta: number;
  r2: number;
  se: number; // standard error of the residuals
  n: number;
}

/** Ordinary least squares y = alpha + beta * x. */
export function ols(xs: number[], ys: number[]): Fit {
  const n = xs.length;
  if (n < 2) return { alpha: NaN, beta: NaN, r2: NaN, se: NaN, n };
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    sxy += (xs[k] - mx) * (ys[k] - my);
    sxx += (xs[k] - mx) ** 2;
    syy += (ys[k] - my) ** 2;
  }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = my - beta * mx;
  const sse = xs.reduce((s, x, k) => s + (ys[k] - alpha - beta * x) ** 2, 0);
  return { alpha, beta, r2: syy > 0 ? 1 - sse / syy : 0, se: n > 2 ? Math.sqrt(sse / (n - 2)) : 0, n };
}

export interface ScatterPoint {
  ticker: string;
  name: string;
  cik: string;
  x: number; // ROATCE
  y: number; // P/TBV
  fitted: number;
  residual: number;
  flag: 'premium' | 'discount' | 'inline';
  included: boolean;
  isTarget: boolean;
}

export interface Regression {
  fit: Fit;
  points: ScatterPoint[];
  band: number; // residual threshold for the over/undervalued flag
  impliedPtbv: number;
  impliedPrice: number;
  targetResidual: number;
}

const usable = (p: BankInputs) => Number.isFinite(p.roatce) && Number.isFinite(p.ptbv) && p.ptbv > 0 && p.roatce > -0.3 && p.roatce < 0.6;

/** Fit P/TBV on ROATCE across the peer group (target excluded from the fit), then read the line at `roatce`. */
export function regression(target: BankInputs, peers: BankInputs[], a: Pick<BankAssumptions, 'roatce' | 'excluded'>): Regression {
  const pool = peers.filter((p) => p.ticker !== target.ticker && usable(p));
  const fitSet = pool.filter((p) => !a.excluded.includes(p.ticker));
  const fit = ols(
    fitSet.map((p) => p.roatce),
    fitSet.map((p) => p.ptbv),
  );
  const band = Math.max(0.15, fit.se || 0);
  const point = (p: BankInputs, isTarget: boolean): ScatterPoint => {
    const fitted = fit.alpha + fit.beta * p.roatce;
    const residual = p.ptbv - fitted;
    return { ticker: p.ticker, name: p.name, cik: p.cik, x: p.roatce, y: p.ptbv, fitted, residual, flag: residual > band ? 'premium' : residual < -band ? 'discount' : 'inline', included: isTarget ? false : !a.excluded.includes(p.ticker), isTarget };
  };
  const points = [...pool.map((p) => point(p, false)), ...(usable(target) ? [point(target, true)] : [])];
  const impliedPtbv = Math.max(0, fit.alpha + fit.beta * a.roatce);
  const t = points.find((p) => p.isTarget);
  return { fit, points, band, impliedPtbv, impliedPrice: impliedPtbv * target.tbvps, targetResidual: t?.residual ?? NaN };
}

// ------------------------------------------------------------------ 3-stage DDM (PRD 4.3)

export interface DdmYear {
  t: number;
  stage: 1 | 2;
  growth: number;
  rwa: number;
  netIncome: number;
  requiredCet1: number;
  dividend: number; // negative = capital the bank must raise
  pv: number;
}

export interface Ddm {
  years: DdmYear[];
  ke: number;
  pvStage1: number;
  pvStage2: number;
  terminalValue: number;
  pvTerminal: number;
  equityValue: number;
  perShare: number;
  impliedPtbv: number;
  excessCet1Now: number; // CET1 above target today (negative = shortfall)
  capitalRaises: { t: number; amount: number }[];
  valid: boolean;
}

export const STAGE1_YEARS = 5;
export const STAGE2_YEARS = 5;

/**
 * Stage 1 (years 1-5): RWA grows with loans at `loanGrowth`, earnings at a constant return on RWA
 * (the bank's own, or the one implied by a normalized ROATCE).
 * Stage 2 (years 6-10): growth fades linearly to `terminalGrowth`.
 * Stage 3: Gordon growth on the year-11 dividend.
 * Dividend capacity_t = NetIncome_t − (RWA_t × target CET1 − CET1_{t−1}).
 */
export function ddm(i: BankInputs, a: Pick<BankAssumptions, 'targetCet1' | 'loanGrowth' | 'ke' | 'terminalGrowth'> & { roatce?: number }): Ddm {
  const ke = a.ke;
  // Earnings run at the (possibly normalized) ROATCE slider, expressed as a return on RWA.
  const rorwa = a.roatce !== undefined && i.rwa > 0 ? (a.roatce * i.avgTce) / i.rwa : i.rorwa;
  const gT = a.terminalGrowth;
  const years: DdmYear[] = [];
  let rwa = i.rwa;
  let cet1 = i.cet1;
  let pv1 = 0;
  let pv2 = 0;
  const raises: { t: number; amount: number }[] = [];
  const N = STAGE1_YEARS + STAGE2_YEARS;
  for (let t = 1; t <= N; t++) {
    const stage: 1 | 2 = t <= STAGE1_YEARS ? 1 : 2;
    const g = stage === 1 ? a.loanGrowth : a.loanGrowth + ((gT - a.loanGrowth) * (t - STAGE1_YEARS)) / STAGE2_YEARS;
    rwa *= 1 + g;
    const ni = rorwa * rwa;
    const required = a.targetCet1 * rwa;
    const dividend = ni - (required - cet1);
    if (dividend < 0) raises.push({ t, amount: -dividend });
    cet1 = required;
    const pv = dividend / (1 + ke) ** t;
    if (stage === 1) pv1 += pv;
    else pv2 += pv;
    years.push({ t, stage, growth: g, rwa, netIncome: ni, requiredCet1: required, dividend, pv });
  }
  const last = years[years.length - 1];
  const nextDividend = last.netIncome * (1 + gT) - a.targetCet1 * last.rwa * gT;
  const valid = ke - gT > 0.005;
  const terminalValue = valid ? nextDividend / (ke - gT) : NaN;
  const pvTerminal = terminalValue / (1 + ke) ** N;
  const equityValue = pv1 + pv2 + pvTerminal;
  const perShare = equityValue / i.shares;
  return {
    years,
    ke,
    pvStage1: pv1,
    pvStage2: pv2,
    terminalValue,
    pvTerminal,
    equityValue,
    perShare,
    impliedPtbv: perShare / i.tbvps,
    excessCet1Now: i.cet1 - a.targetCet1 * i.rwa,
    capitalRaises: raises,
    valid,
  };
}

export interface Grid {
  rows: number[]; // cost of equity
  cols: number[]; // target CET1
  values: number[][]; // value per share
}

/** DDM value per share across cost of equity × target CET1 (the pitchbook sensitivity table). */
export function ddmGrid(i: BankInputs, a: BankAssumptions): Grid {
  const rows = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => Math.round((a.ke + d) * 1000) / 1000);
  const cols = [0.09, 0.1, 0.105, 0.11, 0.12, 0.13];
  return { rows, cols, values: rows.map((ke) => cols.map((tc) => ddm(i, { ...a, ke, targetCet1: tc }).perShare)) };
}

// ------------------------------------------------------------------ Basel capital stack

export interface CapitalStack {
  cet1: number;
  at1: number;
  t2: number;
  requirement: { cet1: number; tier1: number; total: number };
  cet1Surplus: number; // ratio points above CET1 minimum + conservation buffer
  injectionToTarget: number; // USD of CET1 needed to reach the target ratio (0 if above)
  excessToTarget: number; // USD of CET1 above the target ratio
}

export function capitalStack(i: BankInputs, targetCet1: number): CapitalStack {
  const cet1 = i.cet1Ratio;
  const at1 = Math.max(0, i.tier1Ratio - i.cet1Ratio);
  const t2 = Math.max(0, i.totalCapitalRatio - i.tier1Ratio);
  const requirement = { cet1: BASEL.cet1Min + BASEL.ccb, tier1: BASEL.tier1Min + BASEL.ccb, total: BASEL.totalMin + BASEL.ccb };
  const gap = (targetCet1 - cet1) * i.rwa;
  return { cet1, at1, t2, requirement, cet1Surplus: cet1 - requirement.cet1, injectionToTarget: Math.max(0, gap), excessToTarget: Math.max(0, -gap) };
}

// ------------------------------------------------------------------ Stress tests

export interface Stress {
  shock: number;
  afsLoss: number; // pre-tax mark-to-market from the rate shock
  htmLoss: number;
  htmUnrealizedToday: number;
  outflow: number;
  sources: { label: string; available: number; used: number }[];
  shortfall: number; // outflow not covered by cash + securities: needs FHLB / discount window
  coverage: number; // liquid sources / outflow
  realizedLoss: number; // after-tax losses crystallised by selling securities
  cet1Hit: number; // after tax
  cet1RatioAfter: number;
  tceAfter: number;
  tceRatioAfter: number;
  economicTce: number; // TCE if every security were marked to market
}

/** Interest-rate duration shock on the securities book plus an uninsured-deposit run (SVB-style). */
export function stressTest(i: BankInputs, a: Pick<BankAssumptions, 'rateShockBps' | 'duration' | 'outflowPct' | 'aociInCet1'>): Stress {
  const shock = a.rateShockBps / 10_000;
  const afsLoss = Math.min(i.afs, i.afs * a.duration * shock);
  const htmLoss = Math.min(i.htm, i.htm * a.duration * shock);
  const htmUnrealizedToday = i.htmUnrealized ?? 0;
  const afsValue = i.afs - afsLoss;
  const htmValue = Math.max(0, i.htm - htmUnrealizedToday - htmLoss);
  const outflow = i.deposits * a.outflowPct;
  let need = outflow;
  const take = (avail: number) => {
    const used = Math.min(avail, need);
    need -= used;
    return used;
  };
  const usedCash = take(i.cash);
  const usedAfs = take(afsValue);
  const usedHtm = take(htmValue);
  const afsSoldShare = afsValue > 0 ? usedAfs / afsValue : 0;
  const htmSoldShare = htmValue > 0 ? usedHtm / htmValue : 0;
  const t = 1 - TAX_RATE;
  // AFS losses already sit in AOCI (and in CET1 when AOCI counts); selling HTM crystallises its losses.
  const realizedHtm = htmSoldShare * (htmUnrealizedToday + htmLoss) * t;
  const realizedAfs = afsSoldShare * afsLoss * t;
  const cet1Hit = (a.aociInCet1 ? afsLoss * t : realizedAfs) + realizedHtm;
  const tceHit = afsLoss * t + realizedHtm;
  const tangibleAssets = i.totalAssets - i.goodwill - i.intangibles;
  const tceAfter = i.tce - tceHit;
  return {
    shock,
    afsLoss,
    htmLoss,
    htmUnrealizedToday,
    outflow,
    sources: [
      { label: 'Cash and deposits at banks', available: i.cash, used: usedCash },
      { label: 'AFS securities (after shock)', available: afsValue, used: usedAfs },
      { label: 'HTM securities (at fair value)', available: htmValue, used: usedHtm },
    ],
    shortfall: need,
    coverage: outflow > 0 ? (i.cash + afsValue + htmValue) / outflow : Infinity,
    realizedLoss: realizedHtm + realizedAfs,
    cet1Hit,
    cet1RatioAfter: (i.cet1 - cet1Hit) / i.rwa,
    tceAfter,
    tceRatioAfter: tceAfter / (tangibleAssets - outflow),
    economicTce: i.tce - (afsLoss + htmLoss + htmUnrealizedToday) * t,
  };
}

// ------------------------------------------------------------------ One call for every surface

export interface BankRun {
  i: BankInputs;
  reg: Regression;
  ddm: Ddm;
  grid: Grid;
  stack: CapitalStack;
  stress: Stress;
}

export function runBank(i: BankInputs, peers: BankInputs[], a: BankAssumptions): BankRun {
  return { i, reg: regression(i, peers, a), ddm: ddm(i, a), grid: ddmGrid(i, a), stack: capitalStack(i, a.targetCet1), stress: stressTest(i, a) };
}
