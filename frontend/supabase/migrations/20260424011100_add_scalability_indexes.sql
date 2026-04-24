-- Adds scalability indexes across all major tables to support common
-- frontend query patterns (filtering by assigned sales rep, status, state,
-- joins by provider_id / law_firm_id, pagination by created_at DESC, etc).
--
-- All statements use CREATE INDEX IF NOT EXISTS so this migration is
-- idempotent and safe to re-run. No data is modified.
--
-- Rollback: drop each index by name, e.g.
--   DROP INDEX IF EXISTS public.idx_providers_assigned_sales_rep;
--   DROP INDEX IF EXISTS public.idx_providers_status;
--   ... (see index names below).

-- =============================================================================
-- providers
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_providers_assigned_sales_rep
  ON public.providers (assigned_sales_rep);

CREATE INDEX IF NOT EXISTS idx_providers_status
  ON public.providers (status);

CREATE INDEX IF NOT EXISTS idx_providers_state
  ON public.providers (state);

CREATE INDEX IF NOT EXISTS idx_providers_created_at
  ON public.providers (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_providers_service_package_id
  ON public.providers (service_package_id);

-- Partial index for geospatial lookups; only rows with coordinates are indexed.
CREATE INDEX IF NOT EXISTS idx_providers_lat_lng
  ON public.providers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- =============================================================================
-- activities
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_activities_provider_created
  ON public.activities (provider_id, created_at DESC);

-- =============================================================================
-- provider_subscriptions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_provider_status
  ON public.provider_subscriptions (provider_id, status);

-- =============================================================================
-- provider_documents
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_provider_documents_provider_status
  ON public.provider_documents (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_provider_documents_provider_signing_order
  ON public.provider_documents (provider_id, signing_order);

-- =============================================================================
-- contracts
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_contracts_provider_status
  ON public.contracts (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON public.contracts (status);

CREATE INDEX IF NOT EXISTS idx_contracts_renewal_date
  ON public.contracts (renewal_date);

-- =============================================================================
-- notifications
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- `read` column exists (boolean, default false) per the notifications schema.
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, read);

-- =============================================================================
-- law_firms
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_law_firms_assigned_sales_rep
  ON public.law_firms (assigned_sales_rep);

CREATE INDEX IF NOT EXISTS idx_law_firms_status
  ON public.law_firms (status);

CREATE INDEX IF NOT EXISTS idx_law_firms_state
  ON public.law_firms (state);

CREATE INDEX IF NOT EXISTS idx_law_firms_created_at
  ON public.law_firms (created_at DESC);

-- =============================================================================
-- law_firm_subscriptions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_law_firm_subscriptions_firm_status
  ON public.law_firm_subscriptions (law_firm_id, status);

-- =============================================================================
-- law_firm_documents
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_law_firm_documents_firm_status
  ON public.law_firm_documents (law_firm_id, status);

-- =============================================================================
-- sales_pipeline
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_rep_stage
  ON public.sales_pipeline (sales_rep_id, stage);

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_expected_close_date
  ON public.sales_pipeline (expected_close_date);

-- =============================================================================
-- signature_requests
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_signature_requests_status
  ON public.signature_requests (status);

CREATE INDEX IF NOT EXISTS idx_signature_requests_expires_at
  ON public.signature_requests (expires_at);

CREATE INDEX IF NOT EXISTS idx_signature_requests_provider_id
  ON public.signature_requests (provider_id);

-- =============================================================================
-- invoices
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_provider_status
  ON public.invoices (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON public.invoices (due_date);

-- =============================================================================
-- payments
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_payments_provider_status
  ON public.payments (provider_id, status);

-- =============================================================================
-- support_tickets
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_support_tickets_provider_status
  ON public.support_tickets (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_status
  ON public.support_tickets (assigned_to, status);

-- =============================================================================
-- ticket_messages
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id
  ON public.ticket_messages (ticket_id);

-- =============================================================================
-- scraped_leads
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_scraped_leads_status
  ON public.scraped_leads (status);

CREATE INDEX IF NOT EXISTS idx_scraped_leads_created_at
  ON public.scraped_leads (created_at DESC);

-- =============================================================================
-- campaigns
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON public.campaigns (status);

CREATE INDEX IF NOT EXISTS idx_campaigns_created_at
  ON public.campaigns (created_at DESC);

-- =============================================================================
-- audit_log
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type_id
  ON public.audit_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON public.audit_log (actor_id, created_at DESC);
