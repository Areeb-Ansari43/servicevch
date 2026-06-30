
-- Vehicles
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reg text NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  year integer,
  fuel_type text DEFAULT 'Diesel',
  current_mileage integer DEFAULT 0,
  status text DEFAULT 'available',
  next_service_date date,
  next_mot_date date,
  pco_expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vehicles" ON public.vehicles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service records
CREATE TABLE public.service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  reg text NOT NULL,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  service_type text DEFAULT 'Full Service',
  cost numeric(10,2) DEFAULT 0,
  mileage integer,
  garage text,
  notes text,
  status text DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_records TO authenticated;
GRANT ALL ON public.service_records TO service_role;
ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own services" ON public.service_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Driver tracking
CREATE TABLE public.driver_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  reg text NOT NULL,
  driver_name text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  start_mileage integer NOT NULL DEFAULT 0,
  current_mileage integer NOT NULL DEFAULT 0,
  allowance integer NOT NULL DEFAULT 1500,
  rate_pence integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_tracks TO authenticated;
GRANT ALL ON public.driver_tracks TO service_role;
ALTER TABLE public.driver_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tracks" ON public.driver_tracks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Monthly archive
CREATE TABLE public.mileage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid,
  reg text NOT NULL,
  driver_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  start_mileage integer NOT NULL,
  end_mileage integer NOT NULL,
  allowance integer NOT NULL,
  rate_pence integer NOT NULL,
  excess_charge numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mileage_logs TO authenticated;
GRANT ALL ON public.mileage_logs TO service_role;
ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.mileage_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- OTP (2FA) codes -- service_role only
CREATE TABLE public.login_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.login_otps TO service_role;
ALTER TABLE public.login_otps ENABLE ROW LEVEL SECURITY;
-- no policies = no client access; server-only via service_role

-- Auto-update updated_at on vehicles
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed the single authorised account: Info@fa-ibi.co.uk / Pakistan1!
-- (idempotent: skip if already exists)
DO $$
DECLARE new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('Info@fa-ibi.co.uk')) THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
      'Info@fa-ibi.co.uk', crypt('Pakistan1!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), new_user_id, jsonb_build_object('sub', new_user_id::text, 'email', 'Info@fa-ibi.co.uk'), 'email', new_user_id::text, now(), now(), now());
  END IF;
END $$;
