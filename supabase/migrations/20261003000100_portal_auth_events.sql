-- portal_auth_events (Service Role Insert/All, Staff Select Only)
CREATE TABLE IF NOT EXISTS public.portal_auth_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  hashed_email text NOT NULL,
  step text NOT NULL,
  result_code text NOT NULL,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_portal_auth_events_created ON public.portal_auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_auth_events_hashed_email ON public.portal_auth_events (hashed_email);

ALTER TABLE public.portal_auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated staff to read portal_auth_events" ON public.portal_auth_events;
CREATE POLICY "Allow authenticated staff to read portal_auth_events"
  ON public.portal_auth_events
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.portal_auth_events TO authenticated;
GRANT ALL ON public.portal_auth_events TO service_role;
