import 'server-only';
import { companyFacts, resolveCik, submissionsMeta } from '../sec/client.ts';
import { fetchMarketData, fetchPrice } from '../market/quote.ts';
import { getYieldCurve } from '../market/treasury.ts';
import { cached } from '../data/cache.ts';
import { normalizeTicker, TickerNotFoundError } from '../data/dataset.ts';
import { parseBankFacts } from './xbrl.ts';
import { BANK_SNAPSHOT_AS_OF, BANK_SNAPSHOT_TICKERS, snapshotBank, snapshotBankMarket } from './snapshot.ts';
import { bankInputs, defaultBankAssumptions, runBank, type BankAssumptions, type BankInputs } from './engine.ts';
import type { Bank, BankFinancials, BankMarket } from './types.ts';

export class NotABankError extends Error {}

/** Regression peer universe: large and regional US commercial banks. */
export const BANK_UNIVERSE = [...BANK_SNAPSHOT_TICKERS, 'CMA', 'EWBC', 'WAL'];
export const FEATURED_BANKS = ['JPM', 'BAC', 'WFC', 'PNC', 'USB', 'ZION'];

const FIN_TTL = 12 * 3600_000;
const snapshotMode = () => process.env.DATA_MODE === 'snapshot';

/** Parsed bank XBRL, cached 12h (memory, then Supabase feed_cache). */
async function liveFinancials(ticker: string): Promise<BankFinancials> {
  return cached(`bank:v1:${ticker}`, FIN_TTL, async () => {
    let cik: string;
    try {
      cik = await resolveCik(ticker);
    } catch (e) {
      throw new TickerNotFoundError((e as Error).message);
    }
    const [facts, meta] = await Promise.all([companyFacts(cik), submissionsMeta(cik).catch(() => null)]);
    let parsed;
    try {
      parsed = parseBankFacts(facts, ticker);
    } catch (e) {
      throw new NotABankError((e as Error).message);
    }
    return { ...parsed, name: meta?.name ?? parsed.name, sic: meta?.sic ?? null, source: 'sec-live' as const, fetchedAt: new Date().toISOString() };
  });
}

async function liveMarket(ticker: string, full: boolean): Promise<BankMarket> {
  const snap = snapshotBankMarket(ticker);
  if (!full) return { price: await fetchPrice(ticker), beta: snap?.beta ?? 1.1, asOf: new Date().toISOString().slice(0, 10), source: 'Yahoo Finance', low52: null, high52: null };
  const m = await fetchMarketData(ticker, snap?.beta);
  return { price: m.price, beta: m.beta, asOf: m.asOf, source: `${m.source} · β ${m.betaSource}`, low52: m.low52, high52: m.high52 };
}

/** One bank: live SEC + market data, falling back to the snapshot (with a warning) when live data fails. */
export async function getBank(raw: string, full = true): Promise<{ bank: Bank; warnings: string[] }> {
  const ticker = normalizeTicker(raw);
  const snapFin = snapshotBank(ticker);
  const snapMkt = snapshotBankMarket(ticker);
  if (snapshotMode()) {
    if (!snapFin || !snapMkt) throw new TickerNotFoundError(`${ticker} is not in the offline bank snapshot (DATA_MODE=snapshot). Try ${FEATURED_BANKS.join(', ')}.`);
    return { bank: { fin: snapFin, market: snapMkt }, warnings: [`Offline snapshot: approximate FY2024 figures and prices as of ${BANK_SNAPSHOT_AS_OF}.`] };
  }
  const warnings: string[] = [];
  let fin: BankFinancials;
  try {
    fin = await liveFinancials(ticker);
  } catch (e) {
    if (e instanceof NotABankError || e instanceof TickerNotFoundError || !snapFin) throw e;
    fin = snapFin;
    warnings.push(`Live SEC EDGAR fetch failed (${(e as Error).message}); showing approximate snapshot figures.`);
  }
  let market: BankMarket;
  try {
    market = await liveMarket(ticker, full);
  } catch (e) {
    if (!snapMkt) throw new Error(`Market data unavailable for ${ticker}: ${(e as Error).message}`);
    market = snapMkt;
    warnings.push(`Live price unavailable; using an approximate snapshot price as of ${snapMkt.asOf}.`);
  }
  return { bank: { fin, market }, warnings: [...warnings, ...fin.warnings] };
}

type Peers = { peers: BankInputs[]; basis: string; warnings: string[] };
let peerCache: { at: number; value: Promise<Peers> } | null = null;
const PEER_TTL = 15 * 60_000;

/** Peer universe, cached per instance for 15 minutes (the XBRL behind it is cached for 12 hours). */
export function getPeers(): Promise<Peers> {
  if (peerCache && Date.now() - peerCache.at < PEER_TTL) return peerCache.value;
  const value = loadPeers().catch((e) => {
    peerCache = null;
    throw e;
  });
  peerCache = { at: Date.now(), value };
  return value;
}

/** Peer universe as engine inputs. Falls back to the snapshot peer set if too few live banks load. */
async function loadPeers(): Promise<Peers> {
  const live = await Promise.all(BANK_UNIVERSE.map((t) => getBank(t, false).then((r) => (r.bank.fin.source === 'sec-live' ? bankInputs(r.bank) : null)).catch(() => null)));
  const peers = live.filter((p): p is BankInputs => p !== null);
  if (peers.length >= 6) return { peers, basis: `${peers.length} US commercial banks, SEC EDGAR XBRL + live prices`, warnings: [] };
  const snap = BANK_SNAPSHOT_TICKERS.map((t) => bankInputs({ fin: snapshotBank(t)!, market: snapshotBankMarket(t)! }));
  return {
    peers: snap,
    basis: `${snap.length} US commercial banks, approximate snapshot (FY2024)`,
    warnings: snapshotMode() ? [] : ['Live peer data unavailable; the regression uses the approximate snapshot peer set.'],
  };
}

/** Loss-making peers distort a P/TBV-on-ROATCE line, so they start excluded (one click puts them back). */
export const defaultExcluded = (peers: BankInputs[]) => peers.filter((p) => !(p.roatce > 0)).map((p) => p.ticker);

export async function bankRun(ticker: string, overrides: Partial<BankAssumptions> = {}) {
  const [{ bank, warnings }, { peers, basis, warnings: pw }, macro] = await Promise.all([getBank(ticker), getPeers(), getYieldCurve()]);
  const i = bankInputs(bank);
  const defaults: BankAssumptions = { ...defaultBankAssumptions(i, macro.tenYear), excluded: defaultExcluded(peers).filter((t) => t !== i.ticker) };
  const a: BankAssumptions = { ...defaults, ...overrides };
  if (i.roatce <= 0) warnings.push(`${i.ticker} lost money in ${bank.fin.fyLabel}: set a normalized ROATCE to value it on sustainable earnings.`);
  return { bank, peers, basis, defaults, a, run: runBank(i, peers, a), macro, warnings: [...warnings, ...pw] };
}
