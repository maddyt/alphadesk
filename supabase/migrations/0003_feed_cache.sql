-- Cache for the extended SEC feeds (segments, Form 4, 13D/G, 8-K flags) and proxy extractions.
create table if not exists public.feed_cache (
  key         text primary key,          -- e.g. 'intel:AAPL', 'coc:AAPL:0000320193-25-000008'
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.feed_cache enable row level security;
