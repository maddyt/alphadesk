import 'server-only';
import { extractParachutes, type ProxyResult } from '../ai/proxy.ts';
import { cachedIf } from './cache.ts';

/**
 * Golden-parachute extraction, cached per proxy filing for 30 days (memory, then
 * Supabase feed_cache). Errors and missing-key results are not cached, so a fix takes effect at once.
 * `guard` runs only when Claude would actually be called (not on a cache hit) and may veto the call.
 */
export async function cachedParachutes(
  ticker: string,
  proxy: { accessionNumber: string; url: string; filingDate: string },
  guard?: () => Promise<ProxyResult | null>,
): Promise<ProxyResult> {
  return cachedIf(
    `coc:${ticker}:${proxy.accessionNumber}`,
    30 * 86400_000,
    async () => (await guard?.()) ?? extractParachutes(proxy),
    (r) => r.status === 'ok' || r.status === 'not_found',
  );
}
