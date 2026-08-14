/**
 * Triangulated valuation.
 *
 * Three independent routes to the same number:
 *   1. FCFE discounted at the cost of equity      -> equity value directly
 *   2. FCFF discounted at WACC                    -> enterprise value, less net debt
 *   3. Residual income (book value + excess ROE)  -> preferred for financials, where a
 *      CapEx-based cash-flow model is structurally unreliable
 *
 * Agreement across the three is evidence. Divergence is a warning, and is surfaced as a flag
 * rather than hidden behind whichever number looks best.
 */
import type {
  Assumptions, CompanyData, FcfeRow, FcffResult, Perturbation, ResidualIncomeResult,
  ScenarioResult, SectorMedian, ValuationFlag,
} from './types.ts';
import { clamp, num } from './math.ts';
import { runForecast } from './forecast.ts';

const FIN_RE = /financ|bank|insur/i;

export function costOfEquity(a: Assumptions, rShift = 0): number {
  let r = clamp(a.dcf.rf + a.dcf.beta * a.dcf.erp + rShift, a.dcf.minCoE, a.dcf.maxCoE)!;
  if (r <= a.dcf.terminalGrowth + 0.01) r = a.dcf.terminalGrowth + 0.02;
  return r;
}

export function runScenario(
  data: CompanyData, a: Assumptions, sectorMedian: SectorMedian = { gross: null, op: null, ebitda: null },
  perturb: Perturbation = {},
): ScenarioResult {
  const f = runForecast(data, a, sectorMedian, perturb);
  const { projIS, projCF, projBS } = f;
  const is_ = data.income_statement.filter((r) => !r.is_projected);
  const bs = data.balance_sheet.filter((r) => !r.is_projected);
  const lastBS = bs[bs.length - 1];
  const lastIS = is_[is_.length - 1];

  const discountRate = costOfEquity(a, perturb.rShift ?? 0);
  const termG = a.dcf.terminalGrowth;
  const mid = a.dcf.midYear ? 0.5 : 0;
  const n = projBS.length;

  // ---- Method 1: FCFE ----
  let prevDebt = num(lastBS.total_debt);
  let nbClampedCount = 0, terminalClamped = false;
  const fcfeRows: FcfeRow[] = projBS.map((bsRow, i) => {
    const cfRow = projCF[i];
    const rawNB = bsRow.totalDebt - prevDebt;
    const cap = cfRow.ocf > 0 ? a.dcf.nbOcfCap * cfRow.ocf : 0;
    let nb = clamp(rawNB, -cap, cap)!;
    if (i === n - 1 && nb > 0) {
      const steady = termG * prevDebt;
      if (nb > steady) { nb = steady; terminalClamped = true; }
    }
    if (nb !== rawNB) nbClampedCount++;
    prevDebt = bsRow.totalDebt;
    const sbcDed = a.flags.sbcDeduct ? cfRow.sbc : 0;
    const fcfe = cfRow.ocf + cfRow.capex + nb - sbcDed;
    return { fy: bsRow.fy, ocf: cfRow.ocf, capex: cfRow.capex, nbRaw: rawNB, nb, sbcDed, fcfe, clamped: nb !== rawNB, pv: 0 };
  });
  let pvSum = 0;
  fcfeRows.forEach((r, i) => { r.pv = r.fcfe / Math.pow(1 + discountRate, i + 1 - mid); pvSum += r.pv; });
  const lastFCFE = fcfeRows[n - 1].fcfe;
  const terminalOk = lastFCFE > 0;
  const terminalValue = terminalOk ? (lastFCFE * (1 + termG)) / (discountRate - termG) : null;
  const pvTerminal = terminalOk ? terminalValue! / Math.pow(1 + discountRate, n - mid) : null;
  const equityValue = terminalOk ? pvSum + pvTerminal! : null;
  const shares = data.meta.shares_outstanding;
  const price = data.meta.current_price;
  const fcfePerShare = terminalOk && shares ? equityValue! / shares : null;
  const fcfeMos = fcfePerShare && price ? ((fcfePerShare - price) / fcfePerShare) * 100 : null;

  // ---- Method 2: FCFF at WACC ----
  const fcff = computeFcff(data, a, f, discountRate, mid, termG);

  // ---- Method 3: residual income ----
  const ri = computeResidualIncome(data, projIS, projBS, discountRate, termG, mid, shares, price);

  // ---- diagnostics ----
  const isFinancial = FIN_RE.test(data.meta.sector ?? '');
  const candidates = [fcfePerShare, fcff?.perShare ?? null, ri?.perShare ?? null].filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  const spread = candidates.length > 1 ? (Math.max(...candidates) - Math.min(...candidates)) / Math.max(...candidates) : null;
  const ivToPrice = fcfePerShare && price ? fcfePerShare / price : null;

  const eps0 = lastIS.net_income && shares ? num(lastIS.net_income) / shares : null;
  const eps1 = shares ? projIS[0].net_income / shares : null;
  const netDebt0 = num(lastBS.total_debt) - num(lastBS.cash_and_equivalents);
  const mcap = price && shares ? price * shares : null;
  const ebitda0 = num(lastIS.ebitda);
  const terminalEbitda = projIS[n - 1].ebitda;

  const flags = buildFlags({ ivToPrice, wacc: fcff?.ok ? fcff.wacc : null, rf: a.dcf.rf, spread, tvShareEV: fcff?.ok ? fcff.tvShare : null, tvShareEquity: terminalOk && equityValue ? pvTerminal! / equityValue : null, isFinancial, terminalOk, terminalClamped, nbClampedCount });

  return {
    ticker: data.meta.ticker,
    projIS, projCF, projBS, fcfeRows,
    costOfEquity: discountRate, terminalGrowth: termG,
    fcfe: {
      equityValue, perShare: fcfePerShare, pvSum, pvTerminal,
      tvShare: terminalOk && equityValue ? pvTerminal! / equityValue : null,
      terminalOk, marginOfSafety: fcfeMos,
    },
    fcff, residualIncome: ri,
    diagnostics: {
      marginMode: f.marginMode, autoDetected: f.autoDetected, sectorMedian, sectorBlend: a.margin.sectorBlend,
      sbcDeducted: a.flags.sbcDeduct, sharesLinked: a.flags.sharesLink && !!price, midYear: a.dcf.midYear,
      isFinancial, spread, ivToPrice,
      peCurrent: eps0 && eps0 > 0 && price ? price / eps0 : null,
      peAtIV: eps0 && eps0 > 0 && fcfePerShare ? fcfePerShare / eps0 : null,
      peForward: eps1 && eps1 > 0 && price ? price / eps1 : null,
      evEbitdaCurrent: mcap !== null && ebitda0 > 0 ? (mcap + netDebt0) / ebitda0 : null,
      terminalEquityMultiple: terminalValue && terminalEbitda > 0 ? terminalValue / terminalEbitda : null,
      nbClampedCount, terminalClamped,
    },
    flags, price, shares,
  };
}

