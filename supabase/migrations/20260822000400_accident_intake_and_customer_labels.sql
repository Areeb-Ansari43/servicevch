ALTER TABLE public.whatsapp_leads
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'new_customer',
  ADD COLUMN IF NOT EXISTS accident_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.accident_cases
  ADD COLUMN IF NOT EXISTS source_lead_id uuid REFERENCES public.whatsapp_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS at_fault_driver_name text,
  ADD COLUMN IF NOT EXISTS at_fault_driver_license_url text,
  ADD COLUMN IF NOT EXISTS at_fault_vehicle_reg text,
  ADD COLUMN IF NOT EXISTS incident_time time,
  ADD COLUMN IF NOT EXISTS evidence_urls text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS whatsapp_leads_customer_type_idx
  ON public.whatsapp_leads (user_id, customer_type, last_message_at DESC);
CREATE INDEX IF NOT EXISTS accident_cases_source_lead_idx
  ON public.accident_cases (source_lead_id);
