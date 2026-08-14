import { NextResponse } from 'next/server';
import { listCompanies } from '@/lib/supabase/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ companies: await listCompanies() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
