import 'server-only';

// Spot FX for converting foreign filers' statements to USD. ECB reference rates via
// Frankfurter first (no key), then open.er-api.com, which also covers currencies the
// ECB doesn't publish (e.g. TWD).

export interface FxRate {
  currency: string;
  rate: number; // USD per 1 unit of `currency`
  asOf: string;
  source: string;
}

const cache = new Map<string, { at: number; value: FxRate }>();
const TTL = 6 * 3600_000;

async function frankfurter(ccy: string): Promise<FxRate> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${ccy}&to=USD`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const j = await res.json();
  const rate = Number(j?.rates?.USD);
  if (!(rate > 0)) throw new Error('Frankfurter: no rate');
  return { currency: ccy, rate, asOf: j.date, source: 'ECB reference rate (Frankfurter)' };
}

async function openEr(ccy: string): Promise<FxRate> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`open.er-api ${res.status}`);
  const j = await res.json();
  const perUsd = Number(j?.rates?.[ccy]);
  if (!(perUsd > 0)) throw new Error(`open.er-api: no ${ccy}`);
  return { currency: ccy, rate: 1 / perUsd, asOf: String(j.time_last_update_utc ?? '').slice(0, 16), source: 'open.er-api.com' };
}

export async function getUsdRate(ccy: string): Promise<FxRate> {
  if (ccy === 'USD') return { currency: 'USD', rate: 1, asOf: '', source: 'n/a' };
  const hit = cache.get(ccy);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value: FxRate;
  try {
    value = await frankfurter(ccy);
  } catch {
    value = await openEr(ccy);
  }
  cache.set(ccy, { at: Date.now(), value });
  return value;
}
