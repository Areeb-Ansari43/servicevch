-- Fix driver_charges schema column drift and ensure driver_id column exists
DO $$
BEGIN
  -- Check if driver_id column exists in public.driver_charges
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'driver_charges' AND column_name = 'driver_id'
  ) THEN
    -- If user_id exists as the legacy driver FK, rename user_id to driver_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'driver_charges' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.driver_charges RENAME COLUMN user_id TO driver_id;
      -- Re-add user_id column for referencing auth.users if needed
      ALTER TABLE public.driver_charges ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    ELSE
      -- Add driver_id column directly
      ALTER TABLE public.driver_charges ADD COLUMN driver_id uuid REFERENCES public.driver_tracks(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
