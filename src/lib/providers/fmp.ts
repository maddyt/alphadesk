/**
 * Financial Modeling Prep adapter.
 *
 * Normalisation is deliberate and total: every field the engine reads is mapped explicitly,
 * so a vendor rename surfaces as a null here rather than as a silently wrong valuation
 * downstream. Anything unmapped still reaches storage inside `raw`.
 */
import type { DataProvider, ProviderCompany } from './types.ts';
import { ProviderError } from './types.ts';
import type { BalanceRow, CashFlowRow, IncomeRow } from '../engine/types.ts';

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export class FmpProvider implements DataProvider {
  readonly name = 'fmp';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    if (!apiKey) throw new Error('FMP_API_KEY is required for the fmp provider');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? process.env.FMP_BASE_URL ?? 'https://financialmodelingprep.com/api/v3';
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('apikey', this.apiKey);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new ProviderError(this.name, path, `HTTP ${res.status} ${res.statusText}`, res.status);
    return (await res.json()) as T;
  }

  async universe(spec: string): Promise<string[]> {
    if (spec.toUpperCase() === 'SP500') {
      const rows = await this.get<{ symbol: string }[]>('sp500_constituent');
      return rows.map((r) => r.symbol).filter(Boolean);
    }
    return spec.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  async fetchCompany(ticker: string, years: number): Promise<ProviderCompany> {
    const [income, balance, cash, profileArr, quoteArr] = await Promise.all([
      this.get<Record<string, unknown>[]>(`income-statement/${ticker}`, { period: 'annual', limit: years }),
      this.get<Record<string, unknown>[]>(`balance-sheet-statement/${ticker}`, { period: 'annual', limit: years }),
      this.get<Record<string, unknown>[]>(`cash-flow-statement/${ticker}`, { period: 'annual', limit: years }),
      this.get<Record<string, unknown>[]>(`profile/${ticker}`),
      this.get<Record<string, unknown>[]>(`quote/${ticker}`),
    ]);
    if (!income?.length) throw new ProviderError(this.name, ticker, 'no income statement rows returned');
    const profile = profileArr?.[0] ?? {};
    const quote = quoteArr?.[0] ?? {};
    const fy = (r: Record<string, unknown>): number => Number(r.calendarYear ?? String(r.date ?? '').slice(0, 4));

    const incomeRows: IncomeRow[] = income.map((r) => ({
      fiscal_year: fy(r), is_projected: false, period_end_date: (r.date as string) ?? null,
      revenue: n(r.revenue), cost_of_revenue: n(r.costOfRevenue), gross_profit: n(r.grossProfit),
      operating_expenses: n(r.operatingExpenses), operating_income: n(r.operatingIncome),
      depreciation_and_amortization: n(r.depreciationAndAmortization), ebitda: n(r.ebitda),
      interest_expense: n(r.interestExpense), interest_income: n(r.interestIncome),
      income_before_tax: n(r.incomeBeforeTax), income_tax_expense: n(r.incomeTaxExpense),
      net_income: n(r.netIncome), eps_diluted: n(r.epsdiluted),
      shares_outstanding: n(r.weightedAverageShsOut), shares_outstanding_diluted: n(r.weightedAverageShsOutDil),
      research_and_development_expenses: n(r.researchAndDevelopmentExpenses),
      selling_general_and_administrative_expenses: n(r.sellingGeneralAndAdministrativeExpenses),
    }));

    const balanceRows: BalanceRow[] = balance.map((r) => ({
      fiscal_year: fy(r), is_projected: false,
      cash_and_equivalents: n(r.cashAndCashEquivalents), short_term_investments: n(r.shortTermInvestments),
      accounts_receivable: n(r.netReceivables), inventory: n(r.inventory),
      other_current_assets: n(r.otherCurrentAssets), total_current_assets: n(r.totalCurrentAssets),
      property_plant_equipment: n(r.propertyPlantEquipmentNet), goodwill: n(r.goodwill),
      intangible_assets: n(r.intangibleAssets), long_term_investments: n(r.longTermInvestments),
      other_non_current_assets: n(r.otherNonCurrentAssets), total_non_current_assets: n(r.totalNonCurrentAssets),
      total_assets: n(r.totalAssets), accounts_payable: n(r.accountPayables), short_term_debt: n(r.shortTermDebt),
      other_current_liabilities: n(r.otherCurrentLiabilities), total_current_liabilities: n(r.totalCurrentLiabilities),
      long_term_debt: n(r.longTermDebt), other_non_current_liabilities: n(r.otherNonCurrentLiabilities),
      total_non_current_liabilities: n(r.totalNonCurrentLiabilities), total_liabilities: n(r.totalLiabilities),
      common_stock: n(r.commonStock), retained_earnings: n(r.retainedEarnings),
      total_stockholders_equity: n(r.totalStockholdersEquity), minority_interest: n(r.minorityInterest),
      total_debt: n(r.totalDebt),
    }));

    const cashRows: CashFlowRow[] = cash.map((r) => ({
      fiscal_year: fy(r), is_projected: false,
      net_income: n(r.netIncome), depreciation_amortization: n(r.depreciationAndAmortization),
      stock_based_compensation: n(r.stockBasedCompensation), change_in_working_capital: n(r.changeInWorkingCapital),
      operating_cash_flow: n(r.netCashProvidedByOperatingActivities), capital_expenditure: n(r.capitalExpenditure),
      investment_purchases: n(r.purchasesOfInvestments), investment_sales: n(r.salesMaturitiesOfInvestments),
      investing_cash_flow: n(r.netCashUsedForInvestingActivites ?? r.netCashProvidedByInvestingActivities),
      // The vendor's net debt issuance lives in a single column. The long-term-only field is a
      // SUBSET of it and must never be added on top — that double-count was a real production bug.
      debt_repayment: n(r.netDebtIssuance ?? r.debtRepayment),
      debt_issued: n(r.longTermNetDebtIssuance),
      dividends_paid: n(r.commonDividendsPaid ?? r.dividendsPaid),
      stock_repurchased: n(r.commonStockRepurchased), stock_issued: n(r.commonStockIssuance),
      financing_cash_flow: n(r.netCashUsedProvidedByFinancingActivities ?? r.netCashProvidedByFinancingActivities),
      net_change_in_cash: n(r.netChangeInCash), free_cash_flow: n(r.freeCashFlow),
    }));

    const price = n(quote.price) ?? n(profile.price);
    // Prefer the reported share count; fall back to market cap / price only when both exist.
    let shares = n(quote.sharesOutstanding);
    if (shares === null) {
      const mktCap = n(quote.marketCap) ?? n(profile.mktCap);
      shares = mktCap !== null && price !== null && price !== 0 ? mktCap / price : null;
    }

    return {
      meta: {
        ticker: ticker.toUpperCase(),
        company_name: (profile.companyName as string) ?? ticker.toUpperCase(),
        sector: (profile.sector as string) ?? null,
        current_price: price,
        shares_outstanding: shares,
        beta: n(profile.beta),
      },
      income_statement: incomeRows,
      balance_sheet: balanceRows,
      cash_flow: cashRows,
      raw: { income, balance, cash, profile },
    };
  }
}
