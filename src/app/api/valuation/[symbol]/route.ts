import { NextResponse } from 'next/server';
import { loadCompany, loadSectorMedians } from '@/lib/supabase/queries';
import { defaultAssumptions, withOverrides, type DeepPartial } from '@/lib/engine/assumptions';
import { runScenario } from '@/lib/engine/valuation';
import { backtest, cases, monteCarlo, reverseDcf, sensitivity } from '@/lib/engine/analytics';
import type { Assumptions } from '@/lib/engine/types';

export const dynamic = 'force-dynamic';

/** GET returns the base-case valuation. POST accepts assumption overrides and re-runs it. */
export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  return compute(params.symbol, undefined, false);
}

export async function POST(req: Request, { params }: { params: { symbol: string } }) {
  let body: { assumptions?: DeepPartial<Assumptions>; analytics?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  return compute(params.symbol, body.assumptions, body.analytics ?? true);
}

async function compute(symbol: string, overrides?: DeepPartial<Assumptions>, withAnalytics = true) {
  try {
    const [data, medians] = await Promise.all([loadCompany(symbol), loadSectorMedians()]);
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const med = medians[data.meta.sector ?? 'Other'] ?? { gross: null, op: null, ebitda: null };
    const a = withOverrides(defaultAssumptions(data.meta), overrides);
    const result = runScenario(data, a, med);
    const extras = withAnalytics && data.meta.shares_outstanding
      ? {
          sensitivity: sensitivity(result, a, data.meta.shares_outstanding),
          cases: cases(data, a, med),
          reverseDcf: reverseDcf(data, a, med),
          backtest: backtest(data, a),
          monteCarlo: monteCarlo(data, a, med, 400),
        }
      : {};
    return NextResponse.json({ assumptions: a, result, ...extras });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
