-- Stores the set of Gmail message IDs seen in the previous analysis run.
-- On each run, only emails NOT in this set (plus alert-referenced ones)
-- are forwarded to Claude, eliminating redundant re-analysis of old messages.
ALTER TABLE households ADD COLUMN IF NOT EXISTS last_analyzed_email_ids JSONB DEFAULT '[]'::jsonb;
