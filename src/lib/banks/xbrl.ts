// Bank-specific parsing of the SEC companyfacts payload. Banks use a different
// slice of US GAAP than industrial companies (deposits, loans, allowance, regulatory
// capital), so this has its own tag map. Pure: no I/O, unit-testable.

import type { Fact } from '../types.ts';
import type { CompanyFactsJson } from '../sec/xbrl.ts';
import type { BankFinancials, BankItem, BankKey } from './types.ts';

interface RawFact {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

type Spec = { tag: string; unit?: string; taxonomy?: string };
const T = (...tags: string[]): Spec[] => tags.map((tag) => ({ tag }));

/** Candidate tags per line, most specific first (PRD section 6 tags lead each list). */
export const FLOW_TAGS: Partial<Record<BankKey, Spec[]>> = {
  netIncome: T('NetIncomeLoss', 'ProfitLoss'),
  netIncomeToCommon: T('NetIncomeLossAvailableToCommonStockholdersBasic'),
  preferredDividends: T('PreferredStockDividendsIncomeStatementImpact', 'DividendsPreferredStock', 'DividendsPreferredStockCash'),
  nii: T('InterestIncomeExpenseNet', 'InterestIncomeExpenseOperatingNet'),
  nonInterestIncome: T('NoninterestIncome'),
  nonInterestExpense: T('NoninterestExpense'),
  provision: T('ProvisionForLoanLeaseAndOtherLosses', 'ProvisionForCreditLossesNet', 'ProvisionForLoanAndLeaseLosses', 'FinancingReceivableCreditLossExpenseReversal'),
  dividendsPerShare: [
    { tag: 'CommonStockDividendsPerShareDeclared', unit: 'USD/shares' },
    { tag: 'CommonStockDividendsPerShareCashPaid', unit: 'USD/shares' },
  ],
};

export const INSTANT_TAGS: Partial<Record<BankKey, Spec[]>> = {
  totalAssets: T('Assets'),
  totalEquity: T('StockholdersEquity'),
  preferred: T('PreferredStockValue', 'PreferredStockValueOutstanding', 'PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount'),
  commonEquity: T('CommonStockholdersEquity'),
  goodwill: T('Goodwill'),
  intangibles: T('IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet', 'OtherIntangibleAssetsNet'),
  loans: T(
    'FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss',
    'LoansAndLeasesReceivableNetOfDeferredIncome',
    'LoansAndLeasesReceivableGrossCarryingAmount',
    'FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss',
    'LoansAndLeasesReceivableNetReportedAmount',
  ),
  deposits: T('Deposits'),
  allowance: T('FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest', 'FinancingReceivableAllowanceForCreditLosses', 'LoansAndLeasesReceivableAllowance'),
  npl: T('FinancingReceivableNonaccrualNonperforming', 'FinancingReceivableExcludingAccruedInterestNonaccrual', 'FinancingReceivableRecordedInvestmentNonaccrualStatus', 'FinancingReceivableNonaccrual'),
  cash: T('CashAndCashEquivalentsAtCarryingValue', 'CashAndDueFromBanks'),
  afs: T('AvailableForSaleSecuritiesDebtSecurities', 'AvailableForSaleSecurities'),
  htm: T('HeldToMaturitySecuritiesAmortizedCostBeforeAllowanceForCreditLoss', 'HeldToMaturitySecurities', 'HeldToMaturitySecuritiesAmortizedCostAfterAllowanceForCreditLoss'),
  htmFairValue: T('HeldToMaturitySecuritiesFairValue'),
  shares: [
    { tag: 'EntityCommonStockSharesOutstanding', unit: 'shares', taxonomy: 'dei' },
    { tag: 'CommonStockSharesOutstanding', unit: 'shares' },
  ],
  // Regulatory capital: the 2019+ "BankingRegulation…" tags first, then the older ones.
  cet1: T('BankingRegulationCommonEquityTier1RiskBasedCapitalActual', 'CommonEquityTier1Capital', 'CommonEquityTierOneCapital'),
  tier1: T('BankingRegulationTier1RiskBasedCapitalActual', 'TierOneRiskBasedCapital'),
  totalCapital: T('BankingRegulationTotalCapitalActual', 'Capital'),
};

export const RATIO_TAGS: Record<'cet1' | 'tier1' | 'totalCapital', Spec[]> = {
  cet1: [
    { tag: 'BankingRegulationCommonEquityTier1RiskBasedCapitalRatioActual', unit: 'pure' },
    { tag: 'CommonEquityTier1CapitalRatio', unit: 'pure' },
    { tag: 'CommonEquityTierOneCapitalRatio', unit: 'pure' },
  ],
  tier1: [
    { tag: 'BankingRegulationTier1RiskBasedCapitalRatioActual', unit: 'pure' },
    { tag: 'TierOneRiskBasedCapitalToRiskWeightedAssets', unit: 'pure' },
  ],
  totalCapital: [
    { tag: 'BankingRegulationTotalCapitalRatioActual', unit: 'pure' },
    { tag: 'CapitalToRiskWeightedAssets', unit: 'pure' },
  ],
};

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;
const near = (a: string, b: string, tol = 10) => Math.abs(days(a, b)) <= tol;
const PERIODIC = /^(10-K|10-Q)/;
const ANNUAL = /^10-K/;

class Facts {
  private json: CompanyFactsJson;
  constructor(json: CompanyFactsJson) {
    this.json = json;
  }

