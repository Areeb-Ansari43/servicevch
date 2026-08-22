-- Durable inactivity workflow state for WhatsApp leads.
-- Apply in the Supabase SQL Editor before deploying the inactivity route.
ALTER TABLE public.whatsapp_leads
  ADD COLUMN IF NOT EXISTS inactivity_prompted_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactivity_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_leads_inactivity_idx
  ON public.whatsapp_leads (ai_paused, status, last_message_at)
  WHERE ai_paused = false AND status <> 'closed';
