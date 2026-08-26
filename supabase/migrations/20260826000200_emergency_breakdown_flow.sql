-- Emergency Breakdown workflow state and case metadata.
-- Apply after the existing WhatsApp/accident migrations.

alter table public.whatsapp_leads
  add column if not exists intent text not null default 'general',
  add column if not exists breakdown_data jsonb not null default '{}'::jsonb;

alter table public.accident_cases
  add column if not exists case_type text not null default 'accident',
  add column if not exists garage_name text,
  add column if not exists garage_address text,
  add column if not exists garage_map_url text,
  add column if not exists key_photo_url text,
  add column if not exists key_video_url text;

create index if not exists accident_cases_case_type_idx
  on public.accident_cases (case_type, created_at desc);

create index if not exists whatsapp_leads_breakdown_intent_idx
  on public.whatsapp_leads (intent, status, last_message_at)
  where intent = 'emergency_breakdown';

comment on column public.whatsapp_leads.breakdown_data is 'State for Emergency Breakdown garage drop-off and key photo/video verification.';
comment on column public.accident_cases.case_type is 'Workflow type: accident or breakdown.';
comment on column public.accident_cases.garage_map_url is 'Clickable map URL supplied to the customer.';
comment on column public.accident_cases.key_photo_url is 'Signed/private CRM URL for the key photo.';
comment on column public.accident_cases.key_video_url is 'Signed/private CRM URL for the key video.';

-- Realtime keeps the WhatsApp Leads and Accident Cases views current.
alter table public.accident_cases replica identity full;
