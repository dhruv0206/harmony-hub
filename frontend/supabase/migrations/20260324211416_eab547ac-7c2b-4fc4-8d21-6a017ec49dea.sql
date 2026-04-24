
-- Create law_firms table
CREATE TABLE public.law_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name text NOT NULL,
  dba_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  latitude float,
  longitude float,
  website text,
  firm_size text,
  practice_areas text[],
  states_licensed text[],
  bar_numbers jsonb,
  status text NOT NULL DEFAULT 'prospect',
  assigned_sales_rep uuid REFERENCES public.profiles(id),
  source text,
  notes text,
  health_score integer,
  service_package_id uuid REFERENCES public.service_packages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.law_firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_law_firms" ON public.law_firms FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_law_firms" ON public.law_firms FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_rep') AND assigned_sales_rep = auth.uid());

CREATE POLICY "sales_rep_update_law_firms" ON public.law_firms FOR UPDATE TO public
  USING (has_role(auth.uid(), 'sales_rep') AND assigned_sales_rep = auth.uid());

-- Create law_firm_contacts table
CREATE TABLE public.law_firm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  is_signer boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.law_firm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_law_firm_contacts" ON public.law_firm_contacts FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_manage_law_firm_contacts" ON public.law_firm_contacts FOR ALL TO public
  USING (has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.law_firms WHERE law_firms.id = law_firm_contacts.law_firm_id AND law_firms.assigned_sales_rep = auth.uid()
  ))
  WITH CHECK (has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.law_firms WHERE law_firms.id = law_firm_contacts.law_firm_id AND law_firms.assigned_sales_rep = auth.uid()
  ));

-- Create law_firm_documents table
CREATE TABLE public.law_firm_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.document_templates(id),
  file_url text,
  status text NOT NULL DEFAULT 'pending',
  signing_order integer,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signature_request_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.law_firm_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_law_firm_documents" ON public.law_firm_documents FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_manage_law_firm_documents" ON public.law_firm_documents FOR ALL TO public
  USING (has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.law_firms WHERE law_firms.id = law_firm_documents.law_firm_id AND law_firms.assigned_sales_rep = auth.uid()
  ))
  WITH CHECK (has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.law_firms WHERE law_firms.id = law_firm_documents.law_firm_id AND law_firms.assigned_sales_rep = auth.uid()
  ));

-- Create law_firm_subscriptions table
CREATE TABLE public.law_firm_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  tier_id uuid REFERENCES public.membership_tiers(id),
  monthly_amount numeric NOT NULL,
  billing_day integer DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  cancelled_at timestamptz,
  next_billing_date date,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.law_firm_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_law_firm_subscriptions" ON public.law_firm_subscriptions FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create law_firm_invoices table
CREATE TABLE public.law_firm_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id),
  subscription_id uuid REFERENCES public.law_firm_subscriptions(id),
  billing_period_start date,
  billing_period_end date,
  total_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  paid_date date,
  paid_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.law_firm_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_law_firm_invoices" ON public.law_firm_invoices FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create law_firm_activities table
CREATE TABLE public.law_firm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id),
  user_id uuid REFERENCES public.profiles(id),
  activity_type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.law_firm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_law_firm_activities" ON public.law_firm_activities FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_manage_law_firm_activities" ON public.law_firm_activities FOR ALL TO public
  USING (has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.law_firms WHERE law_firms.id = law_firm_activities.law_firm_id AND law_firms.assigned_sales_rep = auth.uid()
  ))
  WITH CHECK (has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.law_firms WHERE law_firms.id = law_firm_activities.law_firm_id AND law_firms.assigned_sales_rep = auth.uid()
  ));

-- Updated_at triggers
CREATE TRIGGER update_law_firms_updated_at BEFORE UPDATE ON public.law_firms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_law_firm_documents_updated_at BEFORE UPDATE ON public.law_firm_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_law_firm_subscriptions_updated_at BEFORE UPDATE ON public.law_firm_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_law_firm_invoices_updated_at BEFORE UPDATE ON public.law_firm_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