function computeFcff(
  data: CompanyData, a: Assumptions, f: ReturnType<typeof runForecast>,
  coe: number, mid: number, termG: number,
): FcffResult | null {
  const bs = data.balance_sheet.filter((r) => !r.is_projected);
  const lastBS = bs[bs.length - 1];
  const shares = data.meta.shares_outstanding, price = data.meta.current_price;
  if (!shares) return null;
  const debt = num(lastBS.total_debt), cash = num(lastBS.cash_and_equivalents);
  const netDebt = debt - cash;
  const mcap = price ? price * shares : 0;
  const rd = debt ? f.projIS[0].interest_expense / debt : 0.05;
  const V = mcap + debt;
  const wacc = V > 0 ? (mcap / V) * coe + (debt / V) * rd * (1 - f.taxRate) : coe;

  const fcff = f.projIS.map((p, i) => {
    const cf = f.projCF[i];
    return p.operating_income * (1 - f.taxRate) + cf.da + cf.wc_change + cf.capex - (a.flags.sbcDeduct ? cf.sbc : 0);
  });
  let pv = 0;
  fcff.forEach((v, i) => { pv += v / Math.pow(1 + wacc, i + 1 - mid); });
  const last = fcff[fcff.length - 1];
  const ok = wacc > termG + 0.005 && last > 0;
  const tv = ok ? (last * (1 + termG)) / (wacc - termG) : null;
  const pvTV = ok ? tv! / Math.pow(1 + wacc, fcff.length - mid) : null;
  const ev = ok ? pv + pvTV! : null;
  const eq = ok ? ev! - netDebt : null;
  const ps = ok ? eq! / shares : null;
  return {
    ok, fcff, wacc, costOfDebt: rd, taxRate: f.taxRate, costOfEquity: coe,
    enterpriseValue: ev, pvOperating: pv, pvTerminal: pvTV, netDebt, equityValue: eq, perShare: ps,
    tvShare: ok && ev ? pvTV! / ev : null,
    marginOfSafety: ps && price && ps > 0 ? ((ps - price) / ps) * 100 : null,
  };
}

