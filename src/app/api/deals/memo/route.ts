import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { buildDealFacts } from '@/lib/deals/facts';
import { generateDealMemo } from '@/lib/deals/memo';
import { readDealOverrides } from '@/lib/deals/params';
import { dealRun } from '@/lib/deals/run';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const Body = z.object({ acquirer: z.string().min(1).max(8), target: z.string().min(1).max(8), query: z.string().max(500).optional() });

// POST /api/deals/memo { acquirer, target, query } -> AI rationale with every figure verified.
// Numbers are recomputed here from the scenario; nothing numeric is taken from the client.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Expected { acquirer, target, query }' }, { status: 400 });
  try {
    const q = Object.fromEntries(new URLSearchParams(parsed.data.query ?? ''));
    const d = await dealRun(parsed.data.acquirer, parsed.data.target, readDealOverrides(q));
    const facts = buildDealFacts(d.A, d.T, d.a, d.r);
    const result = await generateDealMemo({
      acquirer: { ticker: d.A.ticker, name: d.A.name, industry: d.A.sicDescription },
      target: { ticker: d.T.ticker, name: d.T.name, industry: d.T.sicDescription },
      facts,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof TickerNotFoundError ? 404 : 502 });
  }
}
