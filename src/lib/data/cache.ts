import 'server-only';
import { supabase } from '../supabase.ts';

// Two-level cache: per-instance memory, then Supabase feed_cache when configured.
const memory = new Map<string, { at: number; value: unknown }>();

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const db = supabase();
  if (db) {
    const { data } = await db.from('feed_cache').select('payload, fetched_at').eq('key', key).maybeSingle();
    if (data && Date.now() - Date.parse(data.fetched_at) < ttlMs) {
      memory.set(key, { at: Date.parse(data.fetched_at), value: data.payload });
      return data.payload as T;
    }
  }
  return undefined;
}

export async function cachePut<T>(key: string, value: T): Promise<void> {
  memory.set(key, { at: Date.now(), value });
  const db = supabase();
  if (db) await db.from('feed_cache').upsert({ key, payload: value, fetched_at: new Date().toISOString() }).then(() => undefined, () => undefined);
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key, ttlMs);
  if (hit !== undefined) return hit;
  const value = await load();
  await cachePut(key, value);
  return value;
}

/** Like cached(), but only stores results that pass `keep` (e.g. real AI output, not a fallback template). */
export async function cachedIf<T>(key: string, ttlMs: number, load: () => Promise<T>, keep: (v: T) => boolean): Promise<T> {
  const hit = await cacheGet<T>(key, ttlMs);
  if (hit !== undefined) return hit;
  const value = await load();
  if (keep(value)) await cachePut(key, value);
  return value;
}
