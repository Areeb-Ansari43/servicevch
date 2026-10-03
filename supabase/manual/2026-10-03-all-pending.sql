-- SQL consolidation file for production database updates and pending migrations

-- 1. Ensure driver_tracks has required columns
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS licence_expiry_date date;
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- 2. Ensure login_otps table exists with attempts_count column for 2FA tracking
CREATE TABLE IF NOT EXISTS public.login_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean DEFAULT false NOT NULL,
  attempts_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.login_otps ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_login_otps_email ON public.login_otps (email);
CREATE INDEX IF NOT EXISTS idx_login_otps_expires ON public.login_otps (expires_at);

-- 3. Durable rate limits table for server-to-server portal auth
CREATE TABLE IF NOT EXISTS public.portal_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  action text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_rate_limits_key_action ON public.portal_rate_limits (key, action, created_at);

-- 4. Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamp with time zone DEFAULT now() NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb
);

-- 5. Email log table
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. Driver notifications table
CREATE TABLE IF NOT EXISTS public.driver_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.driver_tracks(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. Driver charges table
CREATE TABLE IF NOT EXISTS public.driver_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.driver_tracks(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
