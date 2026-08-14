CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.whatsapp_leads(id) ON DELETE CASCADE,
  sender text NOT NULL DEFAULT 'customer',
  content text NOT NULL DEFAULT '',
  media_url text,
  handoff boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own messages" ON public.messages FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_messages_lead_id ON public.messages (lead_id, created_at);

ALTER TABLE public.whatsapp_leads ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.whatsapp_leads ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone NOT NULL DEFAULT now();