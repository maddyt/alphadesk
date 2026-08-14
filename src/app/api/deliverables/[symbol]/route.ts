import { NextResponse } from 'next/server';
import { loadCompany, loadSectorMedians } from '@/lib/supabase/queries';
import { defaultAssumptions } from '@/lib/engine/assumptions';
import { runScenario } from '@/lib/engine/valuation';
import { backtest, reverseDcf, sensitivity } from '@/lib/engine/analytics';
import { dcfReport, modelCsv, tearsheet } from '@/lib/deliverables/report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: { symbol: string } }) {
  const type = new URL(req.url).searchParams.get('type') ?? 'dcf';
  const symbol = params.symbol.toUpperCase();
  try {
    const [data, medians] = await Promise.all([loadCompany(symbol), loadSectorMedians()]);
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const med = medians[data.meta.sector ?? 'Other'] ?? { gross: null, op: null, ebitda: null };
    const a = defaultAssumptions(data.meta);
    const result = runScenario(data, a, med);
    const input = { data, result, firm: process.env.FIRM_NAME ?? 'AlphaDesk' };

    switch (type) {
      case 'dcf': {
        const html = dcfReport({
          ...input,
          sensitivity: data.meta.shares_outstanding ? sensitivity(result, a, data.meta.shares_outstanding) : null,
          reverse: reverseDcf(data, a, med),
          backtest: backtest(data, a),
        });
        return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-disposition': `inline; filename="${symbol}_dcf.html"` } });
      }
      case 'tearsheet':
        return new NextResponse(tearsheet(input), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-disposition': `inline; filename="${symbol}_tearsheet.html"` } });
      case 'csv':
        return new NextResponse(modelCsv(input), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${symbol}_model.csv"` } });
      case 'model': {
        // Isolated import: the workbook writer is the only dependency-bearing deliverable.
        const { buildWorkbook } = await import('@/lib/deliverables/workbook');
        const buf = await buildWorkbook(data, result);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': `attachment; filename="${symbol}_model.xlsx"`,
          },
        });
      }
      default:
        return NextResponse.json({ error: `unknown type "${type}" (dcf | tearsheet | csv | model)` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
