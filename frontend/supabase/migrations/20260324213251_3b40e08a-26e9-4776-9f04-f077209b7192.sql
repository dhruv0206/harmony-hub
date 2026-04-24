
-- Add 'law_firm' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'law_firm';

-- Create law_firm_profiles linking table
CREATE TABLE public.law_firm_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  law_firm_id uuid REFERENCES public.law_firms(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.law_firm_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own law_firm_profile"
  ON public.law_firm_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage law_firm_profiles"
  ON public.law_firm_profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: law firm users can read their own law firm
CREATE POLICY "Law firm users can read own firm"
  ON public.law_firms FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_rep')
  );

-- Law firm users can update own firm
CREATE POLICY "Law firm users can update own firm"
  ON public.law_firms FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
  );

-- Law firm contacts: law firm users can read/manage their own contacts
CREATE POLICY "Law firm users can read own contacts"
  ON public.law_firm_contacts FOR SELECT
  TO authenticated
  USING (
    law_firm_id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_rep')
  );

CREATE POLICY "Law firm users can manage own contacts"
  ON public.law_firm_contacts FOR ALL
  TO authenticated
  USING (
    law_firm_id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
  );

-- Law firm documents: read own
CREATE POLICY "Law firm users can read own documents"
  ON public.law_firm_documents FOR SELECT
  TO authenticated
  USING (
    law_firm_id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_rep')
  );

-- Law firm subscriptions: read own
CREATE POLICY "Law firm users can read own subscriptions"
  ON public.law_firm_subscriptions FOR SELECT
  TO authenticated
  USING (
    law_firm_id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Law firm invoices: read own
CREATE POLICY "Law firm users can read own invoices"
  ON public.law_firm_invoices FOR SELECT
  TO authenticated
  USING (
    law_firm_id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Law firm activities: read own
CREATE POLICY "Law firm users can read own activities"
  ON public.law_firm_activities FOR SELECT
  TO authenticated
  USING (
    law_firm_id IN (SELECT law_firm_id FROM public.law_firm_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_rep')
  );
