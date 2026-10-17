-- =============================================================================
-- Migration & Admin Reference: Job Runs Table, Secrets Checklist, and pg_cron Unschedule
-- File: supabase/manual/2026-10-12-job-runs-and-cron-cleanup.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create job_runs table for tracking background task execution and counts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'failed'
    counts JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick sorting and lookup of recent runs
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name_started_at ON public.job_runs (job_name, started_at DESC);

-- Enable RLS
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from anon role
REVOKE ALL ON public.job_runs FROM anon;

-- Grants
GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

-- Staff-only read policy (uses existing public.is_staff() - NEVER redefines it)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_runs' AND policyname = 'Allow staff to read job_runs'
  ) THEN
    CREATE POLICY "Allow staff to read job_runs"
        ON public.job_runs
        FOR SELECT
        TO authenticated
        USING (public.is_staff());
  END IF;
END $$;

-- Service role full access policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_runs' AND policyname = 'Allow service_role full access to job_runs'
  ) THEN
    CREATE POLICY "Allow service_role full access to job_runs"
        ON public.job_runs
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Safe pg_cron Cleanup Script for Legacy Jobs Sending from onboarding@resend.dev
-- -----------------------------------------------------------------------------

-- Step 2A: Print existing active cron jobs BEFORE cleanup
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== PG_CRON JOBS BEFORE CLEANUP ===';
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN SELECT jobid, jobname, schedule, command FROM cron.job LOOP
      RAISE NOTICE 'JobID: %, Name: %, Schedule: %, Command: %', r.jobid, r.jobname, r.schedule, r.command;
    END LOOP;
  ELSE
    RAISE NOTICE 'pg_cron extension is not installed in this database.';
  END IF;
END $$;

-- Step 2B: Safely unschedule ONLY jobs that send from onboarding@resend.dev or call legacy endpoints
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid, jobname, command
      FROM cron.job
      WHERE command ILIKE '%onboarding@resend.dev%'
         OR command ILIKE '%servicevch.lovable.app%'
    LOOP
      RAISE NOTICE 'Unscheduling legacy job: % (JobID: %)', r.jobname, r.jobid;
      PERFORM cron.unschedule(r.jobid);
    END LOOP;
  END IF;
END $$;

-- Step 2C: Print remaining active cron jobs AFTER cleanup
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== PG_CRON JOBS AFTER CLEANUP ===';
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN SELECT jobid, jobname, schedule, command FROM cron.job LOOP
      RAISE NOTICE 'JobID: %, Name: %, Schedule: %, Command: %', r.jobid, r.jobname, r.schedule, r.command;
    END LOOP;
  ELSE
    RAISE NOTICE 'pg_cron extension is not installed in this database.';
  END IF;
END $$;


/*
================================================================================
3. REQUIRED ENVIRONMENT SECRETS CHECKLIST
================================================================================

A. Cloudflare / Application Server Secrets (Set in Cloudflare Pages / Server Environment):
   - RESEND_API_KEY              : Resend API Key for sending emails directly (e.g., re_...)
   - PORTAL_SHARED_SECRET        : Shared secret for /api/public/portal-auth endpoints
   - PORTAL_OTP_PEPPER           : Pepper secret string for HMAC-SHA256 OTP hashing
   - SUPABASE_URL                : Supabase Project URL (https://hhpkffratbbnwedjlebx.supabase.co)
   - SUPABASE_SERVICE_ROLE_KEY   : Supabase Service Role Key (JWT for administrative server operations)
   - TELEGRAM_BOT_TOKEN          : Telegram Bot API Token for sending failure alerts
   - TELEGRAM_CHAT_ID            : Telegram Chat ID receiving administrative failure alerts
   - AUTH_EMAIL_FROM             : "Virtual Car Hire <auth@fa-ibi.co.uk>"
   - NOTIFICATIONS_EMAIL_FROM    : "Virtual Car Hire <notifications@fa-ibi.co.uk>"
   - DRIVER_ALERTS_EMAIL_FROM    : "Virtual Car Hire <driver-alerts@fa-ibi.co.uk>"

B. GitHub Actions Secrets:
   - CRON_SECRET                 : Secret token for invoking background job cron endpoints
   - SUPABASE_ACCESS_TOKEN       : Supabase CLI access token for function deployments
*/
