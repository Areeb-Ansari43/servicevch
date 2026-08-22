create table if not exists public.webhook_events (
  id uuid not null default gen_random_uuid() primary key,
  source text not null default 'openwa',
  request_id text,
  event_name text,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb,
  payload_text text,
  normalized jsonb,
  status text not null,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now()
);

grant all on public.webhook_events to service_role;

alter table public.webhook_events enable row level security;

create index if not exists webhook_events_received_idx
  on public.webhook_events (source, received_at desc);

create index if not exists webhook_events_request_idx
  on public.webhook_events (request_id);
