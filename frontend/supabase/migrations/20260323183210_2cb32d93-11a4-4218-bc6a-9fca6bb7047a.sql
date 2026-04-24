
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  template_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent'
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_email_logs" ON public.email_logs FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_rep_select_email_logs" ON public.email_logs FOR SELECT USING (
  has_role(auth.uid(), 'sales_rep') AND EXISTS (
    SELECT 1 FROM providers WHERE providers.id = email_logs.provider_id AND (providers.assigned_sales_rep = auth.uid() OR providers.status = 'prospect')
  )
);
CREATE POLICY "sales_rep_insert_email_logs" ON public.email_logs FOR INSERT WITH CHECK (has_role(auth.uid(), 'sales_rep'));
