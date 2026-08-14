/** Core domain types for the valuation engine. Pure data — no I/O, no framework. */

export interface IncomeRow {
  fiscal_year: number; is_projected?: boolean; period_end_date?: string | null;
  revenue?: number | null; cost_of_revenue?: number | null; gross_profit?: number | null;
  operating_expenses?: number | null; operating_income?: number | null;
  depreciation_and_amortization?: number | null; ebitda?: number | null;
  interest_expense?: number | null; interest_income?: number | null;
  income_before_tax?: number | null; income_tax_expense?: number | null;
  net_income?: number | null; eps_diluted?: number | null;
  shares_outstanding?: number | null; shares_outstanding_diluted?: number | null;
  [k: string]: unknown;
}

export interface BalanceRow {
  fiscal_year: number; is_projected?: boolean;
  cash_and_equivalents?: number | null; short_term_investments?: number | null;
  accounts_receivable?: number | null; inventory?: number | null;
  other_current_assets?: number | null; total_current_assets?: number | null;
  property_plant_equipment?: number | null; goodwill?: number | null; intangible_assets?: number | null;
  long_term_investments?: number | null; other_non_current_assets?: number | null;
  total_non_current_assets?: number | null; total_assets?: number | null;
  accounts_payable?: number | null; short_term_debt?: number | null;
  other_current_liabilities?: number | null; total_current_liabilities?: number | null;
  long_term_debt?: number | null; other_non_current_liabilities?: number | null;
  total_non_current_liabilities?: number | null; total_liabilities?: number | null;
  common_stock?: number | null; retained_earnings?: number | null;
  total_stockholders_equity?: number | null; minority_interest?: number | null;
  total_debt?: number | null;
  [k: string]: unknown;
}

export interface CashFlowRow {
  fiscal_year: number; is_projected?: boolean;
  net_income?: number | null; depreciation_amortization?: number | null;
  stock_based_compensation?: number | null; change_in_working_capital?: number | null;
  operating_cash_flow?: number | null; capital_expenditure?: number | null;
  investment_purchases?: number | null; investment_sales?: number | null;
  investing_cash_flow?: number | null; debt_repayment?: number | null; debt_issued?: number | null;
  dividends_paid?: number | null; stock_repurchased?: number | null; stock_issued?: number | null;
  financing_cash_flow?: number | null; net_change_in_cash?: number | null; free_cash_flow?: number | null;
  [k: string]: unknown;
}

export interface CompanyMeta {
  ticker: string; company_name: string; sector: string | null;
  current_price: number | null; shares_outstanding: number | null; beta: number | null;
}

export interface CompanyData {
  meta: CompanyMeta;
  income_statement: IncomeRow[];
  balance_sheet: BalanceRow[];
  cash_flow: CashFlowRow[];
}

export interface SectorMedian { gross: number | null; op: number | null; ebitda: number | null; }
export type SectorMedians = Record<string, SectorMedian>;

export type MarginMode = 'auto' | 'recency' | 'cycle';

export interface Assumptions {
  revenue: { growthMin: number; growthMax: number; longTermGrowth: number; decayOverride: number | null };
  margin: { stability: number; trendDamp: number; mode: MarginMode; sectorBlend: number };
  capex: { override: number | null };
  interest: { borrowRateOverride: number | null; yieldRateOverride: number | null; otherRatioOverride: number | null };
  debt: { method: 'current' | 'legacy'; nbRevRatio: number; decayToZero: boolean; legacyClamp: number };
  dcf: { rf: number; erp: number; beta: number; minCoE: number; maxCoE: number; terminalGrowth: number; nbOcfCap: number; midYear: boolean };
  flags: { sharesLink: boolean; sbcDeduct: boolean };
}

export interface Perturbation { gShift?: number; mShift?: number; rShift?: number }

export interface ProjectedIncome {
  fy: number; revenue: number; growth: number; gross_profit: number; gross_margin: number;
  operating_income: number; operating_margin: number; ebitda: number; ebitda_margin: number;
  interest_expense: number; interest_income: number; true_other: number;
  income_before_tax: number; tax_expense: number; net_income: number; net_margin: number | null;
  shares_diluted: number;
}
export interface ProjectedCashFlow {
  fy: number; da: number; sbc: number; wc_change: number; ocf: number; capex: number;
  inv_purchases: number; inv_sales: number; div_paid: number; buybacks: number; s_issued: number;
  d_repay: number; d_issued: number; financing_cf: number; net_change_in_cash: number; free_cash_flow: number;
}
export interface ProjectedBalance {
  fy: number; cash: number; ar: number; inv: number; ap: number; sti: number; lti: number;
  totalCurrentAssets: number; ppe: number; intangibles: number; totalNonCurrentAssets: number; totalAssets: number;
  stDebt: number; ltDebt: number; totalDebt: number; totalCurrentLiab: number; totalNonCurrentLiab: number;
  totalLiabilities: number; retained: number; common: number; otherEquityAdj: number; totalSE: number; netDebt: number;
  balanceCheck: number;
}
export interface FcfeRow {
  fy: number; ocf: number; capex: number; nbRaw: number; nb: number; sbcDed: number;
  fcfe: number; clamped: boolean; pv: number;
}
export interface FcffResult {
  ok: boolean; fcff: number[]; wacc: number; costOfDebt: number; taxRate: number; costOfEquity: number;
  enterpriseValue: number | null; pvOperating: number; pvTerminal: number | null;
  netDebt: number; equityValue: number | null; perShare: number | null;
  tvShare: number | null; marginOfSafety: number | null;
}
export interface ResidualIncomeResult { value: number; perShare: number | null; marginOfSafety: number | null }

export interface ValuationFlag { code: string; severity: 'warn' | 'info'; message: string }

export interface ScenarioResult {
  ticker: string;
  projIS: ProjectedIncome[]; projCF: ProjectedCashFlow[]; projBS: ProjectedBalance[];
  fcfeRows: FcfeRow[];
  costOfEquity: number; terminalGrowth: number;
  fcfe: { equityValue: number | null; perShare: number | null; pvSum: number; pvTerminal: number | null; tvShare: number | null; terminalOk: boolean; marginOfSafety: number | null };
  fcff: FcffResult | null;
  residualIncome: ResidualIncomeResult | null;
  diagnostics: {
    marginMode: 'recency' | 'cycle'; autoDetected: boolean; sectorMedian: SectorMedian;
    sectorBlend: number; sbcDeducted: boolean; sharesLinked: boolean; midYear: boolean;
    isFinancial: boolean; spread: number | null; ivToPrice: number | null;
    peCurrent: number | null; peAtIV: number | null; peForward: number | null;
    evEbitdaCurrent: number | null; terminalEquityMultiple: number | null;
    nbClampedCount: number; terminalClamped: boolean;
  };
  flags: ValuationFlag[];
  price: number | null; shares: number | null;
}
