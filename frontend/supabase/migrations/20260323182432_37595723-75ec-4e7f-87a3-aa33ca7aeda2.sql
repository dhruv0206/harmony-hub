
-- ============================================================
-- DROP ALL EXISTING RLS POLICIES AND RECREATE PROPERLY
-- ============================================================

-- ==================== PROVIDERS ====================
DROP POLICY IF EXISTS "Admins can do anything with providers" ON public.providers;
DROP POLICY IF EXISTS "Sales reps can insert providers" ON public.providers;
DROP POLICY IF EXISTS "Sales reps can update assigned providers" ON public.providers;
DROP POLICY IF EXISTS "Sales reps can view assigned providers" ON public.providers;
DROP POLICY IF EXISTS "Providers can view own provider" ON public.providers;
DROP POLICY IF EXISTS "Providers can update own provider" ON public.providers;

CREATE POLICY "admin_all_providers" ON public.providers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_providers" ON public.providers FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND (
      assigned_sales_rep = auth.uid() OR status = 'prospect'
    )
  );

CREATE POLICY "sales_rep_insert_providers" ON public.providers FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'sales_rep'));

CREATE POLICY "sales_rep_update_providers" ON public.providers FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND (
      assigned_sales_rep = auth.uid() OR status = 'prospect'
    )
  );

CREATE POLICY "provider_select_own" ON public.providers FOR SELECT
  USING (
    public.has_role(auth.uid(), 'provider') AND
    contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "provider_update_own" ON public.providers FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'provider') AND
    contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- ==================== CONTRACTS ====================
DROP POLICY IF EXISTS "Admins can do anything with contracts" ON public.contracts;
DROP POLICY IF EXISTS "Sales reps can create contracts" ON public.contracts;
DROP POLICY IF EXISTS "Sales reps can update contracts for assigned providers" ON public.contracts;
DROP POLICY IF EXISTS "Sales reps can view contracts for assigned providers" ON public.contracts;
DROP POLICY IF EXISTS "Providers can view own contracts" ON public.contracts;

CREATE POLICY "admin_all_contracts" ON public.contracts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_contracts" ON public.contracts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = contracts.provider_id
        AND (providers.assigned_sales_rep = auth.uid() OR providers.status = 'prospect')
    )
  );

CREATE POLICY "sales_rep_insert_contracts" ON public.contracts FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'sales_rep'));

CREATE POLICY "sales_rep_update_contracts" ON public.contracts FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = contracts.provider_id
        AND providers.assigned_sales_rep = auth.uid()
    )
  );

CREATE POLICY "provider_select_own_contracts" ON public.contracts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'provider') AND
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = contracts.provider_id
        AND providers.contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ==================== SALES_PIPELINE ====================
DROP POLICY IF EXISTS "Admins can do anything with pipeline" ON public.sales_pipeline;
DROP POLICY IF EXISTS "Sales reps can manage own pipeline" ON public.sales_pipeline;
DROP POLICY IF EXISTS "Sales reps can update own pipeline" ON public.sales_pipeline;
DROP POLICY IF EXISTS "Sales reps can view own pipeline" ON public.sales_pipeline;

CREATE POLICY "admin_all_pipeline" ON public.sales_pipeline FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_pipeline" ON public.sales_pipeline FOR SELECT
  USING (public.has_role(auth.uid(), 'sales_rep') AND sales_rep_id = auth.uid());

CREATE POLICY "sales_rep_insert_pipeline" ON public.sales_pipeline FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'sales_rep') AND sales_rep_id = auth.uid());

CREATE POLICY "sales_rep_update_pipeline" ON public.sales_pipeline FOR UPDATE
  USING (public.has_role(auth.uid(), 'sales_rep') AND sales_rep_id = auth.uid());

-- ==================== SUPPORT_TICKETS ====================
DROP POLICY IF EXISTS "Admins can do anything with tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Providers can create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Providers can view own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Sales reps can view tickets for assigned providers" ON public.support_tickets;

CREATE POLICY "admin_all_tickets" ON public.support_tickets FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_tickets" ON public.support_tickets FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND (
      assigned_to = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.providers
        WHERE providers.id = support_tickets.provider_id
          AND providers.assigned_sales_rep = auth.uid()
      )
    )
  );

CREATE POLICY "sales_rep_update_tickets" ON public.support_tickets FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND (
      assigned_to = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.providers
        WHERE providers.id = support_tickets.provider_id
          AND providers.assigned_sales_rep = auth.uid()
      )
    )
  );

CREATE POLICY "provider_insert_tickets" ON public.support_tickets FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'provider') AND
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = support_tickets.provider_id
        AND providers.contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "provider_select_own_tickets" ON public.support_tickets FOR SELECT
  USING (
    public.has_role(auth.uid(), 'provider') AND
    EXISTS (
      SELECT 1 FROM public.providers
      WHERE providers.id = support_tickets.provider_id
        AND providers.contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ==================== TICKET_MESSAGES ====================
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.ticket_messages;
DROP POLICY IF EXISTS "Can view messages for accessible tickets" ON public.ticket_messages;

CREATE POLICY "select_messages_for_accessible_tickets" ON public.ticket_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
    )
  );

CREATE POLICY "insert_messages_authenticated" ON public.ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (sender_id = auth.uid() OR sender_id IS NULL) AND
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
    )
  );

-- ==================== ACTIVITIES ====================
DROP POLICY IF EXISTS "Admins can do anything with activities" ON public.activities;
DROP POLICY IF EXISTS "Sales reps can insert activities" ON public.activities;
DROP POLICY IF EXISTS "Sales reps can view own activities" ON public.activities;

CREATE POLICY "admin_all_activities" ON public.activities FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_insert_activities" ON public.activities FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'sales_rep') AND user_id = auth.uid()
  );

CREATE POLICY "sales_rep_select_activities" ON public.activities FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_rep') AND (
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.providers
        WHERE providers.id = activities.provider_id
          AND providers.assigned_sales_rep = auth.uid()
      )
    )
  );

-- ==================== PROFILES ====================
-- Keep existing policies (already correct)

-- ==================== USER_ROLES ====================
-- Keep existing policies (already correct)

-- ==================== ONBOARDING_CHECKLISTS ====================
-- Keep existing policies (already correct)

-- ==================== ONBOARDING_STEPS ====================
-- Keep existing policies (already correct)

-- ==================== DEAL_TYPES ====================
-- Keep existing policies (already correct)

-- ==================== COMPANY_SETTINGS ====================
-- Keep existing policies (already correct)

-- ==================== NOTIFICATIONS ====================
-- Keep existing policies (already correct)
