
-- Onboarding checklist for providers
CREATE TABLE public.onboarding_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'blocked')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id)
);

-- Individual onboarding steps
CREATE TABLE public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.onboarding_checklists(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_name text NOT NULL,
  description text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id),
  assigned_to uuid REFERENCES public.profiles(id),
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies for onboarding_checklists
CREATE POLICY "Admins can do anything with onboarding" ON public.onboarding_checklists FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view assigned onboarding" ON public.onboarding_checklists FOR SELECT USING (has_role(auth.uid(), 'sales_rep') AND assigned_to = auth.uid());
CREATE POLICY "Sales reps can update assigned onboarding" ON public.onboarding_checklists FOR UPDATE USING (has_role(auth.uid(), 'sales_rep') AND assigned_to = auth.uid());
CREATE POLICY "Sales reps can insert onboarding" ON public.onboarding_checklists FOR INSERT WITH CHECK (has_role(auth.uid(), 'sales_rep'));

-- RLS policies for onboarding_steps
CREATE POLICY "Admins can do anything with onboarding steps" ON public.onboarding_steps FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Sales reps can view onboarding steps" ON public.onboarding_steps FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.onboarding_checklists WHERE id = onboarding_steps.checklist_id AND assigned_to = auth.uid()
  )
);
CREATE POLICY "Sales reps can update onboarding steps" ON public.onboarding_steps FOR UPDATE USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM public.onboarding_checklists WHERE id = onboarding_steps.checklist_id AND assigned_to = auth.uid()
  )
);
CREATE POLICY "Sales reps can insert onboarding steps" ON public.onboarding_steps FOR INSERT WITH CHECK (has_role(auth.uid(), 'sales_rep'));

-- Triggers for updated_at
CREATE TRIGGER update_onboarding_checklists_updated_at BEFORE UPDATE ON public.onboarding_checklists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_onboarding_steps_updated_at BEFORE UPDATE ON public.onboarding_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
