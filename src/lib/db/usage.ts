import 'server-only';
import { createHash } from 'node:crypto';
import { supabase } from '../supabase.ts';
import { costUsd, type Usage } from '../agents/verify.ts';

// AI spend tracking and a budget guard, so a public deployment can't run up the
// Anthropic bill. Every Claude call is logged to Supabase `ai_usage`; without
// Supabase the guard falls back to per-instance memory (weaker, resets on cold start).

export type AiFeature = 'valuation_memo' | 'deal_memo' | 'proxy' | 'deal_room' | 'bank_memo';

const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
export const limits = () => ({
  dailyBudgetUsd: num(process.env.AI_DAILY_BUDGET_USD, 25),
  roomRunsPerIpPerDay: num(process.env.AI_ROOM_RUNS_PER_IP_PER_DAY, 10),
});

/** Salted hash of the caller's IP: enough to rate-limit, never stored raw. */
export function ipHash(req: Request): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip');
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dealpulse';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

const memLog: { at: number; feature: AiFeature; cost: number; ip: string | null }[] = [];
const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export async function recordAiUsage(row: { feature: AiFeature; subject: string; model?: string; usage: Usage | null | undefined; ip?: string | null }): Promise<void> {
  if (!row.usage) return;
  const cost = costUsd(row.usage);
  memLog.push({ at: Date.now(), feature: row.feature, cost, ip: row.ip ?? null });
  if (memLog.length > 2000) memLog.splice(0, memLog.length - 2000);
  const db = supabase();
  if (!db) return;
  await db
    .from('ai_usage')
    .insert({
      feature: row.feature,
      subject: row.subject,
      model: row.model ?? null,
      input_tokens: row.usage.input + row.usage.cacheRead + row.usage.cacheWrite,
      output_tokens: row.usage.output,
      cost_usd: Number(cost.toFixed(4)),
      ip_hash: row.ip ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** SDK usage object -> our Usage shape. */
export function fromSdkUsage(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined | null): Usage | null {
  return u ? { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } : null;
}

export interface BudgetCheck {
  ok: boolean;
  reason?: string;
  spentTodayUsd: number;
}

/** Refuse new AI work once today's spend hits the budget, or an IP has used its Deal Room runs. */
export async function checkAiBudget(feature: AiFeature, ip: string | null): Promise<BudgetCheck> {
  const L = limits();
  const since = dayStart();
  let spent: number;
  let ipRuns: number;
  const db = supabase();
  if (db) {
    const [{ data: rows }, ipq] = await Promise.all([
      db.from('ai_usage').select('cost_usd').gte('created_at', since.toISOString()).limit(10_000),
      feature === 'deal_room' && ip
        ? db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('feature', 'deal_room').eq('ip_hash', ip).gte('created_at', since.toISOString())
        : Promise.resolve({ count: 0 }),
    ]);
    spent = (rows ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
    ipRuns = ipq.count ?? 0;
  } else {
    const today = memLog.filter((r) => r.at >= since.getTime());
    spent = today.reduce((s, r) => s + r.cost, 0);
    ipRuns = today.filter((r) => r.feature === 'deal_room' && ip && r.ip === ip).length;
  }
  if (L.dailyBudgetUsd > 0 && spent >= L.dailyBudgetUsd) {
    return { ok: false, spentTodayUsd: spent, reason: `Today's AI budget ($${L.dailyBudgetUsd}) has been used. It resets at midnight UTC; the owner can raise AI_DAILY_BUDGET_USD in Vercel.` };
  }
  if (feature === 'deal_room' && L.roomRunsPerIpPerDay > 0 && ipRuns >= L.roomRunsPerIpPerDay) {
    return { ok: false, spentTodayUsd: spent, reason: `This connection has used its ${L.roomRunsPerIpPerDay} AI Deal Room runs for today. Saved runs can still be opened and exported.` };
  }
  return { ok: true, spentTodayUsd: spent };
}

export class BudgetError extends Error {}

/** Stable short hash of a fact sheet's ids and values, for caching AI output on identical numbers. */
export function factsHash(facts: { id: string; value: number }[]): string {
  return createHash('sha1')
    .update(facts.map((f) => `${f.id}=${f.value.toPrecision(8)}`).join('|'))
    .digest('hex')
    .slice(0, 16);
}
