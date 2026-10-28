import { NextResponse } from 'next/server';
import { health } from '@/lib/db/health';

export const dynamic = 'force-dynamic';

// GET /api/health -> configuration and Supabase table check (no secrets, no row data).
export async function GET() {
  const h = await health();
  return NextResponse.json(h, { status: h.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
