-- Driver rent tracking, itemised charges, and alerts/notifications
ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS weekly_rent numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_due_day text DEFAULT 'Monday',
  ADD COLUMN IF NOT EXISTS rent_status text DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS balance_due numeric(10,2) DEFAULT 0;

-- Itemised charges for drivers (e.g. maintenance, missed rent, extra fees)
CREATE TABLE IF NOT EXISTS public.driver_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.driver_tracks(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_charges TO authenticated;
GRANT ALL ON public.driver_charges TO service_role;
ALTER TABLE public.driver_charges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'driver_charges' AND policyname = 'staff or driver access charges'
  ) THEN
    CREATE POLICY "staff or driver access charges" ON public.driver_charges
      FOR ALL
      USING (
        auth.uid() = user_id OR
        auth.uid() IN (SELECT auth_user_id FROM public.driver_tracks WHERE id = driver_id)
      )
      WITH CHECK (
        auth.uid() = user_id OR
        auth.uid() IN (SELECT auth_user_id FROM public.driver_tracks WHERE id = driver_id)
      );
  END IF;
END $$;

-- Driver notifications / alerts (e.g. MOT, Service, PCO reminders)
CREATE TABLE IF NOT EXISTS public.driver_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.driver_tracks(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_notifications TO authenticated;
GRANT ALL ON public.driver_notifications TO service_role;
ALTER TABLE public.driver_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'driver_notifications' AND policyname = 'staff or driver access notifications'
  ) THEN
    CREATE POLICY "staff or driver access notifications" ON public.driver_notifications
      FOR ALL
      USING (
        auth.uid() = user_id OR
        auth.uid() IN (SELECT auth_user_id FROM public.driver_tracks WHERE id = driver_id)
      )
      WITH CHECK (
        auth.uid() = user_id OR
        auth.uid() IN (SELECT auth_user_id FROM public.driver_tracks WHERE id = driver_id)
      );
  END IF;
END $$;
