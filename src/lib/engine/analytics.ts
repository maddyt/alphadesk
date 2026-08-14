/**
 * Analytics layered on the scenario runner: uncertainty, sensitivity, market-implied
 * expectations, and an out-of-sample test of the forecast machinery itself.
 */
import type { Assumptions, CompanyData, ScenarioResult, SectorMedian } from './types.ts';
import { mean, percentile, randNormal, safeDiv, seededRandom, stdev, yoyGrowthRates } from './math.ts';
import { runScenario } from './valuation.ts';
import { forecastMargin, forecastRevenue } from './forecast.ts';
import { num } from './math.ts';

/** Per-company volatility used to size every perturbation. Damped to 60% of raw history. */
export function historicalVolatility(data: CompanyData): { sdG: number; sdM: number; sdR: number } {
  const is_ = data.income_statement.filter((r) => !r.is_projected);
  const rates = yoyGrowthRates(is_.map((r) => num(r.revenue))).filter((v): v is number => v !== null && Number.isFinite(v));
  const opM = is_.map((r) => safeDiv(r.operating_income as number, r.revenue as number)).filter((v): v is number => v !== null);
  return {
    sdG: Math.min(0.15, Math.max(0.015, (stdev(rates) ?? 0.05) * 0.6)),
    sdM: Math.min(0.05, Math.max(0.004, (stdev(opM) ?? 0.015) * 0.6)),
    sdR: 0.008,
  };
}

export interface MonteCarloResult {
  trials: number; failed: number; sdG: number; sdM: number; sdR: number;
  p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null;
  probAbovePrice: number | null; values: number[];
}

/** Seeded by default so the same scenario always produces the same distribution. */
export function monteCarlo(
  data: CompanyData, a: Assumptions, sectorMedian: SectorMedian, trials = 800, seed = 42,
): MonteCarloResult {
  const { sdG, sdM, sdR } = historicalVolatility(data);
  const rand = seededRandom(seed);
  const price = data.meta.current_price;
  const values: number[] = [];
  let failed = 0, above = 0;
  for (let i = 0; i < trials; i++) {
    const r = runScenario(data, a, sectorMedian, {
      gShift: randNormal(rand) * sdG, mShift: randNormal(rand) * sdM, rShift: randNormal(rand) * sdR,
    });
    const v = r.fcfe.perShare;
    if (r.fcfe.terminalOk && v !== null && Number.isFinite(v) && v > 0) {
      values.push(v);
      if (price !== null && v > price) above++;
    } else failed++;
  }
  values.sort((x, y) => x - y);
  return {
    trials, failed, sdG, sdM, sdR,
    p10: percentile(values, 0.10), p25: percentile(values, 0.25), p50: percentile(values, 0.50),
    p75: percentile(values, 0.75), p90: percentile(values, 0.90),
    probAbovePrice: trials ? above / trials : null, values,
  };
}

export interface SensitivityGrid { waccRows: number[]; growthCols: number[]; grid: (number | null)[][] }

/** Implied value per share across discount rate x terminal growth, on the FCFF route. */
export function sensitivity(result: ScenarioResult, a: Assumptions, shares: number): SensitivityGrid {
  const f = result.fcff;
  if (!f?.ok) return { waccRows: [], growthCols: [], grid: [] };
  const mid = a.dcf.midYear ? 0.5 : 0;
  const n = f.fcff.length, last = f.fcff[n - 1];
  const waccRows = [-0.02, -0.015, -0.01, 0, 0.01, 0.015, 0.02].map((d) => f.wacc + d).sort((x, y) => x - y);
  const growthCols = [0.015, 0.02, 0.025, 0.03, 0.035, 0.04];
  const grid = waccRows.map((w) => growthCols.map((g) => {
    if (!(w > g + 0.005)) return null;
    let pv = 0;
    f.fcff.forEach((v, i) => { pv += v / Math.pow(1 + w, i + 1 - mid); });
    const tv = (last * (1 + g)) / (w - g);
    return (pv + tv / Math.pow(1 + w, n - mid) - f.netDebt) / shares;
  }));
  return { waccRows, growthCols, grid };
}

export type ReverseDcf =
  | { status: 'ok'; growthShift: number; impliedAvgGrowth: number; year1Growth: number; modelAvgGrowth: number }
  | { status: 'below_range' | 'above_range' };

/**
 * Inverts the question: not "what is it worth" but "what growth must hold for today's price
 * to be correct". Bisection on a uniform shift to the whole growth path.
 */
