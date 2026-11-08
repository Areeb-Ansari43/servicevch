-- ============================================================================
-- MANUAL MIGRATION: 2026-10-31 Production Schema Alignment & 2FA Column Sync
-- ============================================================================
-- Idempotent script: Safe to run multiple times in Supabase SQL Editor.
-- Does NOT redefine public.is_staff() or alter existing staff-only RLS logic.

-- 1. login_otps: Support both code_hash and otp_hash across code versions
ALTER TABLE public.login_otps
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS consumed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempts_count integer DEFAULT 0;

-- Loosen leftover NOT NULL constraints so inserts providing either code_hash or otp_hash succeed
ALTER TABLE public.login_otps ALTER COLUMN code_hash DROP NOT NULL;
ALTER TABLE public.login_otps ALTER COLUMN otp_hash DROP NOT NULL;

-- Backfill existing rows so both columns are synchronized
UPDATE public.login_otps
SET code_hash = otp_hash
WHERE code_hash IS NULL AND otp_hash IS NOT NULL;

UPDATE public.login_otps
SET otp_hash = code_hash
WHERE otp_hash IS NULL AND code_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_otps_email ON public.login_otps (email);
CREATE INDEX IF NOT EXISTS idx_login_otps_expires ON public.login_otps (expires_at);

-- 2. portal_auth_events: Add source column ('CRM' vs 'Portal')
CREATE TABLE IF NOT EXISTS public.portal_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time timestamptz NOT NULL DEFAULT now(),
  hashed_email text NOT NULL,
  step text NOT NULL,
  result_code text NOT NULL,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_auth_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'Portal',
  ADD COLUMN IF NOT EXISTS event_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_portal_auth_events_created_at ON public.portal_auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_auth_events_hashed_email ON public.portal_auth_events (hashed_email);
CREATE INDEX IF NOT EXISTS idx_portal_auth_events_source ON public.portal_auth_events (source);

-- 3. email_log: Ensure required columns exist
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON public.email_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON public.email_log (recipient);

-- 4. job_runs: Ensure required execution columns exist
CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  records_processed integer DEFAULT 0,
  emails_sent integer DEFAULT 0,
  details jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_runs
  ADD COLUMN IF NOT EXISTS records_processed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_sent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON public.job_runs (job_name, started_at DESC);

-- 5. driver_tracks & driver_notifications
ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS licence_expiry_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_mileage integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_paid_for_due_date date;

ALTER TABLE public.driver_notifications
  ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;

-- 6. Reload schema cache in PostgREST
NOTIFY pgrst, 'reload schema';
