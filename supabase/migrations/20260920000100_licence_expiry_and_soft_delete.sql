-- Migration to add licence_expiry_date and deleted_at columns to driver_tracks
ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS licence_expiry_date text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
