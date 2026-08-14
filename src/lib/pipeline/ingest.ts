/**
 * Ingestion pipeline: provider -> normalise -> correct -> quality-audit -> store -> value.
 *
 * The audit step is not decoration. Vendor fundamentals routinely fail their own accounting
 * identity, and a portal that silently swallows that produces confident nonsense. Every gap is
 * recorded against the company so the audit dashboard can show exactly how much of the index
 * is standing on bad data.
 */
import type { CompanyData, SectorMedians, ValuationFlag } from '../engine/types.ts';
import { prepare, balanceGap } from '../engine/corrections.ts';
import { defaultAssumptions } from '../engine/assumptions.ts';
import { runScenario } from '../engine/valuation.ts';
import { computeSectorMedians } from '../engine/analytics.ts';
import { getProvider } from '../providers/index.ts';
import type { DataProvider, ProviderCompany } from '../providers/types.ts';
import { num } from '../engine/math.ts';

export const ENGINE_VERSION = '1.0.0';

export interface QualityFinding { code: string; severity: 'warn' | 'info'; message: string; fiscalYear?: number; context?: Record<string, unknown> }

/** Structural checks on reported data — independent of any forecast. */
export function auditCompany(data: CompanyData): QualityFinding[] {
  const out: QualityFinding[] = [];
  const is_ = data.income_statement.filter((r) => !r.is_projected);
  const bs = data.balance_sheet.filter((r) => !r.is_projected);
  const cf = data.cash_flow.filter((r) => !r.is_projected);

  if (is_.length < 5) out.push({ code: 'THIN_HISTORY', severity: 'warn', message: `Only ${is_.length} reported fiscal years — the forecast calibrates on very little evidence and the backtest cannot run.` });
  if (!data.meta.current_price) out.push({ code: 'NO_PRICE', severity: 'warn', message: 'No market price available; margin of safety and share-count linkage are unavailable.' });
  if (!data.meta.shares_outstanding) out.push({ code: 'NO_SHARES', severity: 'warn', message: 'No share count available; per-share values cannot be computed.' });
  if (data.meta.beta === null || data.meta.beta === undefined) out.push({ code: 'NO_BETA', severity: 'info', message: 'No beta available; the cost of equity falls back to a beta of 1.0.' });

  for (const r of bs) {
    const gap = balanceGap(r);
    if (gap !== null && r.total_assets && Math.abs(gap) / Math.abs(num(r.total_assets)) > 0.005) {
      out.push({
        code: 'BALANCE_GAP', severity: 'warn', fiscalYear: r.fiscal_year,
        message: `Reported balance sheet does not satisfy Assets = Liabilities + Equity in FY${r.fiscal_year} (gap ${(gap / 1e6).toFixed(0)}mm, ${((gap / num(r.total_assets)) * 100).toFixed(2)}% of assets).`,
        context: { gap, totalAssets: num(r.total_assets) },
      });
    }
  }
  for (const r of is_) {
    if (r.revenue !== null && r.revenue !== undefined && num(r.revenue) <= 0) out.push({ code: 'NON_POSITIVE_REVENUE', severity: 'warn', fiscalYear: r.fiscal_year, message: `Revenue is not positive in FY${r.fiscal_year}; ratio calibration for that year is meaningless.` });
    if (r.cost_of_revenue !== null && r.cost_of_revenue !== undefined && num(r.cost_of_revenue) < 0) out.push({ code: 'NEGATIVE_COGS', severity: 'info', fiscalYear: r.fiscal_year, message: `Cost of revenue is negative in FY${r.fiscal_year} (gross profit exceeds revenue). Excluded from COGS-denominated ratios.` });
    if ((r.interest_expense === 0 || r.interest_expense === null) && bs.find((b) => b.fiscal_year === r.fiscal_year && num(b.total_debt) > 1e9)) {
      out.push({ code: 'ZERO_INTEREST_WITH_DEBT', severity: 'info', fiscalYear: r.fiscal_year, message: `FY${r.fiscal_year} reports no interest expense despite material debt — treated as a reporting gap and excluded from rate calibration.` });
    }
  }
  const years = is_.map((r) => r.fiscal_year);
  for (let i = 1; i < years.length; i++) {
    if (years[i] - years[i - 1] > 1) out.push({ code: 'YEAR_GAP', severity: 'warn', message: `Missing fiscal years between FY${years[i - 1]} and FY${years[i]}.` });
  }
  if (!cf.length) out.push({ code: 'NO_CASH_FLOW', severity: 'warn', message: 'No cash flow statement rows; the valuation cannot run.' });
  return out;
}

export interface IngestOptions { universe: string; years: number; provider?: DataProvider; concurrency?: number }
export interface IngestSummary { provider: string; ok: string[]; failed: { ticker: string; error: string }[]; flags: number }

/** Fetch and normalise every ticker. Persistence is injected so this stays testable. */
export async function collect(opts: IngestOptions): Promise<{ provider: DataProvider; companies: { ticker: string; provider: ProviderCompany; data: CompanyData; findings: QualityFinding[] }[]; failed: { ticker: string; error: string }[] }> {
  const provider = opts.provider ?? getProvider();
  const tickers = await provider.universe(opts.universe);
  const limit = opts.concurrency ?? 4;
  const companies: { ticker: string; provider: ProviderCompany; data: CompanyData; findings: QualityFinding[] }[] = [];
  const failed: { ticker: string; error: string }[] = [];

  for (let i = 0; i < tickers.length; i += limit) {
    const batch = tickers.slice(i, i + limit);
    const settled = await Promise.allSettled(batch.map(async (t) => {
      const pc = await provider.fetchCompany(t, opts.years);
      const data = prepare({ meta: pc.meta, income_statement: pc.income_statement, balance_sheet: pc.balance_sheet, cash_flow: pc.cash_flow });
      return { ticker: t, provider: pc, data, findings: auditCompany(data) };
    }));
    settled.forEach((s, j) => {
      if (s.status === 'fulfilled') companies.push(s.value);
      else failed.push({ ticker: batch[j], error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
    });
  }
  return { provider, companies, failed };
}

/** Value every company against sector medians derived from the same batch. */
export function valueAll(companies: { ticker: string; data: CompanyData }[], medians?: SectorMedians) {
  const med = medians ?? computeSectorMedians(companies.map((c) => c.data));
  return companies.map(({ ticker, data }) => {
    const a = defaultAssumptions(data.meta, {
      rf: Number(process.env.DEFAULT_RISK_FREE ?? 0.046),
      erp: Number(process.env.DEFAULT_ERP ?? 0.0446),
      terminalGrowth: Number(process.env.DEFAULT_TERMINAL_GROWTH ?? 0.025),
    });
    try {
      const result = runScenario(data, a, med[data.meta.sector ?? 'Other'] ?? { gross: null, op: null, ebitda: null });
      return { ticker, assumptions: a, result, error: null as string | null };
    } catch (e) {
      return { ticker, assumptions: a, result: null, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export function valuationFlagsToFindings(flags: ValuationFlag[]): QualityFinding[] {
  return flags.map((f) => ({ code: f.code, severity: f.severity, message: f.message }));
}
