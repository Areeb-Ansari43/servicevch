REVOKE ALL ON public.login_otps FROM anon, authenticated;
GRANT ALL ON public.login_otps TO service_role;
ALTER TABLE public.login_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all client access to login_otps"
  ON public.login_otps
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);