  raw(s: Spec): RawFact[] {
    return (this.json.facts?.[s.taxonomy ?? 'us-gaap']?.[s.tag]?.units?.[s.unit ?? 'USD'] as RawFact[] | undefined) ?? [];
  }

  fact(s: Spec, r: RawFact): Fact {
    return { value: r.val, tag: s.tag, taxonomy: s.taxonomy ?? 'us-gaap', unit: s.unit ?? 'USD', accn: r.accn ?? null, form: r.form ?? null, filed: r.filed ?? null, fy: r.fy ?? null, fp: r.fp ?? null, start: r.start ?? null, end: r.end };
  }

  /** Latest-filed instant fact for any candidate tag at (about) the given date. */
  instantAt(specs: Spec[], end: string, tol = 6): Fact | undefined {
    for (const s of specs) {
      let best: RawFact | undefined;
      for (const r of this.raw(s)) {
        if (r.start || !r.form || !PERIODIC.test(r.form) || !near(r.end, end, tol)) continue;
        if (!best || (r.filed ?? '') > (best.filed ?? '')) best = r;
      }
      if (best) return this.fact(s, best);
    }
    return undefined;
  }

  /** dei share counts are dated at the cover-page date, not the balance-sheet date: take the latest. */
  latestInstant(specs: Spec[]): Fact | undefined {
    let out: Fact | undefined;
    for (const s of specs) {
      for (const r of this.raw(s)) {
        if (r.start || !r.form || !PERIODIC.test(r.form)) continue;
        if (!out || r.end > out.end || (r.end === out.end && (r.filed ?? '') > (out.filed ?? ''))) out = this.fact(s, r);
      }
      if (out) return out;
    }
    return out;
  }

  /** Full-year flow (10-K, 340-380 days) ending at `end`. */
  annualAt(specs: Spec[], end: string): Fact | undefined {
    for (const s of specs) {
      let best: RawFact | undefined;
      for (const r of this.raw(s)) {
        if (!r.start || !r.form || !ANNUAL.test(r.form) || !near(r.end, end)) continue;
        const d = days(r.start, r.end);
        if (d < 340 || d > 380) continue;
        if (!best || (r.filed ?? '') > (best.filed ?? '')) best = r;
      }
      if (best) return this.fact(s, best);
    }
    return undefined;
  }

  /** End dates of full-year net income, newest first. */
  fiscalYearEnds(): string[] {
    const ends = new Set<string>();
    for (const s of FLOW_TAGS.netIncome!) {
      for (const r of this.raw(s)) {
        if (r.start && r.form && ANNUAL.test(r.form) && days(r.start, r.end) > 340 && days(r.start, r.end) < 380) ends.add(r.end);
      }
    }
    return [...ends].sort().reverse();
  }

