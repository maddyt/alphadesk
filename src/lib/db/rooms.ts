import 'server-only';
import { supabase } from '../supabase.ts';
import { cacheGet, cachePut } from '../data/cache.ts';
import type { RoomEvent } from '../agents/room.ts';
import type { RunSummary, SavedRun } from '../agents/room-state.ts';

// AI Deal Room run history. With Supabase every run is a row in `deal_room_runs`
// (kept permanently, shareable by id, works across devices). Without it the latest
// run per pair lives in the instance cache for 30 days.

const MEM_TTL = 30 * 24 * 3600_000;
const memKey = (a: string, t: string) => `room:latest:${a}:${t}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function headline(events: RoomEvent[]) {
  const syn = events.find((e): e is Extract<RoomEvent, { type: 'synergy' }> => e.type === 'synergy')?.data;
  const audit = events.find((e): e is Extract<RoomEvent, { type: 'audit' }> => e.type === 'audit')?.data;
  const risk = events.find((e): e is Extract<RoomEvent, { type: 'risk' }> => e.type === 'risk')?.data;
  const usage = events.find((e): e is Extract<RoomEvent, { type: 'usage' }> => e.type === 'usage');
  const failed = events.some((e) => e.type === 'agent' && e.status === 'error');
  return {
    status: failed || !(syn && audit && risk) ? 'partial' : 'complete',
    cost_synergies: syn?.totalCost ?? null,
    hsr_score: syn?.hsrRisk.score ?? null,
    audit_verdict: audit?.verdict ?? null,
    risk_count: risk?.risks.length ?? null,
    input_tokens: usage ? usage.usage.input + usage.usage.cacheRead + usage.usage.cacheWrite : 0,
    output_tokens: usage?.usage.output ?? 0,
    cost_usd: usage ? Number(usage.costUsd.toFixed(4)) : 0,
    model: usage?.model ?? null,
  };
}

/** Store a run; returns it with its database id when Supabase is configured. */
export async function saveRoomRun(run: SavedRun): Promise<SavedRun> {
  await cachePut(memKey(run.acquirer, run.target), run);
  const db = supabase();
  if (!db) return run;
  const { data, error } = await db
    .from('deal_room_runs')
    .insert({ acquirer: run.acquirer, target: run.target, query: run.query, mode: run.mode, events: run.events, created_at: run.savedAt, ...headline(run.events) })
    .select('id')
    .single();
  if (error || !data) return run;
  const saved = { ...run, id: data.id as string };
  await cachePut(memKey(run.acquirer, run.target), saved);
  return saved;
}

type Row = { id: string; acquirer: string; target: string; query: string; mode: 'focused' | 'whole'; events: RoomEvent[]; created_at: string };
const toRun = (r: Row): SavedRun => ({ v: 1, id: r.id, acquirer: r.acquirer, target: r.target, query: r.query, mode: r.mode, savedAt: r.created_at, events: r.events });

export async function roomRunById(id: string): Promise<SavedRun | null> {
  const db = supabase();
  if (!db || !UUID.test(id)) return null;
  const { data } = await db.from('deal_room_runs').select('id, acquirer, target, query, mode, events, created_at').eq('id', id).maybeSingle();
  return data ? toRun(data as Row) : null;
}

export async function latestRoomRun(acquirer: string, target: string): Promise<SavedRun | null> {
  const db = supabase();
  if (db) {
    const { data } = await db
      .from('deal_room_runs')
      .select('id, acquirer, target, query, mode, events, created_at')
      .eq('acquirer', acquirer)
      .eq('target', target)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return toRun(data as Row);
  }
  return (await cacheGet<SavedRun>(memKey(acquirer, target), MEM_TTL)) ?? null;
}

export async function listRoomRuns(acquirer: string, target: string, limit = 10): Promise<RunSummary[] | null> {
  const db = supabase();
  if (!db) return null;
  const { data } = await db
    .from('deal_room_runs')
    .select('id, query, mode, status, cost_synergies, hsr_score, audit_verdict, risk_count, cost_usd, created_at')
    .eq('acquirer', acquirer)
    .eq('target', target)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as RunSummary[] | null) ?? [];
}
