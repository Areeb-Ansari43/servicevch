-- Driver portal invite and authentication columns
ALTER TABLE public.driver_tracks
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS invite_token uuid,
  ADD COLUMN IF NOT EXISTS invite_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS driver_tracks_invite_token_idx
  ON public.driver_tracks (invite_token)
  WHERE invite_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS driver_tracks_email_idx
  ON public.driver_tracks (lower(email))
  WHERE email IS NOT NULL;
