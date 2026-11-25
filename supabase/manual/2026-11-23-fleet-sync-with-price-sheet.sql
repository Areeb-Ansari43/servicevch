-- Fleet sync with the price sheet (VCH_Car_Fleet_01092026.numbers, 92 cars).
-- Run in the Supabase SQL Editor: paste the whole file, then Run.
-- Everything is one block: it all happens or nothing does. Safe to run again.
--
-- What it does:
--   1. Renames a CRM car whose reg is a known typo of a sheet reg (e.g. OWN19XNX -> OW19XNX),
--      so its history stays with it.
--   2. Duplicates: when the same reg is in the CRM twice, keeps the copy with drivers / service
--      history (or the oldest) and deletes the extra copy if nothing is attached to it.
--   3. Adds every car on the sheet that is missing from the CRM.
--   4. Sets each car's weekly rent (Sheet 1), monthly mileage allowance (Sheet 2), deposit and
--      minimum term.
--   5. Removes CRM cars that are not on the sheet - ONLY when nothing is attached to them.
--      Deleting a vehicle row also deletes its drivers and service records, so a car with any
--      driver or service history is NOT deleted: it is set to Off Road and listed.
--      Every deleted car is copied to public.vehicles_removed_backup first.
--   6. WhatsApp bot catalogue: prices, allowance, deposit and term from Sheet 2, and year
--      ranges from the cars on Sheet 1.
-- The result table at the end lists everything it did.

