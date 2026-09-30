-- Migration to add status column to driver_tracks
ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Index for status
CREATE INDEX IF NOT EXISTS idx_driver_tracks_status ON public.driver_tracks (status);
