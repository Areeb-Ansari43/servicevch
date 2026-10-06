-- Idempotent setup for portal_auth_events
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

-- Index for efficient querying by staff
CREATE INDEX IF NOT EXISTS idx_portal_auth_events_created_at ON public.portal_auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_auth_events_hashed_email ON public.portal_auth_events (hashed_email);

-- Ensure public.is_staff() function exists for checking authenticated staff members
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.role() = 'authenticated'),
    false
  );
$$;

-- Enable RLS on portal_auth_events
ALTER TABLE public.portal_auth_events ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT ON public.portal_auth_events TO authenticated;
GRANT ALL ON public.portal_auth_events TO service_role;

-- RLS Policy: Authenticated staff can read portal auth events
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'portal_auth_events' AND policyname = 'staff read portal auth events'
  ) THEN
    CREATE POLICY "staff read portal auth events" ON public.portal_auth_events
      FOR SELECT
      TO authenticated
      USING (public.is_staff());
  END IF;
END $$;
