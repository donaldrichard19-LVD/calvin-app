create table if not exists oauth_codes (
  code        text primary key,
  partner_id  uuid references partners(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  client_id   text not null,
  redirect_uri text not null,
  used        boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Auto-clean expired codes
create index if not exists oauth_codes_expires_at_idx on oauth_codes(expires_at);
