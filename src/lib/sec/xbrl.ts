// Parses the SEC EDGAR companyfacts payload (https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json)
// into annual, LTM and latest-balance-sheet line items. Every value keeps the raw
// facts it came from (tag, accession number, form, filing date) for the audit trail.

import type { CompanyFinancials, Fact, LineItem, LineItems, LineKey, Period } from '../types.ts';

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

export interface CompanyFactsJson {
  cik: number | string;
  entityName: string;
  facts: Record<string, Record<string, { label?: string; units: Record<string, RawFact[]> }>>;
}

type Kind = 'flow' | 'instant';

interface TagSpec {
  taxonomy: string;
  tag: string;
  unit: string;
  sign?: number;
}

const usd = (tag: string, sign = 1): TagSpec => ({ taxonomy: 'us-gaap', tag, unit: 'USD', sign });

export const LABELS: Record<LineKey, string> = {
  revenue: 'Revenue',
  ebit: 'Operating income (EBIT)',
  netIncome: 'Net income',
  da: 'Depreciation & amortization',
  capex: 'Capital expenditures',
  pretax: 'Pre-tax income',
  taxExpense: 'Income tax expense',
  interestExpense: 'Interest expense',
  impairment: 'Restructuring & impairment',
  cash: 'Cash & equivalents',
  securities: 'Short-term investments',
  debt: 'Total debt',
  ar: 'Accounts receivable',
  inventory: 'Inventory',
  ap: 'Accounts payable',
  assets: 'Total assets',
  liabilities: 'Total liabilities',
  equity: "Stockholders' equity",
  sharesOutstanding: 'Shares outstanding',
  sharesDiluted: 'Diluted weighted-average shares',
};

const FLOW: Partial<Record<LineKey, TagSpec[]>> = {
  revenue: [
    usd('Revenues'),
    usd('RevenueFromContractWithCustomerExcludingAssessedTax'),
    usd('RevenueFromContractWithCustomerIncludingAssessedTax'),
    usd('SalesRevenueNet'),
    usd('SalesRevenueGoodsNet'),
  ],
  ebit: [usd('OperatingIncomeLoss')],
  netIncome: [usd('NetIncomeLoss'), usd('ProfitLoss')],
  da: [
    usd('DepreciationDepletionAndAmortization'),
    usd('DepreciationAndAmortization'),
    usd('DepreciationAmortizationAndAccretionNet'),
    usd('DepreciationDepletionAndAmortizationPropertyPlantAndEquipment'),
    usd('Depreciation'),
  ],
  capex: [
    usd('PaymentsToAcquirePropertyPlantAndEquipment'),
    usd('PaymentsToAcquireProductiveAssets'),
    usd('PaymentsForCapitalImprovements'),
  ],
  pretax: [
    usd('IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'),
    usd('IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'),
  ],
  taxExpense: [usd('IncomeTaxExpenseBenefit')],
  interestExpense: [
    usd('InterestExpense'),
    usd('InterestExpenseNonoperating'),
    usd('InterestExpenseDebt'),
    usd('InterestAndDebtExpense'),
    usd('InterestIncomeExpenseNonoperatingNet', -1),
  ],
  impairment: [
    usd('RestructuringSettlementAndImpairmentProvisions'),
    usd('GoodwillImpairmentLoss'),
    usd('AssetImpairmentCharges'),
  ],
  sharesDiluted: [{ taxonomy: 'us-gaap', tag: 'WeightedAverageNumberOfDilutedSharesOutstanding', unit: 'shares' }],
};

const INSTANT: Partial<Record<LineKey, TagSpec[]>> = {
  cash: [
    usd('CashAndCashEquivalentsAtCarryingValue'),
    usd('CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'),
    usd('Cash'),
  ],
  securities: [
    usd('MarketableSecuritiesCurrent'),
    usd('AvailableForSaleSecuritiesDebtSecuritiesCurrent'),
    usd('ShortTermInvestments'),
  ],
  ar: [usd('AccountsReceivableNetCurrent'), usd('ReceivablesNetCurrent')],
  inventory: [usd('InventoryNet')],
  ap: [usd('AccountsPayableCurrent'), usd('AccountsPayableTradeCurrent'), usd('AccountsPayableAndAccruedLiabilitiesCurrent')],
  assets: [usd('Assets')],
  liabilities: [usd('Liabilities')],
  equity: [usd('StockholdersEquity'), usd('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest')],
};

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;
const near = (a: string, b: string, tol = 10) => Math.abs(days(a, b)) <= tol;

