
-- Create enums for the workflow system
CREATE TYPE public.workflow_status AS ENUM ('not_started', 'in_progress', 'paused', 'completed', 'stalled');
CREATE TYPE public.workflow_step_type AS ENUM ('auto_email', 'manual_task', 'document_upload', 'contract_review', 'e_signature', 'ai_verification', 'approval', 'training');
CREATE TYPE public.workflow_step_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped', 'blocked');
CREATE TYPE public.onboarding_notification_type AS ENUM ('email', 'in_app', 'sms');
CREATE TYPE public.onboarding_notification_status AS ENUM ('pending', 'sent', 'failed', 'read');

-- Create onboarding_workflows table
CREATE TABLE public.onboarding_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  initiated_by UUID REFERENCES public.profiles(id),
  current_step INTEGER NOT NULL DEFAULT 1,
  total_steps INTEGER NOT NULL DEFAULT 0,
  status workflow_status NOT NULL DEFAULT 'not_started',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create workflow_steps table (new onboarding_steps equivalent)
CREATE TABLE public.workflow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES public.onboarding_workflows(id) ON DELETE CASCADE NOT NULL,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type workflow_step_type NOT NULL DEFAULT 'manual_task',
  description TEXT,
  status workflow_step_status NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES public.profiles(id),
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES public.profiles(id),
  auto_trigger BOOLEAN NOT NULL DEFAULT false,
  trigger_delay_hours INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create onboarding_templates table
CREATE TABLE public.onboarding_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  deal_type_id UUID REFERENCES public.deal_types(id) ON DELETE SET NULL,
  steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create onboarding_notifications table
CREATE TABLE public.onboarding_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES public.onboarding_workflows(id) ON DELETE CASCADE NOT NULL,
  step_id UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES public.profiles(id),
  notification_type onboarding_notification_type NOT NULL DEFAULT 'in_app',
  subject TEXT NOT NULL,
  body TEXT,
  status onboarding_notification_status NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.onboarding_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_notifications ENABLE ROW LEVEL SECURITY;

-- RLS for onboarding_workflows
CREATE POLICY "admin_all_workflows" ON public.onboarding_workflows FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_select_workflows" ON public.onboarding_workflows FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND (initiated_by = auth.uid() OR EXISTS (
    SELECT 1 FROM providers WHERE providers.id = onboarding_workflows.provider_id AND providers.assigned_sales_rep = auth.uid()
  ))
);
CREATE POLICY "sales_rep_update_workflows" ON public.onboarding_workflows FOR UPDATE USING (
  has_role(auth.uid(), 'sales_rep') AND (initiated_by = auth.uid() OR EXISTS (
    SELECT 1 FROM providers WHERE providers.id = onboarding_workflows.provider_id AND providers.assigned_sales_rep = auth.uid()
  ))
);
CREATE POLICY "sales_rep_insert_workflows" ON public.onboarding_workflows FOR INSERT WITH CHECK (has_role(auth.uid(), 'sales_rep'));
CREATE POLICY "provider_select_own_workflows" ON public.onboarding_workflows FOR SELECT USING (
  has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = onboarding_workflows.provider_id AND providers.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);

-- RLS for workflow_steps
CREATE POLICY "admin_all_workflow_steps" ON public.workflow_steps FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_select_workflow_steps" ON public.workflow_steps FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM onboarding_workflows w WHERE w.id = workflow_steps.workflow_id AND (w.initiated_by = auth.uid() OR EXISTS (
      SELECT 1 FROM providers WHERE providers.id = w.provider_id AND providers.assigned_sales_rep = auth.uid()
    ))
  )
);
CREATE POLICY "sales_rep_update_workflow_steps" ON public.workflow_steps FOR UPDATE USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM onboarding_workflows w WHERE w.id = workflow_steps.workflow_id AND (w.initiated_by = auth.uid() OR EXISTS (
      SELECT 1 FROM providers WHERE providers.id = w.provider_id AND providers.assigned_sales_rep = auth.uid()
    ))
  )
);
CREATE POLICY "sales_rep_insert_workflow_steps" ON public.workflow_steps FOR INSERT WITH CHECK (has_role(auth.uid(), 'sales_rep'));
CREATE POLICY "provider_select_own_steps" ON public.workflow_steps FOR SELECT USING (
  has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM onboarding_workflows w WHERE w.id = workflow_steps.workflow_id AND EXISTS (
      SELECT 1 FROM providers WHERE providers.id = w.provider_id AND providers.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  )
);

-- RLS for onboarding_templates
CREATE POLICY "authenticated_select_templates" ON public.onboarding_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_all_templates" ON public.onboarding_templates FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS for onboarding_notifications
CREATE POLICY "admin_all_onboarding_notifications" ON public.onboarding_notifications FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_select_onboarding_notifications" ON public.onboarding_notifications FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM onboarding_workflows w WHERE w.id = onboarding_notifications.workflow_id AND (w.initiated_by = auth.uid() OR EXISTS (
      SELECT 1 FROM providers WHERE providers.id = w.provider_id AND providers.assigned_sales_rep = auth.uid()
    ))
  )
);
CREATE POLICY "sales_rep_insert_onboarding_notifications" ON public.onboarding_notifications FOR INSERT WITH CHECK (has_role(auth.uid(), 'sales_rep'));
CREATE POLICY "provider_select_own_notifications" ON public.onboarding_notifications FOR SELECT USING (
  has_role(auth.uid(), 'provider') AND (recipient_id = auth.uid())
);

-- Enable realtime for workflow tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_workflows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_notifications;

-- Updated_at trigger for workflows
CREATE TRIGGER update_onboarding_workflows_updated_at BEFORE UPDATE ON public.onboarding_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
