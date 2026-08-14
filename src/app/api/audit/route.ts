import { NextResponse } from 'next/server';
import { loadLatestValuations, loadOpenFlags } from '@/lib/supabase/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [flags, valuations] = await Promise.all([loadOpenFlags(), loadLatestValuations()]);
    const byCode: Record<string, number> = {};
    for (const f of flags as { code: string }[]) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
    return NextResponse.json({
      totals: {
        findings: flags.length,
        warnings: (flags as { severity: string }[]).filter((f) => f.severity === 'warn').length,
        valued: valuations.length,
        methodDisagreement: (valuations as { method_spread: number | null }[]).filter((v) => (v.method_spread ?? 0) > 0.35).length,
      },
      byCode, flags,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
