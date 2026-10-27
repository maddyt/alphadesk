import 'server-only';
import type { CompanyFinancials, Dataset, PeerComp } from '../types.ts';
import { companyFacts, resolveCik, submissionsMeta } from '../sec/client.ts';
import { parseCompanyFacts } from '../sec/xbrl.ts';
import { isFinancialSic, peersFor } from '../sec/tickers.ts';
import { fetchMarketData, fetchPrice } from '../market/quote.ts';
import { getYieldCurve } from '../market/treasury.ts';
import { adjustedEbit } from '../engine/model.ts';
import { snapshotCompany, snapshotDataset, snapshotMarket, snapshotPeers } from './snapshot.ts';
import { supabase } from '../supabase.ts';
import { checkBalance } from '../schema.ts';

const FINANCIALS_TTL_MS = 12 * 3600_000; // XBRL facts change only when a filing lands
const DATASET_TTL_MS = 15 * 60_000; // prices move; keep the assembled dataset briefly

export class TickerNotFoundError extends Error {}

const memory = new Map<string, { at: number; value: unknown }>();

function memoGet<T>(key: string, ttl: number): T | undefined {
  const hit = memory.get(key);
  return hit && Date.now() - hit.at < ttl ? (hit.value as T) : undefined;
}

function memoSet(key: string, value: unknown) {
  memory.set(key, { at: Date.now(), value });
}

export function normalizeTicker(raw: string): string {
  const t = decodeURIComponent(raw).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,5}$/.test(t)) throw new TickerNotFoundError(`"${raw}" is not a valid ticker`);
  return t;
}

/** Parsed XBRL financials, cached in memory and (if configured) in Supabase. */
export async function getFinancials(ticker: string): Promise<CompanyFinancials> {
  const key = `fin:${ticker}`;
  const mem = memoGet<CompanyFinancials>(key, FINANCIALS_TTL_MS);
  if (mem) return mem;

  const db = supabase();
  if (db) {
    const { data } = await db.from('company_cache').select('payload, fetched_at').eq('ticker', ticker).maybeSingle();
    if (data && Date.now() - Date.parse(data.fetched_at) < FINANCIALS_TTL_MS) {
      memoSet(key, data.payload);
      return data.payload as CompanyFinancials;
    }
  }

  let cik: string;
  try {
    cik = await resolveCik(ticker);
  } catch (e) {
    if (String(e).includes('not found')) throw new TickerNotFoundError(String((e as Error).message));
    throw e;
  }
  const [facts, meta] = await Promise.all([companyFacts(cik), submissionsMeta(cik).catch(() => null)]);
  const parsed = parseCompanyFacts(facts, ticker);
  const company: CompanyFinancials = {
    ...parsed,
    name: meta?.name ?? parsed.name,
    sic: meta?.sic ?? null,
    sicDescription: meta?.sicDescription ?? null,
    source: 'sec-live',
    fetchedAt: new Date().toISOString(),
  };
  memoSet(key, company);
  if (db) {
    await db
      .from('company_cache')
      .upsert({ ticker, cik: company.cik, name: company.name, payload: company, fetched_at: company.fetchedAt });
  }
  return company;
}

async function livePeer(ticker: string): Promise<PeerComp | null> {
  try {
    const [fin, price] = await Promise.all([getFinancials(ticker), fetchPrice(ticker)]);
    const ltm = fin.ltm.items;
    const ebit = adjustedEbit(ltm);
    const da = ltm.da?.value ?? 0;
    const bal = fin.balance.items;
    const shares = bal.sharesOutstanding?.value;
    if (ebit === undefined || !shares) return null;
    const ebitda = ebit + da;
    const ev = price * shares + (bal.debt?.value ?? 0) - (bal.cash?.value ?? 0) - (bal.securities?.value ?? 0);
    const evEbitda = ev / ebitda;
    if (!(ebitda > 0) || !Number.isFinite(evEbitda) || evEbitda <= 0 || evEbitda > 80) return null;
    const revenue = ltm.revenue?.value;
    return { ticker, name: fin.name, evEbitda, evRevenue: revenue && revenue > 0 ? ev / revenue : null, ev, ebitda, source: 'sec-live' };
  } catch {
    return null;
  }
}

