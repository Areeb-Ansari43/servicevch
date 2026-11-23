-- Fleet sync with the price sheet (VCH_Car_Fleet_01092026.numbers, 92 cars).
-- Run once in the Supabase SQL Editor. Safe to run again (it only changes what still differs).
--
-- What it does:
--   1. Adds every car on the sheet that is missing from the CRM.
--   2. Sets each car's weekly rent (Sheet 1), monthly mileage allowance (Sheet 2), deposit
--      and minimum term.
--   3. Removes CRM cars that are not on the sheet - ONLY when nothing is attached to them.
--      Deleting a vehicle row also deletes its drivers and service records, so a car that has
--      any driver or service history is NOT deleted: it is set to Off Road and listed at the end.
--      Every removed car is copied to public.vehicles_removed_backup first, so it can be restored.
--   4. Two sheet regs are not valid UK plates (OWN19XNX, YH76ZLWF). If the CRM already has the
--      same car with one character fewer (e.g. WN19XNX), that CRM car is kept and nothing is added.
--   5. Widens the WhatsApp bot catalogue's year ranges to the years on the sheet.
-- The last result table lists everything it did.

-- Columns this uses (already there if earlier migrations ran; added if not)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS weekly_price numeric(10,2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS monthly_mileage_allowance integer DEFAULT 5000;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS default_deposit numeric(10,2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS minimum_contract_weeks integer DEFAULT 6;

DROP TABLE IF EXISTS fleet_sync_report;
CREATE TEMP TABLE fleet_sync_report (action text, reg text, detail text);

BEGIN;

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
  ('OWN19XNX', 'Mercedes-Benz', 'E220D', 2019, 'Diesel', 270, 5000, 500, 6, 'Mercedes E220D', ARRAY['ON19XNX', 'OW19XNX', 'WN19XNX']::text[]),
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
  ('HK73SXU', 'Hyundai', 'Santa Fe', 2023, 'Plug-in-Hybrid', 330, 5000, 500, 8, 'Hyundai Santa Fe (2023-2025)', ARRAY[]::text[]),
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
  ('YH76ZLWF', 'MG', 'S9', 2026, 'Plug-in-Hybrid', 300, 5000, 500, 6, 'MG S9', ARRAY['YH76LWF', 'YH76ZLF', 'YH76ZLW', 'YH76ZWF']::text[]),
  ('MD25AYY', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('MD25DDZ', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('RX25CME', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('BK76WJG', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('BK76VWB', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]),
  ('BK76WGD', 'Ford', 'Tourneo Custom', 2025, 'Electric', 430, 5000, 500, 6, 'Ford Tourneo Custom', ARRAY[]::text[]);

-- CRM regs, normalised (no spaces, upper case)
CREATE OR REPLACE TEMP VIEW crm AS
  SELECT v.*, upper(regexp_replace(v.reg, '\s+', '', 'g')) AS nreg FROM public.vehicles v;

-- Sheet car -> CRM car (exact reg, or a one-character typo for the two odd sheet regs)
CREATE TEMP TABLE sheet_match ON COMMIT DROP AS
  SELECT s.reg AS sheet_reg, c.id AS vehicle_id, c.nreg AS crm_reg
  FROM fleet_sheet s
  JOIN LATERAL (
    SELECT c.* FROM crm c
    WHERE c.nreg = s.reg OR c.nreg = ANY (s.alt_regs)
    ORDER BY (c.nreg = s.reg) DESC
    LIMIT 1
  ) c ON true;

INSERT INTO fleet_sync_report
  SELECT 'check reg', m.crm_reg, 'Sheet says ' || m.sheet_reg || ', CRM has ' || m.crm_reg || ' - kept the CRM car. Please fix the sheet.'
  FROM sheet_match m WHERE m.crm_reg <> m.sheet_reg;

-- 1. Add missing cars
WITH owner AS (SELECT user_id FROM public.vehicles ORDER BY created_at LIMIT 1),
added AS (
  INSERT INTO public.vehicles (user_id, reg, make, model, year, fuel_type, current_mileage, status, notes)
  SELECT (SELECT user_id FROM owner), s.reg, s.make, s.model, s.year, s.fuel, 0, 'available',
         'Added from the fleet sheet (2026-11-23).'
  FROM fleet_sheet s
  WHERE NOT EXISTS (SELECT 1 FROM sheet_match m WHERE m.sheet_reg = s.reg)
  RETURNING reg, make, model
)
INSERT INTO fleet_sync_report SELECT 'added', reg, make || ' ' || model FROM added;

-- 2. Rent, allowance, deposit and term for every car on the sheet
UPDATE public.vehicles v SET
  weekly_price = s.rent,
  monthly_mileage_allowance = s.monthly_miles,
  default_deposit = s.deposit,
  minimum_contract_weeks = s.term_weeks,
  year = COALESCE(v.year, s.year),
  fuel_type = COALESCE(v.fuel_type, s.fuel)
FROM fleet_sheet s
WHERE upper(regexp_replace(v.reg, '\s+', '', 'g')) = s.reg
   OR upper(regexp_replace(v.reg, '\s+', '', 'g')) = ANY (s.alt_regs);

-- 3. Cars not on the sheet
CREATE TABLE IF NOT EXISTS public.vehicles_removed_backup (LIKE public.vehicles);
ALTER TABLE public.vehicles_removed_backup ADD COLUMN IF NOT EXISTS removed_at timestamptz DEFAULT now();

CREATE TEMP TABLE not_on_sheet ON COMMIT DROP AS
  SELECT c.id, c.nreg,
         EXISTS (SELECT 1 FROM public.driver_tracks d WHERE d.vehicle_id = c.id) AS has_drivers,
         EXISTS (SELECT 1 FROM public.service_records r WHERE r.vehicle_id = c.id) AS has_services
  FROM crm c
  -- compared with the sheet itself (not the earlier match), so cars added above are never removed
  WHERE NOT EXISTS (SELECT 1 FROM fleet_sheet s WHERE c.nreg = s.reg)
    AND NOT EXISTS (SELECT 1 FROM sheet_match m WHERE m.vehicle_id = c.id);

-- 3a. Has history: keep, set Off Road, report
UPDATE public.vehicles v SET status = 'off_road',
  notes = trim(both ' ' from coalesce(v.notes, '') || ' Not on the fleet sheet (2026-11-23).')
FROM not_on_sheet n
WHERE v.id = n.id AND (n.has_drivers OR n.has_services) AND coalesce(v.status, '') <> 'off_road';

INSERT INTO fleet_sync_report
  SELECT 'kept (off road)', n.nreg,
         'Not on the sheet but has ' ||
         concat_ws(' and ', CASE WHEN n.has_drivers THEN 'driver records' END, CASE WHEN n.has_services THEN 'service history' END) ||
         ' - set to Off Road instead of deleting.'
  FROM not_on_sheet n WHERE n.has_drivers OR n.has_services;

-- 3b. Nothing attached: back up, then delete
INSERT INTO public.vehicles_removed_backup
  SELECT v.*, now() FROM public.vehicles v JOIN not_on_sheet n ON n.id = v.id
  WHERE NOT n.has_drivers AND NOT n.has_services;

WITH removed AS (
  DELETE FROM public.vehicles v USING not_on_sheet n
  WHERE v.id = n.id AND NOT n.has_drivers AND NOT n.has_services
  RETURNING v.reg, v.make, v.model
)
INSERT INTO fleet_sync_report SELECT 'removed', reg, make || ' ' || model || ' (copy in vehicles_removed_backup)' FROM removed;

-- 5. Bot catalogue year ranges = years on the sheet
UPDATE public.bot_fleet_catalog b SET crm_year_min = y.lo, crm_year_max = y.hi
FROM (VALUES
    ('Ford Tourneo Custom', 2025, 2025),
    ('Hyundai Ioniq', 2020, 2022),
    ('Hyundai Santa Fe (2023-2025)', 2023, 2023),
    ('Hyundai Santa Fe (2026)', 2026, 2026),
    ('Jaguar I-Pace', 2020, 2020),
    ('MG 5 EV', 2021, 2022),
    ('MG S9', 2026, 2026),
    ('Mercedes E220D', 2018, 2019),
    ('Mercedes E300', 2019, 2020),
    ('Mercedes EQE', 2023, 2024),
    ('Mercedes Vito', 2016, 2019),
    ('Tesla Model 3', 2019, 2020),
    ('Toyota Auris', 2018, 2019),
    ('Toyota Corolla', 2019, 2019),
    ('Toyota Prius', 2016, 2016)
) AS y(name, lo, hi)
WHERE b.display_name = y.name AND (b.crm_year_min IS DISTINCT FROM y.lo OR b.crm_year_max IS DISTINCT FROM y.hi);

INSERT INTO fleet_sync_report
  SELECT 'summary', NULL,
    (SELECT count(*) FROM public.vehicles)::text || ' cars in the CRM now; ' ||
    (SELECT count(*) FROM fleet_sheet)::text || ' on the sheet.';

COMMIT;

-- What happened
SELECT action, reg, detail FROM fleet_sync_report ORDER BY
  CASE action WHEN 'summary' THEN 0 WHEN 'check reg' THEN 1 WHEN 'kept (off road)' THEN 2 WHEN 'removed' THEN 3 ELSE 4 END, reg;
