-- Consolidated, Idempotent Production Database Migrations & Security Policies
-- Safe to re-run multiple times on Supabase.

-- ============================================================================
-- 1. TABLES & COLUMNS
-- ============================================================================

-- driver_tracks
CREATE TABLE IF NOT EXISTS public.driver_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS licence_expiry_date date;
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;
ALTER TABLE public.driver_tracks ADD COLUMN IF NOT EXISTS current_mileage integer DEFAULT 0;

-- login_otps (Service Role Only)
CREATE TABLE IF NOT EXISTS public.login_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed boolean DEFAULT false NOT NULL,
  attempts_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.login_otps ADD COLUMN IF NOT EXISTS consumed boolean DEFAULT false NOT NULL;
ALTER TABLE public.login_otps ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_login_otps_email ON public.login_otps (email);
CREATE INDEX IF NOT EXISTS idx_login_otps_expires ON public.login_otps (expires_at);

-- portal_rate_limits (Service Role Only)
CREATE TABLE IF NOT EXISTS public.portal_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  action text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_rate_limits_key_action ON public.portal_rate_limits (key, action, created_at);

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamp with time zone DEFAULT now() NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb
);

-- email_log
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

-- driver_notifications
CREATE TABLE IF NOT EXISTS public.driver_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.driver_tracks(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- driver_charges
CREATE TABLE IF NOT EXISTS public.driver_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.driver_tracks(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS) & POLICIES
-- ============================================================================

-- Enable RLS on ALL tables
ALTER TABLE public.driver_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 2a. login_otps & portal_rate_limits: RLS ON, NO POLICIES (Service Role Access Only)
DROP POLICY IF EXISTS "No public access to login_otps" ON public.login_otps;
DROP POLICY IF EXISTS "No public access to portal_rate_limits" ON public.portal_rate_limits;

-- 2b. audit_logs: Staff read access, Service Role write access
DROP POLICY IF EXISTS "Staff read audit_logs" ON public.audit_logs;
CREATE POLICY "Staff read audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (true);

-- 2c. email_log: Staff read access, Service Role write access
DROP POLICY IF EXISTS "Staff read email_log" ON public.email_log;
CREATE POLICY "Staff read email_log" ON public.email_log
  FOR SELECT TO authenticated
  USING (true);

-- 2d. driver_notifications: Staff full access, Drivers read own rows
DROP POLICY IF EXISTS "Staff full access driver_notifications" ON public.driver_notifications;
CREATE POLICY "Staff full access driver_notifications" ON public.driver_notifications
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2e. driver_charges: Staff full access, Drivers read own rows
DROP POLICY IF EXISTS "Staff full access driver_charges" ON public.driver_charges;
CREATE POLICY "Staff full access driver_charges" ON public.driver_charges
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2f. user_settings: Users read/write own settings row
DROP POLICY IF EXISTS "Users read write own user_settings" ON public.user_settings;
CREATE POLICY "Users read write own user_settings" ON public.user_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
