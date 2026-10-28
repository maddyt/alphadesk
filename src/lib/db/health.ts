import 'server-only';
import { supabase } from '../supabase.ts';
import { limits } from './usage.ts';

// Setup check behind /status and /api/health: which integrations are configured and
// whether every Supabase table from supabase/setup.sql exists. Exposes no secrets or row data.

export const TABLES = [
  { name: 'company_cache', migration: '0001', purpose: 'Parsed SEC XBRL financials (12h)' },
  { name: 'valuation_runs', migration: '0001', purpose: '"Recently valued" feed on the home page' },
  { name: 'saved_deals', migration: '0002', purpose: 'Saved DealPulse teardowns' },
  { name: 'feed_cache', migration: '0003', purpose: 'SEC feeds, AI memos, parachutes, yield curve, FX' },
  { name: 'deal_room_runs', migration: '0004', purpose: 'AI Deal Room history and share links' },
  { name: 'ai_usage', migration: '0004', purpose: 'Claude spend log and daily budget guard' },
  { name: 'filing_docs', migration: '0004', purpose: '10-K / 20-F / proxy text cache' },
  { name: 'mcp_calls', migration: '0004', purpose: 'SEC EDGAR MCP tool-call log' },
] as const;

export interface Health {
  ok: boolean;
  env: { secUserAgent: boolean; anthropic: boolean; supabase: boolean; marketKey: boolean; dataMode: string };
  tables: { name: string; migration: string; purpose: string; ok: boolean; rows: number | null; error?: string }[];
  ai: { dailyBudgetUsd: number; roomRunsPerIpPerDay: number; spentTodayUsd: number | null; spent7dUsd: number | null };
}

export async function health(): Promise<Health> {
  const db = supabase();
  const env = {
    secUserAgent: !!process.env.SEC_USER_AGENT,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    supabase: !!db,
    marketKey: !!process.env.FMP_API_KEY,
    dataMode: process.env.DATA_MODE ?? 'live',
  };
  const tables = await Promise.all(
    TABLES.map(async (t) => {
      if (!db) return { ...t, ok: false, rows: null, error: 'Supabase not configured' };
      const { count, error } = await db.from(t.name).select('*', { count: 'estimated', head: true });
      // HEAD requests carry no error body, so an empty message almost always means the table is missing.
      const missing = !error?.message || /does not exist|schema cache|Could not find/i.test(error.message);
      return error ? { ...t, ok: false, rows: null, error: missing ? `Missing: run supabase/setup.sql (migration ${t.migration})` : error.message } : { ...t, ok: true, rows: count ?? 0 };
    }),
  );
  let spentTodayUsd: number | null = null;
  let spent7dUsd: number | null = null;
  if (db && tables.find((t) => t.name === 'ai_usage')?.ok) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const week = new Date(today.getTime() - 6 * 86400_000);
    const { data } = await db.from('ai_usage').select('cost_usd, created_at').gte('created_at', week.toISOString()).limit(20_000);
    spent7dUsd = (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
    spentTodayUsd = (data ?? []).filter((r) => Date.parse(r.created_at) >= today.getTime()).reduce((s, r) => s + Number(r.cost_usd), 0);
  }
  return { ok: !db || tables.every((t) => t.ok), env, tables, ai: { ...limits(), spentTodayUsd, spent7dUsd } };
}
