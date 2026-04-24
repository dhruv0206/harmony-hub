
CREATE TABLE public.template_signing_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  field_type text NOT NULL CHECK (field_type IN ('signature', 'initials', 'checkbox', 'text', 'date')),
  field_label text NOT NULL DEFAULT '',
  assigned_to text NOT NULL DEFAULT 'provider' CHECK (assigned_to IN ('provider', 'admin', 'witness')),
  page_number integer NOT NULL DEFAULT 1,
  x_position numeric NOT NULL DEFAULT 0,
  y_position numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 10,
  height numeric NOT NULL DEFAULT 5,
  is_required boolean NOT NULL DEFAULT true,
  placeholder_text text,
  validation_rule text,
  checkbox_label text,
  auto_fill_date boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.template_signing_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_template_signing_fields" ON public.template_signing_fields
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_rep_select_template_signing_fields" ON public.template_signing_fields
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_rep'::app_role));

CREATE POLICY "provider_select_template_signing_fields" ON public.template_signing_fields
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'provider'::app_role) AND EXISTS (
    SELECT 1 FROM public.document_templates dt WHERE dt.id = template_signing_fields.template_id AND dt.is_active = true
  ));
