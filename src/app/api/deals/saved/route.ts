import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const Body = z.object({
  acquirer: z.string().regex(/^[A-Z][A-Z0-9.\-]{0,5}$/),
  target: z.string().regex(/^[A-Z][A-Z0-9.\-]{0,5}$/),
  name: z.string().min(1).max(80),
  query: z.string().max(500),
  accretion: z.number().finite(),
});

export async function GET() {
  const db = supabase();
  if (!db) return NextResponse.json({ enabled: false, deals: [] });
  const { data, error } = await db.from('saved_deals').select('id, acquirer, target, name, query, accretion, created_at').order('created_at', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ enabled: true, deals: [], error: error.message }, { status: 502 });
  return NextResponse.json({ enabled: true, deals: data });
}

export async function POST(req: Request) {
  const db = supabase();
  if (!db) return NextResponse.json({ error: 'Saving needs Supabase (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).' }, { status: 501 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid teardown' }, { status: 400 });
  const { data, error } = await db.from('saved_deals').insert(parsed.data).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ id: data.id });
}
