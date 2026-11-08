-- =============================================================================
-- 2026-11-09  Bot Fleet Catalogue + Bot Instructions tables, portal odometer submissions
--
-- WHY: Settings > Bot Fleet Catalogue "Save" fails with
--   "Could not find the table 'public.bot_fleet_catalog' in the schema cache".
-- The SQL that creates it (2026-10-16-bot-fleet-catalog.sql, PR #91) was never run, and the
-- WhatsApp bot was silently using built-in default prices. Bot Instructions (bot_settings) has
-- the same dependency.
--
-- Idempotent and SAFE TO RE-RUN: creates tables/columns only if missing, seeds the starting
-- catalogue ONLY where a car is not already present (ON CONFLICT DO NOTHING), so prices you
-- edit in Settings are never overwritten.
-- =============================================================================

-- 1. Bot fleet catalogue (what the WhatsApp bot sells and quotes)
CREATE TABLE IF NOT EXISTS public.bot_fleet_catalog (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name text UNIQUE NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  aliases text[] DEFAULT '{}'::text[],
  crm_make_pattern text,
  crm_model_pattern text,
  crm_year_min int,
  crm_year_max int,
  crm_regs text[],
  weekly_rent numeric NOT NULL,
  monthly_miles int NOT NULL DEFAULT 5000,
  deposit numeric,
  minimum_term_weeks int NOT NULL DEFAULT 6,
  year_label text NOT NULL,
  fuel_type text,
  fuel_group text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz DEFAULT now()
);

-- In case an older partial version of the table exists
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS make text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}'::text[];
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS crm_make_pattern text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS crm_model_pattern text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS crm_year_min int;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS crm_year_max int;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS crm_regs text[];
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS weekly_rent numeric;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS monthly_miles int DEFAULT 5000;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS deposit numeric;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS minimum_term_weeks int DEFAULT 6;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS year_label text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS fuel_type text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS fuel_group text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.bot_fleet_catalog ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS bot_fleet_catalog_display_name_key ON public.bot_fleet_catalog (display_name);

ALTER TABLE public.bot_fleet_catalog ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_fleet_catalog TO authenticated;
GRANT ALL ON public.bot_fleet_catalog TO service_role;

DROP POLICY IF EXISTS "Staff full access on bot_fleet_catalog" ON public.bot_fleet_catalog;
CREATE POLICY "Staff full access on bot_fleet_catalog" ON public.bot_fleet_catalog
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Starting catalogue (only inserted if the car is not there yet)
INSERT INTO public.bot_fleet_catalog (
  display_name, make, model, aliases, crm_make_pattern, crm_model_pattern,
  crm_year_min, crm_year_max, crm_regs, weekly_rent, monthly_miles, deposit,
  minimum_term_weeks, year_label, fuel_type, fuel_group, active, notes
) VALUES
(
  'Mercedes EQE', 'Mercedes-Benz', 'EQE',
  ARRAY['eqe', 'mercedes eqe', 'eqe 300', 'eqe 350'],
  'mercedes', 'eqe', 2023, 2024, NULL,
  440, 4500, 1000, 8, '2023-2024', 'Electric', 'electric', true, NULL
),
(
  'Mercedes E300', 'Mercedes-Benz', 'E300',
  ARRAY['e300', 'e 300', 'mercedes e300'],
  'mercedes', 'e300', 2019, 2019, NULL,
  280, 5000, 500, 8, '2019', 'Plug-in-Hybrid', 'plug_in_hybrid', true, NULL
),
(
  'Mercedes E220D', 'Mercedes-Benz', 'E220D',
  ARRAY['e220', 'e 220', 'e220d', 'mercedes e220', 'mercedes e220d', 'e-class'],
  'mercedes', 'e220', 2018, 2019, NULL,
  270, 5000, 500, 6, '2018-2019', 'Diesel', 'diesel', true, NULL
),
(
  'Mercedes Vito', 'Mercedes-Benz', 'Vito',
  ARRAY['vito', 'mercedes vito'],
  'mercedes', 'vito', 2016, 2019, NULL,
  370, 5000, 500, 8, '2016-2019', 'Diesel', 'diesel', true, NULL
),
(
  'Toyota Corolla', 'Toyota', 'Corolla',
  ARRAY['corolla', 'toyota corolla', 'corolla estate'],
  'toyota', 'corolla', 2019, 2019, NULL,
  210, 5000, 500, 6, '2019', 'Petrol', 'petrol', true, NULL
),
(
  'Toyota Auris', 'Toyota', 'Auris',
  ARRAY['auris', 'toyota auris', 'auris estate'],
  'toyota', 'auris', 2019, 2019, NULL,
  210, 5000, 500, 6, '2019', 'Hybrid', 'hybrid', true, NULL
),
(
  'Toyota Prius', 'Toyota', 'Prius',
  ARRAY['prius', 'toyota prius'],
  'toyota', 'prius', 2016, 2017, NULL,
  200, 5000, 500, 6, '2016-2017', 'Hybrid', 'hybrid', true, NULL
),
(
  'Tesla Model 3', 'Tesla', 'Model 3',
  ARRAY['model 3', 'tesla model 3', 'tesla 3', 'model3'],
  'tesla', 'model3', 2019, 2021, NULL,
  260, 5000, 500, 6, '2019-2021', 'Electric', 'electric', true, NULL
),
(
  'Jaguar I-Pace', 'Jaguar', 'I-Pace',
  ARRAY['i pace', 'ipace', 'jaguar ipace', 'jaguar i-pace'],
  'jaguar', 'ipace', 2020, 2020, NULL,
  270, 5000, 500, 6, '2020', 'Electric', 'electric', true, NULL
),
(
  'Hyundai Santa Fe (2023-2025)', 'Hyundai', 'Santa Fe',
  ARRAY['santa fe', 'hyundai santa fe', 'santa fe plug in', 'santa fe 2023', 'santa fe 2024', 'santa fe 2025'],
  'hyundai', 'santafe', 2023, 2025, NULL,
  330, 5000, 500, 8, '2023-2025', 'Plug-in-Hybrid', 'plug_in_hybrid', true, NULL
),
(
  'Hyundai Santa Fe (2026)', 'Hyundai', 'Santa Fe',
  ARRAY['santa fe 2026', '2026 santa fe', 'new santa fe', 'santa fe lb76buj'],
  'hyundai', 'santafe', 2026, 2026, ARRAY['LB76BUJ'],
  370, 5000, NULL, 8, '2026', NULL, NULL, true, 'Deposit and fuel type to be confirmed by team'
),
(
  'Hyundai Ioniq', 'Hyundai', 'Ioniq',
  ARRAY['ioniq', 'hyundai ioniq'],
  'hyundai', 'ioniq', 2020, 2022, NULL,
  210, 5000, 500, 6, '2020-2022', 'Plug-in-Hybrid', 'plug_in_hybrid', true, NULL
),
(
  'MG 5 EV', 'MG', 'MG5 EV',
  ARRAY['mg5', 'mg 5', 'mg5 ev', 'mg 5 ev', '5 ev'],
  'mg', 'mg5', 2021, 2022, NULL,
  200, 5000, 500, 6, '2021-2022', 'Electric', 'electric', true, NULL
),
(
  'MG S9', 'MG', 'S9',
  ARRAY['mg s9', 's9', 'mgs9', 'mg s9 phev'],
  'mg', 's9', 2023, 2025, NULL,
  280, 5000, 500, 6, '2023-2025', 'Plug-in-Hybrid', 'plug_in_hybrid', true, NULL
),
(
  'Ford Tourneo Custom', 'Ford', 'Tourneo Custom',
  ARRAY['tourneo', 'ford tourneo', 'tourneo custom'],
  'ford', 'tourneo', 2024, 2025, NULL,
  410, 5000, 500, 6, '2024-2025', 'Electric', 'electric', true, NULL
)
ON CONFLICT (display_name) DO NOTHING;

