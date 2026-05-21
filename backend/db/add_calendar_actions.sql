-- Run this in the Supabase SQL editor before deploying the event completion feature.

create table if not exists calendar_actions (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid references households(id) on delete cascade not null,
  event_id             text not null,
  event_title          text,
  partner              text not null,       -- 'partnerA' or 'partnerB'
  partner_id           uuid references partners(id),
  trigger_email_subject text,
  trigger_reason       text,
  cancelled_at         timestamptz default now(),
  restored_at          timestamptz,
  alert_id             uuid references alerts(id)
);

create index if not exists calendar_actions_household_event
  on calendar_actions(household_id, event_id);
