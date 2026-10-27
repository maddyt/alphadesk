// Offline snapshot for the featured demo tickers. It exists only so the demo still
// works when SEC EDGAR or the market-data source cannot be reached (or when
// DATA_MODE=snapshot). Figures are rounded, as reported in each company's 10-K,
// in USD millions; market data is approximate as of SNAPSHOT_AS_OF. Peer multiples
// are illustrative. Accession numbers are left null on purpose: the audit trail
// only ever shows an accession ID that came from a live SEC response.
// Live mode replaces all of this.

import type { CompanyFinancials, Dataset, Fact, LineItem, LineItems, LineKey, MarketData, Period, PeerComp } from '../types.ts';
import { LABELS } from '../sec/xbrl.ts';

export const SNAPSHOT_AS_OF = '2025-03-31';

interface SnapSpec {
  name: string;
  cik: string;
  sic: string;
  sicDescription: string;
  fyEnds: string[];
  revenue: number[];
  ebit: number[];
  /** Latest fiscal year, USD millions (shares in millions). */
  latest: Partial<Record<LineKey, number>>;
  market: { price: number; low52: number; high52: number; beta: number };
  /** [ticker, name, EV/EBITDA, EV/Revenue], illustrative. */
  peers: [string, string, number, number][];
  peerBasis: string;
  /** Foreign filers only: figures are in this currency, as reported in a 20-F. */
  foreign?: { standard: 'IFRS' | 'US GAAP'; currency: string; form: string };
}

/** Approximate USD per unit, for offline snapshot mode only (live mode uses ECB / open.er-api rates). */
export const SNAPSHOT_FX: Record<string, number> = { EUR: 1.08 };

const IFRS_TAGS: Partial<Record<LineKey, string>> = {
  revenue: 'Revenue',
  ebit: 'ProfitLossFromOperatingActivities',
  netIncome: 'ProfitLossAttributableToOwnersOfParent',
  da: 'DepreciationAndAmortisationExpense',
  capex: 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  pretax: 'ProfitLossBeforeTax',
  taxExpense: 'IncomeTaxExpenseContinuingOperations',
  cash: 'CashAndCashEquivalents',
  debt: 'Borrowings',
  leasePayments: 'PaymentsOfLeaseLiabilitiesClassifiedAsFinancingActivities',
  sharesOutstanding: 'EntityCommonStockSharesOutstanding',
};

const TAGS: Partial<Record<LineKey, string>> = {
  revenue: 'RevenueFromContractWithCustomerExcludingAssessedTax',
  ebit: 'OperatingIncomeLoss',
  netIncome: 'NetIncomeLoss',
  da: 'DepreciationDepletionAndAmortization',
  capex: 'PaymentsToAcquirePropertyPlantAndEquipment',
  pretax: 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  taxExpense: 'IncomeTaxExpenseBenefit',
  interestExpense: 'InterestExpense',
  impairment: 'RestructuringSettlementAndImpairmentProvisions',
  cash: 'CashAndCashEquivalentsAtCarryingValue',
  securities: 'MarketableSecuritiesCurrent',
  debt: 'LongTermDebt',
  ar: 'AccountsReceivableNetCurrent',
  inventory: 'InventoryNet',
  ap: 'AccountsPayableCurrent',
  sharesOutstanding: 'EntityCommonStockSharesOutstanding',
};

