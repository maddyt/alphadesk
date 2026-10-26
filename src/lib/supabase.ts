import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase is optional: without credentials the app runs on in-memory caching only.
// All access is server-side with the service-role key; the browser never talks to
// the database, so RLS can stay locked down (see supabase/migrations).

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export function supabaseConfigured(): boolean {
  return supabase() !== null;
}
