-- Migration: Editable Bot Settings and History Table for WhatsApp Agent Prompt Management

CREATE TABLE IF NOT EXISTS public.bot_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_settings_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  value text NOT NULL,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings_history ENABLE ROW LEVEL SECURITY;

-- Staff-only RLS Policies (using existing public.is_staff())
DROP POLICY IF EXISTS "Staff full access on bot_settings" ON public.bot_settings;
CREATE POLICY "Staff full access on bot_settings" ON public.bot_settings
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff full access on bot_settings_history" ON public.bot_settings_history;
CREATE POLICY "Staff full access on bot_settings_history" ON public.bot_settings_history
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
