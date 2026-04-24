-- Fix: audit_log INSERT policy must verify actor_id matches auth.uid().
-- The prior policy "Authenticated users can insert audit logs" used
-- WITH CHECK (true), which lets any authenticated user forge entries
-- attributed to another user. This migration replaces it with a policy
-- that requires actor_id = auth.uid(). The service-role / anon insert
-- policy ("Service role insert audit logs", WITH CHECK actor_type = 'system')
-- is left untouched so server-side logging still works.
--
-- Verified via existing migration 20260324222941 that audit_log has an
-- actor_id uuid column referencing public.profiles(id).
--
-- Rollback: reinstate the prior permissive policy:
--   DROP POLICY IF EXISTS "Users insert own audit entries" ON public.audit_log;
--   CREATE POLICY "Authenticated users can insert audit logs"
--     ON public.audit_log FOR INSERT TO authenticated
--     WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;

CREATE POLICY "Users insert own audit entries"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());
