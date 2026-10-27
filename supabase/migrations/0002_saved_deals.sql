-- DealPulse saved teardowns. Server-side access only (service-role key); RLS on with no policies.
create table if not exists public.saved_deals (
  id          uuid primary key default gen_random_uuid(),
  acquirer    text not null,
  target      text not null,
  name        text not null,
  query       text not null default '',      -- assumption overrides as a URL query string
  accretion   numeric not null,              -- EPS accretion at save time, for the list view
  created_at  timestamptz not null default now()
);

create index if not exists saved_deals_created_at_idx on public.saved_deals (created_at desc);

alter table public.saved_deals enable row level security;
