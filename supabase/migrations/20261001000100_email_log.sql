-- Migration: Shared Email-Sending Foundation - email_log table
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  template_type text NOT NULL DEFAULT 'general',
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'simulated', 'skipped')),
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_log TO authenticated, anon;
GRANT ALL ON public.email_log TO service_role;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'email_log' AND policyname = 'allow read write email log'
  ) THEN
    CREATE POLICY "allow read write email log" ON public.email_log
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Enable Supabase Realtime for email_log
DO $$
DECLARE
  publication_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) INTO publication_exists;

  IF publication_exists THEN
    IF to_regclass('public.email_log') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'email_log'
      ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.email_log;
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.email_log REPLICA IDENTITY FULL;