class FactIndex {
  private json: CompanyFactsJson;
  constructor(json: CompanyFactsJson) {
    this.json = json;
  }

  raw(spec: TagSpec): RawFact[] {
    return this.json.facts?.[spec.taxonomy]?.[spec.tag]?.units?.[spec.unit] ?? [];
  }

  toFact(spec: TagSpec, r: RawFact): Fact {
    return {
      value: r.val * (spec.sign ?? 1),
      tag: spec.tag,
      taxonomy: spec.taxonomy,
      unit: spec.unit,
      accn: r.accn ?? null,
      form: r.form ?? null,
      filed: r.filed ?? null,
      fy: r.fy ?? null,
      fp: r.fp ?? null,
      start: r.start ?? null,
      end: r.end,
    };
  }

  /** Annual (10-K, ~12 month) flow facts keyed by period end; latest filing wins (restatements). */
  annualFlow(spec: TagSpec): Map<string, Fact> {
    const out = new Map<string, Fact>();
    for (const r of this.raw(spec)) {
      if (!r.start || !r.form?.startsWith('10-K')) continue;
      const d = days(r.start, r.end);
      if (d < 340 || d > 380) continue;
      const prev = out.get(r.end);
      if (!prev || (r.filed ?? '') > (prev.filed ?? '')) out.set(r.end, this.toFact(spec, r));
    }
    return out;
  }

  instants(spec: TagSpec): Fact[] {
    return this.raw(spec)
      .filter((r) => !r.start && (r.form?.startsWith('10-K') || r.form?.startsWith('10-Q')))
      .map((r) => this.toFact(spec, r));
  }

  /** Flow fact with a given end and approximate duration (any form), latest filing wins. */
  flowAt(spec: TagSpec, end: string, durationDays: number): Fact | undefined {
    let best: RawFact | undefined;
    for (const r of this.raw(spec)) {
      if (!r.start || !near(r.end, end, 5)) continue;
      if (Math.abs(days(r.start, r.end) - durationDays) > 12) continue;
      if (!best || (r.filed ?? '') > (best.filed ?? '')) best = r;
    }
    return best ? this.toFact(spec, best) : undefined;
  }

  instantAt(spec: TagSpec, end: string, tol = 5): Fact | undefined {
    let best: Fact | undefined;
    for (const f of this.instants(spec)) {
      if (!near(f.end, end, tol)) continue;
      if (!best || (f.filed ?? '') > (best.filed ?? '')) best = f;
    }
    return best;
  }

  latestEnd(spec: TagSpec): string {
    return this.raw(spec).reduce((m, r) => (r.end > m ? r.end : m), '');
  }
}

/** Order candidate tags so a company that switched tags uses its most recent one first. */
function orderSpecs(idx: FactIndex, specs: TagSpec[]): TagSpec[] {
  return specs
    .map((s, i) => ({ s, i, latest: idx.latestEnd(s) }))
    .filter((x) => x.latest)
    .sort((a, b) => (a.latest.slice(0, 4) === b.latest.slice(0, 4) ? a.i - b.i : b.latest.localeCompare(a.latest)))
    .map((x) => x.s);
}

function item(key: LineKey, facts: Fact[], formula?: string): LineItem {
  const value = facts.reduce((s, f) => s + f.value * (f.weight ?? 1), 0);
  return { key, label: LABELS[key], value, facts, formula };
}

function annualFlowItem(idx: FactIndex, key: LineKey, end: string): LineItem | undefined {
  for (const spec of orderSpecs(idx, FLOW[key] ?? [])) {
    const series = idx.annualFlow(spec);
    for (const [e, f] of series) if (near(e, end)) return item(key, [f]);
  }
  return undefined;
}

