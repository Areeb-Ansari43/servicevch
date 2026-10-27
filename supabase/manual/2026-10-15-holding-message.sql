-- Idempotent SQL migration for Human Handling 10-Minute Holding Message tracking

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_leads' AND column_name = 'holding_message_sent_at'
  ) THEN
    ALTER TABLE public.whatsapp_leads ADD COLUMN holding_message_sent_at timestamptz;
  END IF;
END $$;
