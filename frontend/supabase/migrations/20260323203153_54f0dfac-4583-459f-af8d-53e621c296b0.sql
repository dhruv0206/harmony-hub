ALTER TABLE public.signature_requests ADD COLUMN IF NOT EXISTS provider_document_id uuid REFERENCES public.provider_documents(id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_provider_document_id ON public.signature_requests(provider_document_id);