function instantItem(idx: FactIndex, key: LineKey, end: string): LineItem | undefined {
  for (const spec of orderSpecs(idx, INSTANT[key] ?? [])) {
    const f = idx.instantAt(spec, end);
    if (f) return item(key, [f]);
  }
  return undefined;
}

function debtItem(idx: FactIndex, end: string): LineItem | undefined {
  const at = (tag: string) => idx.instantAt(usd(tag), end);
  const total = at('LongTermDebt') ?? at('LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities');
  const facts: Fact[] = [];
  let usedDebtCurrent = false;
  if (total) {
    facts.push(total);
  } else {
    const nonCurrent = at('LongTermDebtNoncurrent') ?? at('LongTermDebtAndCapitalLeaseObligations');
    let current = at('LongTermDebtCurrent') ?? at('LongTermDebtAndCapitalLeaseObligationsCurrent');
    if (!current) {
      current = at('DebtCurrent');
      usedDebtCurrent = !!current;
    }
    if (nonCurrent) facts.push(nonCurrent);
    if (current) facts.push(current);
  }
  if (!usedDebtCurrent) {
    const shortTerm = at('CommercialPaper') ?? at('ShortTermBorrowings');
    if (shortTerm) facts.push(shortTerm);
  }
  if (facts.length === 0) return { key: 'debt', label: LABELS.debt, value: 0, facts: [], formula: 'No debt tags reported' };
  return item('debt', facts, facts.map((f) => f.tag).join(' + '));
}

/** EBIT from OperatingIncomeLoss, or rebuilt as pre-tax income + interest expense when not reported. */
function ebitItem(items: LineItems): LineItem | undefined {
  if (items.ebit) return items.ebit;
  if (!items.pretax) return undefined;
  const facts = [...items.pretax.facts, ...(items.interestExpense?.facts ?? [])];
  return {
    key: 'ebit',
    label: LABELS.ebit,
    value: items.pretax.value + (items.interestExpense?.value ?? 0),
    facts,
    formula: 'Pre-tax income + interest expense (OperatingIncomeLoss not reported)',
  };
}

function fyLabel(end: string) {
  return `FY${end.slice(0, 4)}`;
}

function monYY(end: string) {
  const d = new Date(end + 'T00:00:00Z');
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + '-' + String(d.getUTCFullYear()).slice(2);
}

export function parseCompanyFacts(json: CompanyFactsJson, ticker: string): Omit<CompanyFinancials, 'sic' | 'sicDescription' | 'source' | 'fetchedAt'> {
  const idx = new FactIndex(json);

  // Fiscal year ends come from the revenue series (the most consistently tagged flow line).
  const revSpecs = orderSpecs(idx, FLOW.revenue!);
  const ends = new Set<string>();
  for (const spec of revSpecs) for (const e of idx.annualFlow(spec).keys()) ends.add(e);
  const sortedEnds = [...ends].sort();
  // Collapse ends that are within a few days of each other (52/53-week calendars).
  const fyEnds: string[] = [];
  for (const e of sortedEnds) {
    if (fyEnds.length && near(fyEnds[fyEnds.length - 1], e, 20)) fyEnds[fyEnds.length - 1] = e;
    else fyEnds.push(e);
  }
  const lastEnds = fyEnds.slice(-5);
  if (lastEnds.length === 0) throw new Error(`${ticker}: no annual 10-K revenue facts found`);

  const flowKeys = Object.keys(FLOW) as LineKey[];
  const instantKeys = Object.keys(INSTANT) as LineKey[];

  const years: Period[] = lastEnds.map((end) => {
    const items: LineItems = {};
    for (const k of flowKeys) {
      const it = annualFlowItem(idx, k, end);
      if (it) items[k] = it;
    }
    for (const k of instantKeys) {
      const it = instantItem(idx, k, end);
      if (it) items[k] = it;
    }
    const debt = debtItem(idx, end);
    if (debt) items.debt = debt;
    const ebit = ebitItem(items);
    if (ebit) items.ebit = ebit;
    return { label: fyLabel(end), fy: Number(end.slice(0, 4)), end, items };
  });

  const lastFy = years[years.length - 1];
  const ltm = buildLtm(idx, lastFy);
  const balance = buildBalance(idx, lastFy);

  return {
    ticker,
    cik: String(json.cik).padStart(10, '0'),
    name: json.entityName,
    years,
    ltm,
    balance,
  };
}

