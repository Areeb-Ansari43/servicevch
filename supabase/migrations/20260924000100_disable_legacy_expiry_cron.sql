-- Migration to unschedule legacy daily expiry alerts cron job calling servicevch.lovable.app
DO $$
BEGIN
  PERFORM cron.unschedule('vch-daily-expiry-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
