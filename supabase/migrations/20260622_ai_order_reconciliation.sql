-- Extend share_access_log with AI attribution columns
ALTER TABLE share_access_log
  ADD COLUMN IF NOT EXISTS assistant_name text,
  ADD COLUMN IF NOT EXISTS merchant_domain text,
  ADD COLUMN IF NOT EXISTS access_source text DEFAULT 'context_card';

-- New table: detected order confirmation emails
CREATE TABLE IF NOT EXISTS detected_order_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) NOT NULL,
  email_id text NOT NULL,
  merchant_name text NOT NULL,
  sender_domain text,
  order_total numeric,
  item_summary text,
  order_date timestamptz,
  raw_subject text,
  partner_id uuid REFERENCES partners(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(household_id, email_id)
);

-- New table: reconciliation matches
CREATE TABLE IF NOT EXISTS order_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) NOT NULL,
  email_id text NOT NULL,
  access_log_id uuid REFERENCES share_access_log(id),
  assistant_name text NOT NULL,
  merchant_name text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium')),
  order_total numeric,
  order_description text,
  matched_at timestamptz DEFAULT now(),
  alert_id uuid REFERENCES alerts(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(household_id, email_id)
);

-- Add ai_attributed_to column to household_orders
ALTER TABLE household_orders
  ADD COLUMN IF NOT EXISTS ai_attributed_to jsonb;
