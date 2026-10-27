import { NextResponse } from 'next/server';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { readDealOverrides } from '@/lib/deals/params';
import { dealRun, toDealOutput } from '@/lib/deals/run';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET /api/deals?acquirer=DIS&target=EA&p=0.3&s=0.5 -> Zod-validated accretion/dilution output
export async function GET(req: Request) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  if (!q.acquirer || !q.target) return NextResponse.json({ error: 'acquirer and target are required' }, { status: 400 });
  try {
    return NextResponse.json(toDealOutput(await dealRun(q.acquirer, q.target, readDealOverrides(q))));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof TickerNotFoundError ? 404 : 502 });
  }
}
