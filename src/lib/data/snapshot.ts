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
  peers: [string, string, number][];
  peerBasis: string;
}

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
    peers: [['MSFT', 'Microsoft', 22.0], ['GOOGL', 'Alphabet', 14.0], ['META', 'Meta Platforms', 15.5], ['AMZN', 'Amazon', 15.0], ['DELL', 'Dell Technologies', 9.5], ['HPQ', 'HP Inc.', 6.8]],
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
    peers: [['AMD', 'Advanced Micro Devices', 27.0], ['AVGO', 'Broadcom', 30.0], ['QCOM', 'Qualcomm', 12.0], ['MRVL', 'Marvell Technology', 35.0], ['MU', 'Micron Technology', 8.5], ['TXN', 'Texas Instruments', 22.0]],
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
    peers: [['CMCSA', 'Comcast', 6.0], ['WBD', 'Warner Bros. Discovery', 6.8], ['FOXA', 'Fox Corporation', 8.0], ['NFLX', 'Netflix', 33.0]],
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
    peers: [['AAPL', 'Apple', 23.0], ['GOOGL', 'Alphabet', 14.0], ['AMZN', 'Amazon', 15.0], ['ORCL', 'Oracle', 22.0], ['CRM', 'Salesforce', 19.0], ['ADBE', 'Adobe', 19.5]],
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
    peers: [['WMT', 'Walmart', 18.0], ['TGT', 'Target', 8.0], ['BJ', "BJ's Wholesale", 13.0], ['DG', 'Dollar General', 10.0], ['KR', 'Kroger', 7.0]],
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
    peers: [['PEP', 'PepsiCo', 13.5], ['MDLZ', 'Mondelez', 15.0], ['KDP', 'Keurig Dr Pepper', 14.0], ['MNST', 'Monster Beverage', 25.0], ['KHC', 'Kraft Heinz', 8.5]],
    peerBasis: 'Beverages & packaged food',
  },
};

export const SNAPSHOT_TICKERS = Object.keys(SPECS);

function fact(key: LineKey, value: number, end: string, fy: number, start: string | null): Fact {
  const isShares = key === 'sharesOutstanding';
  return {
    value,
    tag: TAGS[key] ?? key,
    taxonomy: isShares ? 'dei' : 'us-gaap',
    unit: isShares ? 'shares' : 'USD',
    accn: null,
    form: '10-K',
    filed: null,
    fy,
    fp: 'FY',
    start,
    end,
  };
}

function line(key: LineKey, valueMillions: number, end: string, fy: number, start: string | null): LineItem {
  const value = valueMillions * 1e6;
  return { key, label: LABELS[key], value, facts: [fact(key, value, end, fy, start)] };
}

const FLOW_KEYS = new Set<LineKey>(['revenue', 'ebit', 'netIncome', 'da', 'capex', 'pretax', 'taxExpense', 'interestExpense', 'impairment']);

function buildCompany(ticker: string, s: SnapSpec): CompanyFinancials {
  const years: Period[] = s.fyEnds.map((end, i) => {
    const fy = Number(end.slice(0, 4));
    const start = new Date(Date.parse(end) - 364 * 86400_000).toISOString().slice(0, 10);
    const items: LineItems = {
      revenue: line('revenue', s.revenue[i], end, fy, start),
      ebit: line('ebit', s.ebit[i], end, fy, start),
    };
    if (i === s.fyEnds.length - 1) {
      for (const [k, v] of Object.entries(s.latest) as [LineKey, number][]) {
        items[k] = line(k, v, end, fy, FLOW_KEYS.has(k) ? start : null);
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
    ltm: { ...last, label: `${last.label} (LTM)` },
    balance: { ...last, label: `Balance sheet ${last.label}` },
    source: 'snapshot',
    fetchedAt: SNAPSHOT_AS_OF,
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
    peers: s.peers.map(([t, name, m]) => ({ ticker: t, name, evEbitda: m, ev: null, ebitda: null, source: 'snapshot' })),
    basis: `${s.peerBasis} (illustrative snapshot multiples)`,
  };
}

export function snapshotDataset(ticker: string): Dataset | null {
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
