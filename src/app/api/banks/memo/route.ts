import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { cachedIf } from '@/lib/data/cache';
import { bankRun, NotABankError } from '@/lib/banks/data';
import { buildBankFacts } from '@/lib/banks/facts';
import { generateBankMemo } from '@/lib/banks/memo';
import { readBankOverrides } from '@/lib/banks/params';
import { BudgetError, checkAiBudget, factsHash, ipHash } from '@/lib/db/usage';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const Body = z.object({ ticker: z.string().min(1).max(8), query: z.string().max(800).optional() });

// POST /api/banks/memo { ticker, query } -> AI bank note with every figure verified against the engine.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Expected { ticker, query }' }, { status: 400 });
  try {
    const q = Object.fromEntries(new URLSearchParams((parsed.data.query ?? '').replace(/^\?/, '')));
    const d = await bankRun(parsed.data.ticker, readBankOverrides(q));
    const facts = buildBankFacts(d.run, d.a);
    // Same numbers -> same note: cache real Claude output for 24h by a hash of the fact sheet.
    const result = await cachedIf(
      `bankmemo:${d.run.i.ticker}:${factsHash(facts)}`,
      24 * 3600_000,
      async () => {
        const b = process.env.ANTHROPIC_API_KEY ? await checkAiBudget('bank_memo', ipHash(req)) : { ok: true as const };
        if (!b.ok) throw new BudgetError(b.reason!);
        return generateBankMemo({ ticker: d.run.i.ticker, name: d.run.i.name, peerBasis: d.basis, facts });
      },
      (m) => m.mode === 'claude',
    );
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof TickerNotFoundError ? 404 : e instanceof NotABankError ? 422 : e instanceof BudgetError ? 429 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