const SPECS: Record<string, SnapSpec> = {
  AAPL: {
    name: 'Apple Inc.',
    cik: '0000320193',
    sic: '3571',
    sicDescription: 'Electronic Computers',
    fyEnds: ['2022-09-24', '2023-09-30', '2024-09-28'],
    revenue: [394328, 383285, 391035],
    ebit: [119437, 114301, 123216],
    latest: {
      netIncome: 93736, da: 11445, capex: 9447, pretax: 123485, taxExpense: 29749,
      cash: 29943, securities: 35228, debt: 106629, ar: 33410, inventory: 7286, ap: 68960, sharesOutstanding: 15116,
    },
    market: { price: 222.13, low52: 165.0, high52: 259.02, beta: 1.2 },
    peers: [['MSFT', 'Microsoft', 22.0, 12.5], ['GOOGL', 'Alphabet', 14.0, 6.0], ['META', 'Meta Platforms', 15.5, 8.5], ['AMZN', 'Amazon', 15.0, 3.4], ['DELL', 'Dell Technologies', 9.5, 0.9], ['HPQ', 'HP Inc.', 6.8, 0.7]],
    peerBasis: 'Mega-cap technology',
  },
  NVDA: {
    name: 'NVIDIA Corporation',
    cik: '0001045810',
    sic: '3674',
    sicDescription: 'Semiconductors & Related Devices',
    fyEnds: ['2023-01-29', '2024-01-28', '2025-01-26'],
    revenue: [26974, 60922, 130497],
    ebit: [4224, 32972, 81453],
    latest: {
      netIncome: 72880, da: 1864, capex: 3236, pretax: 84026, taxExpense: 11146,
      cash: 8589, securities: 34621, debt: 8463, ar: 23065, inventory: 10080, ap: 6310, sharesOutstanding: 24400,
    },
    market: { price: 108.38, low52: 76.2, high52: 149.43, beta: 1.7 },
    peers: [['AMD', 'Advanced Micro Devices', 27.0, 7.5], ['AVGO', 'Broadcom', 30.0, 17.0], ['QCOM', 'Qualcomm', 12.0, 4.3], ['MRVL', 'Marvell Technology', 35.0, 11.0], ['MU', 'Micron Technology', 8.5, 3.5], ['TXN', 'Texas Instruments', 22.0, 10.0]],
    peerBasis: 'Semiconductors',
  },
  DIS: {
    name: 'The Walt Disney Company',
    cik: '0001744489',
    sic: '4841',
    sicDescription: 'Cable & Other Pay Television Services',
    fyEnds: ['2022-10-01', '2023-09-30', '2024-09-28'],
    revenue: [82722, 88898, 91361],
    // Disney does not tag OperatingIncomeLoss; EBIT is pre-tax income + interest expense.
    ebit: [6682, 5978, 8829],
    latest: {
      netIncome: 4972, da: 4990, capex: 5412, pretax: 7569, taxExpense: 1796, interestExpense: 1260, impairment: 3595,
      cash: 6002, securities: 0, debt: 45815, ar: 12729, inventory: 2022, ap: 21070, sharesOutstanding: 1810,
    },
    market: { price: 98.7, low52: 85.6, high52: 122.0, beta: 1.4 },
    peers: [['CMCSA', 'Comcast', 6.0, 2.0], ['WBD', 'Warner Bros. Discovery', 6.8, 1.6], ['FOXA', 'Fox Corporation', 8.0, 1.8], ['NFLX', 'Netflix', 33.0, 10.0]],
    peerBasis: 'Media & entertainment',
  },
  MSFT: {
    name: 'Microsoft Corporation',
    cik: '0000789019',
    sic: '7372',
    sicDescription: 'Services-Prepackaged Software',
    fyEnds: ['2022-06-30', '2023-06-30', '2024-06-30'],
    revenue: [198270, 211915, 245122],
    ebit: [83383, 88523, 109433],
    latest: {
      netIncome: 88136, da: 22287, capex: 44477, pretax: 107787, taxExpense: 19651, interestExpense: 2935,
      cash: 18315, securities: 57228, debt: 44937, ar: 56924, inventory: 1246, ap: 21996, sharesOutstanding: 7434,
    },
    market: { price: 375.39, low52: 367.24, high52: 467.56, beta: 0.9 },
    peers: [['AAPL', 'Apple', 23.0, 8.5], ['GOOGL', 'Alphabet', 14.0, 6.0], ['AMZN', 'Amazon', 15.0, 3.4], ['ORCL', 'Oracle', 22.0, 9.0], ['CRM', 'Salesforce', 19.0, 7.0], ['ADBE', 'Adobe', 19.5, 8.0]],
    peerBasis: 'Mega-cap technology',
  },
  COST: {
    name: 'Costco Wholesale Corporation',
    cik: '0000909832',
    sic: '5331',
    sicDescription: 'Retail-Variety Stores',
    fyEnds: ['2022-08-28', '2023-09-03', '2024-09-01'],
    revenue: [226954, 242290, 254453],
    ebit: [7793, 8114, 9285],
    latest: {
      netIncome: 7367, da: 2237, capex: 4710, pretax: 9740, taxExpense: 2373, interestExpense: 169,
      cash: 9906, securities: 1238, debt: 5897, ar: 2721, inventory: 18647, ap: 19421, sharesOutstanding: 443.6,
    },
    market: { price: 945.78, low52: 697.0, high52: 1076.0, beta: 0.8 },
    peers: [['WMT', 'Walmart', 18.0, 1.0], ['TGT', 'Target', 8.0, 0.6], ['BJ', "BJ's Wholesale", 13.0, 0.6], ['DG', 'Dollar General', 10.0, 0.7], ['KR', 'Kroger', 7.0, 0.4]],
    peerBasis: 'Mass & warehouse retail',
  },
  KO: {
    name: 'The Coca-Cola Company',
    cik: '0000021344',
    sic: '2080',
    sicDescription: 'Beverages',
    fyEnds: ['2022-12-31', '2023-12-31', '2024-12-31'],
    revenue: [43004, 45754, 47061],
    ebit: [10909, 11311, 9992],
    latest: {
      netIncome: 10631, da: 1075, capex: 2064, pretax: 13086, taxExpense: 2437, interestExpense: 1656,
      cash: 10828, securities: 1553, debt: 48083, ar: 3569, inventory: 4728, ap: 5468, sharesOutstanding: 4308,
    },
    market: { price: 71.62, low52: 57.9, high52: 73.0, beta: 0.55 },
    peers: [['PEP', 'PepsiCo', 13.5, 2.6], ['MDLZ', 'Mondelez', 15.0, 3.0], ['KDP', 'Keurig Dr Pepper', 14.0, 3.9], ['MNST', 'Monster Beverage', 25.0, 7.5], ['KHC', 'Kraft Heinz', 8.5, 2.4]],
    peerBasis: 'Beverages & packaged food',
  },
  EA: {
    name: 'Electronic Arts Inc.',
    cik: '0000712515',
    sic: '7372',
    sicDescription: 'Services-Prepackaged Software',
    fyEnds: ['2023-03-31', '2024-03-31', '2025-03-31'],
    revenue: [7426, 7562, 7463],
    ebit: [1167, 1546, 1431],
    latest: {
      netIncome: 1121, da: 360, capex: 210, pretax: 1442, taxExpense: 321, interestExpense: 56,
      cash: 2136, securities: 112, debt: 1882, ar: 637, inventory: 0, ap: 82, sharesOutstanding: 251,
    },
    market: { price: 144.72, low52: 124.9, high52: 168.5, beta: 0.75 },
    peers: [['TTWO', 'Take-Two Interactive', 30.0, 6.5], ['RBLX', 'Roblox', 60.0, 11.0], ['NTES', 'NetEase', 11.0, 3.5], ['MSFT', 'Microsoft', 22.0, 12.5]],
    peerBasis: 'Interactive entertainment',
  },
  // Foreign private issuer: IFRS 20-F in EUR millions (approximate FY2024), ADR price in USD.
  ASML: {
    name: 'ASML Holding N.V.',
    cik: '0000937966',
    sic: '3559',
    sicDescription: 'Special Industry Machinery, NEC',
    fyEnds: ['2022-12-31', '2023-12-31', '2024-12-31'],
    revenue: [21173, 27559, 28263],
    ebit: [6501, 9042, 9019],
    latest: {
      netIncome: 7571, da: 1100, capex: 2068, pretax: 8970, taxExpense: 1399, leasePayments: 90,
      cash: 12742, securities: 0, debt: 4666, sharesOutstanding: 393.3,
    },
    market: { price: 662.62, low52: 645.0, high52: 1110.0, beta: 1.3 },
    peers: [['AMAT', 'Applied Materials', 15.0, 4.5], ['LRCX', 'Lam Research', 18.0, 5.5], ['KLAC', 'KLA', 20.0, 8.5]],
    peerBasis: 'Semiconductor equipment',
    foreign: { standard: 'IFRS', currency: 'EUR', form: '20-F' },
  },
};

