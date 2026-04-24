
-- 1. Reference Tables
CREATE TABLE public.specialty_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  description text,
  display_order integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  description text,
  features jsonb,
  display_order integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.geographic_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  rate_multiplier decimal NOT NULL,
  description text,
  example_cities text,
  display_order integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. Rate Tables
CREATE TABLE public.rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.specialty_categories(id),
  tier_id uuid NOT NULL REFERENCES public.membership_tiers(id),
  market_id uuid NOT NULL REFERENCES public.geographic_markets(id),
  monthly_rate decimal NOT NULL,
  is_active boolean DEFAULT true,
  effective_date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now(),
  UNIQUE (category_id, tier_id, market_id, effective_date)
);

CREATE TABLE public.enterprise_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.specialty_categories(id),
  tier_id uuid NOT NULL REFERENCES public.membership_tiers(id),
  monthly_rate decimal NOT NULL,
  min_locations integer DEFAULT 5,
  is_active boolean DEFAULT true,
  effective_date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now(),
  UNIQUE (category_id, tier_id, effective_date)
);

-- 3. Provider Locations
CREATE TABLE public.provider_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  location_name text,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  zip_code text NOT NULL,
  latitude float,
  longitude float,
  market_id uuid REFERENCES public.geographic_markets(id),
  is_primary boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Provider Subscriptions
CREATE TABLE public.provider_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.specialty_categories(id),
  tier_id uuid NOT NULL REFERENCES public.membership_tiers(id),
  is_enterprise boolean DEFAULT false,
  monthly_amount decimal NOT NULL,
  billing_day integer DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','suspended','cancelled','grace_period')),
  started_at timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  next_billing_date date,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  subscription_id uuid NOT NULL REFERENCES public.provider_subscriptions(id),
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  subtotal decimal NOT NULL,
  discount_amount decimal DEFAULT 0,
  discount_reason text,
  tax_amount decimal DEFAULT 0,
  total_amount decimal NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','sent','paid','partial','past_due','void','refunded','write_off')),
  due_date date NOT NULL,
  paid_date date,
  paid_amount decimal DEFAULT 0,
  notes text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Invoice Line Items
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  location_id uuid REFERENCES public.provider_locations(id),
  quantity integer DEFAULT 1,
  unit_price decimal NOT NULL,
  discount_percentage decimal DEFAULT 0,
  line_total decimal NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 7. Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  amount decimal NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('credit_card','ach','wire','check','manual','other')),
  payment_reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded','chargeback')),
  processed_at timestamptz,
  notes text,
  recorded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 8. Billing Credits
CREATE TABLE public.billing_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  amount decimal NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','applied','expired')),
  applied_to_invoice_id uuid REFERENCES public.invoices(id),
  expires_at date,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 9. Billing Alerts
