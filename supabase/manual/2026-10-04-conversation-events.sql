-- Idempotent creation of conversation_events table for staff AI log inspection
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  tool_calls JSONB,
  validation_result TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and add authenticated staff policies
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff full access on conversation_events" ON public.conversation_events;
CREATE POLICY "Staff full access on conversation_events" ON public.conversation_events
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
