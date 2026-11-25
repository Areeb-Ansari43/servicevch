-- Correct a mistyped plate: YH76ZLWF -> YH76ZWF (MG S9).
-- Run in the Supabase SQL Editor: paste the whole file, then Run. Safe to run again.
-- Renames the plate in every table that stores a reg (vehicles, drivers, service history,
-- mileage logs, accident cases...), keeping the same spacing style each row used.

DO $fix$
DECLARE
  t record;
  n int;
BEGIN
  DROP TABLE IF EXISTS public.reg_fix_report;
  CREATE TABLE public.reg_fix_report (table_name text, column_name text, rows_changed int);
  ALTER TABLE public.reg_fix_report ENABLE ROW LEVEL SECURITY;

  -- Stop if the correct plate is already a separate car (that needs merging by hand instead).
  IF EXISTS (SELECT 1 FROM public.vehicles WHERE upper(regexp_replace(reg, '\s+', '', 'g')) = 'YH76ZWF')
     AND EXISTS (SELECT 1 FROM public.vehicles WHERE upper(regexp_replace(reg, '\s+', '', 'g')) = 'YH76ZLWF') THEN
    INSERT INTO public.reg_fix_report VALUES ('vehicles', 'reg', -1);
    RAISE NOTICE 'Both YH76ZWF and YH76ZLWF exist as cars: nothing changed. Merge them by hand.';
    RETURN;
  END IF;

  FOR t IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
      AND c.column_name IN ('reg', 'registration', 'vehicle_reg')
      AND c.data_type IN ('text', 'character varying')
      AND c.table_name <> 'reg_fix_report'
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = CASE WHEN %I ~ ''\s'' THEN ''YH76 ZWF'' ELSE ''YH76ZWF'' END
       WHERE upper(regexp_replace(%I, ''\s+'', '''', ''g'')) = ''YH76ZLWF''',
      t.table_name, t.column_name, t.column_name, t.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      INSERT INTO public.reg_fix_report VALUES (t.table_name, t.column_name, n);
    END IF;
  END LOOP;
END
$fix$;

-- What changed (-1 = both plates exist as cars, nothing changed)
SELECT * FROM public.reg_fix_report ORDER BY table_name;
