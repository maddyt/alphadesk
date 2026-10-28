import { NextResponse } from 'next/server';
import type { ProxyResult } from '@/lib/ai/proxy';
import { cachedParachutes } from '@/lib/data/parachutes';
import { checkAiBudget, ipHash } from '@/lib/db/usage';
import { getIntel } from '@/lib/data/intel';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// POST /api/proxy/AAPL -> change-of-control payouts extracted from the latest DEF 14A (cached per filing)
export async function POST(req: Request, { params }: { params: { ticker: string } }) {
  try {
    const intel = await getIntel(params.ticker);
    if (!intel.proxy) {
      const r: ProxyResult = { status: 'not_found', message: intel.source === 'snapshot' ? 'Proxy statements need live SEC access.' : 'No DEF 14A proxy statement on file.', executives: [], verifiedTotal: 0 };
      return NextResponse.json(r);
    }
    const proxy = intel.proxy;
    const result = await cachedParachutes(intel.ticker, proxy, async () => {
      const b = await checkAiBudget('proxy', ipHash(req));
      return b.ok ? null : { status: 'error', message: b.reason, url: proxy.url, filingDate: proxy.filingDate, executives: [], verifiedTotal: 0 };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ status: 'error', message: (e as Error).message, executives: [], verifiedTotal: 0 }, { status: 502 });
  }
}
