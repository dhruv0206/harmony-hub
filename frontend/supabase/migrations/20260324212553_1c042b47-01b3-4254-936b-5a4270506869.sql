
-- Add participant_type and law_firm_id to onboarding_workflows
ALTER TABLE public.onboarding_workflows 
  ADD COLUMN IF NOT EXISTS participant_type text NOT NULL DEFAULT 'provider' CHECK (participant_type IN ('provider', 'law_firm')),
  ADD COLUMN IF NOT EXISTS law_firm_id uuid REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- Make provider_id nullable for law firm workflows
ALTER TABLE public.onboarding_workflows ALTER COLUMN provider_id DROP NOT NULL;

-- Add index on law_firm_id
CREATE INDEX IF NOT EXISTS idx_onboarding_workflows_law_firm_id ON public.onboarding_workflows(law_firm_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_workflows_participant_type ON public.onboarding_workflows(participant_type);
