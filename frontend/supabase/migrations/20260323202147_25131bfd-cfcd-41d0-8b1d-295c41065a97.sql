
-- Table: document_templates
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  description text,
  document_type text NOT NULL CHECK (document_type IN ('agreement', 'addendum', 'exhibit', 'application', 'baa', 'acknowledgment')),
  file_url text,
  file_type text CHECK (file_type IN ('pdf', 'docx')) DEFAULT 'pdf',
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  requires_witness boolean DEFAULT false,
  requires_notary boolean DEFAULT false,
  signing_instructions text,
  display_order integer DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: service_packages
CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  short_code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Table: package_documents
CREATE TABLE public.package_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  signing_order integer NOT NULL,
  is_required boolean DEFAULT true,
  condition_description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (package_id, template_id)
);

-- Table: provider_documents
CREATE TABLE public.provider_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.document_templates(id),
  package_id uuid REFERENCES public.service_packages(id),
  file_url text,
  status text CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'voided')) DEFAULT 'pending',
  signing_order integer,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signature_request_id uuid REFERENCES public.signature_requests(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Updated_at triggers
CREATE TRIGGER update_document_templates_updated_at BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_documents_updated_at BEFORE UPDATE ON public.provider_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_documents ENABLE ROW LEVEL SECURITY;

-- RLS: document_templates
CREATE POLICY "admin_all_document_templates" ON public.document_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_document_templates" ON public.document_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'sales_rep'));

CREATE POLICY "provider_select_active_document_templates" ON public.document_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'provider') AND is_active = true);

-- RLS: service_packages
CREATE POLICY "admin_all_service_packages" ON public.service_packages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_service_packages" ON public.service_packages FOR SELECT
  USING (public.has_role(auth.uid(), 'sales_rep'));

CREATE POLICY "provider_select_active_service_packages" ON public.service_packages FOR SELECT
  USING (public.has_role(auth.uid(), 'provider') AND is_active = true);

-- RLS: package_documents
CREATE POLICY "admin_all_package_documents" ON public.package_documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_package_documents" ON public.package_documents FOR SELECT
  USING (public.has_role(auth.uid(), 'sales_rep'));

CREATE POLICY "provider_select_package_documents" ON public.package_documents FOR SELECT
  USING (public.has_role(auth.uid(), 'provider'));

-- RLS: provider_documents
CREATE POLICY "admin_all_provider_documents" ON public.provider_documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_provider_documents" ON public.provider_documents FOR SELECT
  USING (public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers
    WHERE providers.id = provider_documents.provider_id
      AND providers.assigned_sales_rep = auth.uid()
  ));

CREATE POLICY "sales_rep_update_provider_documents" ON public.provider_documents FOR UPDATE
  USING (public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers
    WHERE providers.id = provider_documents.provider_id
      AND providers.assigned_sales_rep = auth.uid()
  ));

CREATE POLICY "provider_select_own_documents" ON public.provider_documents FOR SELECT
  USING (public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers
    WHERE providers.id = provider_documents.provider_id
      AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
  ));
