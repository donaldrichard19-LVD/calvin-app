-- Run this in the Supabase SQL editor (Settings → SQL Editor).
--
-- Allows a partner to connect up to 3 distinct Google accounts (enforced in
-- application code — see routes/google.js) by relaxing the uniqueness
-- constraint from (partner_id, provider) to (partner_id, provider, account_email).
-- This lets a second/third distinct Gmail address create its own row instead
-- of overwriting the first account's tokens on upsert.

-- Drop the old constraint that limited each partner to a single row per provider.
-- We don't know the exact constraint name up front (it depends on how it was
-- originally created), so look it up dynamically and drop whatever unique
-- constraint currently covers exactly (partner_id, provider). The explicit
-- `drop constraint if exists integrations_partner_id_provider_key` below
-- covers the common Postgres default-naming case as a fast path; the DO block
-- is the robust fallback for any other name.
alter table public.integrations
  drop constraint if exists integrations_partner_id_provider_key;

do $$
declare
  conname text;
begin
  select tc.constraint_name into conname
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'integrations'
    and tc.constraint_type = 'UNIQUE'
  group by tc.constraint_name
  having array_agg(kcu.column_name::text order by kcu.ordinal_position) = array['partner_id', 'provider']::text[];

  if conname is not null then
    execute format('alter table public.integrations drop constraint %I', conname);
  end if;
end $$;

-- New constraint: one row per distinct (partner, provider, account email).
-- Prevents the same Google account from being connected twice for the same
-- partner, while allowing multiple distinct accounts.
alter table public.integrations
  add constraint integrations_partner_provider_email_key
  unique (partner_id, provider, account_email);
