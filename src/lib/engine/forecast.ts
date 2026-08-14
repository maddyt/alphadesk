/**
 * Five-year three-statement forecast.
 *
 * Design notes that matter:
 *  - The build is SEQUENTIAL (year t uses year t-1's own computed closing balances), which is
 *    what lets interest be driven by the prior year's debt and investment balances without
 *    circularity. A multi-pass "project every line for all years" structure cannot do this.
 *  - Margins mean-revert toward a blend of the company's own history and its SECTOR median,
 *    so young companies with unrepresentative histories are not extrapolated off a cliff.
 *  - Cyclical companies (volatile operating margin) are detected and switched to a full-cycle
 *    average base instead of a recency-weighted one.
 *  - Income before tax is built bottom-up from its components; net income is derived from it.
 *    The reverse (forecasting a net margin and backing into pre-tax income) hides the drivers.
 */
import type {
  Assumptions, CompanyData, Perturbation, ProjectedBalance, ProjectedCashFlow, ProjectedIncome,
  SectorMedian,
} from './types.ts';
import { clamp, num, safeDiv, stableRatio, stdev, mean, weightedAvg, yoyGrowthRates } from './math.ts';
import { PROJECTION_YEARS } from './assumptions.ts';

export interface ForecastOutput {
  projIS: ProjectedIncome[]; projCF: ProjectedCashFlow[]; projBS: ProjectedBalance[];
  marginMode: 'recency' | 'cycle'; autoDetected: boolean;
  effectiveBorrowRate: number; effectiveYieldRate: number; taxRate: number;
}

export function forecastRevenue(
  hist: number[], years: number, a: Assumptions['revenue'], gShift = 0,
): { year: number; growth: number; revenue: number }[] {
  if (hist.length < 2) {
    const base = hist.length ? hist[hist.length - 1] : 0;
    return Array.from({ length: years }, (_, y) => ({ year: y + 1, growth: 0.05 + gShift, revenue: Math.trunc(base * Math.pow(1.05 + gShift, y + 1)) }));
  }
  const rates = yoyGrowthRates(hist);
  let base = weightedAvg(rates, 2.0); if (base === null) base = 0.05;
  const clamped = clamp(base, a.growthMin, a.growthMax)!;
  const decay = a.decayOverride ?? (Math.abs(clamped) < 0.08 ? 0.95 : Math.abs(clamped) < 0.15 ? 0.90 : 0.85);
  const baseG = clamped + gShift, ltg = a.longTermGrowth + gShift;
  const out: { year: number; growth: number; revenue: number }[] = [];
  let last = hist[hist.length - 1];
  for (let y = 1; y <= years; y++) {
    let g = ltg + (baseG - ltg) * Math.pow(decay, y);
    if (!gShift) g = clamp(g, a.growthMin, a.growthMax)!;
    let next = Math.trunc(last * (1 + g));
    next = Math.max(next, Math.trunc(last * 0.5));      // revenue floor: no more than a halving
    out.push({ year: y, growth: g, revenue: next });
    last = next;
  }
  return out;
}

export function forecastMargin(
  hist: (number | null)[], minV: number, maxV: number, years: number,
  stability: number, trendDamp: number, mode: 'recency' | 'cycle',
  sectorMedian: number | null | undefined, blend: number, mShift = 0,
): number[] {
  const valid = hist.filter((m): m is number => m !== null && m !== undefined);
  if (!valid.length) return Array(years).fill(0);
  let base = (mode === 'cycle' ? mean(valid) : weightedAvg(valid, 1.8)) ?? 0;
  if (sectorMedian !== null && sectorMedian !== undefined && blend > 0) base = base * (1 - blend) + sectorMedian * blend;
  if (mShift) base += mShift;
  let trend = 0;
  if (mode !== 'cycle') {
    if (valid.length >= 3) trend = (valid[valid.length - 1] - valid[valid.length - 3]) / 2;
    else if (valid.length >= 2) trend = valid[valid.length - 1] - valid[valid.length - 2];
    trend *= trendDamp;
  }
  let current = valid[valid.length - 1];
  const out: number[] = [];
  for (let y = 1; y <= years; y++) {
    const target = base + trend * y;
    current = clamp(current * stability + target * (1 - stability), minV, maxV)!;
    out.push(current);
  }
  return out;
}

export function forecastGrowthSeries(hist: (number | null | undefined)[], floor: number, cap: number, years: number): number[] {
  const valid = hist.filter((v): v is number => v !== null && v !== undefined);
  if (valid.length < 2) return Array(years).fill(valid.length ? valid[valid.length - 1] : 0);
  let g = weightedAvg(yoyGrowthRates(valid), 1.5) ?? 0;
  g = clamp(g, floor, cap)!;
  const out: number[] = []; let last = valid[valid.length - 1];
  for (let y = 0; y < years; y++) { const next = Math.trunc(last * (1 + g)); out.push(next); last = next; }
  return out;
}

