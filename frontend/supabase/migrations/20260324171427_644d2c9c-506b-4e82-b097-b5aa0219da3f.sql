
-- Calendar Events table
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type text NOT NULL CHECK (event_type IN ('onboarding_call', 'training_session', 'follow_up', 'check_in', 'demo', 'review', 'general')),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  location text,
  meeting_link text,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.scraped_leads(id) ON DELETE SET NULL,
  host_id uuid NOT NULL REFERENCES public.profiles(id),
  attendee_ids uuid[] DEFAULT '{}',
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
  notes text,
  outcome text,
  reminder_sent boolean DEFAULT false,
  recurrence text CHECK (recurrence IN ('daily', 'weekly', 'biweekly', 'monthly', NULL)),
  color text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Calendar Reminders table
CREATE TABLE public.calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  reminder_type text CHECK (reminder_type IN ('15_min', '1_hour', '1_day', 'custom')),
  sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_reminders ENABLE ROW LEVEL SECURITY;

-- RLS for calendar_events
CREATE POLICY "admin_all_calendar_events" ON public.calendar_events
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_select_calendar_events" ON public.calendar_events
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'sales_rep') AND (
      host_id = auth.uid()
      OR auth.uid() = ANY(attendee_ids)
      OR EXISTS (
        SELECT 1 FROM providers
        WHERE providers.id = calendar_events.provider_id
        AND providers.assigned_sales_rep = auth.uid()
      )
    )
  );

CREATE POLICY "sales_rep_insert_calendar_events" ON public.calendar_events
  FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'sales_rep'));

CREATE POLICY "sales_rep_update_calendar_events" ON public.calendar_events
  FOR UPDATE TO public
  USING (
    has_role(auth.uid(), 'sales_rep') AND (
      host_id = auth.uid()
      OR auth.uid() = ANY(attendee_ids)
    )
  );

CREATE POLICY "provider_select_calendar_events" ON public.calendar_events
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'provider') AND EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = calendar_events.provider_id
      AND providers.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "provider_update_calendar_events" ON public.calendar_events
  FOR UPDATE TO public
  USING (
    has_role(auth.uid(), 'provider') AND EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = calendar_events.provider_id
      AND providers.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- RLS for calendar_reminders
CREATE POLICY "admin_all_calendar_reminders" ON public.calendar_reminders
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_rep_manage_calendar_reminders" ON public.calendar_reminders
  FOR ALL TO public
  USING (
    has_role(auth.uid(), 'sales_rep') AND EXISTS (
      SELECT 1 FROM calendar_events
      WHERE calendar_events.id = calendar_reminders.event_id
      AND (calendar_events.host_id = auth.uid() OR auth.uid() = ANY(calendar_events.attendee_ids))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'sales_rep') AND EXISTS (
      SELECT 1 FROM calendar_events
      WHERE calendar_events.id = calendar_reminders.event_id
      AND (calendar_events.host_id = auth.uid() OR auth.uid() = ANY(calendar_events.attendee_ids))
    )
  );

-- Updated at trigger
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
