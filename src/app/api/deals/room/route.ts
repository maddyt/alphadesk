import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runDealRoom } from '@/lib/agents/room';
import { normalizeTicker } from '@/lib/data/dataset';
import { latestRoomRun, listRoomRuns, roomRunById } from '@/lib/db/rooms';
import { ipHash } from '@/lib/db/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  acquirer: z.string().min(1).max(8),
  target: z.string().min(1).max(8),
  query: z.string().max(500).optional(),
  mode: z.enum(['whole', 'focused']).optional(),
  refresh: z.boolean().optional(),
});

// POST /api/deals/room -> NDJSON stream of agent events (see RoomEvent in lib/agents/room.ts).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Expected { acquirer, target, query, mode }' }, { status: 400 });
  const { acquirer, target, query = '', mode = 'focused', refresh } = parsed.data;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: object) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'));
      try {
        for await (const e of runDealRoom({ acquirer, target, query: query.replace(/^\?/, ''), mode, refresh, ip: ipHash(req) })) send(e);
      } catch (e) {
        send({ type: 'error', message: (e as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

// GET /api/deals/room?id=<uuid>                         -> one stored run (shared link)
// GET /api/deals/room?acquirer=MSFT&target=EA            -> the latest run for the pair
// GET /api/deals/room?acquirer=MSFT&target=EA&list=1     -> run history (Supabase only)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id');
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (id) {
      const run = await roomRunById(id);
      return run ? NextResponse.json(run, { headers }) : NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    const acquirer = u.searchParams.get('acquirer');
    const target = u.searchParams.get('target');
    if (!acquirer || !target) return NextResponse.json({ error: 'Expected ?id= or ?acquirer=&target=' }, { status: 400 });
    const [A, T] = [normalizeTicker(acquirer), normalizeTicker(target)];
    if (u.searchParams.get('list')) {
      const runs = await listRoomRuns(A, T);
      return NextResponse.json({ enabled: runs !== null, runs: runs ?? [] }, { headers });
    }
    const run = await latestRoomRun(A, T);
    return run ? NextResponse.json(run, { headers }) : NextResponse.json({ error: 'No saved Deal Room run' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
