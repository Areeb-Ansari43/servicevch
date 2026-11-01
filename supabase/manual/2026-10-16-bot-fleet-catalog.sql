-- Migration: Bot Fleet Catalog table (source of truth for what the bot sells)
-- Idempotent DDL with seed data and staff-only RLS via public.is_staff()

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
  fuel_group text, -- 'electric', 'hybrid', 'plug_in_hybrid', 'diesel', 'petrol'
  active boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bot_fleet_catalog ENABLE ROW LEVEL SECURITY;

-- Staff-only RLS Policy (never redefine public.is_staff())
DROP POLICY IF EXISTS "Staff full access on bot_fleet_catalog" ON public.bot_fleet_catalog;
CREATE POLICY "Staff full access on bot_fleet_catalog" ON public.bot_fleet_catalog
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Seed Data (Upsert on display_name)
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
ON CONFLICT (display_name) DO UPDATE SET
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  aliases = EXCLUDED.aliases,
  crm_make_pattern = EXCLUDED.crm_make_pattern,
  crm_model_pattern = EXCLUDED.crm_model_pattern,
  crm_year_min = EXCLUDED.crm_year_min,
  crm_year_max = EXCLUDED.crm_year_max,
  crm_regs = EXCLUDED.crm_regs,
  weekly_rent = EXCLUDED.weekly_rent,
  monthly_miles = EXCLUDED.monthly_miles,
  deposit = EXCLUDED.deposit,
  minimum_term_weeks = EXCLUDED.minimum_term_weeks,
  year_label = EXCLUDED.year_label,
  fuel_type = EXCLUDED.fuel_type,
  fuel_group = EXCLUDED.fuel_group,
  active = EXCLUDED.active,
  notes = EXCLUDED.notes,
  updated_at = now();
