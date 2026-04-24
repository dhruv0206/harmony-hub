
ALTER TABLE public.provider_documents
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS is_current_version boolean NOT NULL DEFAULT true;

ALTER TABLE public.law_firm_documents
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS is_current_version boolean NOT NULL DEFAULT true;