DO $sync$
BEGIN
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS weekly_price numeric(10,2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS monthly_mileage_allowance integer DEFAULT 5000;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS default_deposit numeric(10,2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS minimum_contract_weeks integer DEFAULT 6;

-- Result of this run. RLS on with no policies: only readable here in the SQL Editor.
DROP TABLE IF EXISTS public.fleet_sync_report;
CREATE TABLE public.fleet_sync_report (action text, reg text, detail text);
ALTER TABLE public.fleet_sync_report ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.vehicles_removed_backup (LIKE public.vehicles);
ALTER TABLE public.vehicles_removed_backup ADD COLUMN IF NOT EXISTS removed_at timestamptz DEFAULT now();
ALTER TABLE public.vehicles_removed_backup ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS fleet_sheet, crm, sheet_match, not_on_sheet, dupes;

CREATE TEMP TABLE fleet_sheet (
  reg text PRIMARY KEY, make text, model text, year int, fuel text,
  rent numeric, monthly_miles int, deposit numeric, term_weeks int, catalog_name text, alt_regs text[]
) ON COMMIT DROP;

INSERT INTO fleet_sheet VALUES
  ('KN73XLB', 'Mercedes-Benz', 'EQE', 2023, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('KN73XLA', 'Mercedes-Benz', 'EQE', 2023, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('KU73MVW', 'Mercedes-Benz', 'EQE', 2023, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('WH74EJF', 'Mercedes-Benz', 'EQE', 2024, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('WG74KFJ', 'Mercedes-Benz', 'EQE', 2024, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('KR74WDL', 'Mercedes-Benz', 'EQE', 2024, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('EN73UBZ', 'Mercedes-Benz', 'EQE', 2023, 'Electric', 440, 4500, 1000, 8, 'Mercedes EQE', ARRAY[]::text[]),
  ('WN20NKU', 'Mercedes-Benz', 'E300', 2020, 'Plug-in-Hybrid', 280, 5000, 500, 8, 'Mercedes E300', ARRAY[]::text[]),
  ('BD20XPU', 'Mercedes-Benz', 'E300', 2020, 'Plug-in-Hybrid', 280, 5000, 500, 8, 'Mercedes E300', ARRAY[]::text[]),
  ('GY69NWL', 'Mercedes-Benz', 'E300', 2019, 'Plug-in-Hybrid', 280, 5000, 500, 8, 'Mercedes E300', ARRAY[]::text[]),
  ('KT68VYM', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('FX19FXC', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('CA19UTF', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('OW19XNX', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BV19WNA', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BX19ZMY', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BU19ACJ', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('WD19SNN', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('KP69WOR', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('LR69UCG', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('HX19VZG', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('HX19VXB', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('OU68SXP', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BN68MYZ', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('RO68NXP', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('MV68OHB', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('MV68OGF', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BN68NHP', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('AK69CKJ', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BL19JDZ', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('PO18UTT', 'Mercedes-Benz', 'E220D', 2018, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY[]::text[]),
  ('BN17CVA', 'Mercedes-Benz', 'Vito', 2017, 'Diesel', 370, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('KO18HKE', 'Mercedes-Benz', 'Vito', 2018, 'Diesel', 370, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('SF19WPW', 'Mercedes-Benz', 'Vito', 2018, 'Diesel', 400, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('KT18ATF', 'Mercedes-Benz', 'Vito', 2018, 'Diesel', 370, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('KW18TMV', 'Mercedes-Benz', 'Vito', 2018, 'Diesel', 370, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('WR16UED', 'Mercedes-Benz', 'Vito', 2016, 'Diesel', 350, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('WR19UFG', 'Mercedes-Benz', 'Vito', 2019, 'Diesel', 400, 5000, 500, 8, 'Mercedes Vito', ARRAY[]::text[]),
  ('KF19UCJ', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('KF19UCM', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('KF19UCN', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('LT69GSU', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('LT69GSY', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('LT69GSZ', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('LT69GTU', 'Toyota', 'Corolla', 2019, 'Petrol', 210, 5000, 500, 6, 'Toyota Corolla', ARRAY[]::text[]),
  ('LL68CRZ', 'Toyota', 'Auris', 2018, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LL68CRV', 'Toyota', 'Auris', 2018, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LM68KRD', 'Toyota', 'Auris', 2018, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LM68KRG', 'Toyota', 'Auris', 2018, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LM68KRJ', 'Toyota', 'Auris', 2018, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LM68KRO', 'Toyota', 'Auris', 2019, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LM68KRU', 'Toyota', 'Auris', 2018, 'Hybrid', 210, 5000, 500, 6, 'Toyota Auris', ARRAY[]::text[]),
  ('LR16VTY', 'Toyota', 'Prius', 2016, 'Hybrid', 200, 5000, 500, 6, 'Toyota Prius', ARRAY[]::text[]),
  ('AF70MWK', 'Tesla', 'Model 3', 2020, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('BJ20LGX', 'Tesla', 'Model 3', 2020, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('MJ69YPN', 'Tesla', 'Model 3', 2019, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('BK70WYM', 'Tesla', 'Model 3', 2020, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('BT69TEJ', 'Tesla', 'Model 3', 2019, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('LA69AXF', 'Tesla', 'Model 3', 2019, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('LB69OFY', 'Tesla', 'Model 3', 2019, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('LD20COJ', 'Tesla', 'Model 3', 2020, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('LD20FCE', 'Tesla', 'Model 3', 2020, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('WN20EJA', 'Tesla', 'Model 3', 2020, 'Electric', 260, 5000, 500, 6, 'Tesla Model 3', ARRAY[]::text[]),
  ('BN20WJL', 'Jaguar', 'I-Pace', 2020, 'Electric', 270, 5000, 500, 6, 'Jaguar I-Pace', ARRAY[]::text[]),
  ('BN20XMX', 'Jaguar', 'I-Pace', 2020, 'Electric', 270, 5000, 500, 6, 'Jaguar I-Pace', ARRAY[]::text[]),
  ('GX70UBD', 'Jaguar', 'I-Pace', 2020, 'Electric', 270, 5000, 500, 6, 'Jaguar I-Pace', ARRAY[]::text[]),
  ('HK73SXU', 'Hyundai', 'Santa Fe', 2023, 'Plug-in-Hybrid', 370, 5000, 500, 8, 'Hyundai Santa Fe (2023-2025)', ARRAY[]::text[]),
  ('LB76BUJ', 'Hyundai', 'Santa Fe', 2026, 'Plug-in-Hybrid', 370, 5000, 500, 8, 'Hyundai Santa Fe (2026)', ARRAY[]::text[]),
  ('LB76BWF', 'Hyundai', 'Santa Fe', 2026, 'Plug-in-Hybrid', 370, 5000, 500, 8, 'Hyundai Santa Fe (2026)', ARRAY[]::text[]),
  ('EF70ZPZ', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('EF70ZPY', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('EF70ZVM', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('EF70ZYA', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('EF70ZYD', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('GU72DVP', 'Hyundai', 'Ioniq', 2022, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('FL70EUV', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('EK70BKJ', 'Hyundai', 'Ioniq', 2020, 'Plug-in-Hybrid', 210, 5000, 500, 6, 'Hyundai Ioniq', ARRAY[]::text[]),
  ('YC72HZM', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YF22UVZ', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YF22UWK', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YF22UWM', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YF22UWT', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YF22UXC', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YF22UXY', 'MG', 'MG5 EV', 2022, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YG71LCZ', 'MG', 'MG5 EV', 2021, 'Electric', 200, 5000, 500, 6, 'MG 5 EV', ARRAY[]::text[]),
  ('YH76ZWF', 'MG', 'S9', 2026, 'Plug-in-Hybrid', 300, 5000, 500, 6, 'MG S9', ARRAY['YH76ZLWF']::text[]),
  ('MD25AYY', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('MD25DDZ', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('RX25CME', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('BK76WJG', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('BK76VWB', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('BK76WGD', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]);

-- 1. Typo regs in the CRM (8 characters, one extra) -> the sheet reg, if that reg isn't in the CRM yet
WITH cand AS (
  SELECT v.id, upper(regexp_replace(v.reg, '\s+', '', 'g')) AS nreg
  FROM public.vehicles v
  WHERE upper(regexp_replace(v.reg, '\s+', '', 'g')) !~ '^[A-Z]{2}[0-9]{2}[A-Z]{3}$'
), fix AS (
  SELECT DISTINCT ON (c.id) c.id, c.nreg AS old_reg, s.reg AS new_reg
  FROM cand c
  JOIN fleet_sheet s ON length(c.nreg) = length(s.reg) + 1
   AND EXISTS (SELECT 1 FROM generate_series(1, length(c.nreg)) i
               WHERE overlay(c.nreg PLACING '' FROM i FOR 1) = s.reg)
  WHERE NOT EXISTS (SELECT 1 FROM public.vehicles v2 WHERE upper(regexp_replace(v2.reg, '\s+', '', 'g')) = s.reg)
  ORDER BY c.id, s.reg
), renamed AS (
  UPDATE public.vehicles v SET reg = f.new_reg FROM fix f WHERE v.id = f.id
  RETURNING f.old_reg, f.new_reg
)
INSERT INTO public.fleet_sync_report SELECT 'renamed', new_reg, 'Reg corrected from ' || old_reg || ' to match the sheet.' FROM renamed;

-- 2. Duplicates (same reg more than once)
CREATE TEMP TABLE dupes ON COMMIT DROP AS
  SELECT v.id, upper(regexp_replace(v.reg, '\s+', '', 'g')) AS nreg,
         EXISTS (SELECT 1 FROM public.driver_tracks d WHERE d.vehicle_id = v.id) AS has_drivers,
         EXISTS (SELECT 1 FROM public.service_records r WHERE r.vehicle_id = v.id) AS has_services,
         row_number() OVER (
           PARTITION BY upper(regexp_replace(v.reg, '\s+', '', 'g'))
           ORDER BY (EXISTS (SELECT 1 FROM public.driver_tracks d WHERE d.vehicle_id = v.id)
                  OR EXISTS (SELECT 1 FROM public.service_records r WHERE r.vehicle_id = v.id)) DESC,
                    v.created_at, v.id
         ) AS rn
  FROM public.vehicles v;

INSERT INTO public.vehicles_removed_backup
  SELECT v.*, now() FROM public.vehicles v JOIN dupes d ON d.id = v.id
  WHERE d.rn > 1 AND NOT d.has_drivers AND NOT d.has_services;

WITH gone AS (
  DELETE FROM public.vehicles v USING dupes d
  WHERE v.id = d.id AND d.rn > 1 AND NOT d.has_drivers AND NOT d.has_services
  RETURNING v.reg, v.make, v.model
)
INSERT INTO public.fleet_sync_report SELECT 'duplicate removed', upper(regexp_replace(reg, '\s+', '', 'g')), make || ' ' || model || ' was in the CRM twice; the empty copy was removed (backed up).' FROM gone;

INSERT INTO public.fleet_sync_report
  SELECT 'duplicate (check)', d.nreg, 'In the CRM more than once and both copies have drivers or service history. Please merge them by hand.'
  FROM dupes d WHERE d.rn > 1 AND (d.has_drivers OR d.has_services);

-- CRM regs, normalised (no spaces, upper case), after the fixes above
CREATE TEMP TABLE crm ON COMMIT DROP AS
  SELECT v.*, upper(regexp_replace(v.reg, '\s+', '', 'g')) AS nreg FROM public.vehicles v;

-- Sheet car -> CRM car (exact reg, or a one-character typo for an odd sheet reg)
CREATE TEMP TABLE sheet_match ON COMMIT DROP AS
  SELECT s.reg AS sheet_reg, c.id AS vehicle_id, c.nreg AS crm_reg
  FROM fleet_sheet s
  JOIN LATERAL (
    SELECT c.* FROM crm c
    WHERE c.nreg = s.reg OR c.nreg = ANY (s.alt_regs)
    ORDER BY (c.nreg = s.reg) DESC
    LIMIT 1
  ) c ON true;

INSERT INTO public.fleet_sync_report
  SELECT 'check reg', m.crm_reg, 'Sheet says ' || m.sheet_reg || ', CRM has ' || m.crm_reg || ' - kept the CRM car. Please check which is right.'
  FROM sheet_match m WHERE m.crm_reg <> m.sheet_reg;

INSERT INTO public.fleet_sync_report
  SELECT 'check reg', s.reg, s.reg || ' is not a valid UK plate (8 characters). Please check it on the sheet.'
  FROM fleet_sheet s WHERE s.reg !~ '^[A-Z]{2}[0-9]{2}[A-Z]{3}$';

-- 3. Add missing cars
WITH owner AS (SELECT user_id FROM public.vehicles ORDER BY created_at LIMIT 1),
added AS (
  INSERT INTO public.vehicles (user_id, reg, make, model, year, fuel_type, current_mileage, status, notes)
  SELECT (SELECT user_id FROM owner), s.reg, s.make, s.model, s.year, s.fuel, 0, 'available',
         'Added from the fleet sheet.'
  FROM fleet_sheet s
  WHERE NOT EXISTS (SELECT 1 FROM sheet_match m WHERE m.sheet_reg = s.reg)
  RETURNING reg, make, model
)
INSERT INTO public.fleet_sync_report SELECT 'added', reg, make || ' ' || model FROM added;

-- 4. Rent, allowance, deposit and term for every car on the sheet
WITH changed AS (
  UPDATE public.vehicles v SET
    weekly_price = s.rent,
    monthly_mileage_allowance = s.monthly_miles,
    default_deposit = s.deposit,
    minimum_contract_weeks = s.term_weeks,
    year = COALESCE(v.year, s.year),
    fuel_type = COALESCE(v.fuel_type, s.fuel)
  FROM fleet_sheet s
  WHERE (upper(regexp_replace(v.reg, '\s+', '', 'g')) = s.reg
         OR upper(regexp_replace(v.reg, '\s+', '', 'g')) = ANY (s.alt_regs))
    AND (v.weekly_price IS DISTINCT FROM s.rent
         OR v.monthly_mileage_allowance IS DISTINCT FROM s.monthly_miles
         OR v.default_deposit IS DISTINCT FROM s.deposit
         OR v.minimum_contract_weeks IS DISTINCT FROM s.term_weeks)
  RETURNING v.reg, s.rent, s.monthly_miles
)
INSERT INTO public.fleet_sync_report
  SELECT 'price set', upper(regexp_replace(reg, '\s+', '', 'g')), '£' || rent || '/week, ' || monthly_miles || ' miles/month' FROM changed;

-- 5. Cars not on the sheet
CREATE TEMP TABLE not_on_sheet ON COMMIT DROP AS
  SELECT c.id, c.nreg,
         EXISTS (SELECT 1 FROM public.driver_tracks d WHERE d.vehicle_id = c.id) AS has_drivers,
         EXISTS (SELECT 1 FROM public.service_records r WHERE r.vehicle_id = c.id) AS has_services
  FROM crm c
  WHERE NOT EXISTS (SELECT 1 FROM fleet_sheet s WHERE c.nreg = s.reg)
    AND NOT EXISTS (SELECT 1 FROM sheet_match m WHERE m.vehicle_id = c.id);

UPDATE public.vehicles v SET status = 'off_road',
  notes = trim(both ' ' from coalesce(v.notes, '') || ' Not on the fleet sheet.')
FROM not_on_sheet n
WHERE v.id = n.id AND (n.has_drivers OR n.has_services) AND coalesce(v.status, '') <> 'off_road';

INSERT INTO public.fleet_sync_report
  SELECT 'kept (off road)', n.nreg,
         'Not on the sheet but has ' ||
         concat_ws(' and ', CASE WHEN n.has_drivers THEN 'driver records' END, CASE WHEN n.has_services THEN 'service history' END) ||
         ' - set to Off Road instead of deleting.'
  FROM not_on_sheet n WHERE n.has_drivers OR n.has_services;

INSERT INTO public.vehicles_removed_backup
  SELECT v.*, now() FROM public.vehicles v JOIN not_on_sheet n ON n.id = v.id
  WHERE NOT n.has_drivers AND NOT n.has_services;

WITH removed AS (
  DELETE FROM public.vehicles v USING not_on_sheet n
  WHERE v.id = n.id AND NOT n.has_drivers AND NOT n.has_services
  RETURNING v.reg, v.make, v.model
)
INSERT INTO public.fleet_sync_report SELECT 'removed', reg, make || ' ' || model || ' (copy in vehicles_removed_backup)' FROM removed;

-- 6. WhatsApp bot catalogue: Sheet 2 prices/terms and the sheet's year ranges
WITH upd AS (
  UPDATE public.bot_fleet_catalog b SET
    crm_year_min = y.lo, crm_year_max = y.hi,
    weekly_rent = y.rent, monthly_miles = y.miles, deposit = y.deposit, minimum_term_weeks = y.term
  FROM (VALUES
    ('Ford Tourneo Custom', 2025, 2025, 430, 5000, 500, 6),
    ('Hyundai Ioniq', 2020, 2022, 210, 5000, 500, 6),
    ('Hyundai Santa Fe (2023-2025)', 2023, 2023, 370, 5000, 500, 8),
    ('Hyundai Santa Fe (2026)', 2026, 2026, 370, 5000, 500, 8),
    ('Jaguar I-Pace', 2020, 2020, 270, 5000, 500, 6),
    ('MG 5 EV', 2021, 2022, 200, 5000, 500, 6),
    ('MG S9', 2026, 2026, 300, 5000, 500, 6),
    ('Mercedes E220D', 2018, 2019, 270, 5000, 500, 6),
    ('Mercedes E300', 2019, 2020, 280, 5000, 500, 8),
    ('Mercedes EQE', 2023, 2024, 440, 4500, 1000, 8),
    ('Mercedes Vito', 2016, 2019, 370, 5000, 500, 8),
    ('Tesla Model 3', 2019, 2020, 260, 5000, 500, 6),
    ('Toyota Auris', 2018, 2019, 210, 5000, 500, 6),
    ('Toyota Corolla', 2019, 2019, 210, 5000, 500, 6),
    ('Toyota Prius', 2016, 2016, 200, 5000, 500, 6)
  ) AS y(name, lo, hi, rent, miles, deposit, term)
  WHERE b.display_name = y.name
    AND (b.crm_year_min IS DISTINCT FROM y.lo OR b.crm_year_max IS DISTINCT FROM y.hi
         OR b.weekly_rent IS DISTINCT FROM y.rent OR b.monthly_miles IS DISTINCT FROM y.miles
         OR b.deposit IS DISTINCT FROM y.deposit OR b.minimum_term_weeks IS DISTINCT FROM y.term)
  RETURNING b.display_name, b.weekly_rent
)
INSERT INTO public.fleet_sync_report SELECT 'bot price', NULL, display_name || ': £' || weekly_rent || '/week' FROM upd;

INSERT INTO public.fleet_sync_report
  SELECT 'summary', NULL,
    (SELECT count(*) FROM public.vehicles)::text || ' cars in the CRM now; ' ||
    (SELECT count(*) FROM fleet_sheet)::text || ' on the sheet.';
END
$sync$;

-- What happened
SELECT action, reg, detail FROM public.fleet_sync_report ORDER BY
  CASE action WHEN 'summary' THEN 0 WHEN 'check reg' THEN 1 WHEN 'duplicate (check)' THEN 2 WHEN 'kept (off road)' THEN 3
              WHEN 'renamed' THEN 4 WHEN 'duplicate removed' THEN 5 WHEN 'removed' THEN 6 WHEN 'added' THEN 7 ELSE 8 END, reg;