export const SNAPSHOT_TICKERS = Object.keys(SPECS).filter((t) => !SPECS[t].foreign);
export const SNAPSHOT_FOREIGN = Object.keys(SPECS).filter((t) => SPECS[t].foreign);

function fact(key: LineKey, value: number, end: string, fy: number, start: string | null, foreign?: SnapSpec['foreign']): Fact {
  const isShares = key === 'sharesOutstanding';
  const ifrs = foreign?.standard === 'IFRS';
  return {
    value,
    tag: (ifrs ? IFRS_TAGS[key] : TAGS[key]) ?? key,
    taxonomy: isShares ? 'dei' : ifrs ? 'ifrs-full' : 'us-gaap',
    unit: isShares ? 'shares' : (foreign?.currency ?? 'USD'),
    accn: null,
    form: foreign?.form ?? '10-K',
    filed: null,
    fy,
    fp: 'FY',
    start,
    end,
  };
}

function line(key: LineKey, valueMillions: number, end: string, fy: number, start: string | null, foreign?: SnapSpec['foreign']): LineItem {
  const value = valueMillions * 1e6;
  return { key, label: LABELS[key], value, facts: [fact(key, value, end, fy, start, foreign)] };
}

const FLOW_KEYS = new Set<LineKey>(['revenue', 'ebit', 'netIncome', 'da', 'capex', 'pretax', 'taxExpense', 'interestExpense', 'impairment', 'leasePayments']);

