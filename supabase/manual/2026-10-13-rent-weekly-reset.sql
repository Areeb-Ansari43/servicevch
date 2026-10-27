-- ==============================================================================
-- Manual Migration: Weekly Rent Reset & Payment History
-- File: supabase/manual/2026-10-13-rent-weekly-reset.sql
-- ==============================================================================

-- 1. Add rent_paid_for_due_date column to driver_tracks
ALTER TABLE public.driver_tracks
ADD COLUMN IF NOT EXISTS rent_paid_for_due_date DATE;

-- 2. Create rent_payments history table
CREATE TABLE IF NOT EXISTS public.rent_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.driver_tracks(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rent_payments_driver_due_date_key UNIQUE (driver_id, due_date)
);

-- Index for fast driver lookup
CREATE INDEX IF NOT EXISTS idx_rent_payments_driver_due ON public.rent_payments(driver_id, due_date DESC);

-- 3. Enable RLS on rent_payments
ALTER TABLE public.rent_payments ENABLE ROW LEVEL SECURITY;

-- 4. Staff-only RLS policies using public.is_staff() (DO NOT REDEFINE is_staff)
DROP POLICY IF EXISTS "Staff full access to rent_payments" ON public.rent_payments;

CREATE POLICY "Staff full access to rent_payments"
ON public.rent_payments
FOR ALL
TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 5. Backfill: Drivers currently shown as Paid are treated as paid for their CURRENT due date
DO $$
DECLARE
    today_london DATE := (now() AT TIME ZONE 'Europe/London')::DATE;
    rec RECORD;
    target_dow INT;
    current_dow INT := EXTRACT(DOW FROM today_london)::INT;
    days_back INT;
    calc_due_date DATE;
BEGIN
    FOR rec IN
        SELECT id, rent_due_day, weekly_rent
        FROM public.driver_tracks
        WHERE LOWER(COALESCE(rent_status, 'unpaid')) = 'paid'
    LOOP
        CASE LOWER(TRIM(COALESCE(rec.rent_due_day, 'monday')))
            WHEN 'sunday' THEN target_dow := 0;
            WHEN 'monday' THEN target_dow := 1;
            WHEN 'tuesday' THEN target_dow := 2;
            WHEN 'wednesday' THEN target_dow := 3;
            WHEN 'thursday' THEN target_dow := 4;
            WHEN 'friday' THEN target_dow := 5;
            WHEN 'saturday' THEN target_dow := 6;
            ELSE target_dow := 1;
        END CASE;

        days_back := (current_dow - target_dow + 7) % 7;
        calc_due_date := today_london - days_back;

        -- Update driver_tracks
        UPDATE public.driver_tracks
        SET rent_paid_for_due_date = calc_due_date
        WHERE id = rec.id;

        -- Insert initial payment record into rent_payments history
        INSERT INTO public.rent_payments (driver_id, due_date, amount, paid_at)
        VALUES (rec.id, calc_due_date, COALESCE(rec.weekly_rent, 0), now())
        ON CONFLICT (driver_id, due_date) DO NOTHING;
    END LOOP;
END $$;
