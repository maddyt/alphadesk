import 'server-only';
import { parseFredCsv, parseTreasuryCsv, type YieldCurve } from '../sec/parsers.ts';
import { RISK_FREE_DEFAULT } from '../engine/model.ts';
import { cacheGet, cachePut } from '../data/cache.ts';

// PRD v2 appendix E: live risk-free rate from the U.S. Treasury daily par yield curve,
// falling back to FRED's DGS10 series, then to a static default.

let cache: { at: number; value: YieldCurve } | null = null;
const TTL = 6 * 3600_000;

async function treasury(year: number): Promise<YieldCurve | null> {
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Treasury ${res.status}`);
  return parseTreasuryCsv(await res.text());
}

async function fred(): Promise<YieldCurve | null> {
  const res = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`FRED ${res.status}`);
  const p = parseFredCsv(await res.text());
  return p ? { date: p.date, points: [{ tenor: '10Y', years: 10, rate: p.rate }], tenYear: p.rate, source: 'FRED DGS10 (10-year Treasury)' } : null;
}

export async function getYieldCurve(): Promise<YieldCurve> {
  if (process.env.DATA_MODE === 'snapshot') return { date: '', points: [], tenYear: RISK_FREE_DEFAULT, source: 'Static default (offline snapshot mode)' };
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  // Shared across instances via Supabase feed_cache (cold starts skip Treasury.gov).
  const shared = await cacheGet<YieldCurve>('macro:yield-curve', TTL).catch(() => undefined);
  if (shared) {
    cache = { at: Date.now(), value: shared };
    return shared;
  }
  const year = new Date().getUTCFullYear();
  let curve: YieldCurve | null = null;
  try {
    curve = (await treasury(year)) ?? (await treasury(year - 1));
  } catch {
    /* fall through */
  }
  if (!curve) {
    try {
      curve = await fred();
    } catch {
      /* fall through */
    }
  }
  const value = curve ?? { date: '', points: [], tenYear: RISK_FREE_DEFAULT, source: 'Static default (live yield curve unavailable)' };
  if (curve) {
    cache = { at: Date.now(), value };
    await cachePut('macro:yield-curve', value).catch(() => undefined);
  }
  return value;
}
