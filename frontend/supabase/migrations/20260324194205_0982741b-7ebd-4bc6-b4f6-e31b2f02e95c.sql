
-- Background jobs table
CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress integer DEFAULT 0,
  total_items integer,
  processed_items integer DEFAULT 0,
  result jsonb,
  error_message text,
  started_by uuid REFERENCES public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_background_jobs" ON public.background_jobs FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_rep_own_jobs" ON public.background_jobs FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role) AND started_by = auth.uid());

CREATE INDEX idx_bg_jobs_status ON public.background_jobs(status);
CREATE INDEX idx_bg_jobs_started_by ON public.background_jobs(started_by);

-- Enable realtime for background_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.background_jobs;

-- Providers full-text search
ALTER TABLE providers ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_providers_search ON providers USING gin(search_vector);

CREATE OR REPLACE FUNCTION public.providers_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.business_name, '') || ' ' || coalesce(NEW.contact_name, '') || ' ' || coalesce(NEW.city, '') || ' ' || coalesce(NEW.state, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_providers_search ON providers;
CREATE TRIGGER trg_providers_search BEFORE INSERT OR UPDATE ON providers
FOR EACH ROW EXECUTE FUNCTION providers_search_trigger();

-- AI rate limit check function
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(_user_id uuid)
RETURNS TABLE(calls_this_hour bigint, calls_today bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour'),
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 day')
  FROM public.ai_logs
  WHERE user_id = _user_id;
$$;
