alter table public.messages
  add column if not exists meta_message_id text,
  add column if not exists media_type text,
  add column if not exists media_mime_type text,
  add column if not exists media_storage_path text,
  add column if not exists media_meta_id text;

create unique index if not exists messages_meta_message_id_uidx
  on public.messages (meta_message_id)
  where meta_message_id is not null;

create index if not exists whatsapp_leads_user_phone_idx
  on public.whatsapp_leads (user_id, phone, last_message_at desc)
  where phone is not null;

create index if not exists messages_media_meta_id_idx
  on public.messages (media_meta_id)
  where media_meta_id is not null;

create table if not exists public.whatsapp_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.whatsapp_leads(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  meta_media_id text not null,
  media_type text not null,
  mime_type text,
  file_name text,
  storage_bucket text not null default 'whatsapp-media',
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.whatsapp_media to authenticated;
grant all on public.whatsapp_media to service_role;
alter table public.whatsapp_media enable row level security;

drop policy if exists "own whatsapp media" on public.whatsapp_media;
create policy "own whatsapp media" on public.whatsapp_media for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create unique index if not exists whatsapp_media_meta_media_uidx
  on public.whatsapp_media (meta_media_id);

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

-- The Edge/server handler uses the service role and bypasses RLS.
-- The existing authenticated CRM policies on public.messages remain unchanged.
