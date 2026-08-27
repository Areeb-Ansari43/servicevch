-- Store the third-party insurer captured by the accident intake flow.
alter table public.accident_cases
  add column if not exists insurance_provider text;

comment on column public.accident_cases.insurance_provider is
  'Insurance provider for the third party involved in the accident.';