export function reverseDcf(data: CompanyData, a: Assumptions, sectorMedian: SectorMedian): ReverseDcf | null {
  const price = data.meta.current_price;
  if (!price) return null;
  const f = (g: number): number => {
    const r = runScenario(data, a, sectorMedian, { gShift: g });
    return r.fcfe.terminalOk && r.fcfe.perShare !== null && Number.isFinite(r.fcfe.perShare)
      ? r.fcfe.perShare - price : -price * 2;
  };
  let lo = -0.35, hi = 0.45;
  if (f(lo) > 0) return { status: 'below_range' };
  if (f(hi) < 0) return { status: 'above_range' };
  for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  const g = (lo + hi) / 2;
  const solved = runScenario(data, a, sectorMedian, { gShift: g });
  const base = runScenario(data, a, sectorMedian);
  return {
    status: 'ok', growthShift: g,
    impliedAvgGrowth: mean(solved.projIS.map((p) => p.growth))!,
    year1Growth: solved.projIS[0].growth,
    modelAvgGrowth: mean(base.projIS.map((p) => p.growth))!,
  };
}

export interface BacktestRow {
  fiscalYear: number; predictedRevenue: number | null; actualRevenue: number | null; revenueError: number | null;
  predictedOperatingIncome: number | null; actualOperatingIncome: number | null; operatingIncomeError: number | null;
}
export interface BacktestResult { cutoffYear: number; rows: BacktestRow[]; revenueMape: number | null; operatingIncomeMape: number | null }

/**
 * Re-runs the forecast using only data available as of ~3 years ago and compares it with what
 * actually happened. The only honest way to know whether the machinery deserves trust.
 */
export function backtest(data: CompanyData, a: Assumptions, holdout = 3): BacktestResult | null {
  const is_ = data.income_statement.filter((r) => !r.is_projected);
  const n = is_.length;
  const k = Math.min(holdout, n - 5);
  if (k < 1) return null;
  const train = is_.slice(0, n - k), test = is_.slice(n - k);
  const projR = forecastRevenue(train.map((r) => num(r.revenue)), k, a.revenue);
  const opM = train.map((r) => safeDiv(r.operating_income as number, r.revenue as number));
  const projM = forecastMargin(opM, -0.5, 0.7, k, a.margin.stability, a.margin.trendDamp, 'recency', null, 0);
  const rows: BacktestRow[] = test.map((r, i) => {
    const pr = projR[i]?.revenue ?? null;
    const po = pr !== null && projM[i] !== undefined ? pr * projM[i] : null;
    const ar = r.revenue ?? null, ao = r.operating_income ?? null;
    return {
      fiscalYear: r.fiscal_year, predictedRevenue: pr, actualRevenue: ar as number | null,
      revenueError: pr !== null && ar ? Math.abs(pr - (ar as number)) / Math.abs(ar as number) : null,
      predictedOperatingIncome: po, actualOperatingIncome: ao as number | null,
      operatingIncomeError: po !== null && ao ? Math.abs(po - (ao as number)) / Math.abs(ao as number) : null,
    };
  });
  return {
    cutoffYear: train[train.length - 1].fiscal_year, rows,
    revenueMape: mean(rows.map((r) => r.revenueError).filter((v): v is number => v !== null)),
    operatingIncomeMape: mean(rows.map((r) => r.operatingIncomeError).filter((v): v is number => v !== null)),
  };
}

/** Deterministic bull / bear bookends at +/-1 sigma. */
export function cases(data: CompanyData, a: Assumptions, sectorMedian: SectorMedian) {
  const { sdG, sdM } = historicalVolatility(data);
  const mk = (s: number) => {
    const r = runScenario(data, a, sectorMedian, { gShift: s * sdG, mShift: s * sdM });
    return {
      perShare: r.fcfe.terminalOk ? r.fcfe.perShare : null,
      avgGrowth: mean(r.projIS.map((p) => p.growth)),
      endOperatingMargin: r.projIS[r.projIS.length - 1].operating_margin,
    };
  };
  return { sdG, sdM, bull: mk(1), bear: mk(-1) };
}

/** Sector medians of last-actual margins, computed across the stored universe. */
export function computeSectorMedians(all: CompanyData[]): Record<string, SectorMedian> {
  const bySector: Record<string, { g: number[]; o: number[]; e: number[] }> = {};
  for (const c of all) {
    const acts = c.income_statement.filter((r) => !r.is_projected);
    if (!acts.length) continue;
    const last = acts[acts.length - 1];
    const rev = num(last.revenue);
    if (!rev) continue;
    const key = c.meta.sector ?? 'Other';
    const b = (bySector[key] ??= { g: [], o: [], e: [] });
    if (last.gross_profit !== null && last.gross_profit !== undefined) b.g.push(num(last.gross_profit) / rev);
    if (last.operating_income !== null && last.operating_income !== undefined) b.o.push(num(last.operating_income) / rev);
    if (last.ebitda !== null && last.ebitda !== undefined) b.e.push(num(last.ebitda) / rev);
  }
  const out: Record<string, SectorMedian> = {};
  const med = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((p, q) => p - q), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  for (const k of Object.keys(bySector)) out[k] = { gross: med(bySector[k].g), op: med(bySector[k].o), ebitda: med(bySector[k].e) };
  return out;
}
