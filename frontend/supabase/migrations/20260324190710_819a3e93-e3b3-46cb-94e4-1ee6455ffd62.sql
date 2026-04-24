
-- ══════════════════════════════════════
-- PERFORMANCE INDEXES
-- ══════════════════════════════════════

-- PROVIDERS
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status);
CREATE INDEX IF NOT EXISTS idx_providers_state ON providers(state);
CREATE INDEX IF NOT EXISTS idx_providers_assigned_rep ON providers(assigned_sales_rep);
CREATE INDEX IF NOT EXISTS idx_providers_category ON providers(specialty_category_id);
CREATE INDEX IF NOT EXISTS idx_providers_tier ON providers(membership_tier_id);
CREATE INDEX IF NOT EXISTS idx_providers_created ON providers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_providers_health ON providers(health_score);
CREATE INDEX IF NOT EXISTS idx_providers_status_state ON providers(status, state);

-- PROVIDER DOCUMENTS
CREATE INDEX IF NOT EXISTS idx_provider_docs_provider ON provider_documents(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_docs_status ON provider_documents(status);
CREATE INDEX IF NOT EXISTS idx_provider_docs_template ON provider_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_provider_docs_provider_status ON provider_documents(provider_id, status);

-- SIGNATURE REQUESTS
CREATE INDEX IF NOT EXISTS idx_sig_requests_status ON signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_sig_requests_provider ON signature_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_sig_requests_created ON signature_requests(created_at DESC);

-- INVOICES
CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON invoices(billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);

-- PROVIDER SUBSCRIPTIONS
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON provider_subscriptions(provider_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON provider_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON provider_subscriptions(next_billing_date);

-- PAYMENTS
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ACTIVITIES
CREATE INDEX IF NOT EXISTS idx_activities_provider ON activities(provider_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);

-- SUPPORT TICKETS
CREATE INDEX IF NOT EXISTS idx_tickets_provider ON support_tickets(provider_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON support_tickets(created_at DESC);

-- TICKET MESSAGES
CREATE INDEX IF NOT EXISTS idx_ticket_msgs_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_msgs_created ON ticket_messages(created_at);

-- SALES PIPELINE
CREATE INDEX IF NOT EXISTS idx_pipeline_provider ON sales_pipeline(provider_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_rep ON sales_pipeline(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON sales_pipeline(stage);

-- CAMPAIGNS & LEADS
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_stage ON campaign_leads(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_scraped_leads_job ON scraped_leads(scrape_job_id);
CREATE INDEX IF NOT EXISTS idx_scraped_leads_status ON scraped_leads(status);
CREATE INDEX IF NOT EXISTS idx_scraped_leads_state ON scraped_leads(state);

-- ONBOARDING
CREATE INDEX IF NOT EXISTS idx_onboarding_provider ON onboarding_workflows(provider_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_workflows(status);

-- CALENDAR
CREATE INDEX IF NOT EXISTS idx_calendar_host ON calendar_events(host_id);
CREATE INDEX IF NOT EXISTS idx_calendar_provider ON calendar_events(provider_id);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_start_end ON calendar_events(start_time, end_time);

-- NOTIFICATIONS
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- BILLING ALERTS
CREATE INDEX IF NOT EXISTS idx_billing_alerts_provider ON billing_alerts(provider_id);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_status ON billing_alerts(status);

-- RATE CARDS
CREATE INDEX IF NOT EXISTS idx_rate_cards_lookup ON rate_cards(category_id, tier_id, market_id, is_active);

-- TEMPLATE SIGNING FIELDS
CREATE INDEX IF NOT EXISTS idx_signing_fields_template ON template_signing_fields(template_id);

-- CONTRACT REVIEW
CREATE INDEX IF NOT EXISTS idx_review_sessions_contract ON contract_review_sessions(contract_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_provider ON contract_review_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_review_msgs_session ON contract_review_messages(session_id);

-- CONTRACTS
CREATE INDEX IF NOT EXISTS idx_contracts_provider ON contracts(provider_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- CHURN PREDICTIONS
CREATE INDEX IF NOT EXISTS idx_churn_provider ON churn_predictions(provider_id);
CREATE INDEX IF NOT EXISTS idx_churn_status ON churn_predictions(status);

-- HEALTH SCORES
CREATE INDEX IF NOT EXISTS idx_health_scores_provider ON provider_health_scores(provider_id);
CREATE INDEX IF NOT EXISTS idx_health_scores_calculated ON provider_health_scores(calculated_at DESC);

-- TRAINING PROGRESS
CREATE INDEX IF NOT EXISTS idx_video_progress_provider ON provider_video_progress(provider_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_provider ON provider_training_progress(provider_id);

-- ══════════════════════════════════════
-- DATABASE FUNCTIONS for aggregations
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_provider_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status::text, COUNT(*) FROM providers GROUP BY status;
$$;

CREATE OR REPLACE FUNCTION public.get_total_mrr()
RETURNS TABLE(total_mrr numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(monthly_amount), 0) as total_mrr
  FROM provider_subscriptions WHERE status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.get_document_stats()
RETURNS TABLE(pending bigint, sent bigint, signed bigint, fully_executed bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status IN ('signed', 'provider_signed')),
    COUNT(*) FILTER (WHERE status = 'fully_executed')
  FROM provider_documents;
$$;

CREATE OR REPLACE FUNCTION public.get_billing_aging()
RETURNS TABLE(current_amount numeric, days_7 numeric, days_14 numeric, days_30 numeric, days_60 numeric, days_60_plus numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)) FILTER (WHERE due_date >= CURRENT_DATE), 0),
    COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 7), 0),
    COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)) FILTER (WHERE due_date < CURRENT_DATE - 7 AND due_date >= CURRENT_DATE - 14), 0),
    COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)) FILTER (WHERE due_date < CURRENT_DATE - 14 AND due_date >= CURRENT_DATE - 30), 0),
    COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0),
    COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)) FILTER (WHERE due_date < CURRENT_DATE - 60), 0)
  FROM invoices WHERE status IN ('sent', 'past_due', 'partial');
$$;

-- ══════════════════════════════════════
-- DATA ARCHIVAL SETUP
-- ══════════════════════════════════════

ALTER TABLE activities ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_activities_archived ON activities(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_notifications_archived ON notifications(archived) WHERE archived = false;

CREATE OR REPLACE VIEW recent_activities AS
SELECT * FROM activities WHERE archived = false ORDER BY created_at DESC;