function computeResidualIncome(
  data: CompanyData, projIS: ScenarioResult['projIS'], projBS: ScenarioResult['projBS'],
  coe: number, termG: number, mid: number, shares: number | null, price: number | null,
): ResidualIncomeResult | null {
  const bs = data.balance_sheet.filter((r) => !r.is_projected);
  const bv0 = num(bs[bs.length - 1].total_stockholders_equity);
  if (!(bv0 > 0)) return null;
  let prevBV = bv0, pvRI = 0, lastRI: number | null = null;
  projIS.forEach((p, i) => {
    const ri = p.net_income - coe * prevBV;      // profit above the charge for equity capital
    pvRI += ri / Math.pow(1 + coe, i + 1 - mid);
    lastRI = ri;
    prevBV = projBS[i].totalSE;
  });
  let pvTV = 0;
  if (coe > termG + 0.005 && lastRI !== null) {
    pvTV = ((lastRI * (1 + termG)) / (coe - termG)) / Math.pow(1 + coe, projIS.length - mid);
  }
  const value = bv0 + pvRI + pvTV;
  const perShare = shares ? value / shares : null;
  return {
    value, perShare,
    marginOfSafety: perShare && price && perShare > 0 ? ((perShare - price) / perShare) * 100 : null,
  };
}

function buildFlags(x: {
  ivToPrice: number | null; wacc: number | null; rf: number; spread: number | null;
  tvShareEV: number | null; tvShareEquity: number | null; isFinancial: boolean;
  terminalOk: boolean; terminalClamped: boolean; nbClampedCount: number;
}): ValuationFlag[] {
  const out: ValuationFlag[] = [];
  if (!x.terminalOk) out.push({ code: 'NO_TERMINAL', severity: 'warn', message: 'Terminal-year FCFE is at or below zero — no equity value can be computed on this route. The residual-income figure still applies.' });
  if (x.ivToPrice !== null && (x.ivToPrice > 2 || x.ivToPrice < 0.5)) out.push({ code: 'EXTREME_RESULT', severity: 'warn', message: `Model value is ${x.ivToPrice.toFixed(2)}x the market price. A gap this size usually means an assumption is wrong, not that the market is.` });
  if (x.wacc !== null && (x.wacc < x.rf || x.wacc > 0.15)) out.push({ code: 'WACC_BAND', severity: 'warn', message: `WACC of ${(x.wacc * 100).toFixed(1)}% falls outside the plausible band (risk-free to 15%) — check the capital-structure inputs.` });
  if (x.spread !== null && x.spread > 0.35) out.push({ code: 'METHOD_DISAGREEMENT', severity: 'warn', message: `The three valuation routes disagree by ${(x.spread * 100).toFixed(0)}%. Treat any single one as indicative only.` });
  if (x.tvShareEV !== null && x.tvShareEV > 0.80) out.push({ code: 'TV_CONCENTRATION', severity: 'warn', message: `${(x.tvShareEV * 100).toFixed(0)}% of enterprise value sits in the terminal value — the result is mostly an assumption about the far future.` });
  else if (x.tvShareEquity !== null && x.tvShareEquity > 0.75) out.push({ code: 'TV_CONCENTRATION', severity: 'info', message: `${(x.tvShareEquity * 100).toFixed(0)}% of equity value sits in the terminal value.` });
  if (x.isFinancial) out.push({ code: 'FINANCIAL_SECTOR', severity: 'info', message: 'Financial-sector company: cash-flow DCF is structurally unreliable here (no meaningful CapEx). Use the residual-income value as the anchor.' });
  if (x.terminalClamped) out.push({ code: 'NB_TERMINAL_CLAMP', severity: 'info', message: 'Terminal-year net borrowing was clamped to a steady-state bound — the debt schedule wanted to outgrow the business.' });
  else if (x.nbClampedCount > 0) out.push({ code: 'NB_CLAMP', severity: 'info', message: `${x.nbClampedCount} year(s) had net borrowing clamped by the cash-flow-based bound.` });
  return out;
}
