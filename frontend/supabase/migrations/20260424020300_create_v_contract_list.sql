-- =============================================================================
-- v_contract_list
-- =============================================================================
-- Purpose:
--   Read-optimized view for the contracts list screen. Joins contracts to
--   their provider (for business name) and to the creator profile (for
--   creator_name). Includes signature progress aggregates (total signature
--   requests + signed count) and a computed `days_until_renewal` that the
--   frontend can use to render the renewal badge.
--
--   RLS on contracts/providers still applies.
--
-- Rollback:
--   DROP VIEW IF EXISTS public.v_contract_list;
-- =============================================================================

CREATE OR REPLACE VIEW public.v_contract_list AS
SELECT
  -- Raw contract columns
  c.id,
  c.provider_id,
  c.contract_type,
  c.deal_value,
  c.start_date,
  c.end_date,
  c.renewal_date,
  c.status,
  c.document_url,
  c.terms_summary,
  c.created_by,
  c.renewal_status,
  c.auto_renew,
  c.renewal_notice_days,
  c.created_at,
  c.updated_at,

  -- Provider (business name)
  p.business_name   AS provider_business_name,
  p.contact_email   AS provider_contact_email,
  p.status          AS provider_status,
  p.assigned_sales_rep,

  -- Creator profile
  creator.full_name AS creator_name,
  creator.email     AS creator_email,

  -- Signature progress (per-contract)
  (
    SELECT COUNT(*)
    FROM public.signature_requests sr
    WHERE sr.contract_id = c.id
  )::bigint AS signature_request_count,

  (
    SELECT COUNT(*)
    FROM public.signature_requests sr
    WHERE sr.contract_id = c.id
      AND sr.status = 'signed'
  )::bigint AS signature_signed_count,

  -- days_until_renewal: nullable; positive means in future, negative means past.
  CASE
    WHEN c.renewal_date IS NULL THEN NULL
    ELSE (c.renewal_date - CURRENT_DATE)
  END AS days_until_renewal

FROM public.contracts c
LEFT JOIN public.providers p
       ON p.id = c.provider_id
LEFT JOIN public.profiles creator
       ON creator.id = c.created_by;

COMMENT ON VIEW public.v_contract_list IS
  'Denormalized contract list with provider name, creator, and signature progress. RLS on base tables still applies.';