function buildCompany(ticker: string, s: SnapSpec): CompanyFinancials {
  const years: Period[] = s.fyEnds.map((end, i) => {
    const fy = Number(end.slice(0, 4));
    const start = new Date(Date.parse(end) - 364 * 86400_000).toISOString().slice(0, 10);
    const items: LineItems = {
      revenue: line('revenue', s.revenue[i], end, fy, start, s.foreign),
      ebit: line('ebit', s.ebit[i], end, fy, start, s.foreign),
    };
    if (i === s.fyEnds.length - 1) {
      for (const [k, v] of Object.entries(s.latest) as [LineKey, number][]) {
        items[k] = line(k, v, end, fy, FLOW_KEYS.has(k) ? start : null, s.foreign);
      }
    }
    if (ticker === 'DIS' && items.ebit) items.ebit.formula = 'Pre-tax income + interest expense (OperatingIncomeLoss not reported)';
    return { label: `FY${fy}`, fy, end, items };
  });
  const last = years[years.length - 1];
  return {
    ticker,
    cik: s.cik,
    name: s.name,
    sic: s.sic,
    sicDescription: s.sicDescription,
    years,
    ltm: { ...last, label: s.foreign ? `${last.label} (annual)` : `${last.label} (LTM)` },
    balance: { ...last, label: `Balance sheet ${last.label}` },
    source: 'snapshot',
    fetchedAt: SNAPSHOT_AS_OF,
    accounting: s.foreign ? { standard: s.foreign.standard, currency: s.foreign.currency, annualForm: s.foreign.form } : { standard: 'US GAAP', currency: 'USD', annualForm: '10-K' },
  };
}

export function snapshotMarket(ticker: string): MarketData | null {
  const s = SPECS[ticker];
  if (!s) return null;
  const { price, low52, high52, beta } = s.market;
  const at = (q: number) => low52 + q * (high52 - low52);
  return {
    price,
    asOf: SNAPSHOT_AS_OF,
    low52,
    high52,
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    closes: [],
    beta,
    betaSource: 'Snapshot estimate',
    source: `Snapshot (${SNAPSHOT_AS_OF}, approximate)`,
  };
}

export function snapshotCompany(ticker: string): CompanyFinancials | null {
  const s = SPECS[ticker];
  return s ? buildCompany(ticker, s) : null;
}

export function snapshotPeers(ticker: string): { peers: PeerComp[]; basis: string } | null {
  const s = SPECS[ticker];
  if (!s) return null;
  return {
    peers: s.peers.map(([t, name, m, r]) => ({ ticker: t, name, evEbitda: m, evRevenue: r, ev: null, ebitda: null, source: 'snapshot' })),
    basis: `${s.peerBasis} (illustrative snapshot multiples)`,
  };
}

export function snapshotDataset(ticker: string): Dataset | null {
  // The valuation workbench covers US 10-K filers only; foreign snapshots are for DealPulse.
  if (SPECS[ticker]?.foreign) return null;
  const company = snapshotCompany(ticker);
  const market = snapshotMarket(ticker);
  const peers = snapshotPeers(ticker);
  if (!company || !market || !peers) return null;
  return {
    company,
    market,
    peers: peers.peers,
    peerBasis: peers.basis,
    isFinancial: false,
    warnings: [
      `Offline snapshot: FY figures rounded from 10-K filings, market data approximate as of ${SNAPSHOT_AS_OF}, peer multiples illustrative. Deploy with network access for live SEC EDGAR data and accession-level audit trails.`,
    ],
    source: 'snapshot',
    generatedAt: new Date().toISOString(),
  };
}
