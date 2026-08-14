import { NextResponse } from 'next/server';
import { loadCompany } from '@/lib/supabase/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  try {
    const data = await loadCompany(params.symbol);
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
