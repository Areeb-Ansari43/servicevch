-- Table for tracking scheduled background job executions and status
CREATE TABLE IF NOT EXISTS public.job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'failed'
    counts JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick sorting and lookup of recent runs
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name_started_at ON public.job_runs (job_name, started_at DESC);

-- Enable RLS
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- Staff-only read policy
CREATE POLICY "Allow authenticated staff to read job_runs"
    ON public.job_runs
    FOR SELECT
    TO authenticated
    USING (true);

-- Service role full access policy
CREATE POLICY "Allow service_role full access to job_runs"
    ON public.job_runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