/** LTM = latest fiscal year + current YTD - prior-year YTD, using the same tag for all three. */
function buildLtm(idx: FactIndex, fy: Period): Period {
  const revFact = fy.items.revenue?.facts[0];
  const fallback: Period = { ...fy, label: `${fy.label} (LTM)` };
  if (!revFact) return fallback;
  const revSpec = usd(revFact.tag);
  // Latest 10-Q YTD revenue that starts at the beginning of the new fiscal year.
  let ytd: Fact | undefined;
  for (const r of idx.raw(revSpec)) {
    if (!r.start || !r.form?.startsWith('10-Q') || r.end <= fy.end) continue;
    if (Math.abs(days(fy.end, r.start)) > 10) continue;
    if (!ytd || r.end > ytd.end) ytd = idx.toFact(revSpec, r);
  }
  if (!ytd) return fallback;
  const dur = days(ytd.start!, ytd.end);
  const priorEnd = new Date(Date.parse(ytd.end) - 364 * DAY).toISOString().slice(0, 10);

  const items: LineItems = {};
  for (const key of Object.keys(FLOW) as LineKey[]) {
    const base = fy.items[key];
    if (key === 'ebit' && base?.formula) continue; // derived EBIT is rebuilt from LTM pre-tax + interest below
    if (!base || base.facts.length !== 1 || key === 'sharesDiluted') {
      if (base) items[key] = base;
      continue;
    }
    const f = base.facts[0];
    const spec = (FLOW[key] ?? []).find((t) => t.tag === f.tag);
    const cur = spec && idx.flowAt(spec, ytd.end, dur);
    const prior = spec && idx.flowAt(spec, priorEnd, dur);
    if (!cur || !prior) {
      items[key] = base;
      continue;
    }
    const facts: Fact[] = [{ ...f, weight: 1 }, { ...cur, weight: 1 }, { ...prior, weight: -1 }];
    items[key] = item(key, facts, `${fy.label} + YTD ${monYY(ytd.end)} - YTD ${monYY(prior.end)}`);
  }
  const ebit = ebitItem(items);
  if (ebit) items.ebit = ebit;
  return { label: `LTM ${monYY(ytd.end)}`, fy: fy.fy, end: ytd.end, items };
}

function buildBalance(idx: FactIndex, fy: Period): Period {
  const assetsSpec = usd('Assets');
  const end = [fy.end, ...idx.instants(assetsSpec).map((f) => f.end)].reduce((m, e) => (e > m ? e : m), fy.end);
  const items: LineItems = {};
  for (const k of Object.keys(INSTANT) as LineKey[]) {
    const it = instantItem(idx, k, end) ?? fy.items[k];
    if (it) items[k] = it;
  }
  items.debt = debtItem(idx, end) ?? fy.items.debt;

  // Cover-page share count (dei) is the most current; sum classes reported under one filing.
  const dei = idx.raw({ taxonomy: 'dei', tag: 'EntityCommonStockSharesOutstanding', unit: 'shares' });
  if (dei.length) {
    const latest = dei.reduce((m, r) => ((r.filed ?? '') + r.end > (m.filed ?? '') + m.end ? r : m));
    const group = dei.filter((r) => r.accn === latest.accn && r.end === latest.end);
    const spec: TagSpec = { taxonomy: 'dei', tag: 'EntityCommonStockSharesOutstanding', unit: 'shares' };
    items.sharesOutstanding = item(
      'sharesOutstanding',
      group.map((r) => idx.toFact(spec, r)),
      group.length > 1 ? 'Sum of share classes on the filing cover page' : undefined,
    );
  } else {
    const diluted = fy.items.sharesDiluted;
    if (diluted) items.sharesOutstanding = { ...diluted, key: 'sharesOutstanding', label: LABELS.sharesOutstanding, formula: 'Diluted weighted-average shares (cover-page count not tagged)' };
  }
  const d = new Date(end + 'T00:00:00Z');
  return { label: `Balance sheet ${monYY(end)}`, fy: d.getUTCFullYear(), end, items };
}
