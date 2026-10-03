-- Migration to create user_settings table for CRM theme, preset, and accent customization
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'dark',
  theme_preset text NOT NULL DEFAULT 'midnight',
  accent_color text NOT NULL DEFAULT 'orange',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Permissions for anon, authenticated, and service_role
GRANT ALL ON public.user_settings TO authenticated, anon, service_role;

-- RLS setup
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'allow read write user settings'
  ) THEN
    CREATE POLICY "allow read write user settings" ON public.user_settings
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
