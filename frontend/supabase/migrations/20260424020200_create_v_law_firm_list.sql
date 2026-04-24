-- =============================================================================
-- v_law_firm_list
-- =============================================================================
-- Purpose:
--   Mirror of v_provider_list for law firms. Joins law_firms to their
--   assigned sales rep, their service package, and (via LATERAL) their
--   most-relevant law_firm_subscription. Resolves membership tier from the
--   subscription. Aggregates doc counts from law_firm_documents and
--   last activity timestamp from law_firm_activities.
--
--   NOTE: `contracts` does NOT currently have a law_firm_id column (see the
--   original schema migration). Until that FK is added, active_contract_count
--   is always 0 for law firms. This keeps the view's column shape stable for
--   the frontend and is trivially replaced with a real count when/if the
--   link is added.
--
--   NOTE: `law_firm_subscriptions` has NO category_id (unlike
--   provider_subscriptions), so we omit specialty_category fields.
--
--   Security: view respects RLS on all base tables.
--
-- Rollback:
--   DROP VIEW IF EXISTS public.v_law_firm_list;
-- =============================================================================

CREATE OR REPLACE VIEW public.v_law_firm_list AS
SELECT
  -- Raw law firm columns
  lf.id,
  lf.firm_name,
  lf.dba_name,
  lf.contact_name,
  lf.contact_email,
  lf.contact_phone,
  lf.address_line1,
  lf.address_line2,
  lf.city,
  lf.state,
  lf.zip_code,
  lf.latitude,
  lf.longitude,
  lf.website,
  lf.firm_size,
  lf.practice_areas,
  lf.states_licensed,
  lf.bar_numbers,
  lf.status,
  lf.assigned_sales_rep,
  lf.source,
  lf.notes,
  lf.health_score,
  lf.service_package_id,
  lf.created_at,
  lf.updated_at,

  -- Assigned sales rep profile
  rep.full_name AS rep_name,
  rep.email     AS rep_email,

  -- Service package
  pkg.name       AS package_name,
  pkg.short_code AS package_code,

  -- Most-relevant subscription
  sub.billing_status,
  sub.monthly_amount,

  -- Membership tier (via subscription.tier_id)
  tier.name       AS tier_name,
  tier.short_code AS tier_code,

  -- Scalar aggregates
  -- contracts has no law_firm_id today; placeholder kept for shape parity.
  0::bigint AS active_contract_count,

  (
    SELECT MAX(lfa.created_at)
    FROM public.law_firm_activities lfa
    WHERE lfa.law_firm_id = lf.id
  ) AS last_activity_at,

  (
    SELECT COUNT(*)
    FROM public.law_firm_documents lfd
    WHERE lfd.law_firm_id = lf.id
  )::bigint AS total_docs,

  (
    SELECT COUNT(*)
    FROM public.law_firm_documents lfd
    WHERE lfd.law_firm_id = lf.id
      AND lfd.status = 'signed'
  )::bigint AS signed_docs

FROM public.law_firms lf
LEFT JOIN public.profiles rep
       ON rep.id = lf.assigned_sales_rep
LEFT JOIN public.service_packages pkg
       ON pkg.id = lf.service_package_id
LEFT JOIN LATERAL (
  -- `law_firm_subscriptions.status` is a free-form text column in the
  -- current schema (default 'pending'). We apply the same priority ordering
  -- as v_provider_list so active subs win, then past_due, pending, etc.
  SELECT
    lfs.status AS billing_status,
    lfs.monthly_amount,
    lfs.tier_id
  FROM public.law_firm_subscriptions lfs
  WHERE lfs.law_firm_id = lf.id
  ORDER BY
    CASE lfs.status
      WHEN 'active'        THEN 1
      WHEN 'past_due'      THEN 2
      WHEN 'pending'       THEN 3
      WHEN 'trial'         THEN 4
      WHEN 'grace_period'  THEN 5
      WHEN 'suspended'     THEN 6
      WHEN 'cancelled'     THEN 7
      ELSE 8
    END,
    lfs.created_at DESC
  LIMIT 1
) sub ON TRUE
LEFT JOIN public.membership_tiers tier
       ON tier.id = sub.tier_id;

COMMENT ON VIEW public.v_law_firm_list IS
  'Denormalized law firm list. RLS on underlying tables still applies.';
