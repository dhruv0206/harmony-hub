
-- Add onboarding stage tracking columns to onboarding_workflows
ALTER TABLE public.onboarding_workflows
  ADD COLUMN IF NOT EXISTS onboarding_stage text NOT NULL DEFAULT 'documents',
  ADD COLUMN IF NOT EXISTS specialist_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id),
  ADD COLUMN IF NOT EXISTS call_event_id uuid REFERENCES public.calendar_events(id),
  ADD COLUMN IF NOT EXISTS call_checklist jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS call_notes text,
  ADD COLUMN IF NOT EXISTS portal_checklist jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS go_live_date timestamptz;

-- Training videos table
CREATE TABLE public.training_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  video_url text,
  thumbnail_url text,
  duration_minutes integer NOT NULL DEFAULT 10,
  display_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_training_videos" ON public.training_videos FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "authenticated_read_training_videos" ON public.training_videos FOR SELECT TO authenticated
  USING (true);

-- Provider training progress
CREATE TABLE public.provider_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.onboarding_workflows(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.training_videos(id) ON DELETE CASCADE,
  watched boolean NOT NULL DEFAULT false,
  watched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, video_id)
);

ALTER TABLE public.provider_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_training_progress" ON public.provider_training_progress FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_rep_manage_training_progress" ON public.provider_training_progress FOR ALL TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role))
  WITH CHECK (has_role(auth.uid(), 'sales_rep'::app_role));

CREATE POLICY "provider_select_own_training" ON public.provider_training_progress FOR SELECT TO public
  USING (has_role(auth.uid(), 'provider'::app_role) AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = provider_training_progress.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
  ));

CREATE POLICY "provider_update_own_training" ON public.provider_training_progress FOR UPDATE TO public
  USING (has_role(auth.uid(), 'provider'::app_role) AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = provider_training_progress.provider_id
    AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
  ));

-- Insert default training videos
INSERT INTO public.training_videos (title, description, duration_minutes, display_order) VALUES
  ('Platform Overview', 'Introduction to the provider portal and key features', 8, 1),
  ('Document Signing Guide', 'How to review and sign documents on the platform', 5, 2),
  ('Billing & Subscription', 'Understanding your billing, invoices, and subscription management', 6, 3),
  ('Support & Resources', 'How to submit support tickets and access help resources', 4, 4);
