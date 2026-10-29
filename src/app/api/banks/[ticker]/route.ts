import { NextResponse } from 'next/server';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { bankRun, NotABankError } from '@/lib/banks/data';
import { readBankOverrides } from '@/lib/banks/params';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/banks/JPM?tc=0.11&g=0.05 -> P/TBV regression, 3-stage DDM, capital stack and stress test as JSON.
export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  try {
    const q = Object.fromEntries(new URL(req.url).searchParams);
    const d = await bankRun(params.ticker, readBankOverrides(q));
    const { i, reg, ddm, grid, stack, stress } = d.run;
    return NextResponse.json({
      ticker: i.ticker,
      name: i.name,
      source: d.bank.fin.source,
      period: { fiscalYear: d.bank.fin.fyLabel, balanceSheet: d.bank.fin.balanceLabel },
      metrics: i,
      assumptions: d.a,
      regression: { ...reg.fit, impliedPtbv: reg.impliedPtbv, impliedPrice: reg.impliedPrice, residual: reg.targetResidual, peers: reg.points, basis: d.basis },
      ddm: { ...ddm, sensitivity: grid },
      capital: stack,
      stress,
      warnings: d.warnings,
    });
  } catch (e) {
    const status = e instanceof TickerNotFoundError ? 404 : e instanceof NotABankError ? 422 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