/** Detect cyclicality from operating-margin dispersion. */
export function detectMarginMode(opMargins: number[]): 'recency' | 'cycle' {
  const mu = mean(opMargins), sd = stdev(opMargins);
  return mu && sd !== null && Math.abs(sd / mu) > 0.35 ? 'cycle' : 'recency';
}

export function runForecast(
  data: CompanyData, a: Assumptions, sectorMedian: SectorMedian, perturb: Perturbation = {},
): ForecastOutput {
  const is_ = data.income_statement.filter((r) => !r.is_projected);
  const bs = data.balance_sheet.filter((r) => !r.is_projected);
  const cf = data.cash_flow.filter((r) => !r.is_projected);
  if (!is_.length || !bs.length) throw new Error(`insufficient history for ${data.meta.ticker}`);

  const revenues = is_.map((r) => num(r.revenue));
  const grossM = is_.map((r) => safeDiv(r.gross_profit as number, r.revenue as number));
  const opM = is_.map((r) => safeDiv(r.operating_income as number, r.revenue as number));
  const ebitdaM = is_.map((r) => safeDiv(r.ebitda as number, r.revenue as number));

  const taxRates = is_.map((r) => safeDiv(r.income_tax_expense as number, r.income_before_tax as number))
    .filter((t): t is number => t !== null && t > 0 && t < 0.5);
  const taxRate = taxRates.length ? taxRates.reduce((x, y) => x + y, 0) / taxRates.length : 0.21;

  const mode = a.margin.mode === 'auto'
    ? detectMarginMode(opM.filter((v): v is number => v !== null))
    : a.margin.mode;
  const autoDetected = a.margin.mode === 'auto';

  // Interest is driven by balances, not by a revenue ratio. Years with a zero interest figure
  // are excluded from the rate calibration: a company carrying >$100bn of debt does not pay 0%,
  // so a zero is a reporting gap rather than an economic rate.
  const bsByYear = new Map(bs.map((r) => [r.fiscal_year, r]));
  const borrowSeries = is_.map((r) => {
    const b = bsByYear.get(r.fiscal_year); const debt = b?.total_debt;
    if (!r.interest_expense || !debt) return null;
    return num(r.interest_expense) / num(debt);
  });
  const yieldSeries = is_.map((r) => {
    const b = bsByYear.get(r.fiscal_year);
    const inv = b ? num(b.cash_and_equivalents) + num(b.short_term_investments) + num(b.long_term_investments) : 0;
    if (!r.interest_income || !inv) return null;
    return num(r.interest_income) / inv;
  });
  const trueOtherSeries = is_.map((r) => (num(r.income_before_tax) - num(r.operating_income)) + num(r.interest_expense) - num(r.interest_income));

  const effBorrow = a.interest.borrowRateOverride ?? weightedAvg(borrowSeries.filter((v) => v !== null), 1.5) ?? 0.04;
  const effYield = a.interest.yieldRateOverride ?? weightedAvg(yieldSeries.filter((v) => v !== null), 1.5) ?? a.dcf.rf;
  const trueOtherRatio = a.interest.otherRatioOverride ?? stableRatio(trueOtherSeries, revenues, 0);

  const projRev = forecastRevenue(revenues, PROJECTION_YEARS, a.revenue, perturb.gShift);
  const projGM = forecastMargin(grossM, 0, 0.95, PROJECTION_YEARS, a.margin.stability, a.margin.trendDamp, mode, sectorMedian?.gross, a.margin.sectorBlend, perturb.mShift);
  const projOM = forecastMargin(opM, -0.5, 0.7, PROJECTION_YEARS, a.margin.stability, a.margin.trendDamp, mode, sectorMedian?.op, a.margin.sectorBlend, perturb.mShift);
  const projEM = forecastMargin(ebitdaM, -0.3, 0.8, PROJECTION_YEARS, a.margin.stability, a.margin.trendDamp, mode, sectorMedian?.ebitda, a.margin.sectorBlend, perturb.mShift);
  const projShrTrend = forecastGrowthSeries(is_.map((r) => r.shares_outstanding_diluted), -0.05, 0.05, PROJECTION_YEARS);

  const sbcRatio = stableRatio(cf.map((r) => r.stock_based_compensation), revenues, 0.02);
  const wcRatio = stableRatio(cf.map((r) => r.change_in_working_capital), revenues, -0.01);
  const capexRatio = a.capex.override ?? stableRatio(cf.map((r) => r.capital_expenditure), revenues, -0.05);
  const buybackRatio = stableRatio(cf.map((r) => r.stock_repurchased), revenues, 0);
  const invPurchaseRatio = stableRatio(cf.map((r) => r.investment_purchases), revenues, 0);
  const invSalesRatio = stableRatio(cf.map((r) => r.investment_sales), revenues, 0);
  const projDividends = forecastGrowthSeries(cf.map((r) => r.dividends_paid), -0.05, 0.10, PROJECTION_YEARS);
  const projStockIssued = forecastGrowthSeries(cf.map((r) => r.stock_issued), -0.10, 0.10, PROJECTION_YEARS);

  const histNetBorrow = cf.map((r) => (r.debt_repayment !== null && r.debt_repayment !== undefined ? r.debt_repayment : r.debt_issued));
  const nbRatio = clamp(stableRatio(histNetBorrow, revenues, 0), -a.debt.nbRevRatio, a.debt.nbRevRatio)!;
  const legacyRepay = forecastGrowthSeries(cf.map((r) => r.debt_repayment), -a.debt.legacyClamp, a.debt.legacyClamp, PROJECTION_YEARS);
  const legacyIssued = forecastGrowthSeries(cf.map((r) => r.debt_issued), -a.debt.legacyClamp, a.debt.legacyClamp, PROJECTION_YEARS);

  const lastBS = bs[bs.length - 1];
  const AR_ratio = stableRatio(bs.map((r) => r.accounts_receivable), revenues, 0.10);
  // A single year where gross profit exceeds revenue (loan-loss reserve releases at banks)
  // drives cost of revenue negative and would poison a COGS-denominated ratio. Exclude it.
  const cogsHist = is_.map((r) => {
    const v = r.cost_of_revenue;
    return v !== null && v !== undefined && (v as number) < 0 ? null : v;
  });
  const INV_ratio = stableRatio(bs.map((r) => r.inventory), cogsHist, 0.10);
  const AP_ratio = stableRatio(bs.map((r) => r.accounts_payable), cogsHist, 0.10);

  const price = data.meta.current_price;
  const canLink = a.flags.sharesLink && !!price && price > 0;
  const shValid = is_.map((r) => r.shares_outstanding_diluted).filter((v): v is number => v !== null && v !== undefined);
  let prevSh = shValid.length ? shValid[shValid.length - 1] : num(data.meta.shares_outstanding);
  const sh0 = prevSh;

  let prevDebt = num(lastBS.total_debt);
  let prevSTI = num(lastBS.short_term_investments), prevLTI = num(lastBS.long_term_investments);
  let prevInvestments = num(lastBS.cash_and_equivalents) + prevSTI + prevLTI;
  let prevCash = num(lastBS.cash_and_equivalents);
  let prevPPE = num(lastBS.property_plant_equipment);
  let prevIntangibles = num(lastBS.intangible_assets);
  let prevLTDebt = num(lastBS.long_term_debt);
  let prevRetained = num(lastBS.retained_earnings);
  let prevCommon = num(lastBS.common_stock);
  let prevOtherEquity = num(lastBS.total_stockholders_equity) - num(lastBS.common_stock) - num(lastBS.retained_earnings);
  const frozen = {
    goodwill: num(lastBS.goodwill), stDebt: num(lastBS.short_term_debt),
    oca: num(lastBS.other_current_assets), onca: num(lastBS.other_non_current_assets),
    ocl: num(lastBS.other_current_liabilities), oncl: num(lastBS.other_non_current_liabilities),
  };

  const projIS: ProjectedIncome[] = [], projCF: ProjectedCashFlow[] = [], projBS: ProjectedBalance[] = [];

  for (let y = 0; y < PROJECTION_YEARS; y++) {
    const revenue = projRev[y].revenue;
    const gross_profit = revenue * projGM[y];
    const operating_income = revenue * projOM[y];
    const ebitda = revenue * projEM[y];

    const interest_expense = prevDebt * effBorrow;
    const interest_income = prevInvestments * effYield;
    const true_other = revenue * trueOtherRatio;
    const income_before_tax = operating_income + interest_income - interest_expense + true_other;
    const tax_expense = income_before_tax * taxRate;
    const net_income = income_before_tax - tax_expense;

    // D&A is the same real-world number the income statement already implies; deriving it a
    // second way from a revenue ratio would put two inconsistent values in one model.
    const da = ebitda - operating_income;
    const sbc = Math.trunc(revenue * sbcRatio);
    const wc_change = Math.trunc(revenue * wcRatio);
    const ocf = net_income + da + sbc + wc_change;
    const capex = Math.trunc(revenue * capexRatio);
    const inv_purchases = Math.trunc(revenue * invPurchaseRatio);
    const inv_sales = Math.trunc(revenue * invSalesRatio);
    const div_paid = projDividends[y];
    const buybacks = Math.trunc(revenue * buybackRatio);
    const s_issued = projStockIssued[y];
    let d_repay: number, d_issued: number;
    if (a.debt.method === 'current') {
      const decayFactor = a.debt.decayToZero ? 1 - y / PROJECTION_YEARS : 1;
      d_repay = Math.trunc(revenue * nbRatio * decayFactor); d_issued = 0;
    } else { d_repay = legacyRepay[y]; d_issued = legacyIssued[y]; }
    const investing_cf = capex + inv_purchases + inv_sales;
    const financing_cf = d_repay + d_issued + div_paid + buybacks + s_issued;
    const net_change_in_cash = ocf + investing_cf + financing_cf;

    // Buybacks retire shares and issuance/SBC adds them, at today's price. Without this link a
    // model can spend billions on repurchases while the share count drifts on an unrelated trend.
    const shares_diluted = canLink
      ? Math.max(sh0 * 0.4, prevSh + (sbc + s_issued + buybacks) / (price as number))
      : projShrTrend[y];
    if (canLink) prevSh = shares_diluted;

    projIS.push({
      fy: y + 1, revenue, growth: projRev[y].growth, gross_profit, gross_margin: projGM[y],
      operating_income, operating_margin: projOM[y], ebitda, ebitda_margin: projEM[y],
      interest_expense, interest_income, true_other, income_before_tax, tax_expense, net_income,
      net_margin: revenue ? net_income / revenue : null, shares_diluted,
    });
    projCF.push({
      fy: y + 1, da, sbc, wc_change, ocf, capex, inv_purchases, inv_sales, div_paid, buybacks,
      s_issued, d_repay, d_issued, financing_cf, net_change_in_cash, free_cash_flow: ocf + capex,
    });

    const cogs = revenue - gross_profit;
    const ar = Math.trunc(revenue * AR_ratio);
    const inv = Math.trunc(cogs * INV_ratio);
    const ap = Math.trunc(cogs * AP_ratio);
    // Purchasing investments is a cash OUTFLOW (negative) that INCREASES the balance, so the
    // flow is subtracted. Split by the prior year's own STI/LTI proportion, which evolves.
    const invFlow = inv_purchases + inv_sales;
    const invTot = prevSTI + prevLTI;
    const stiShare = invTot !== 0 ? prevSTI / invTot : 0.5;
    const sti = prevSTI - invFlow * stiShare;
    const lti = prevLTI - invFlow * (1 - stiShare);
    let cash = prevCash + net_change_in_cash;
    if (cash < 0) cash = Math.max(0, Math.trunc(prevCash * 0.9));
    // D&A is split 85/15 across PP&E and intangibles so the two together absorb exactly 100%
    // of it. CapEx is floored at D&A so chronic under-investers hold flat rather than decaying.
    const effectiveCapex = Math.max(Math.abs(capex), Math.abs(da));
    const ppe = Math.max(0, prevPPE + effectiveCapex * 0.85 - Math.abs(da) * 0.85);
    const intangibles = Math.max(0, prevIntangibles + effectiveCapex * 0.15 - Math.abs(da) * 0.15);
    const totalCurrentAssets = cash + sti + ar + inv + frozen.oca;
    const totalNonCurrentAssets = ppe + frozen.goodwill + intangibles + lti + frozen.onca;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const stDebt = frozen.stDebt;
    const ltDebt = Math.max(0, prevLTDebt + d_issued + d_repay);
    const totalDebt = stDebt + ltDebt;
    const totalCurrentLiab = ap + stDebt + frozen.ocl;
    const totalNonCurrentLiab = ltDebt + frozen.oncl;
    const totalLiabilities = totalCurrentLiab + totalNonCurrentLiab;
    const retained = prevRetained + net_income + div_paid;
    const common = prevCommon + sbc;
    const otherEquityAdj = prevOtherEquity + buybacks + s_issued;
    const totalSE = common + retained + otherEquityAdj;

    projBS.push({
      fy: y + 1, cash, ar, inv, ap, sti, lti, totalCurrentAssets, ppe, intangibles,
      totalNonCurrentAssets, totalAssets, stDebt, ltDebt, totalDebt, totalCurrentLiab,
      totalNonCurrentLiab, totalLiabilities, retained, common, otherEquityAdj, totalSE,
      netDebt: totalDebt - cash, balanceCheck: totalAssets - totalLiabilities - totalSE,
    });

    prevDebt = totalDebt; prevSTI = sti; prevLTI = lti; prevInvestments = cash + sti + lti;
    prevCash = cash; prevPPE = ppe; prevIntangibles = intangibles; prevLTDebt = ltDebt;
    prevRetained = retained; prevCommon = common; prevOtherEquity = otherEquityAdj;
  }

  return { projIS, projCF, projBS, marginMode: mode, autoDetected, effectiveBorrowRate: effBorrow, effectiveYieldRate: effYield, taxRate };
}
