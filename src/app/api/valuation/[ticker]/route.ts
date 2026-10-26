import { NextResponse } from 'next/server';
import { readOverrides } from '@/lib/engine/params';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { toValuationOutput, valuate } from '@/lib/data/valuate';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET /api/valuation/AAPL?w=0.09&g=0.03 -> ValuationOutputSchema JSON (PRD 4.2)
export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  try {
    const q = Object.fromEntries(new URL(req.url).searchParams);
    const r = await valuate(params.ticker, readOverrides(q));
    return NextResponse.json(
      { ...toValuationOutput(r), source: r.ds.source, assumptions: r.a, generatedAt: r.ds.generatedAt },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (e) {
    const status = e instanceof TickerNotFoundError ? 404 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
