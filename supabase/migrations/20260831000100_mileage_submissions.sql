-- Migration: Mileage Submissions Review Queue
CREATE TABLE IF NOT EXISTS public.mileage_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  driver_id uuid REFERENCES public.driver_tracks(id) ON DELETE SET NULL,
  driver_name text NOT NULL,
  registration text NOT NULL,
  photo_url text NOT NULL,
  ocr_mileage integer,
  ocr_confidence text DEFAULT 'low',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_mileage integer,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mileage_submissions TO authenticated, anon;
GRANT ALL ON public.mileage_submissions TO service_role;
ALTER TABLE public.mileage_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mileage_submissions' AND policyname = 'allow read write mileage submissions'
  ) THEN
    CREATE POLICY "allow read write mileage submissions" ON public.mileage_submissions
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Enable Supabase Realtime for mileage_submissions
DO $$
DECLARE
  publication_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) INTO publication_exists;

  IF publication_exists THEN
    IF to_regclass('public.mileage_submissions') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'mileage_submissions'
      ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.mileage_submissions;
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.mileage_submissions REPLICA IDENTITY FULL;
