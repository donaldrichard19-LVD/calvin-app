-- Run this in the Supabase SQL editor (Settings → SQL Editor).
-- Context Wallet: adds share_token, context_sharing, household_orders, and share_access_log.

-- 1. Add share_token column (independent from mcp_token, used for public context card URL)
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- 2. Add context_sharing JSONB column for per-category visibility toggles
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS context_sharing JSONB
    DEFAULT '{"members": true, "routines": true, "preferences": true, "logistics": true, "orders": true}'::jsonb;

-- 3. Household orders table (transactional, lifecycle-based — separate from context JSONB)
CREATE TABLE IF NOT EXISTS public.household_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL,
  description TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  total NUMERIC(10,2),
  status TEXT DEFAULT 'placed' CHECK (status IN ('placed', 'in_progress', 'delivered', 'completed')),
  eta TIMESTAMPTZ,
  placed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_household_orders_active
  ON public.household_orders(household_id, status)
  WHERE archived_at IS NULL;

ALTER TABLE public.household_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.household_orders
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Share access log for audit trail
CREATE TABLE IF NOT EXISTS public.share_access_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_access_log_household
  ON public.share_access_log(household_id, accessed_at DESC);

ALTER TABLE public.share_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.share_access_log
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
