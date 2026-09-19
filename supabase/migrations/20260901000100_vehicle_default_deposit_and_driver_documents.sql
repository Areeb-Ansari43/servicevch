-- Migration: Add vehicle default deposit and driver documents table/storage

-- 1. Add default_deposit column to vehicles table
alter table public.vehicles add column if not exists default_deposit integer not null default 500;

-- Set Mercedes EQE and EQS models to default deposit £1000
update public.vehicles
set default_deposit = 1000
where model ilike '%eqe%' or model ilike '%eqs%' or make ilike '%eqe%' or make ilike '%eqs%';

-- 2. Create driver_documents table if not exists
create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.driver_tracks(id) on delete cascade,
  user_id uuid,
  document_type text not null check (document_type in ('contract', 'permission_letter', 'vehicle_schedule', 'pco_licence')),
  file_name text not null,
  file_path text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- Index for fast document lookup by driver_id
create index if not exists driver_documents_driver_id_idx on public.driver_documents(driver_id);

-- Enable Row Level Security (RLS)
alter table public.driver_documents enable row level security;

-- Permissive RLS policy for CRM staff access
drop policy if exists driver_documents_crm_policy on public.driver_documents;
create policy driver_documents_crm_policy on public.driver_documents for all using (true) with check (true);

-- 3. Storage bucket for driver documents
insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', true)
on conflict (id) do nothing;

drop policy if exists driver_documents_storage_policy on storage.objects;
create policy driver_documents_storage_policy on storage.objects for all using (bucket_id = 'driver-documents') with check (bucket_id = 'driver-documents');
