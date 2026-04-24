-- recent_activities is a view, so we need to secure the underlying tables instead
-- The view already inherits RLS from underlying tables with security_invoker
-- Just ensure the view uses security_invoker
DROP VIEW IF EXISTS public.recent_activities;
CREATE VIEW public.recent_activities WITH (security_invoker = on) AS
  SELECT id, user_id, provider_id, activity_type, description, created_at
  FROM public.activities
  ORDER BY created_at DESC
  LIMIT 50;
