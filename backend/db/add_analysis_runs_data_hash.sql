-- Run this in the Supabase SQL editor (Settings → SQL Editor).
-- Adds data_hash to analysis_runs so repeated fetches with identical
-- email/calendar IDs can skip the Claude call entirely.

alter table public.analysis_runs
  add column if not exists data_hash text,
  add column if not exists status_detail text;

-- Index speeds up the "last completed run for this household" lookup.
create index if not exists analysis_runs_household_completed
  on public.analysis_runs(household_id, completed_at desc)
  where status = 'completed';
