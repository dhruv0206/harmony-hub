
DROP POLICY "System can insert audit logs" ON public.audit_log;

CREATE POLICY "Service role insert audit logs"
  ON public.audit_log FOR INSERT TO anon
  WITH CHECK (actor_type = 'system');
