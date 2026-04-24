
-- Add health score columns to providers
ALTER TABLE public.providers 
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS health_score_updated_at timestamptz;

-- Create provider_health_scores table
CREATE TABLE public.provider_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  score integer NOT NULL,
  factors jsonb DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'healthy' CHECK (risk_level IN ('healthy', 'monitor', 'at_risk', 'critical')),
  ai_summary text,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_health_scores ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_health_scores" ON public.provider_health_scores
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Sales reps can view health scores for their providers
CREATE POLICY "sales_rep_select_health_scores" ON public.provider_health_scores
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role) AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = provider_health_scores.provider_id AND providers.assigned_sales_rep = auth.uid()
  ));

-- Index for lookups
CREATE INDEX idx_health_scores_provider ON public.provider_health_scores(provider_id);
CREATE INDEX idx_health_scores_calculated ON public.provider_health_scores(calculated_at DESC);
