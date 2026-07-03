
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any previous version of this job
DO $$
BEGIN
  PERFORM cron.unschedule('vch-daily-expiry-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vch-daily-expiry-alerts',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://servicevch.lovable.app/api/public/expiry-alerts',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvemR3c2N3ZWNyYnlrZmhjeGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDk1NTYsImV4cCI6MjA5ODM4NTU1Nn0.DN5EYSw7JUPhuNnIrDm--IAQOFZUKMmMHCTEtSr7K_Y"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
