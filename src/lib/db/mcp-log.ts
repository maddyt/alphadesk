import 'server-only';
import { supabase } from '../supabase.ts';

/** Log one SEC EDGAR tool call to Supabase `mcp_calls` (no-op without Supabase; never throws). */
export async function logToolCall(row: { source: 'mcp' | 'deal_room'; tool: string; args: unknown; ok: boolean; ms: number; chars: number }): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db
    .from('mcp_calls')
    .insert({ ...row, args: (row.args ?? {}) as object })
    .then(
      () => undefined,
      () => undefined,
    );
}
