-- Add the new 2026 Hyundai Santa Fe Plug-in Hybrid to the VCH fleet.
-- Safe to run more than once: the registration is only inserted if it is absent.

insert into public.vehicles (
  user_id,
  reg,
  make,
  model,
  year,
  fuel_type,
  current_mileage,
  status,
  next_service_date,
  next_mot_date,
  pco_expiry_date,
  notes
)
select
  u.id,
  'LB76BUJ',
  'HYUNDAI',
  'SANTA FE PLUG-IN HYBRID',
  2026,
  'Plug-in-Hybrid',
  0,
  'available',
  null,
  null,
  null,
  'Added from the 2026 fleet update.'
from auth.users as u
where lower(u.email) = lower('Info@fa-ibi.co.uk')
  and not exists (
    select 1
    from public.vehicles as existing
    where upper(replace(existing.reg, ' ', '')) = 'LB76BUJ'
      and existing.user_id = u.id
  );
