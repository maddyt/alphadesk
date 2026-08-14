import type { BalanceRow, CashFlowRow, CompanyMeta, IncomeRow } from '../engine/types.ts';

/** Everything a provider must supply for one company. `raw` is kept for lineage. */
export interface ProviderCompany {
  meta: CompanyMeta;
  income_statement: IncomeRow[];
  balance_sheet: BalanceRow[];
  cash_flow: CashFlowRow[];
  raw: { income: unknown[]; balance: unknown[]; cash: unknown[]; profile: unknown };
}

export interface DataProvider {
  readonly name: string;
  /** Resolve the working universe (explicit list, or an index constituent lookup). */
  universe(spec: string): Promise<string[]>;
  fetchCompany(ticker: string, years: number): Promise<ProviderCompany>;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly ticker: string;
  readonly status?: number;

  constructor(provider: string, ticker: string, message: string, status?: number) {
    super(`[${provider}] ${ticker}: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.ticker = ticker;
    this.status = status;
  }
}
