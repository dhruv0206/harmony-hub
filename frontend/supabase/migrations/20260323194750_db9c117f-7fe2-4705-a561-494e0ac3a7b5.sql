-- Create ai_config table
CREATE TABLE public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ai_config" ON public.ai_config FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "authenticated_read_ai_config" ON public.ai_config FOR SELECT TO authenticated
  USING (true);

-- Create ai_logs table
CREATE TABLE public.ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL,
  user_id uuid REFERENCES public.profiles(id),
  provider_id uuid REFERENCES public.providers(id),
  input_summary text,
  output_summary text,
  tokens_used integer DEFAULT 0,
  response_time_ms integer DEFAULT 0,
  flagged boolean NOT NULL DEFAULT false,
  rating integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ai_logs" ON public.ai_logs FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "users_insert_own_logs" ON public.ai_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_select_own_logs" ON public.ai_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Rating validation trigger
CREATE OR REPLACE FUNCTION public.validate_ai_log_rating()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.rating IS NOT NULL AND (NEW.rating < 1 OR NEW.rating > 5) THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_ai_log_rating_trigger
  BEFORE INSERT OR UPDATE ON public.ai_logs
  FOR EACH ROW EXECUTE FUNCTION public.validate_ai_log_rating();

-- Seed default AI configuration
INSERT INTO public.ai_config (feature_name, enabled, settings) VALUES
  ('global', true, '{"kill_switch": false}'),
  ('tone_personality', true, '{"style": "professional", "custom_persona": ""}'),
  ('provider_health_score', true, '{"auto_calculate": true, "threshold_healthy": 80, "threshold_monitor": 60, "threshold_at_risk": 40}'),
  ('deal_negotiation_coach', true, '{}'),
  ('smart_follow_up', true, '{}'),
  ('churn_prediction', true, '{"scan_frequency": "weekly"}'),
  ('territory_optimizer', true, '{}'),
  ('competitive_intelligence', false, '{"scan_frequency": "weekly"}'),
  ('conversation_analytics', true, '{}'),
  ('auto_responder', false, '{"confidence_threshold": 85, "require_review": true, "categories": {}}'),
  ('budget', true, '{"monthly_limit_usd": 100, "alert_threshold_pct": 80, "auto_disable_pct": 100}'),
  ('content_policy', true, '{"excluded_topics": [], "blocked_phrases": [], "allowed_phrases": []}');