import 'server-only';
import { supabase } from '../supabase.ts';

// Two-level cache: per-instance memory, then Supabase feed_cache when configured.
const memory = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
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
  const value = await load();
  memory.set(key, { at: Date.now(), value });
  if (db) await db.from('feed_cache').upsert({ key, payload: value, fetched_at: new Date().toISOString() }).then(() => undefined, () => undefined);
  return value;
}
