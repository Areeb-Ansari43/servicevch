-- Migration: Create email_log table for tracking all outbound email send attempts.
CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'simulated', 'skipped')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying by date, status, and recipient
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON public.email_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON public.email_log (recipient);

-- Enable Row Level Security (RLS)
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (Edge functions use service role key)
CREATE POLICY "Enable all operations for service_role"
  ON public.email_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users (CRM staff) to read logs
CREATE POLICY "Enable read access for authenticated staff"
  ON public.email_log
  FOR SELECT
  TO authenticated
  USING (true);
