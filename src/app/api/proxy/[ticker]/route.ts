import { NextResponse } from 'next/server';
import { extractParachutes, type ProxyResult } from '@/lib/ai/proxy';
import { cached } from '@/lib/data/cache';
import { getIntel } from '@/lib/data/intel';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// POST /api/proxy/AAPL -> change-of-control payouts extracted from the latest DEF 14A (cached per filing)
export async function POST(_req: Request, { params }: { params: { ticker: string } }) {
  try {
    const intel = await getIntel(params.ticker);
    if (!intel.proxy) {
      const r: ProxyResult = { status: 'not_found', message: intel.source === 'snapshot' ? 'Proxy statements need live SEC access.' : 'No DEF 14A proxy statement on file.', executives: [], verifiedTotal: 0 };
      return NextResponse.json(r);
    }
    const proxy = intel.proxy;
    // Cache real extractions per filing; errors and missing-key results are returned uncached so a fix takes effect immediately.
    const result = await cached(`coc:${intel.ticker}:${proxy.accessionNumber}`, 30 * 86400_000, async () => {
      const r = await extractParachutes(proxy);
      if (r.status === 'needs_key' || r.status === 'error') throw Object.assign(new Error(r.message ?? 'uncached'), { result: r });
      return r;
    }).catch((e: Error & { result?: ProxyResult }) => {
      if (e.result) return e.result;
      throw e;
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ status: 'error', message: (e as Error).message, executives: [], verifiedTotal: 0 }, { status: 502 });
  }
}
