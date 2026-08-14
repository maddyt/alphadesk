/**
 * Source-data normalisation and correction.
 *
 * Vendor fundamentals arrive with two recurring defects:
 *   1. duplicate fiscal-year rows (a stale modelled row alongside the real reported year), and
 *   2. subtotals that do not equal the sum of their own stored components, because the
 *      vendor's catch-all "other" buckets omit categories (deferred tax, leases, pensions).
 *
 * `normalise` keeps one row per fiscal year, preferring reported over modelled and the more
 * complete row on ties. `recomputeOtherBuckets` rebuilds every "other" bucket as a pure
 * residual so each subtotal ties by construction.
 *
 * Note on provenance: the reference implementation applied six patches (A1-A6) at render
 * time, four of which repaired *stored projections*. This portal computes projections itself
 * (see forecast.ts), so only the historical corrections are needed here — the projection
 * build enforces the remaining invariants natively rather than patching them afterwards.
 */
import type { BalanceRow, CompanyData } from './types.ts';
import { num } from './math.ts';

const nonNullCount = (r: Record<string, unknown>): number => Object.values(r).filter((v) => v !== null && v !== undefined).length;

export function normalise<T extends { fiscal_year: number; is_projected?: boolean }>(rows: T[]): T[] {
  const byFy = new Map<number, T>();
  for (const r of rows ?? []) {
    const prev = byFy.get(r.fiscal_year);
    if (!prev) { byFy.set(r.fiscal_year, r); continue; }
    let keep: T;
    if (!!prev.is_projected !== !!r.is_projected) keep = prev.is_projected ? r : prev;
    else keep = nonNullCount(r as Record<string, unknown>) > nonNullCount(prev as Record<string, unknown>) ? r : prev;
    byFy.set(r.fiscal_year, keep);
  }
  return [...byFy.values()].sort((a, b) => a.fiscal_year - b.fiscal_year);
}

/** Rebuild historical "other" buckets as residuals so subtotals tie by construction. */
export function recomputeOtherBuckets(rows: BalanceRow[]): BalanceRow[] {
  return rows.map((r) => {
    if (r.is_projected) return r;
    const out: BalanceRow = { ...r };
    if (r.total_current_assets !== null && r.total_current_assets !== undefined)
      out.other_current_assets = num(r.total_current_assets) - num(r.cash_and_equivalents) - num(r.short_term_investments) - num(r.accounts_receivable) - num(r.inventory);
    if (r.total_non_current_assets !== null && r.total_non_current_assets !== undefined)
      out.other_non_current_assets = num(r.total_non_current_assets) - num(r.property_plant_equipment) - num(r.goodwill) - num(r.intangible_assets) - num(r.long_term_investments);
    if (r.total_current_liabilities !== null && r.total_current_liabilities !== undefined)
      out.other_current_liabilities = num(r.total_current_liabilities) - num(r.accounts_payable) - num(r.short_term_debt);
    if (r.total_non_current_liabilities !== null && r.total_non_current_liabilities !== undefined)
      out.other_non_current_liabilities = num(r.total_non_current_liabilities) - num(r.long_term_debt);
    return out;
  });
}

/** Full clean: dedupe every statement, then repair the balance sheet's residual buckets. */
export function prepare(data: CompanyData): CompanyData {
  return {
    meta: data.meta,
    income_statement: normalise(data.income_statement ?? []),
    balance_sheet: recomputeOtherBuckets(normalise(data.balance_sheet ?? [])),
    cash_flow: normalise(data.cash_flow ?? []),
  };
}

/** Accounting-identity residual for a reported year. Non-zero means the source does not balance. */
export function balanceGap(r: BalanceRow): number | null {
  if (r.total_assets === null || r.total_assets === undefined) return null;
  if (r.total_liabilities === null || r.total_liabilities === undefined) return null;
  if (r.total_stockholders_equity === null || r.total_stockholders_equity === undefined) return null;
  return num(r.total_assets) - num(r.total_liabilities) - num(r.total_stockholders_equity) - num(r.minority_interest);
}
