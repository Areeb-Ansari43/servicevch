CREATE TABLE public.whatsapp_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name text NOT NULL DEFAULT 'Unknown',
  phone text,
  message text NOT NULL,
  ai_summary text,
  intent text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_leads TO authenticated;
GRANT ALL ON public.whatsapp_leads TO service_role;
ALTER TABLE public.whatsapp_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own whatsapp leads" ON public.whatsapp_leads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.accident_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  reg text NOT NULL DEFAULT '',
  driver_name text,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  location text,
  description text NOT NULL,
  ai_summary text,
  severity text NOT NULL DEFAULT 'minor',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accident_cases TO authenticated;
GRANT ALL ON public.accident_cases TO service_role;
ALTER TABLE public.accident_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accident cases" ON public.accident_cases FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);