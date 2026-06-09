alter table households
  add column if not exists digest_last_sent_at timestamptz;