CREATE TABLE public.billing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  subscription_id uuid REFERENCES public.provider_subscriptions(id),
  alert_type text NOT NULL CHECK (alert_type IN ('payment_failed','past_due_7','past_due_14','past_due_30','past_due_60','suspension_warning','suspended','card_expiring','trial_ending','rate_change')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
  acknowledged_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- 10. Add columns to providers
ALTER TABLE public.providers
  ADD COLUMN specialty_category_id uuid REFERENCES public.specialty_categories(id),
  ADD COLUMN membership_tier_id uuid REFERENCES public.membership_tiers(id),
  ADD COLUMN is_enterprise boolean DEFAULT false;

-- 11. Enable RLS on all new tables
ALTER TABLE public.specialty_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geographic_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_alerts ENABLE ROW LEVEL SECURITY;

-- 12. RLS: Reference tables (admin full, sales_rep + provider read)
-- specialty_categories
CREATE POLICY "admin_all_specialty_categories" ON public.specialty_categories FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated_read_specialty_categories" ON public.specialty_categories FOR SELECT TO authenticated USING (true);

-- membership_tiers
CREATE POLICY "admin_all_membership_tiers" ON public.membership_tiers FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated_read_membership_tiers" ON public.membership_tiers FOR SELECT TO authenticated USING (true);

-- geographic_markets
CREATE POLICY "admin_all_geographic_markets" ON public.geographic_markets FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated_read_geographic_markets" ON public.geographic_markets FOR SELECT TO authenticated USING (true);

-- rate_cards
CREATE POLICY "admin_all_rate_cards" ON public.rate_cards FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated_read_rate_cards" ON public.rate_cards FOR SELECT TO authenticated USING (true);

-- enterprise_rates
CREATE POLICY "admin_all_enterprise_rates" ON public.enterprise_rates FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated_read_enterprise_rates" ON public.enterprise_rates FOR SELECT TO authenticated USING (true);

-- 13. RLS: provider_locations
CREATE POLICY "admin_all_provider_locations" ON public.provider_locations FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_read_provider_locations" ON public.provider_locations FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = provider_locations.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "provider_read_own_locations" ON public.provider_locations FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = provider_locations.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 14. RLS: provider_subscriptions
CREATE POLICY "admin_all_provider_subscriptions" ON public.provider_subscriptions FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_read_provider_subscriptions" ON public.provider_subscriptions FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = provider_subscriptions.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "provider_read_own_subscriptions" ON public.provider_subscriptions FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = provider_subscriptions.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 15. RLS: invoices
CREATE POLICY "admin_all_invoices" ON public.invoices FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_read_invoices" ON public.invoices FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = invoices.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "provider_read_own_invoices" ON public.invoices FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = invoices.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 16. RLS: invoice_line_items
CREATE POLICY "admin_all_invoice_line_items" ON public.invoice_line_items FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_read_invoice_line_items" ON public.invoice_line_items FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.invoices JOIN public.providers ON providers.id = invoices.provider_id
    WHERE invoices.id = invoice_line_items.invoice_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "provider_read_own_invoice_line_items" ON public.invoice_line_items FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.invoices JOIN public.providers ON providers.id = invoices.provider_id
    WHERE invoices.id = invoice_line_items.invoice_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 17. RLS: payments
CREATE POLICY "admin_all_payments" ON public.payments FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_read_payments" ON public.payments FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = payments.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "provider_read_own_payments" ON public.payments FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = payments.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 18. RLS: billing_credits
CREATE POLICY "admin_all_billing_credits" ON public.billing_credits FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "provider_read_own_billing_credits" ON public.billing_credits FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = billing_credits.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 19. RLS: billing_alerts
CREATE POLICY "admin_all_billing_alerts" ON public.billing_alerts FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_read_billing_alerts" ON public.billing_alerts FOR SELECT USING (
  public.has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = billing_alerts.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);
