import { NextResponse } from 'next/server';
import { getIntel } from '@/lib/data/intel';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET /api/intel/AAPL -> segment revenue, Form 4 insiders, 13D/G holders, 8-K governance flags, latest proxy
export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  try {
    return NextResponse.json(await getIntel(params.ticker), { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
