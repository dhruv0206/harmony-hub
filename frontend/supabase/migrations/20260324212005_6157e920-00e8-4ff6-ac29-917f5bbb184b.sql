
-- Create law_firm_pipeline table
CREATE TABLE public.law_firm_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid REFERENCES public.law_firms(id) ON DELETE CASCADE NOT NULL,
  sales_rep_id uuid REFERENCES public.profiles(id),
  stage text NOT NULL DEFAULT 'lead_identified' CHECK (stage IN ('lead_identified', 'initial_contact', 'discovery', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost')),
  estimated_value decimal,
  probability integer DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add participant_type to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS participant_type text NOT NULL DEFAULT 'provider' CHECK (participant_type IN ('provider', 'law_firm'));

-- Enable RLS
ALTER TABLE public.law_firm_pipeline ENABLE ROW LEVEL SECURITY;

-- RLS policies for law_firm_pipeline
CREATE POLICY "Admins full access on law_firm_pipeline"
  ON public.law_firm_pipeline FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sales reps manage own pipeline deals"
  ON public.law_firm_pipeline FOR ALL TO authenticated
  USING (sales_rep_id = auth.uid())
  WITH CHECK (sales_rep_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER update_law_firm_pipeline_updated_at
  BEFORE UPDATE ON public.law_firm_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.law_firm_pipeline;