CREATE POLICY "provider_read_own_billing_alerts" ON public.billing_alerts FOR SELECT USING (
  public.has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM public.providers WHERE providers.id = billing_alerts.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

-- 20. Seed specialty_categories
INSERT INTO public.specialty_categories (name, short_code, description, display_order) VALUES
  ('Surgical/Procedural', 'CAT_1', 'Orthopedic surgery, neurosurgery, spine surgery, ambulatory surgery centers', 1),
  ('Interventional/Diagnostic', 'CAT_2', 'Pain management injections, MRI/CT imaging, neurology EMG/NCS, independent medical examiners', 2),
  ('Primary Treatment', 'CAT_3', 'Chiropractic, physical therapy, occupational therapy, rehabilitation, urgent care', 3),
  ('Ancillary/Support', 'CAT_4', 'Psychology, psychiatry, pharmacy, durable medical equipment, home health, acupuncture', 4);

-- 21. Seed membership_tiers
INSERT INTO public.membership_tiers (name, short_code, description, features, display_order) VALUES
  ('Associate', 'ASSOCIATE', 'Basic network membership', '["Network directory listing","Platform access","Lien and LOP administration","Standard payoff statement turnaround","Monthly case status reporting","Compliance monitoring and exclusion screening"]', 1),
  ('Member', 'MEMBER', 'Enhanced membership with dedicated support', '["Everything in Associate","Dedicated account manager","Priority payoff turnaround (48hr)","Bi-weekly case reporting","Provider performance dashboard","Dispute resolution priority queue"]', 2),
  ('Premier', 'PREMIER', 'Top-tier membership with full services', '["Everything in Member","Co-branded network marketing materials","Quarterly business review","Advanced analytics and case outcome reporting","Same-day Simply Funding purchase review","New location onboarding support"]', 3);

-- 22. Seed geographic_markets
INSERT INTO public.geographic_markets (name, short_code, rate_multiplier, description, example_cities, display_order) VALUES
  ('Major Metro', 'MAJOR_METRO', 1.5, 'Top 25 US metros by PI case volume', 'Atlanta, Miami, Houston, Dallas, Los Angeles, NYC, Chicago', 1),
  ('Mid-Market', 'MID_MARKET', 1.0, 'Secondary cities 100K-500K population', 'Savannah, Tallahassee, Fort Worth, Austin, Charlotte', 2),
  ('Secondary', 'SECONDARY', 0.75, 'Smaller cities and suburban markets', 'Macon, Albany, Gainesville, Brownsville', 3),
  ('Rural', 'RURAL', 0.5, 'All other markets', NULL, 4);

-- 23. Seed rate_cards (48 rows: 4 categories × 3 tiers × 4 markets)
INSERT INTO public.rate_cards (category_id, tier_id, market_id, monthly_rate)
SELECT sc.id, mt.id, gm.id,
  CASE
    WHEN sc.short_code='CAT_4' AND mt.short_code='ASSOCIATE' AND gm.short_code='RURAL' THEN 29
    WHEN sc.short_code='CAT_4' AND mt.short_code='ASSOCIATE' AND gm.short_code='MID_MARKET' THEN 39
    WHEN sc.short_code='CAT_4' AND mt.short_code='ASSOCIATE' AND gm.short_code='SECONDARY' THEN 49
    WHEN sc.short_code='CAT_4' AND mt.short_code='ASSOCIATE' AND gm.short_code='MAJOR_METRO' THEN 69
    WHEN sc.short_code='CAT_4' AND mt.short_code='MEMBER' AND gm.short_code='RURAL' THEN 49
    WHEN sc.short_code='CAT_4' AND mt.short_code='MEMBER' AND gm.short_code='MID_MARKET' THEN 69
    WHEN sc.short_code='CAT_4' AND mt.short_code='MEMBER' AND gm.short_code='SECONDARY' THEN 85
    WHEN sc.short_code='CAT_4' AND mt.short_code='MEMBER' AND gm.short_code='MAJOR_METRO' THEN 119
    WHEN sc.short_code='CAT_4' AND mt.short_code='PREMIER' AND gm.short_code='RURAL' THEN 75
    WHEN sc.short_code='CAT_4' AND mt.short_code='PREMIER' AND gm.short_code='MID_MARKET' THEN 99
    WHEN sc.short_code='CAT_4' AND mt.short_code='PREMIER' AND gm.short_code='SECONDARY' THEN 125
    WHEN sc.short_code='CAT_4' AND mt.short_code='PREMIER' AND gm.short_code='MAJOR_METRO' THEN 179
    WHEN sc.short_code='CAT_3' AND mt.short_code='ASSOCIATE' AND gm.short_code='RURAL' THEN 39
    WHEN sc.short_code='CAT_3' AND mt.short_code='ASSOCIATE' AND gm.short_code='MID_MARKET' THEN 49
    WHEN sc.short_code='CAT_3' AND mt.short_code='ASSOCIATE' AND gm.short_code='SECONDARY' THEN 59
    WHEN sc.short_code='CAT_3' AND mt.short_code='ASSOCIATE' AND gm.short_code='MAJOR_METRO' THEN 85
    WHEN sc.short_code='CAT_3' AND mt.short_code='MEMBER' AND gm.short_code='RURAL' THEN 69
    WHEN sc.short_code='CAT_3' AND mt.short_code='MEMBER' AND gm.short_code='MID_MARKET' THEN 85
    WHEN sc.short_code='CAT_3' AND mt.short_code='MEMBER' AND gm.short_code='SECONDARY' THEN 99
    WHEN sc.short_code='CAT_3' AND mt.short_code='MEMBER' AND gm.short_code='MAJOR_METRO' THEN 149
    WHEN sc.short_code='CAT_3' AND mt.short_code='PREMIER' AND gm.short_code='RURAL' THEN 99
    WHEN sc.short_code='CAT_3' AND mt.short_code='PREMIER' AND gm.short_code='MID_MARKET' THEN 125
    WHEN sc.short_code='CAT_3' AND mt.short_code='PREMIER' AND gm.short_code='SECONDARY' THEN 149
    WHEN sc.short_code='CAT_3' AND mt.short_code='PREMIER' AND gm.short_code='MAJOR_METRO' THEN 225
    WHEN sc.short_code='CAT_2' AND mt.short_code='ASSOCIATE' AND gm.short_code='RURAL' THEN 75
    WHEN sc.short_code='CAT_2' AND mt.short_code='ASSOCIATE' AND gm.short_code='MID_MARKET' THEN 99
    WHEN sc.short_code='CAT_2' AND mt.short_code='ASSOCIATE' AND gm.short_code='SECONDARY' THEN 119
    WHEN sc.short_code='CAT_2' AND mt.short_code='ASSOCIATE' AND gm.short_code='MAJOR_METRO' THEN 169
    WHEN sc.short_code='CAT_2' AND mt.short_code='MEMBER' AND gm.short_code='RURAL' THEN 129
    WHEN sc.short_code='CAT_2' AND mt.short_code='MEMBER' AND gm.short_code='MID_MARKET' THEN 169
    WHEN sc.short_code='CAT_2' AND mt.short_code='MEMBER' AND gm.short_code='SECONDARY' THEN 199
    WHEN sc.short_code='CAT_2' AND mt.short_code='MEMBER' AND gm.short_code='MAJOR_METRO' THEN 289
    WHEN sc.short_code='CAT_2' AND mt.short_code='PREMIER' AND gm.short_code='RURAL' THEN 195
    WHEN sc.short_code='CAT_2' AND mt.short_code='PREMIER' AND gm.short_code='MID_MARKET' THEN 249
    WHEN sc.short_code='CAT_2' AND mt.short_code='PREMIER' AND gm.short_code='SECONDARY' THEN 299
    WHEN sc.short_code='CAT_2' AND mt.short_code='PREMIER' AND gm.short_code='MAJOR_METRO' THEN 435
    WHEN sc.short_code='CAT_1' AND mt.short_code='ASSOCIATE' AND gm.short_code='RURAL' THEN 129
    WHEN sc.short_code='CAT_1' AND mt.short_code='ASSOCIATE' AND gm.short_code='MID_MARKET' THEN 169
    WHEN sc.short_code='CAT_1' AND mt.short_code='ASSOCIATE' AND gm.short_code='SECONDARY' THEN 209
    WHEN sc.short_code='CAT_1' AND mt.short_code='ASSOCIATE' AND gm.short_code='MAJOR_METRO' THEN 295
    WHEN sc.short_code='CAT_1' AND mt.short_code='MEMBER' AND gm.short_code='RURAL' THEN 225
    WHEN sc.short_code='CAT_1' AND mt.short_code='MEMBER' AND gm.short_code='MID_MARKET' THEN 295
    WHEN sc.short_code='CAT_1' AND mt.short_code='MEMBER' AND gm.short_code='SECONDARY' THEN 365
    WHEN sc.short_code='CAT_1' AND mt.short_code='MEMBER' AND gm.short_code='MAJOR_METRO' THEN 515
    WHEN sc.short_code='CAT_1' AND mt.short_code='PREMIER' AND gm.short_code='RURAL' THEN 335
    WHEN sc.short_code='CAT_1' AND mt.short_code='PREMIER' AND gm.short_code='MID_MARKET' THEN 440
    WHEN sc.short_code='CAT_1' AND mt.short_code='PREMIER' AND gm.short_code='SECONDARY' THEN 549
    WHEN sc.short_code='CAT_1' AND mt.short_code='PREMIER' AND gm.short_code='MAJOR_METRO' THEN 775
  END
FROM public.specialty_categories sc
CROSS JOIN public.membership_tiers mt
CROSS JOIN public.geographic_markets gm;

-- 24. Seed enterprise_rates (12 rows: 4 categories × 3 tiers)
INSERT INTO public.enterprise_rates (category_id, tier_id, monthly_rate)
SELECT sc.id, mt.id,
  CASE
    WHEN sc.short_code='CAT_4' AND mt.short_code='ASSOCIATE' THEN 199
    WHEN sc.short_code='CAT_4' AND mt.short_code='MEMBER' THEN 249
    WHEN sc.short_code='CAT_4' AND mt.short_code='PREMIER' THEN 349
    WHEN sc.short_code='CAT_3' AND mt.short_code='ASSOCIATE' THEN 299
    WHEN sc.short_code='CAT_3' AND mt.short_code='MEMBER' THEN 399
    WHEN sc.short_code='CAT_3' AND mt.short_code='PREMIER' THEN 549
    WHEN sc.short_code='CAT_2' AND mt.short_code='ASSOCIATE' THEN 599
    WHEN sc.short_code='CAT_2' AND mt.short_code='MEMBER' THEN 799
    WHEN sc.short_code='CAT_2' AND mt.short_code='PREMIER' THEN 1099
    WHEN sc.short_code='CAT_1' AND mt.short_code='ASSOCIATE' THEN 949
    WHEN sc.short_code='CAT_1' AND mt.short_code='MEMBER' THEN 1299
    WHEN sc.short_code='CAT_1' AND mt.short_code='PREMIER' THEN 1799
  END
FROM public.specialty_categories sc
CROSS JOIN public.membership_tiers mt;
