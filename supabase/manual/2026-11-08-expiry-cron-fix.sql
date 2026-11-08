-- =============================================================================
-- 2026-11-08  Fleet expiry email: remove legacy cron jobs, (re)schedule the new one
-- Idempotent: safe to run more than once. No tables or columns are changed.
--
-- WHY
--  * The old "Fleet expiry warning" email (from onboarding@resend.dev, footer
--    "Automated daily notice from VCH Fleet Tracker") still arrives every day at
--    08:00 UTC. That code no longer exists in the repo; it is a legacy pg_cron job
--    calling an old deployment (servicevch.lovable.app). This file unschedules it.
--  * The new "Fleet MOT & PCO Expiry Summary" stopped after 21 Oct because the
--    endpoint started requiring a secret; this schedules a job that sends it.
--
-- BEFORE RUNNING PART 2: store the cron secret in Supabase Vault ONCE (SQL editor):
--     select vault.create_secret('<same value as Cloudflare CRON_SECRET>', 'cron_secret');
--   (If it already exists: select vault.update_secret(id, '<value>') from vault.secrets where name = 'cron_secret';)
--   Never paste the secret into this file or into git.
-- =============================================================================

-- Part 0: show what is scheduled right now (read the NOTICE output)
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; nothing to clean up.';
    RETURN;
  END IF;
  RAISE NOTICE '=== pg_cron jobs BEFORE ===';
  FOR r IN SELECT jobid, jobname, schedule, left(command, 200) AS cmd FROM cron.job ORDER BY jobid LOOP
    RAISE NOTICE '% | % | % | %', r.jobid, r.jobname, r.schedule, r.cmd;
  END LOOP;
END $$;

-- Part 1: unschedule EVERY expiry-related or legacy job (old Lovable host, resend.dev
-- sender, any expiry-alerts caller without the secret). Part 2 recreates the one we want.
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN; END IF;
  FOR r IN
    SELECT jobid, jobname FROM cron.job
    WHERE command ILIKE '%lovable.app%'
       OR command ILIKE '%resend.dev%'
       OR command ILIKE '%expiry-alerts%'
       OR command ILIKE '%fleet%expir%'
       OR jobname ILIKE '%expiry%'
  LOOP
    RAISE NOTICE 'Unscheduling % (jobid %)', r.jobname, r.jobid;
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- Part 2: schedule the new summary. Runs at 08:00 and 09:00 UTC but only calls the CRM
-- when it is 09:xx in London, so it is 09:00 London all year. The CRM also refuses to send
-- twice in one London day, so overlap with the GitHub Actions workflow is harmless.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_cron/pg_net not installed; skipping schedule (GitHub Actions will be the only trigger).';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE 'Supabase Vault not available; skipping schedule.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'vch-fleet-expiry-summary',
    '0 8,9 * * *',
    $cmd$
      SELECT net.http_post(
        url     := 'https://hq.virtual-carhire.co.uk/api/public/expiry-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'User-Agent',   'vch-supabase-pg-cron/1.0',
          'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
      WHERE extract(hour FROM (now() AT TIME ZONE 'Europe/London')) = 9
        AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_secret');
    $cmd$
  );
  RAISE NOTICE 'Scheduled vch-fleet-expiry-summary (0 8,9 * * * UTC, London 09:00 guard).';
END $$;

-- Part 3: confirm
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN; END IF;
  RAISE NOTICE '=== pg_cron jobs AFTER ===';
  FOR r IN SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid LOOP
    RAISE NOTICE '% | % | %', r.jobid, r.jobname, r.schedule;
  END LOOP;
END $$;
