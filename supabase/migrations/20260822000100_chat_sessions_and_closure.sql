alter table public.whatsapp_leads
  add column if not exists session_id text,
  add column if not exists closed_at timestamptz;

alter table public.messages
  add column if not exists session_id text;

create index if not exists whatsapp_leads_user_session_idx
  on public.whatsapp_leads (user_id, session_id, last_message_at desc);

create index if not exists messages_lead_session_idx
  on public.messages (lead_id, session_id, created_at);
