
-- Enums for scrape/lead/campaign system
CREATE TYPE public.scrape_job_status AS ENUM ('queued', 'in_progress', 'completed', 'failed', 'cancelled');
CREATE TYPE public.scraped_lead_status AS ENUM ('new', 'assigned', 'contacted', 'added_to_campaign', 'converted', 'disqualified', 'duplicate');
CREATE TYPE public.campaign_type AS ENUM ('state_outreach', 'category_blitz', 're_engagement', 'custom');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE public.campaign_lead_status AS ENUM ('pending', 'assigned', 'call_scheduled', 'called', 'follow_up', 'interested', 'not_interested', 'no_answer', 'wrong_number', 'converted', 'disqualified');
CREATE TYPE public.campaign_activity_type AS ENUM ('call', 'voicemail', 'email', 'note', 'status_change');

-- scrape_jobs
CREATE TABLE public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id),
  search_category text NOT NULL,
  search_location text,
  search_state text,
  search_zip text,
  search_radius_miles integer NOT NULL DEFAULT 25,
  status scrape_job_status NOT NULL DEFAULT 'queued',
  results_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_scrape_jobs" ON public.scrape_jobs FOR ALL TO public USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_own_scrape_jobs" ON public.scrape_jobs FOR ALL TO public USING (has_role(auth.uid(), 'sales_rep') AND created_by = auth.uid()) WITH CHECK (has_role(auth.uid(), 'sales_rep') AND created_by = auth.uid());

-- scraped_leads
CREATE TABLE public.scraped_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_job_id uuid REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  phone text,
  email text,
  website text,
  address text,
  city text,
  state text,
  zip_code text,
  latitude double precision,
  longitude double precision,
  category text,
  rating double precision,
  review_count integer,
  source text DEFAULT 'ai_search',
  raw_data jsonb DEFAULT '{}'::jsonb,
  status scraped_lead_status NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id),
  disqualified_reason text,
  ai_score integer,
  ai_summary text,
  business_size text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scraped_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_scraped_leads" ON public.scraped_leads FOR ALL TO public USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_manage_scraped_leads" ON public.scraped_leads FOR ALL TO public USING (has_role(auth.uid(), 'sales_rep')) WITH CHECK (has_role(auth.uid(), 'sales_rep'));

-- campaigns
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  campaign_type campaign_type NOT NULL DEFAULT 'custom',
  target_state text,
  target_category text,
  status campaign_status NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  created_by uuid REFERENCES public.profiles(id),
  assigned_reps uuid[] DEFAULT '{}',
  total_leads integer NOT NULL DEFAULT 0,
  contacted_count integer NOT NULL DEFAULT 0,
  converted_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_campaigns" ON public.campaigns FOR ALL TO public USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_manage_campaigns" ON public.campaigns FOR ALL TO public USING (has_role(auth.uid(), 'sales_rep')) WITH CHECK (has_role(auth.uid(), 'sales_rep'));

-- campaign_leads
CREATE TABLE public.campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.scraped_leads(id) ON DELETE CASCADE NOT NULL,
  status campaign_lead_status NOT NULL DEFAULT 'pending',
  assigned_to uuid REFERENCES public.profiles(id),
  call_attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_follow_up timestamptz,
  notes text,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_campaign_leads" ON public.campaign_leads FOR ALL TO public USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_manage_campaign_leads" ON public.campaign_leads FOR ALL TO public USING (has_role(auth.uid(), 'sales_rep')) WITH CHECK (has_role(auth.uid(), 'sales_rep'));

-- campaign_activities
CREATE TABLE public.campaign_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id uuid REFERENCES public.campaign_leads(id) ON DELETE CASCADE NOT NULL,
  activity_type campaign_activity_type NOT NULL,
  description text,
  outcome text,
  duration_seconds integer,
  performed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_campaign_activities" ON public.campaign_activities FOR ALL TO public USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_manage_campaign_activities" ON public.campaign_activities FOR ALL TO public USING (has_role(auth.uid(), 'sales_rep')) WITH CHECK (has_role(auth.uid(), 'sales_rep'));
