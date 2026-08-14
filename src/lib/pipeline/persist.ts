/** Supabase writes for the ingestion pipeline. Service-role only. */
import { createServiceClient } from '../supabase/server.ts';
import type { CompanyData, ScenarioResult, Assumptions } from '../engine/types.ts';
import type { ProviderCompany } from '../providers/types.ts';
import type { QualityFinding } from './ingest.ts';
import { ENGINE_VERSION } from './ingest.ts';

type SB = ReturnType<typeof createServiceClient>;

export async function startRun(sb: SB, provider: string, universe: string[]) {
  const { data, error } = await sb.from('ingestion_runs').insert({ provider, universe, status: 'running' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function finishRun(sb: SB, id: string, patch: { status: string; tickers_ok: number; tickers_failed: number; flags_raised: number; error?: string }) {
  await sb.from('ingestion_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id);
}

export async function upsertCompany(sb: SB, meta: CompanyData['meta']): Promise<string> {
  const { data, error } = await sb.from('companies').upsert({
    ticker: meta.ticker, company_name: meta.company_name, sector: meta.sector,
    current_price: meta.current_price, shares_outstanding: meta.shares_outstanding, beta: meta.beta,
    market_data_at: new Date().toISOString(), is_active: true,
  }, { onConflict: 'ticker' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function upsertStatements(sb: SB, companyId: string, provider: string, data: CompanyData, raw: ProviderCompany['raw']) {
  const rawByYear = (arr: unknown[]): Map<number, unknown> => {
    const m = new Map<number, unknown>();
    for (const r of arr ?? []) {
      const o = r as Record<string, unknown>;
      const y = Number(o.calendarYear ?? String(o.date ?? '').slice(0, 4));
      if (Number.isFinite(y)) m.set(y, r);
    }
    return m;
  };
  const rawMaps = { income_statement: rawByYear(raw.income), balance_sheet: rawByYear(raw.balance), cash_flow: rawByYear(raw.cash) };
  const rows: Record<string, unknown>[] = [];
  for (const kind of ['income_statement', 'balance_sheet', 'cash_flow'] as const) {
    for (const r of data[kind]) {
      const { fiscal_year, is_projected, period_end_date, ...rest } = r as Record<string, unknown> & { fiscal_year: number };
      rows.push({
        company_id: companyId, statement: kind, fiscal_year, is_projected: !!is_projected,
        period_end_date: (period_end_date as string) ?? null, data: rest,
        raw: rawMaps[kind].get(fiscal_year) ?? null, provider,
      });
    }
  }
  if (!rows.length) return;
  const { error } = await sb.from('financial_statements').upsert(rows, { onConflict: 'company_id,statement,fiscal_year,is_projected' });
  if (error) throw error;
}

export async function writeValuation(sb: SB, companyId: string, assumptions: Assumptions, r: ScenarioResult) {
  const { error } = await sb.from('valuation_snapshots').insert({
    company_id: companyId, scenario_name: 'base', assumptions,
    price: r.price, fcfe_per_share: r.fcfe.perShare, fcff_per_share: r.fcff?.perShare ?? null,
    residual_income_per_share: r.residualIncome?.perShare ?? null,
    cost_of_equity: r.costOfEquity, wacc: r.fcff?.wacc ?? null, method_spread: r.diagnostics.spread,
    tv_share_equity: r.fcfe.tvShare, tv_share_ev: r.fcff?.tvShare ?? null,
    margin_of_safety: r.fcfe.marginOfSafety,
    detail: { projIS: r.projIS, projCF: r.projCF, projBS: r.projBS, fcfeRows: r.fcfeRows, diagnostics: r.diagnostics, flags: r.flags },
    engine_version: ENGINE_VERSION,
  });
  if (error) throw error;
}

/** Replace the open flag set for a company so the dashboard reflects the latest run only. */
export async function replaceFlags(sb: SB, companyId: string, findings: QualityFinding[]) {
  await sb.from('quality_flags').update({ resolved_at: new Date().toISOString() }).eq('company_id', companyId).is('resolved_at', null);
  if (!findings.length) return;
  const { error } = await sb.from('quality_flags').insert(findings.map((f) => ({
    company_id: companyId, code: f.code, severity: f.severity, message: f.message,
    fiscal_year: f.fiscalYear ?? null, context: f.context ?? null,
  })));
  if (error) throw error;
}
