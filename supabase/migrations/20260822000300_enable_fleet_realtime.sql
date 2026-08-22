do $$
declare
  publication_exists boolean;
begin
  select exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) into publication_exists;

  if publication_exists then
    if to_regclass('public.vehicles') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'vehicles'
      ) then
      alter publication supabase_realtime add table public.vehicles;
    end if;

    if to_regclass('public.service_records') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'service_records'
      ) then
      alter publication supabase_realtime add table public.service_records;
    end if;

    if to_regclass('public.driver_tracks') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'driver_tracks'
      ) then
      alter publication supabase_realtime add table public.driver_tracks;
    end if;

    if to_regclass('public.whatsapp_leads') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'whatsapp_leads'
      ) then
      alter publication supabase_realtime add table public.whatsapp_leads;
    end if;

    if to_regclass('public.accident_cases') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'accident_cases'
      ) then
      alter publication supabase_realtime add table public.accident_cases;
    end if;

    if to_regclass('public.messages') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'messages'
      ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if to_regclass('public.mileage_logs') is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'mileage_logs'
      ) then
      alter publication supabase_realtime add table public.mileage_logs;
    end if;
  end if;
end $$;

alter table if exists public.vehicles replica identity full;
alter table if exists public.service_records replica identity full;
alter table if exists public.driver_tracks replica identity full;
alter table if exists public.whatsapp_leads replica identity full;
alter table if exists public.accident_cases replica identity full;
alter table if exists public.messages replica identity full;
alter table if exists public.mileage_logs replica identity full;
