import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildFactSheet } from '@/lib/ai/facts';
import { generateMemo } from '@/lib/ai/memo';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { valuate } from '@/lib/data/valuate';
import { cachedIf } from '@/lib/data/cache';
import { BudgetError, checkAiBudget, factsHash, ipHash } from '@/lib/db/usage';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const Body = z.object({
  ticker: z.string().min(1).max(8),
  assumptions: z.record(z.string(), z.number()).optional(),
});

// POST /api/memo { ticker, assumptions } -> AI analyst memo with every figure verified.
// The numbers are recomputed here from the assumptions; nothing numeric is taken from the client.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Expected { ticker, assumptions }' }, { status: 400 });
  try {
    const r = await valuate(parsed.data.ticker, parsed.data.assumptions ?? {});
    const facts = buildFactSheet(r.b, r.a, r.run, r.wacc);
    // Same numbers -> same memo: cache real Claude output for 24h by a hash of the fact sheet.
    const key = `memo:${r.b.ticker}:${factsHash(facts)}`;
    const result = await cachedIf(
      key,
      24 * 3600_000,
      async () => {
        const b = process.env.ANTHROPIC_API_KEY ? await checkAiBudget('valuation_memo', ipHash(req)) : { ok: true as const };
        if (!b.ok) throw new BudgetError(b.reason!);
        return generateMemo({ ticker: r.b.ticker, name: r.b.name, peerBasis: r.ds.peerBasis, facts });
      },
      (m) => m.mode === 'claude',
    );
    return NextResponse.json({ ...result, facts });
  } catch (e) {
    const status = e instanceof TickerNotFoundError ? 404 : e instanceof BudgetError ? 429 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
