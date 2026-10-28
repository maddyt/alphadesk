// Client-safe Deal Room state: rebuilds the view from the NDJSON event log, and
// saves finished runs so they survive a reload and reach the exported teaser.

import type { AgentId, RiskReport, RoomEvent, SynergyReport } from './room.ts';
import type { AuditOut } from './schemas.ts';
import type { PhaseRow, Usage } from './verify.ts';
import type { ToolCall } from './agents.ts';

export type StartEvent = Extract<RoomEvent, { type: 'start' }>;

export interface RoomState {
  status: 'idle' | 'running' | 'done' | 'error' | 'needs_key';
  message?: string;
  start?: StartEvent;
  agents: Record<AgentId, { status: 'waiting' | 'running' | 'done' | 'error'; ms?: number; message?: string }>;
  tools: (ToolCall & { agent: AgentId })[];
  audit?: AuditOut;
  synergy?: { data: SynergyReport; phase: PhaseRow[] };
  risk?: RiskReport;
  usage?: { usage: Usage; costUsd: number; model: string };
  ms?: number;
  /** Database id of the stored run (Supabase), for the share link. */
  savedId?: string | null;
}

/** A finished run as stored in the browser and on the server. */
export interface SavedRun {
  v: 1;
  /** Database id when the run is stored in Supabase `deal_room_runs` (shareable link). */
  id?: string;
  acquirer: string;
  target: string;
  query: string;
  mode: 'focused' | 'whole';
  savedAt: string;
  events: RoomEvent[];
}

export const freshRoom = (): RoomState => ({
  status: 'idle',
  agents: { audit: { status: 'waiting' }, synergy: { status: 'waiting' }, risk: { status: 'waiting' } },
  tools: [],
});

export function reduceRoom(s: RoomState, e: RoomEvent): RoomState {
  switch (e.type) {
    case 'needs_key':
      return { ...s, status: 'needs_key', message: e.message };
    case 'error':
      return { ...s, status: 'error', message: e.message };
    case 'start':
      return { ...s, start: e };
    case 'agent':
      return { ...s, agents: { ...s.agents, [e.agent]: { status: e.status, ms: e.ms, message: e.message } } };
    case 'tool':
      return { ...s, tools: [...s.tools, { ...e.call, agent: e.agent }] };
    case 'audit':
      return { ...s, audit: e.data };
    case 'synergy':
      return { ...s, synergy: { data: e.data, phase: e.phase } };
    case 'risk':
      return { ...s, risk: e.data };
    case 'usage':
      return { ...s, usage: { usage: e.usage, costUsd: e.costUsd, model: e.model } };
    case 'done':
      return { ...s, status: 'done', ms: e.ms };
    case 'saved':
      return { ...s, savedId: e.id };
  }
}

export function roomFromEvents(events: RoomEvent[]): RoomState {
  const s = events.reduce(reduceRoom, freshRoom());
  // A saved run is over even if its stream was cut before "done".
  return s.status === 'running' || s.status === 'idle' ? { ...s, status: 'done' } : s;
}

/** True when at least one agent produced a result worth keeping. */
export const hasResults = (events: RoomEvent[]) => events.some((e) => e.type === 'audit' || e.type === 'synergy' || e.type === 'risk');

const storeKey = (acquirer: string, target: string) => `dealpulse:room:${acquirer.toUpperCase()}:${target.toUpperCase()}`;

export function saveRunLocal(run: SavedRun) {
  try {
    localStorage.setItem(storeKey(run.acquirer, run.target), JSON.stringify(run));
  } catch {
    // Storage full or blocked (private mode): the server copy still exists.
  }
}

export function loadRunLocal(acquirer: string, target: string): SavedRun | null {
  try {
    const raw = localStorage.getItem(storeKey(acquirer, target));
    const run = raw ? (JSON.parse(raw) as SavedRun) : null;
    return run?.v === 1 && Array.isArray(run.events) ? run : null;
  } catch {
    return null;
  }
}

/** Summary row for the run-history list (Supabase only). */
export interface RunSummary {
  id: string;
  query: string;
  mode: 'focused' | 'whole';
  status: 'complete' | 'partial';
  cost_synergies: number | null;
  hsr_score: number | null;
  audit_verdict: string | null;
  risk_count: number | null;
  cost_usd: number;
  created_at: string;
}

const getJson = <T,>(url: string) =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

/** A specific stored run (shared link), else the latest for the pair: this browser or the server, whichever is newer. */
export async function loadRun(acquirer: string, target: string, id?: string | null): Promise<SavedRun | null> {
  if (id) {
    const byId = await getJson<SavedRun>(`/api/deals/room?id=${encodeURIComponent(id)}`);
    if (byId) return byId;
  }
  const local = loadRunLocal(acquirer, target);
  const remote = await getJson<SavedRun>(`/api/deals/room?acquirer=${encodeURIComponent(acquirer)}&target=${encodeURIComponent(target)}`);
  if (local && remote) return Date.parse(remote.savedAt) > Date.parse(local.savedAt) ? remote : local;
  return local ?? remote;
}
