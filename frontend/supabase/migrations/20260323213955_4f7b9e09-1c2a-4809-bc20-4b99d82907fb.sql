
CREATE TABLE public.churn_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  churn_probability integer NOT NULL DEFAULT 0,
  predicted_churn_timeframe text,
  risk_factors jsonb DEFAULT '[]'::jsonb,
  retention_strategy text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'action_taken', 'resolved', 'churned')),
  assigned_to uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.churn_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_churn_predictions" ON public.churn_predictions
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_rep_select_churn_predictions" ON public.churn_predictions
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role) AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = churn_predictions.provider_id AND providers.assigned_sales_rep = auth.uid()
  ));

CREATE POLICY "sales_rep_update_churn_predictions" ON public.churn_predictions
  FOR UPDATE TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role) AND (assigned_to = auth.uid() OR EXISTS (
    SELECT 1 FROM providers WHERE providers.id = churn_predictions.provider_id AND providers.assigned_sales_rep = auth.uid()
  )));

CREATE INDEX idx_churn_predictions_provider ON public.churn_predictions(provider_id);
CREATE INDEX idx_churn_predictions_status ON public.churn_predictions(status);
CREATE INDEX idx_churn_predictions_probability ON public.churn_predictions(churn_probability DESC);
