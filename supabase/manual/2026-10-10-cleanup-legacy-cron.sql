-- Safe pg_cron Cleanup Script for Legacy Expiry Alert Jobs
-- Location: supabase/manual/2026-10-10-cleanup-legacy-cron.sql

-- 1. Print existing active cron jobs BEFORE cleanup
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== PG_CRON JOBS BEFORE CLEANUP ===';
  FOR r IN SELECT jobid, jobname, schedule, command FROM cron.job LOOP
    RAISE NOTICE 'JobID: %, Name: %, Schedule: %, Command: %', r.jobid, r.jobname, r.schedule, r.command;
  END LOOP;
END $$;

-- 2. Safely unschedule ONLY jobs that mention servicevch.lovable.app or onboarding@resend.dev
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command ILIKE '%servicevch.lovable.app%'
       OR command ILIKE '%onboarding@resend.dev%'
  LOOP
    RAISE NOTICE 'Unscheduling legacy job: % (JobID: %)', r.jobname, r.jobid;
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- 3. Print remaining active cron jobs AFTER cleanup to confirm expiry-alerts (09:00 / 09:01) is preserved
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== PG_CRON JOBS AFTER CLEANUP ===';
  FOR r IN SELECT jobid, jobname, schedule, command FROM cron.job LOOP
    RAISE NOTICE 'JobID: %, Name: %, Schedule: %, Command: %', r.jobid, r.jobname, r.schedule, r.command;
  END LOOP;
END $$;
