-- Migration to permanently unschedule all legacy pg_cron daily expiry jobs targeting lovable or old endpoints
DO $$
BEGIN
  -- Unschedule legacy vch-daily-expiry-alerts (calling servicevch.lovable.app)
  PERFORM cron.unschedule('vch-daily-expiry-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  -- Unschedule any legacy vch-daily-expiry-alerts-v2 or fleet-tracker jobs
  PERFORM cron.unschedule('vch-daily-expiry-alerts-v2');
  PERFORM cron.unschedule('fleet-expiry-warning');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
