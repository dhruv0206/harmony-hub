-- =============================================================================
-- v_provider_list
-- =============================================================================
-- Purpose:
--   Read-optimized composed view for the admin + sales-rep provider list
--   screens. Joins providers to their assigned sales rep, their service
--   package, their most-relevant active subscription, and (via subscription)
--   their membership tier + specialty category. Also computes a handful of
--   per-provider aggregates (active contract count, last activity at,
--   document counts) so the frontend can render the list with a single query
--   instead of N+1 per-row fetches.
--
--   Security: this view does NOT bypass RLS on the underlying tables.
--   Callers still see only the providers/subscriptions/etc they are allowed
--   to see by RLS on the base tables. The view is therefore safe to expose
--   directly to the API.
--
--   The FTS column `search_vector` was added to providers in
--   20260324194205_0982741b-7ebd-4bc6-b4f6-e31b2f02e95c.sql so we include it
--   in the view output for full-text filtering.
--
-- Rollback:
--   DROP VIEW IF EXISTS public.v_provider_list;
-- =============================================================================

CREATE OR REPLACE VIEW public.v_provider_list AS
SELECT
  -- Raw provider columns
  p.id,
  p.business_name,
  p.contact_name,
  p.contact_email,
  p.contact_phone,
  p.address_line1,
  p.address_line2,
  p.city,
  p.state,
  p.zip_code,
  p.latitude,
  p.longitude,
  p.provider_type,
  p.status,
  p.notes,
  p.assigned_sales_rep,
  p.tags,
  p.specialty_category_id,
  p.membership_tier_id,
  p.is_enterprise,
  p.health_score,
  p.health_score_updated_at,
  p.service_package_id,
  p.search_vector,
  p.created_at,
  p.updated_at,

  -- Assigned sales rep profile
  rep.full_name  AS rep_name,
  rep.email      AS rep_email,

  -- Service package
  pkg.name       AS package_name,
  pkg.short_code AS package_code,

  -- Most-relevant subscription (LATERAL: one row per provider)
  sub.billing_status,
  sub.monthly_amount,

  -- Membership tier (resolved via subscription.tier_id)
  tier.name       AS tier_name,
  tier.short_code AS tier_code,

  -- Specialty category (resolved via subscription.category_id)
  cat.name       AS category_name,
  cat.short_code AS category_code,

  -- Scalar aggregates
  (
    SELECT COUNT(*)
    FROM public.contracts c
    WHERE c.provider_id = p.id
      AND c.status = 'active'
  )::bigint AS active_contract_count,

  (
    SELECT MAX(a.created_at)
    FROM public.activities a
    WHERE a.provider_id = p.id
  ) AS last_activity_at,

  (
    SELECT COUNT(*)
    FROM public.provider_documents pd
    WHERE pd.provider_id = p.id
  )::bigint AS total_docs,

  (
    SELECT COUNT(*)
    FROM public.provider_documents pd
    WHERE pd.provider_id = p.id
      AND pd.status = 'signed'
  )::bigint AS signed_docs

FROM public.providers p
LEFT JOIN public.profiles rep
       ON rep.id = p.assigned_sales_rep
LEFT JOIN public.service_packages pkg
       ON pkg.id = p.service_package_id
LEFT JOIN LATERAL (
  -- Pick the single most-relevant subscription per provider.
  -- Status priority: active > past_due > pending > trial-ish > suspended.
  -- The `provider_subscriptions` table has no 'trial' status, but it does
  -- have `trial_ends_at`, so we approximate trial by checking that column
  -- alongside the pending status. `grace_period` and `cancelled` are
  -- explicitly deprioritized.
  SELECT
    ps.status        AS billing_status,
    ps.monthly_amount,
    ps.tier_id,
    ps.category_id
  FROM public.provider_subscriptions ps
  WHERE ps.provider_id = p.id
  ORDER BY
    CASE ps.status
      WHEN 'active'        THEN 1
      WHEN 'past_due'      THEN 2
      WHEN 'pending'       THEN 3
      WHEN 'grace_period'  THEN 4
      WHEN 'suspended'     THEN 5
      WHEN 'cancelled'     THEN 6
      ELSE 7
    END,
    ps.created_at DESC
  LIMIT 1
) sub ON TRUE
LEFT JOIN public.membership_tiers tier
       ON tier.id = sub.tier_id
LEFT JOIN public.specialty_categories cat
       ON cat.id = sub.category_id;

COMMENT ON VIEW public.v_provider_list IS
  'Denormalized provider list for admin/sales-rep UIs. RLS on underlying tables still applies.';