async function liveDataset(ticker: string): Promise<Dataset> {
  const [company, macro] = await Promise.all([getFinancials(ticker), getYieldCurve()]);
  const warnings: string[] = [];

  const snapMarket = snapshotMarket(ticker);
  let market;
  try {
    market = await fetchMarketData(ticker, snapMarket?.beta);
  } catch (e) {
    if (!snapMarket) throw new Error(`Market data unavailable for ${ticker}: ${(e as Error).message}`);
    market = snapMarket;
    warnings.push(`Live market data unavailable; using approximate snapshot prices as of ${snapMarket.asOf}.`);
  }

  const { peers: peerTickers, basis } = peersFor(ticker, company.sic);
  let peers = (await Promise.all(peerTickers.map(livePeer))).filter((p): p is PeerComp => p !== null);
  let peerBasis = basis;
  if (peers.length < 2) {
    const snap = snapshotPeers(ticker);
    if (snap) {
      peers = snap.peers;
      peerBasis = snap.basis;
      warnings.push('Live peer data unavailable; comps use illustrative snapshot multiples.');
    } else {
      warnings.push('Fewer than two usable peers: comps and precedents are omitted.');
    }
  }

  const isFinancial = isFinancialSic(company.sic);
  if (isFinancial) {
    warnings.push(
      'Financial institution (SIC 6000-6799): EV/EBITDA and unlevered DCF are not meaningful for banks and insurers. Treat this output as illustrative only.',
    );
  }
  if (company.years[company.years.length - 1]?.items.ebit?.formula) {
    warnings.push('EBIT is rebuilt as pre-tax income + interest expense because the company does not tag operating income.');
  }
  const bal = checkBalance(company.balance.items);
  if (bal.checked && !bal.ties) warnings.push(`Balance-sheet check failed (Zod): ${bal.message}. Treat balance-sheet inputs with care.`);
  return { company, market, peers, peerBasis, isFinancial, warnings, source: 'sec-live', generatedAt: new Date().toISOString(), macro };
}

export async function getDataset(rawTicker: string): Promise<Dataset> {
  const ticker = normalizeTicker(rawTicker);
  const key = `ds:${ticker}`;
  const mem = memoGet<Dataset>(key, DATASET_TTL_MS);
  if (mem) return mem;

  if (process.env.DATA_MODE === 'snapshot') {
    const snap = snapshotDataset(ticker);
    if (!snap) throw new TickerNotFoundError(`${ticker} is not in the offline snapshot (DATA_MODE=snapshot)`);
    return snap;
  }

  try {
    const ds = await liveDataset(ticker);
    memoSet(key, ds);
    return ds;
  } catch (e) {
    const snap = snapshotDataset(ticker);
    if (snap && snapshotCompany(ticker)) {
      snap.warnings.unshift(`Live SEC EDGAR fetch failed (${(e as Error).message}); showing the offline snapshot.`);
      return snap;
    }
    throw e;
  }
}

/** Fire-and-forget log of a valuation run, used for the "recently valued" feed. */
export async function logRun(row: {
  ticker: string;
  name: string;
  price: number;
  current_ev: number;
  composite_price: number;
  source: string;
}): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from('valuation_runs').insert(row).then(
    () => undefined,
    () => undefined,
  );
}

export async function recentRuns(limit = 8): Promise<{ ticker: string; name: string; price: number; composite_price: number; created_at: string }[]> {
  const db = supabase();
  if (!db) return [];
  const { data } = await db
    .from('valuation_runs')
    .select('ticker, name, price, composite_price, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  const seen = new Set<string>();
  return (data ?? []).filter((r) => !seen.has(r.ticker) && seen.add(r.ticker)).slice(0, limit);
}

export async function savedDeals(limit = 8): Promise<{ id: string; acquirer: string; target: string; name: string; query: string; accretion: number }[]> {
  const db = supabase();
  if (!db) return [];
  const { data } = await db.from('saved_deals').select('id, acquirer, target, name, query, accretion').order('created_at', { ascending: false }).limit(limit);
  return data ?? [];
}
