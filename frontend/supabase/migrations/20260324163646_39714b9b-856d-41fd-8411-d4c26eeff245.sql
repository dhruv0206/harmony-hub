
-- Add workflow columns to campaign_leads
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT 'call_attempt',
  ADD COLUMN IF NOT EXISTS deal_type_interest text,
  ADD COLUMN IF NOT EXISTS term_sheet_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS term_sheet_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS contracts_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_provider_id uuid REFERENCES public.providers(id),
  ADD COLUMN IF NOT EXISTS call_disposition text,
  ADD COLUMN IF NOT EXISTS interest_level text,
  ADD COLUMN IF NOT EXISTS objection_notes text,
  ADD COLUMN IF NOT EXISTS qualification_category text,
  ADD COLUMN IF NOT EXISTS qualification_locations integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS selected_package_id uuid REFERENCES public.service_packages(id),
  ADD COLUMN IF NOT EXISTS selected_tier_id uuid REFERENCES public.membership_tiers(id),
  ADD COLUMN IF NOT EXISTS dead_reason text,
  ADD COLUMN IF NOT EXISTS dead_at_stage text,
  ADD COLUMN IF NOT EXISTS follow_up_reason text;

-- Add new activity types to the enum
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'stage_change';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'qualification';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'deal_selected';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'term_sheet_sent';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'term_sheet_accepted';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'contracts_sent';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'document_signed';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'converted';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'marked_dead';
ALTER TYPE public.campaign_activity_type ADD VALUE IF NOT EXISTS 'revived';
