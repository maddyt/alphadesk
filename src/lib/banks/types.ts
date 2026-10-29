import type { Fact } from '../types.ts';

// BankVal AI data model. Every figure keeps the SEC XBRL facts it came from.

export interface BankItem {
  value: number;
  facts: Fact[];
  /** How a derived figure was built, e.g. "StockholdersEquity − PreferredStockValue". */
  formula?: string;
  /** True when the filing has no such fact and the engine substituted a proxy. */
  estimated?: boolean;
}

export type BankKey =
  // latest fiscal year, income statement
  | 'netIncome'
  | 'preferredDividends'
  | 'netIncomeToCommon'
  | 'nii'
  | 'nonInterestIncome'
  | 'nonInterestExpense'
  | 'provision'
  | 'dividendsPerShare'
  // latest balance sheet (10-Q or 10-K)
  | 'totalAssets'
  | 'totalEquity'
  | 'preferred'
  | 'commonEquity'
  | 'goodwill'
  | 'intangibles'
  | 'loans'
  | 'deposits'
  | 'allowance'
  | 'npl'
  | 'cash'
  | 'afs'
  | 'htm'
  | 'htmFairValue'
  | 'shares'
  // regulatory capital (latest)
  | 'cet1'
  | 'tier1'
  | 'totalCapital'
  | 'rwa'
  // prior fiscal year-end, for averages
  | 'commonEquityPrior'
  | 'goodwillPrior'
  | 'intangiblesPrior'
  | 'totalAssetsPrior';

export const BANK_LABELS: Record<BankKey, string> = {
  netIncome: 'Net income',
  preferredDividends: 'Preferred dividends',
  netIncomeToCommon: 'Net income to common',
  nii: 'Net interest income',
  nonInterestIncome: 'Noninterest income',
  nonInterestExpense: 'Noninterest expense',
  provision: 'Provision for credit losses',
  dividendsPerShare: 'Dividends declared per share',
  totalAssets: 'Total assets',
  totalEquity: 'Total stockholders’ equity',
  preferred: 'Preferred stock',
  commonEquity: 'Common stockholders’ equity',
  goodwill: 'Goodwill',
  intangibles: 'Intangible assets (ex goodwill)',
  loans: 'Loans and leases',
  deposits: 'Deposits',
  allowance: 'Allowance for credit losses',
  npl: 'Nonaccrual / nonperforming loans',
  cash: 'Cash and deposits at banks',
  afs: 'Available-for-sale securities',
  htm: 'Held-to-maturity securities (amortized cost)',
  htmFairValue: 'Held-to-maturity securities (fair value)',
  shares: 'Common shares outstanding',
  cet1: 'Common Equity Tier 1 capital',
  tier1: 'Tier 1 capital',
  totalCapital: 'Total risk-based capital',
  rwa: 'Risk-weighted assets',
  commonEquityPrior: 'Common equity (prior year-end)',
  goodwillPrior: 'Goodwill (prior year-end)',
  intangiblesPrior: 'Intangibles (prior year-end)',
  totalAssetsPrior: 'Total assets (prior year-end)',
};

export interface BankFinancials {
  ticker: string;
  name: string;
  cik: string;
  sic: string | null;
  source: 'sec-live' | 'snapshot';
  fetchedAt: string;
  fyEnd: string;
  fyLabel: string; // "FY2025"
  balanceEnd: string;
  balanceLabel: string; // "Sep-26"
  items: Partial<Record<BankKey, BankItem>>;
  warnings: string[];
}

export interface BankMarket {
  price: number;
  beta: number;
  asOf: string;
  source: string;
  low52: number | null;
  high52: number | null;
}

export interface Bank {
  fin: BankFinancials;
  market: BankMarket;
}
