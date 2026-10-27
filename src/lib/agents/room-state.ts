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
}

/** A finished run as stored in the browser and on the server. */
export interface SavedRun {
  v: 1;
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

/** Latest saved run for the pair: this browser first, then the server copy. */
export async function loadRun(acquirer: string, target: string): Promise<SavedRun | null> {
  const local = loadRunLocal(acquirer, target);
  const remote = await fetch(`/api/deals/room?acquirer=${encodeURIComponent(acquirer)}&target=${encodeURIComponent(target)}`)
    .then((r) => (r.ok ? (r.json() as Promise<SavedRun>) : null))
    .catch(() => null);
  if (local && remote) return Date.parse(remote.savedAt) > Date.parse(local.savedAt) ? remote : local;
  return local ?? remote;
}
