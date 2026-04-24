
-- Create enums for contract review
CREATE TYPE public.review_message_role AS ENUM ('provider', 'ai', 'system');
CREATE TYPE public.review_flag_type AS ENUM ('adversarial_intent', 'legal_loophole', 'termination_focused', 'competitive_mention', 'suspicious_pattern');
CREATE TYPE public.review_flag_severity AS ENUM ('low', 'medium', 'high');

-- Create contract_review_sessions
CREATE TABLE public.contract_review_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  messages_count INTEGER NOT NULL DEFAULT 0,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  reviewed_by_admin BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contract_review_messages
CREATE TABLE public.contract_review_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.contract_review_sessions(id) ON DELETE CASCADE NOT NULL,
  role review_message_role NOT NULL,
  message TEXT NOT NULL,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_type review_flag_type,
  flag_severity review_flag_severity,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contract_review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_review_messages ENABLE ROW LEVEL SECURITY;

-- RLS for sessions
CREATE POLICY "admin_all_review_sessions" ON public.contract_review_sessions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "provider_own_review_sessions" ON public.contract_review_sessions FOR ALL USING (
  has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = contract_review_sessions.provider_id
      AND providers.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);
CREATE POLICY "sales_rep_select_review_sessions" ON public.contract_review_sessions FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = contract_review_sessions.provider_id AND providers.assigned_sales_rep = auth.uid()
  )
);

-- RLS for messages
CREATE POLICY "admin_all_review_messages" ON public.contract_review_messages FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "provider_own_review_messages" ON public.contract_review_messages FOR ALL USING (
  has_role(auth.uid(), 'provider') AND EXISTS (
    SELECT 1 FROM contract_review_sessions s
    JOIN providers p ON p.id = s.provider_id
    WHERE s.id = contract_review_messages.session_id
      AND p.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);
CREATE POLICY "sales_rep_select_review_messages" ON public.contract_review_messages FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM contract_review_sessions s
    JOIN providers p ON p.id = s.provider_id
    WHERE s.id = contract_review_messages.session_id AND p.assigned_sales_rep = auth.uid()
  )
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_review_messages;
