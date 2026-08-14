import type { CompanyData, SectorMedians } from '../engine/types.ts';
import { createServerClient } from './server.ts';

interface StatementRow { statement: string; fiscal_year: number; is_projected: boolean; period_end_date: string | null; data: Record<string, unknown> }

/** Assemble the engine's CompanyData shape from stored rows. */
export async function loadCompany(ticker: string): Promise<CompanyData | null> {
  const sb = createServerClient();
  const { data: company, error } = await sb
    .from('companies')
    .select('id, ticker, company_name, sector, current_price, shares_outstanding, beta')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!company) return null;

  const { data: rows, error: e2 } = await sb
    .from('financial_statements')
    .select('statement, fiscal_year, is_projected, period_end_date, data')
    .eq('company_id', company.id)
    .eq('is_projected', false)
    .order('fiscal_year', { ascending: true });
  if (e2) throw e2;

  const pick = (kind: string) =>
    (rows as StatementRow[] ?? [])
      .filter((r) => r.statement === kind)
      .map((r) => ({ ...r.data, fiscal_year: r.fiscal_year, is_projected: r.is_projected, period_end_date: r.period_end_date })) as never[];

  return {
    meta: {
      ticker: company.ticker, company_name: company.company_name, sector: company.sector,
      current_price: company.current_price, shares_outstanding: company.shares_outstanding, beta: company.beta,
    },
    income_statement: pick('income_statement'),
    balance_sheet: pick('balance_sheet'),
    cash_flow: pick('cash_flow'),
  };
}

/** Sector margin medians, straight from the database view that computes them. */
export async function loadSectorMedians(): Promise<SectorMedians> {
  const sb = createServerClient();
  const { data, error } = await sb.from('sector_margin_medians').select('sector, gross_median, op_median, ebitda_median');
  if (error) throw error;
  const out: SectorMedians = {};
  for (const r of data ?? []) {
    out[(r as { sector: string }).sector ?? 'Other'] = {
      gross: (r as { gross_median: number | null }).gross_median,
      op: (r as { op_median: number | null }).op_median,
      ebitda: (r as { ebitda_median: number | null }).ebitda_median,
    };
  }
  return out;
}

export async function listCompanies() {
  const sb = createServerClient();
  const { data, error } = await sb
    .from('companies')
    .select('ticker, company_name, sector, current_price, beta')
    .eq('is_active', true)
    .order('ticker');
  if (error) throw error;
  return data ?? [];
}

export async function loadOpenFlags() {
  const sb = createServerClient();
  const { data, error } = await sb
    .from('quality_flags')
    .select('code, severity, message, fiscal_year, context, detected_at, companies(ticker, company_name, sector)')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

export async function loadLatestValuations() {
  const sb = createServerClient();
  const { data, error } = await sb
    .from('latest_valuations')
    .select('ticker, company_name, sector, price, fcfe_per_share, fcff_per_share, residual_income_per_share, method_spread, wacc, cost_of_equity, tv_share_ev, margin_of_safety, created_at');
  if (error) throw error;
  return data ?? [];
}
