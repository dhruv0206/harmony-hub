-- Add counter-sign columns to signature_requests
ALTER TABLE public.signature_requests 
ADD COLUMN IF NOT EXISTS counter_signed_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS counter_signed_at timestamptz,
ADD COLUMN IF NOT EXISTS counter_signature_url text,
ADD COLUMN IF NOT EXISTS final_document_url text;

-- Add 'counter_signed' to the audit action enum
ALTER TYPE public.signature_audit_action ADD VALUE IF NOT EXISTS 'counter_signed';

-- Add 'fully_executed' to signature_request_status enum
ALTER TYPE public.signature_request_status ADD VALUE IF NOT EXISTS 'fully_executed';
