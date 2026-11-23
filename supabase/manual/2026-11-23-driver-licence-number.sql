-- Driver licence number for the "Read licence" option in Add Driver.
-- Safe to run more than once.
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS licence_number text;

COMMENT ON COLUMN public.driver_tracks.licence_number IS
  'Driving licence number (field 5 on a UK photocard), e.g. MORGA753116SM9IJ';

NOTIFY pgrst, 'reload schema';
