import type { GovernanceFlag, InsiderSummary, OwnershipFiling, SegmentBreakdown, YieldCurve } from './sec/parsers.ts';

// Shared data model. Every number the engine consumes is a LineItem that carries
// the XBRL facts it was built from, so any figure on screen can be traced back to
// a tag, a filing, and an accession number.

export type DataSource = 'sec-live' | 'snapshot';

export interface Fact {
  value: number;
  tag: string;
  taxonomy: string;
  unit: string;
  accn: string | null;
  form: string | null;
  filed: string | null;
  fy: number | null;
  fp: string | null;
  start: string | null;
  end: string;
  /** Sign applied when the fact feeds a derived line (e.g. -1 for YTD prior-year in an LTM build). */
  weight?: number;
}

export type LineKey =
  | 'revenue'
  | 'ebit'
  | 'netIncome'
  | 'da'
  | 'capex'
  | 'pretax'
  | 'taxExpense'
  | 'interestExpense'
  | 'impairment'
  | 'cash'
  | 'securities'
  | 'debt'
  | 'ar'
  | 'inventory'
  | 'ap'
  | 'assets'
  | 'assetsCurrent'
  | 'liabilitiesCurrent'
  | 'liabilitiesAndEquity'
  | 'liabilities'
  | 'equity'
  | 'sharesOutstanding'
  | 'sharesDiluted';

export interface LineItem {
  key: LineKey;
  label: string;
  /** USD for money lines, shares for share counts. */
  value: number;
  facts: Fact[];
  /** Human-readable description of how the value was assembled from its facts. */
  formula?: string;
}

export type LineItems = Partial<Record<LineKey, LineItem>>;

export interface Period {
  label: string; // e.g. "FY2024" or "LTM Jun-25"
  fy: number;
  end: string;
  items: LineItems;
}

export interface CompanyFinancials {
  ticker: string;
  cik: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  /** Ascending, at most five fiscal years. */
  years: Period[];
  /** Last-twelve-months flow items (falls back to the latest fiscal year). */
  ltm: Period;
  /** Most recent balance sheet (10-K or 10-Q), plus the cover-page share count. */
  balance: Period;
  source: DataSource;
  fetchedAt: string;
}

export interface MarketData {
  price: number;
  asOf: string;
  low52: number;
  high52: number;
  /** Distribution of daily closes over the trailing year (if available). */
  p25: number;
  median: number;
  p75: number;
  closes: number[];
  beta: number;
  betaSource: string;
  source: string;
}

export interface PeerComp {
  ticker: string;
  name: string;
  evEbitda: number;
  /** EV / LTM revenue (PRD v2: comps use both multiples). */
  evRevenue: number | null;
  ev: number | null;
  ebitda: number | null;
  source: DataSource;
}

export interface Dataset {
  company: CompanyFinancials;
  market: MarketData;
  peers: PeerComp[];
  peerBasis: string;
  isFinancial: boolean;
  warnings: string[];
  source: DataSource;
  generatedAt: string;
  /** Live Treasury curve for the risk-free rate (PRD v2 appendix E). */
  macro?: YieldCurve;
}

/* PRD v2 appendix: extended SEC feeds. Each section is independent; null = unavailable. */

export interface Intel {
  ticker: string;
  cik: string;
  source: DataSource;
  segments: { breakdowns: SegmentBreakdown[]; accessionNumber: string | null; filingDate: string | null; fyEnd: string } | null;
  insiders: InsiderSummary | null;
  ownership: OwnershipFiling[] | null;
  governance: { flags: GovernanceFlag[]; rating: 'green' | 'amber' | 'red'; months: number } | null;
  proxy: { accessionNumber: string; filingDate: string; url: string } | null;
  notes: string[];
  fetchedAt: string;
}
