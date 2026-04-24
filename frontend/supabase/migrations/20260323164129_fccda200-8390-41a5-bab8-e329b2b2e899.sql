
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'sales_rep', 'provider');
CREATE TYPE public.provider_status AS ENUM ('prospect', 'in_negotiation', 'contracted', 'active', 'churned', 'suspended');
CREATE TYPE public.contract_type AS ENUM ('standard', 'premium', 'enterprise', 'custom');
CREATE TYPE public.contract_status AS ENUM ('draft', 'pending_review', 'sent', 'negotiating', 'signed', 'active', 'expired', 'terminated');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_on_provider', 'resolved', 'closed');
CREATE TYPE public.ticket_category AS ENUM ('billing', 'technical', 'contract_question', 'onboarding', 'general');
CREATE TYPE public.activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'status_change', 'contract_update');
CREATE TYPE public.pipeline_stage AS ENUM ('lead_identified', 'initial_contact', 'discovery', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- 3. providers table
CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude FLOAT,
  longitude FLOAT,
  provider_type TEXT,
  status provider_status NOT NULL DEFAULT 'prospect',
  notes TEXT,
  assigned_sales_rep UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- 4. contracts table
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  contract_type contract_type NOT NULL DEFAULT 'standard',
  deal_value DECIMAL(12,2),
  start_date DATE,
  end_date DATE,
  renewal_date DATE,
  status contract_status NOT NULL DEFAULT 'draft',
  document_url TEXT,
  terms_summary TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- 5. deal_types table
CREATE TABLE public.deal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  default_terms TEXT,
  commission_rate DECIMAL(5,2),
  color TEXT
);
ALTER TABLE public.deal_types ENABLE ROW LEVEL SECURITY;

-- 6. support_tickets table
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  priority ticket_priority NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  category ticket_category NOT NULL DEFAULT 'general',
  assigned_to UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 7. ticket_messages table
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id),
  message TEXT NOT NULL,
  is_ai_response BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- 8. activities table
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  activity_type activity_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 9. sales_pipeline table
CREATE TABLE public.sales_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  sales_rep_id UUID NOT NULL REFERENCES public.profiles(id),
  stage pipeline_stage NOT NULL DEFAULT 'lead_identified',
  deal_type_id UUID REFERENCES public.deal_types(id),
  estimated_value DECIMAL(12,2),
  probability INTEGER CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_pipeline ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_pipeline_updated_at BEFORE UPDATE ON public.sales_pipeline FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-assign role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'provider'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- =================== RLS POLICIES ===================

-- profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles policies
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- providers policies
CREATE POLICY "Admins can do anything with providers" ON public.providers FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view assigned providers" ON public.providers FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND assigned_sales_rep = auth.uid()
);
CREATE POLICY "Sales reps can insert providers" ON public.providers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'sales_rep'));
CREATE POLICY "Sales reps can update assigned providers" ON public.providers FOR UPDATE USING (
  public.has_role(auth.uid(), 'sales_rep') AND assigned_sales_rep = auth.uid()
);

-- contracts policies
CREATE POLICY "Admins can do anything with contracts" ON public.contracts FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view contracts for assigned providers" ON public.contracts FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = contracts.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "Sales reps can create contracts" ON public.contracts FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'sales_rep')
);
CREATE POLICY "Sales reps can update contracts for assigned providers" ON public.contracts FOR UPDATE USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = contracts.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
-- Provider can view own contracts (linked via a provider record that references their email/profile)
CREATE POLICY "Providers can view own contracts" ON public.contracts FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = contracts.provider_id AND providers.contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
);

-- deal_types policies (readable by all authenticated)
CREATE POLICY "Authenticated users can view deal types" ON public.deal_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage deal types" ON public.deal_types FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- support_tickets policies
CREATE POLICY "Admins can do anything with tickets" ON public.support_tickets FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view tickets for assigned providers" ON public.support_tickets FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = support_tickets.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "Providers can view own tickets" ON public.support_tickets FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = support_tickets.provider_id AND providers.contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
);
CREATE POLICY "Providers can create tickets" ON public.support_tickets FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'provider')
);

-- ticket_messages policies
CREATE POLICY "Can view messages for accessible tickets" ON public.ticket_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id)
);
CREATE POLICY "Authenticated users can insert messages" ON public.ticket_messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid()
);

-- activities policies
CREATE POLICY "Admins can do anything with activities" ON public.activities FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view own activities" ON public.activities FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND user_id = auth.uid()
);
CREATE POLICY "Sales reps can insert activities" ON public.activities FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'sales_rep') AND user_id = auth.uid()
);

-- sales_pipeline policies
CREATE POLICY "Admins can do anything with pipeline" ON public.sales_pipeline FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view own pipeline" ON public.sales_pipeline FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND sales_rep_id = auth.uid()
);
CREATE POLICY "Sales reps can manage own pipeline" ON public.sales_pipeline FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'sales_rep') AND sales_rep_id = auth.uid()
);
CREATE POLICY "Sales reps can update own pipeline" ON public.sales_pipeline FOR UPDATE USING (
  public.has_role(auth.uid(), 'sales_rep') AND sales_rep_id = auth.uid()
);
