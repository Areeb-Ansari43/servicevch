-- Consolidated Idempotent SQL Migration for Production Environment
-- Generated: 2026-10-03
-- Purpose: Apply all missing schema columns, tables, RLS policies, email tracking, and unschedule legacy pg_cron jobs.

-- 1. Enable Required Database Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Unschedule Legacy pg_cron Job calling servicevch.lovable.app
DO $$
BEGIN
  PERFORM cron.unschedule('vch-daily-expiry-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('vch-daily-expiry-alerts-v2');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Schedule Updated Production Expiry Scanner Cron Job (08:00 UTC = 09:00 BST)
SELECT cron.schedule(
  'vch-daily-expiry-alerts-v2',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hq.virtual-carhire.co.uk/api/public/expiry-alerts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 4. User Settings Table for CRM Customization (Mode, Theme, Accent)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'dark',
  theme_preset text NOT NULL DEFAULT 'midnight',
  accent_color text NOT NULL DEFAULT 'orange',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.user_settings TO authenticated, anon, service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow read write user settings" ON public.user_settings;
DROP POLICY IF EXISTS "user_settings_own_row_policy" ON public.user_settings;

CREATE POLICY "user_settings_own_row_policy" ON public.user_settings
  FOR ALL
  TO authenticated, anon, service_role
  USING (user_id = auth.uid()::text OR auth.role() = 'service_role' OR auth.role() = 'anon')
  WITH CHECK (user_id = auth.uid()::text OR auth.role() = 'service_role' OR auth.role() = 'anon');

-- 5. Driver Tracks Schema Enhancements
ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS licence_expiry_date text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_tracks_status ON public.driver_tracks (status);

-- 6. Outbound Email Sending Log Table
CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'simulated', 'skipped')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON public.email_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON public.email_log (recipient);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all operations for service_role" ON public.email_log;
CREATE POLICY "Enable all operations for service_role"
  ON public.email_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for authenticated staff" ON public.email_log;
CREATE POLICY "Enable read access for authenticated staff"
  ON public.email_log
  FOR SELECT
  TO authenticated
  USING (true);

-- 7. Driver Notifications Table
CREATE TABLE IF NOT EXISTS public.driver_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_driver_id ON public.driver_notifications (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_type ON public.driver_notifications (type);

-- 8. Driver Charges Table
CREATE TABLE IF NOT EXISTS public.driver_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  charge_type text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_charges_driver_id ON public.driver_charges (driver_id);

-- 9. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- 10. Notify PostgREST to Reload Schema
NOTIFY pgrst, 'reload schema';