  /** Latest balance-sheet date among total assets facts in 10-K / 10-Q filings. */
  latestBalanceEnd(): string {
    return this.raw({ tag: 'Assets' }).reduce((m, r) => (!r.start && r.form && PERIODIC.test(r.form) && r.end > m ? r.end : m), '');
  }
}

const one = (f: Fact | undefined, formula?: string): BankItem | undefined => (f ? { value: f.value, facts: [f], formula } : undefined);

function monYY(end: string) {
  const d = new Date(end + 'T00:00:00Z');
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}-${String(d.getUTCFullYear()).slice(2)}`;
}

/** Parse a bank's companyfacts into the BankVal line items. Throws if it does not look like a bank. */
export function parseBankFacts(json: CompanyFactsJson, ticker: string): Omit<BankFinancials, 'sic' | 'source' | 'fetchedAt'> {
  const x = new Facts(json);
  const fyEnds = x.fiscalYearEnds();
  if (!fyEnds.length) throw new Error(`${ticker}: no annual net income in SEC filings`);
  const fyEnd = fyEnds[0];
  const priorEnd = fyEnds.find((e) => days(e, fyEnd) > 300) ?? '';
  const balanceEnd = x.latestBalanceEnd() || fyEnd;
  const items: BankFinancials['items'] = {};
  const warnings: string[] = [];

  for (const [k, specs] of Object.entries(FLOW_TAGS) as [BankKey, Spec[]][]) {
    const it = one(x.annualAt(specs, fyEnd));
    if (it) items[k] = it;
  }
  for (const [k, specs] of Object.entries(INSTANT_TAGS) as [BankKey, Spec[]][]) {
    const it = k === 'shares' ? one(x.latestInstant(specs)) : one(x.instantAt(specs, balanceEnd));
    if (it) items[k] = it;
  }
  if (!items.deposits) throw new Error(`${ticker} does not report deposits in XBRL, so it does not look like a bank. BankVal covers commercial banks and thrifts.`);

  // Prior year-end balances for average tangible common equity.
  if (priorEnd) {
    const prior: [BankKey, BankKey][] = [
      ['commonEquityPrior', 'commonEquity'],
      ['goodwillPrior', 'goodwill'],
      ['intangiblesPrior', 'intangibles'],
      ['totalAssetsPrior', 'totalAssets'],
    ];
    for (const [k, base] of prior) {
      const it = one(x.instantAt(INSTANT_TAGS[base]!, priorEnd));
      if (it) items[k] = it;
    }
    if (!items.commonEquityPrior) {
      const eq = x.instantAt(INSTANT_TAGS.totalEquity!, priorEnd);
      const pf = x.instantAt(INSTANT_TAGS.preferred!, priorEnd);
      if (eq) items.commonEquityPrior = { value: eq.value - (pf?.value ?? 0), facts: pf ? [eq, { ...pf, weight: -1 }] : [eq], formula: 'StockholdersEquity − PreferredStockValue' };
    }
  }

  // Common equity = total equity − preferred when the bank doesn't tag it directly.
  if (!items.commonEquity && items.totalEquity) {
    const pf = items.preferred;
    items.commonEquity = {
      value: items.totalEquity.value - (pf?.value ?? 0),
      facts: pf ? [...items.totalEquity.facts, ...pf.facts.map((f) => ({ ...f, weight: -1 }))] : items.totalEquity.facts,
      formula: 'StockholdersEquity − PreferredStockValue',
    };
  }

  // Net income to common = net income − preferred dividends.
  if (!items.netIncomeToCommon && items.netIncome) {
    const pd = items.preferredDividends;
    items.netIncomeToCommon = {
      value: items.netIncome.value - (pd?.value ?? 0),
      facts: pd ? [...items.netIncome.facts, ...pd.facts.map((f) => ({ ...f, weight: -1 }))] : items.netIncome.facts,
      formula: 'NetIncomeLoss − preferred dividends',
    };
  }

  // Net interest income from its parts when the net tag is missing.
  if (!items.nii) {
    const inc = x.annualAt(T('InterestAndDividendIncomeOperating'), fyEnd);
    const exp = x.annualAt(T('InterestExpense', 'InterestExpenseOperating'), fyEnd);
    if (inc && exp) items.nii = { value: inc.value - exp.value, facts: [inc, { ...exp, weight: -1 }], formula: 'Interest and dividend income − interest expense' };
  }

  // Regulatory capital. Many holding companies tag capital only with a legal-entity
  // dimension, which companyfacts omits; then CET1 and RWA are estimated and flagged.
  const ratio = (k: keyof typeof RATIO_TAGS) => x.instantAt(RATIO_TAGS[k], balanceEnd, 6) ?? x.latestInstant(RATIO_TAGS[k]);
  const cet1Ratio = ratio('cet1');
  if (items.cet1 && cet1Ratio && cet1Ratio.value > 0) {
    items.rwa = { value: items.cet1.value / cet1Ratio.value, facts: [...items.cet1.facts, cet1Ratio], formula: 'CET1 capital ÷ CET1 ratio' };
  }
  const tce = (items.commonEquity?.value ?? 0) - (items.goodwill?.value ?? 0) - (items.intangibles?.value ?? 0);
  if (!items.cet1 && cet1Ratio && items.rwa === undefined) {
    // Ratio known but amount not: approximate CET1 by tangible common equity.
    items.cet1 = { value: tce, facts: [], formula: 'Tangible common equity (CET1 amount not tagged)', estimated: true };
    items.rwa = { value: tce / cet1Ratio.value, facts: [cet1Ratio], formula: 'Estimated CET1 ÷ reported CET1 ratio', estimated: true };
  }
  if (!items.cet1) {
    items.cet1 = { value: tce, facts: [], formula: 'Tangible common equity (CET1 not tagged without a legal-entity dimension)', estimated: true };
    warnings.push('Regulatory capital is not in the consolidated XBRL facts: CET1 is estimated as tangible common equity and RWA as 70% of total assets.');
  }
  if (!items.rwa && items.totalAssets) {
    items.rwa = { value: items.totalAssets.value * 0.7, facts: items.totalAssets.facts, formula: '70% of total assets (RWA not tagged)', estimated: true };
  }
  if (!items.tier1) {
    const t1Ratio = ratio('tier1');
    items.tier1 =
      t1Ratio && items.rwa
        ? { value: t1Ratio.value * items.rwa.value, facts: [t1Ratio], formula: 'Tier 1 ratio × RWA', estimated: !!items.rwa.estimated }
        : { value: items.cet1.value + (items.preferred?.value ?? 0), facts: [], formula: 'CET1 + preferred stock (Additional Tier 1)', estimated: true };
  }
  if (!items.totalCapital) {
    const tcRatio = ratio('totalCapital');
    const t2 = Math.min(items.allowance?.value ?? 0, (items.rwa?.value ?? 0) * 0.0125);
    items.totalCapital =
      tcRatio && items.rwa
        ? { value: tcRatio.value * items.rwa.value, facts: [tcRatio], formula: 'Total capital ratio × RWA', estimated: !!items.rwa.estimated }
        : { value: items.tier1.value + t2, facts: [], formula: 'Tier 1 + allowance up to 1.25% of RWA (Tier 2)', estimated: true };
  }
  if (!items.npl) warnings.push('Nonaccrual loans are not tagged without a loan-class dimension; the NPL ratio is unavailable.');
  if (!items.shares) throw new Error(`${ticker}: no share count in SEC filings`);

  return {
    ticker,
    name: json.entityName,
    cik: String(json.cik).padStart(10, '0'),
    fyEnd,
    fyLabel: `FY${fyEnd.slice(0, 4)}`,
    balanceEnd,
    balanceLabel: monYY(balanceEnd),
    items,
    warnings,
  };
}