-- 2. Bot instructions (editable WhatsApp system prompt) + history
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

ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_settings, public.bot_settings_history TO authenticated;
GRANT ALL ON public.bot_settings, public.bot_settings_history TO service_role;

DROP POLICY IF EXISTS "Staff full access on bot_settings" ON public.bot_settings;
CREATE POLICY "Staff full access on bot_settings" ON public.bot_settings
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff full access on bot_settings_history" ON public.bot_settings_history;
CREATE POLICY "Staff full access on bot_settings_history" ON public.bot_settings_history
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 3. Odometer submissions from the driver portal
-- Two layouts of mileage_submissions exist across the repos (CRM: driver_name/registration/
-- photo_url NOT NULL; website: image_path/reading_value NOT NULL). Whichever was created first,
-- the other side's inserts failed. Make the table a superset with nullable extras.
CREATE TABLE IF NOT EXISTS public.mileage_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS registration text;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS ocr_mileage integer;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS ocr_confidence text DEFAULT 'low';
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS approved_mileage integer;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS reading_value numeric;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.mileage_submissions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.mileage_submissions ALTER COLUMN driver_id DROP NOT NULL;
ALTER TABLE public.mileage_submissions ALTER COLUMN driver_name DROP NOT NULL;
ALTER TABLE public.mileage_submissions ALTER COLUMN registration DROP NOT NULL;
ALTER TABLE public.mileage_submissions ALTER COLUMN photo_url DROP NOT NULL;
ALTER TABLE public.mileage_submissions ALTER COLUMN image_path DROP NOT NULL;
ALTER TABLE public.mileage_submissions ALTER COLUMN reading_value DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mileage_submissions_driver_id ON public.mileage_submissions (driver_id);

ALTER TABLE public.mileage_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mileage_submissions TO authenticated;
GRANT ALL ON public.mileage_submissions TO service_role;

-- CRM staff review queue needs to read/update every submission
DROP POLICY IF EXISTS "Staff full access on mileage_submissions" ON public.mileage_submissions;
CREATE POLICY "Staff full access on mileage_submissions" ON public.mileage_submissions
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Live updates in the CRM review queue
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mileage_submissions'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mileage_submissions;
  END IF;
END $$;

-- Photo bucket used by portal odometer submissions (public so the CRM can show the photo)
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('mileage-photos', 'mileage-photos', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 4. Make PostgREST see the new tables/columns immediately (fixes "not in the schema cache")
NOTIFY pgrst, 'reload schema';
