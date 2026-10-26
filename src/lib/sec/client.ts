// SEC EDGAR REST client. SEC's fair-access policy requires a descriptive
// User-Agent with a contact address and caps traffic at 10 requests/second;
// the limiter below stays under that per server instance.

import type { CompanyFactsJson } from './xbrl.ts';
import { BUNDLED_CIKS } from './tickers.ts';

const UA = process.env.SEC_USER_AGENT || 'ValuationEngine AI research-demo admin@valuationengine.dev';
const MAX_PER_SECOND = 8;

let windowStart = 0;
let inWindow = 0;
let chain: Promise<void> = Promise.resolve();

/** Serialises request starts so no more than MAX_PER_SECOND begin in any one-second window. */
function rateLimit(): Promise<void> {
  const next = chain.then(async () => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      inWindow = 0;
    }
    if (inWindow >= MAX_PER_SECOND) {
      await new Promise((r) => setTimeout(r, 1000 - (now - windowStart)));
      windowStart = Date.now();
      inWindow = 0;
    }
    inWindow++;
  });
  chain = next.catch(() => undefined);
  return next;
}

export async function secFetch<T>(url: string, timeoutMs = 20_000): Promise<T> {
  await rateLimit();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`SEC EDGAR ${res.status} for ${url}`);
  return (await res.json()) as T;
}

let tickerMap: Promise<Map<string, { cik: string; title: string }>> | null = null;

async function loadTickerMap() {
  const raw = await secFetch<Record<string, { cik_str: number; ticker: string; title: string }>>(
    'https://www.sec.gov/files/company_tickers.json',
  );
  const m = new Map<string, { cik: string; title: string }>();
  for (const r of Object.values(raw)) m.set(r.ticker.toUpperCase(), { cik: String(r.cik_str).padStart(10, '0'), title: r.title });
  return m;
}

export async function resolveCik(ticker: string): Promise<string> {
  const t = ticker.toUpperCase();
  const bundled = BUNDLED_CIKS[t];
  if (bundled) return String(bundled).padStart(10, '0');
  tickerMap ??= loadTickerMap().catch((e) => {
    tickerMap = null;
    throw e;
  });
  const hit = (await tickerMap).get(t) ?? (await tickerMap).get(t.replace('.', '-'));
  if (!hit) throw new Error(`Ticker ${t} not found in SEC EDGAR`);
  return hit.cik;
}

export function companyFacts(cik: string): Promise<CompanyFactsJson> {
  return secFetch<CompanyFactsJson>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, 30_000);
}

export async function submissionsMeta(cik: string): Promise<{ sic: string | null; sicDescription: string | null; name: string }> {
  const s = await secFetch<{ sic?: string; sicDescription?: string; name: string }>(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
  );
  return { sic: s.sic || null, sicDescription: s.sicDescription || null, name: s.name };
}
