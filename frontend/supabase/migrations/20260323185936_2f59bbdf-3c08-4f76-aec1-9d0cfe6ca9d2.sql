
-- Enums
CREATE TYPE public.signature_request_status AS ENUM ('pending', 'viewed', 'identity_verified', 'signed', 'declined', 'expired', 'voided');
CREATE TYPE public.verification_type AS ENUM ('email_code', 'sms_code', 'knowledge_questions', 'selfie_match');
CREATE TYPE public.verification_status AS ENUM ('pending', 'passed', 'failed');
CREATE TYPE public.signature_audit_action AS ENUM ('request_created', 'email_sent', 'document_viewed', 'identity_check_started', 'identity_check_passed', 'identity_check_failed', 'signed', 'declined', 'voided', 'expired', 'downloaded');

-- signature_requests
CREATE TABLE public.signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.profiles(id),
  status signature_request_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ DEFAULT now(),
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  ip_address TEXT,
  user_agent TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- signature_verifications
CREATE TABLE public.signature_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  verification_type verification_type NOT NULL,
  verification_data JSONB DEFAULT '{}',
  status verification_status NOT NULL DEFAULT 'pending',
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- signature_audit_log
CREATE TABLE public.signature_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  action signature_audit_action NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- signed_documents
CREATE TABLE public.signed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  document_url TEXT,
  signature_image_url TEXT,
  certificate_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Storage bucket for signatures
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false);

-- RLS
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signed_documents ENABLE ROW LEVEL SECURITY;

-- signature_requests policies
CREATE POLICY "admin_all_sig_requests" ON public.signature_requests FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_manage_sig_requests" ON public.signature_requests FOR ALL USING (has_role(auth.uid(), 'sales_rep') AND (requested_by = auth.uid() OR EXISTS (SELECT 1 FROM providers WHERE providers.id = signature_requests.provider_id AND providers.assigned_sales_rep = auth.uid()))) WITH CHECK (has_role(auth.uid(), 'sales_rep'));
CREATE POLICY "provider_view_own_sig_requests" ON public.signature_requests FOR SELECT USING (has_role(auth.uid(), 'provider') AND EXISTS (SELECT 1 FROM providers WHERE providers.id = signature_requests.provider_id AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())));
CREATE POLICY "provider_update_own_sig_requests" ON public.signature_requests FOR UPDATE USING (has_role(auth.uid(), 'provider') AND EXISTS (SELECT 1 FROM providers WHERE providers.id = signature_requests.provider_id AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())));

-- signature_verifications policies
CREATE POLICY "admin_all_sig_verifications" ON public.signature_verifications FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_view_sig_verifications" ON public.signature_verifications FOR SELECT USING (has_role(auth.uid(), 'sales_rep') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signature_verifications.signature_request_id AND (sr.requested_by = auth.uid() OR p.assigned_sales_rep = auth.uid())));
CREATE POLICY "provider_manage_own_sig_verifications" ON public.signature_verifications FOR ALL USING (has_role(auth.uid(), 'provider') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signature_verifications.signature_request_id AND p.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid()))) WITH CHECK (has_role(auth.uid(), 'provider') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signature_verifications.signature_request_id AND p.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())));

-- signature_audit_log policies
CREATE POLICY "admin_all_audit_log" ON public.signature_audit_log FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_view_audit_log" ON public.signature_audit_log FOR SELECT USING (has_role(auth.uid(), 'sales_rep') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signature_audit_log.signature_request_id AND (sr.requested_by = auth.uid() OR p.assigned_sales_rep = auth.uid())));
CREATE POLICY "provider_view_own_audit_log" ON public.signature_audit_log FOR SELECT USING (has_role(auth.uid(), 'provider') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signature_audit_log.signature_request_id AND p.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())));
CREATE POLICY "provider_insert_audit_log" ON public.signature_audit_log FOR INSERT WITH CHECK (has_role(auth.uid(), 'provider'));

-- signed_documents policies
CREATE POLICY "admin_all_signed_docs" ON public.signed_documents FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_view_signed_docs" ON public.signed_documents FOR SELECT USING (has_role(auth.uid(), 'sales_rep') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signed_documents.signature_request_id AND (sr.requested_by = auth.uid() OR p.assigned_sales_rep = auth.uid())));
CREATE POLICY "provider_view_own_signed_docs" ON public.signed_documents FOR SELECT USING (has_role(auth.uid(), 'provider') AND EXISTS (SELECT 1 FROM signature_requests sr JOIN providers p ON p.id = sr.provider_id WHERE sr.id = signed_documents.signature_request_id AND p.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())));
CREATE POLICY "provider_insert_signed_docs" ON public.signed_documents FOR INSERT WITH CHECK (has_role(auth.uid(), 'provider'));

-- Storage policies for signatures bucket
CREATE POLICY "admin_all_signatures_storage" ON storage.objects FOR ALL USING (bucket_id = 'signatures' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated_upload_signatures" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures' AND auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_signatures" ON storage.objects FOR SELECT USING (bucket_id = 'signatures' AND auth.role() = 'authenticated');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.signature_requests;
