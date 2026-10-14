-- Idempotent SQL migration for WhatsApp Assistant Speed, Realtime Typing, and Bot Fleet Data Overrides

-- 1. Ensure whatsapp_leads has typing status indicators for Realtime CRM feedback
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_leads' AND column_name = 'ai_status'
  ) THEN
    ALTER TABLE public.whatsapp_leads ADD COLUMN ai_status text DEFAULT 'idle';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_leads' AND column_name = 'ai_status_updated_at'
  ) THEN
    ALTER TABLE public.whatsapp_leads ADD COLUMN ai_status_updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Expand conversation_events with per-stage timing breakdown columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversation_events' AND column_name = 'webhook_received_at'
  ) THEN
    ALTER TABLE public.conversation_events ADD COLUMN webhook_received_at timestamptz;
    ALTER TABLE public.conversation_events ADD COLUMN message_saved_at timestamptz;
    ALTER TABLE public.conversation_events ADD COLUMN ai_started_at timestamptz;
    ALTER TABLE public.conversation_events ADD COLUMN first_provider_response_at timestamptz;
    ALTER TABLE public.conversation_events ADD COLUMN reply_sent_at timestamptz;
    ALTER TABLE public.conversation_events ADD COLUMN crm_visible_at timestamptz;
  END IF;
END $$;

-- 3. Create bot_fleet_overrides table for staff management of vehicle details & weekly rent
CREATE TABLE IF NOT EXISTS public.bot_fleet_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL UNIQUE,
  make text NOT NULL DEFAULT '',
  year text NOT NULL DEFAULT '',
  fuel text NOT NULL DEFAULT '',
  weekly_rent numeric(10,2) NOT NULL DEFAULT 0.00,
  monthly_mileage_allowance integer NOT NULL DEFAULT 2500,
  minimum_term_weeks integer NOT NULL DEFAULT 6,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS and staff full access policy on bot_fleet_overrides
ALTER TABLE public.bot_fleet_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff full access on bot_fleet_overrides" ON public.bot_fleet_overrides;
CREATE POLICY "Staff full access on bot_fleet_overrides" ON public.bot_fleet_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Enable Realtime publication on whatsapp_leads and messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_leads;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
