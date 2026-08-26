-- Car enquiry eligibility answers and fleet contract defaults.
-- Run after the existing WhatsApp/accident/breakdown migrations.

alter table public.whatsapp_leads
  add column if not exists car_enquiry_data jsonb not null default '{}'::jsonb;

comment on column public.whatsapp_leads.car_enquiry_data is
  'Eligibility gate state: age_eligible, uk_licence, points, completed.';

alter table public.vehicles
  add column if not exists weekly_price numeric(10,2),
  add column if not exists monthly_mileage_allowance integer not null default 5000,
  add column if not exists minimum_contract_weeks integer not null default 6,
  add column if not exists insurance_service_included boolean not null default true,
  add column if not exists fleet_source_url text;

comment on column public.vehicles.weekly_price is 'GBP weekly rental rate from the Virtual Car Hire fleet terms.';
comment on column public.vehicles.monthly_mileage_allowance is 'Monthly mileage allowance; EQE and EQS use 4,000, all other supplied vehicles use 5,000.';
comment on column public.vehicles.minimum_contract_weeks is 'Minimum rental contract in weeks; supplied fleet terms use 6 weeks.';
comment on column public.vehicles.fleet_source_url is 'Source page or spreadsheet source for the fleet terms.';

create index if not exists whatsapp_leads_car_enquiry_idx
  on public.whatsapp_leads (user_id, intent, last_message_at desc)
  where intent = 'book_car';

-- Spreadsheet-derived terms. Model matching is deliberately broad because the CRM stores
-- individual registration-level rows with trim names, while the workbook stores model families.
update public.vehicles set weekly_price = 340, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mercedes%' and lower(model) like '%e 300%';
update public.vehicles set weekly_price = 380, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mercedes%' and lower(model) like '%vito%';
update public.vehicles set weekly_price = 450, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mercedes%' and lower(model) like '%v-class%';
update public.vehicles set weekly_price = 500, monthly_mileage_allowance = 4000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mercedes%' and lower(model) like '%eqs%';
update public.vehicles set weekly_price = 310, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mercedes%' and lower(model) like '%e 220%';
update public.vehicles set weekly_price = 440, monthly_mileage_allowance = 4000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mercedes%' and lower(model) like '%eqe%';
update public.vehicles set weekly_price = 220, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%toyota%' and lower(model) like '%corolla%';
update public.vehicles set weekly_price = 210, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%toyota%' and lower(model) like '%auris%';
update public.vehicles set weekly_price = 200, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%toyota%' and lower(model) like '%prius%';
update public.vehicles set weekly_price = 260, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%tesla%' and lower(model) like '%model 3%';
update public.vehicles set weekly_price = 330, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%jaguar%' and lower(model) like '%i-pace%';
update public.vehicles set weekly_price = 220, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%hyundai%' and lower(model) like '%ioniq%';
update public.vehicles set weekly_price = 200, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mg%' and lower(model) like '%mg 5%';
update public.vehicles set weekly_price = 410, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%ford%' and lower(model) like '%tourneo%';
update public.vehicles set weekly_price = 350, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%mg%' and lower(model) like '%s9%';
update public.vehicles set weekly_price = 350, monthly_mileage_allowance = 5000, minimum_contract_weeks = 6, insurance_service_included = true, fleet_source_url = 'https://virtualcarhire.pages.dev/our-fleet'
where lower(make) like '%volkswagen%' and lower(model) like '%multivan%';
