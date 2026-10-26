import { NextResponse } from 'next/server';
import { TickerNotFoundError, getDataset } from '@/lib/data/dataset';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET /api/company/AAPL -> parsed XBRL line items (with accession IDs), market data and peers.
export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  try {
    return NextResponse.json(await getDataset(params.ticker));
  } catch (e) {
    const status = e instanceof TickerNotFoundError ? 404 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
