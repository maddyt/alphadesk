-- Row level security.
-- The portal is read-only for anyone holding the anon key; every write path goes through the
-- service role (ingestion job, valuation writer). This keeps the browser bundle incapable of
-- mutating financial data even if the anon key leaks, which it will.

alter table companies            enable row level security;
alter table financial_statements enable row level security;
alter table valuation_snapshots  enable row level security;
alter table quality_flags        enable row level security;
alter table ingestion_runs       enable row level security;

drop policy if exists "public read companies" on companies;
create policy "public read companies" on companies for select using (true);

drop policy if exists "public read statements" on financial_statements;
create policy "public read statements" on financial_statements for select using (true);

drop policy if exists "public read valuations" on valuation_snapshots;
create policy "public read valuations" on valuation_snapshots for select using (true);

drop policy if exists "public read flags" on quality_flags;
create policy "public read flags" on quality_flags for select using (true);

-- Ingestion history is operational detail; keep it to the service role.
drop policy if exists "service reads runs" on ingestion_runs;
create policy "service reads runs" on ingestion_runs for select using (auth.role() = 'service_role');

-- No insert/update/delete policies are defined for any table: the service-role key bypasses
-- RLS entirely, and nothing else should ever write.
