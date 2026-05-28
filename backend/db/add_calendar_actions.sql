-- Run this in the Supabase SQL editor (Settings → SQL Editor).

create table if not exists public.calendar_actions (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid references public.households(id) on delete cascade not null,
  event_id              text not null,
  event_title           text,
  partner               text not null,
  partner_id            uuid references public.partners(id),
  trigger_email_subject text,
  trigger_reason        text,
  cancelled_at          timestamptz not null default now(),
  restored_at           timestamptz,
  alert_id              uuid references public.alerts(id)
);

create index if not exists calendar_actions_household_event
  on public.calendar_actions(household_id, event_id);

-- Allow the service role used by the backend to read and write this table.
alter table public.calendar_actions enable row level security;

create policy "Service role full access"
  on public.calendar_actions
  as permissive
  for all
  to service_role
  using (true)
  with check (true);
