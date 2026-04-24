
-- Add missing columns to training_videos
ALTER TABLE public.training_videos
  ADD COLUMN IF NOT EXISTS video_type text NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS target_audience text NOT NULL DEFAULT 'new_providers',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

-- Make video_url nullable (admin adds URLs later)
ALTER TABLE public.training_videos ALTER COLUMN video_url DROP NOT NULL;

-- Create provider_video_progress table
CREATE TABLE IF NOT EXISTS public.provider_video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.training_videos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (provider_id, video_id)
);

ALTER TABLE public.provider_video_progress ENABLE ROW LEVEL SECURITY;

-- RLS for provider_video_progress
CREATE POLICY "admin_all_provider_video_progress" ON public.provider_video_progress
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_rep_select_provider_video_progress" ON public.provider_video_progress
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role));

CREATE POLICY "provider_select_own_video_progress" ON public.provider_video_progress
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'provider'::app_role) AND EXISTS (
      SELECT 1 FROM providers WHERE providers.id = provider_video_progress.provider_id
      AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
    )
  );

CREATE POLICY "provider_insert_own_video_progress" ON public.provider_video_progress
  FOR INSERT TO public
  WITH CHECK (
    has_role(auth.uid(), 'provider'::app_role) AND EXISTS (
      SELECT 1 FROM providers WHERE providers.id = provider_video_progress.provider_id
      AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
    )
  );

CREATE POLICY "provider_update_own_video_progress" ON public.provider_video_progress
  FOR UPDATE TO public
  USING (
    has_role(auth.uid(), 'provider'::app_role) AND EXISTS (
      SELECT 1 FROM providers WHERE providers.id = provider_video_progress.provider_id
      AND providers.contact_email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
    )
  );
