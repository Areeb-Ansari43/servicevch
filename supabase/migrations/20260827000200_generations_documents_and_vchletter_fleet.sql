-- Generations: VCHLetter fleet synchronization, Azure licence scans, and generated documents.
create table if not exists public.vchletter_fleet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_repo text not null default 'Areeb-Ansari43/VCHLetter',
  source_revision text not null default 'main',
  source_registration text not null,
  normalized_registration text not null,
  model text not null default '',
  crm_vehicle_id uuid references public.vehicles(id) on delete set null,
  sync_status text not null default 'imported' check (sync_status in ('imported','matched','conflict','retired')),
  conflict_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, normalized_registration)
);

create index if not exists vchletter_fleet_user_reg_idx on public.vchletter_fleet(user_id, normalized_registration);

create table if not exists public.licence_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_id uuid references public.driver_tracks(id) on delete set null,
  storage_path text not null,
  original_filename text,
  mime_type text not null,
  azure_model text not null default 'prebuilt-idDocument',
  extracted_data jsonb not null default '{}'::jsonb,
  confidence_data jsonb not null default '{}'::jsonb,
  review_status text not null default 'needs_review' check (review_status in ('needs_review','confirmed','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists licence_scans_user_created_idx on public.licence_scans(user_id, created_at desc);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('permission_letter','contract')),
  driver_id uuid references public.driver_tracks(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  source_fleet_id uuid references public.vchletter_fleet(id) on delete set null,
  source_registration text,
  storage_path text not null,
  template_version text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists generated_documents_user_created_idx on public.generated_documents(user_id, created_at desc);

alter table public.vchletter_fleet enable row level security;
alter table public.licence_scans enable row level security;
alter table public.generated_documents enable row level security;

drop policy if exists vchletter_fleet_owner on public.vchletter_fleet;
create policy vchletter_fleet_owner on public.vchletter_fleet for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists licence_scans_owner on public.licence_scans;
create policy licence_scans_owner on public.licence_scans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists generated_documents_owner on public.generated_documents;
create policy generated_documents_owner on public.generated_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('generations-documents', 'generations-documents', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('generations-licence-scans', 'generations-licence-scans', false) on conflict (id) do nothing;

drop policy if exists generations_documents_owner on storage.objects;
create policy generations_documents_owner on storage.objects for all to authenticated using (bucket_id = 'generations-documents' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'generations-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists generations_licence_scans_owner on storage.objects;
create policy generations_licence_scans_owner on storage.objects for all to authenticated using (bucket_id = 'generations-licence-scans' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'generations-licence-scans' and (storage.foldername(name))[1] = auth.uid()::text);
