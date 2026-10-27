// CIKs for the curated universe (so demo tickers resolve without fetching SEC's
// 1MB ticker map) and the peer sets used for trading comparables. Any other ticker
// resolves live through https://www.sec.gov/files/company_tickers.json and gets peers
// from its SIC industry code.

export const BUNDLED_CIKS: Record<string, number> = {
  AAPL: 320193, MSFT: 789019, GOOGL: 1652044, META: 1326801, AMZN: 1018724, NVDA: 1045810,
  AMD: 2488, AVGO: 1730168, QCOM: 804328, MU: 723125, MRVL: 1835632, INTC: 50863, TXN: 97476,
  ORCL: 1341439, CRM: 1108524, ADBE: 796343, NOW: 1373715, INTU: 896878,
  DELL: 1571996, HPQ: 47217,
  EA: 712515, TTWO: 946581, ASML: 937966,
  DIS: 1744489, NFLX: 1065280, CMCSA: 1166691, WBD: 1437107, FOXA: 1754301,
  KO: 21344, PEP: 77476, MDLZ: 1103982, KDP: 1418135, MNST: 865752, KHC: 1637459,
  COST: 909832, WMT: 104169, TGT: 27419, BJ: 1531152, DG: 29534, KR: 56873,
  HD: 354950, LOW: 60667,
  NKE: 320187, LULU: 1397187, DECK: 910521, RL: 1037038,
  TSLA: 1318605, GM: 1467858, F: 37996,
  PFE: 78003, JNJ: 200406, MRK: 310158, LLY: 59478, ABBV: 1551152, BMY: 14272,
  XOM: 34088, CVX: 93410, COP: 1163165,
  BA: 12927, LMT: 936468, RTX: 101829, NOC: 1133421, GD: 40533,
  V: 1403161, MA: 1141391, PYPL: 1633917,
  MCD: 63908, SBUX: 829224, CMG: 1058090, YUM: 1041061,
  UBER: 1543151, ABNB: 1559720, BKNG: 1075531, DASH: 1792789,
};

export const PEER_GROUPS: Record<string, string[]> = {
  'Mega-cap technology': ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'],
  Semiconductors: ['NVDA', 'AMD', 'AVGO', 'QCOM', 'MU', 'MRVL', 'TXN', 'INTC'],
  Software: ['MSFT', 'ORCL', 'CRM', 'ADBE', 'NOW', 'INTU'],
  'Hardware & devices': ['AAPL', 'DELL', 'HPQ'],
  'Media & entertainment': ['DIS', 'CMCSA', 'WBD', 'FOXA', 'NFLX'],
  'Beverages & packaged food': ['KO', 'PEP', 'MDLZ', 'KDP', 'MNST', 'KHC'],
  'Mass & warehouse retail': ['COST', 'WMT', 'TGT', 'BJ', 'DG', 'KR'],
  'Home improvement': ['HD', 'LOW', 'WMT', 'TGT'],
  'Apparel & footwear': ['NKE', 'LULU', 'DECK', 'RL'],
  Autos: ['TSLA', 'GM', 'F'],
  Pharma: ['PFE', 'JNJ', 'MRK', 'LLY', 'ABBV', 'BMY'],
  'Integrated energy': ['XOM', 'CVX', 'COP'],
  'Aerospace & defense': ['BA', 'LMT', 'RTX', 'NOC', 'GD'],
  Payments: ['V', 'MA', 'PYPL'],
  Restaurants: ['MCD', 'SBUX', 'CMG', 'YUM'],
  'Consumer internet platforms': ['UBER', 'ABNB', 'BKNG', 'DASH', 'AMZN'],
};

/** Explicit primary group for tickers that sit in more than one. */
const PRIMARY: Record<string, string> = {
  AAPL: 'Mega-cap technology',
  MSFT: 'Mega-cap technology',
  AMZN: 'Mega-cap technology',
  WMT: 'Mass & warehouse retail',
  TGT: 'Mass & warehouse retail',
};

/** Extra peers that do not belong to the ticker's primary group but matter to a banker. */
const EXTRA: Record<string, string[]> = {
  AAPL: ['DELL', 'HPQ'],
  MSFT: ['ORCL', 'CRM'],
};

/** SIC code ranges -> peer group, for tickers outside the curated universe. */
const SIC_GROUPS: [number, number, string][] = [
  [3570, 3579, 'Hardware & devices'],
  [3600, 3699, 'Semiconductors'],
  [7370, 7379, 'Software'],
  [4800, 4899, 'Media & entertainment'],
  [7800, 7899, 'Media & entertainment'],
  [2000, 2099, 'Beverages & packaged food'],
  [5300, 5399, 'Mass & warehouse retail'],
  [5400, 5499, 'Mass & warehouse retail'],
  [5200, 5299, 'Home improvement'],
  [2300, 2399, 'Apparel & footwear'],
  [3020, 3029, 'Apparel & footwear'],
  [3710, 3716, 'Autos'],
  [2830, 2836, 'Pharma'],
  [1300, 1399, 'Integrated energy'],
  [2900, 2999, 'Integrated energy'],
  [3720, 3729, 'Aerospace & defense'],
  [3760, 3769, 'Aerospace & defense'],
  [3810, 3812, 'Aerospace & defense'],
  [5810, 5819, 'Restaurants'],
  [4700, 4799, 'Consumer internet platforms'],
];

export function peersFor(ticker: string, sic: string | null): { peers: string[]; basis: string } {
  const t = ticker.toUpperCase();
  const group =
    PRIMARY[t] ?? Object.entries(PEER_GROUPS).find(([, members]) => members.includes(t))?.[0] ?? sicGroup(sic);
  if (!group) return { peers: [], basis: 'No peer group found for this industry' };
  const peers = [...new Set([...PEER_GROUPS[group], ...(EXTRA[t] ?? [])])].filter((p) => p !== t).slice(0, 7);
  const viaSic = !Object.values(PEER_GROUPS).some((m) => m.includes(t));
  return { peers, basis: viaSic ? `${group} (matched on SIC ${sic})` : group };
}

function sicGroup(sic: string | null): string | null {
  const n = Number(sic);
  if (!Number.isFinite(n)) return null;
  return SIC_GROUPS.find(([lo, hi]) => n >= lo && n <= hi)?.[2] ?? null;
}

export function isFinancialSic(sic: string | null): boolean {
  const n = Number(sic);
  return Number.isFinite(n) && n >= 6000 && n <= 6799;
}

export const FEATURED = ['AAPL', 'NVDA', 'DIS', 'MSFT', 'COST', 'KO'] as const;
