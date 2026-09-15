-- Audit logs table for tracking staff operations in the CRM
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL DEFAULT 'Fleet Admin',
  action_type text NOT NULL,
  target_table text NOT NULL,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated, anon;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'allow read write audit logs'
  ) THEN
    CREATE POLICY "allow read write audit logs" ON public.audit_logs
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
