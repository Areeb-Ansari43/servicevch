ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS driver_tracks_phone_idx
  ON public.driver_tracks (user_id, phone)
  WHERE active = true;
