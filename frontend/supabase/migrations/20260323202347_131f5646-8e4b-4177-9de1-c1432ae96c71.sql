
-- Create storage bucket for document templates
INSERT INTO storage.buckets (id, name, public) VALUES ('document-templates', 'document-templates', false);

-- Storage RLS policies
CREATE POLICY "admin_all_document_template_files" ON storage.objects FOR ALL
  USING (bucket_id = 'document-templates' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'document-templates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "authenticated_read_document_template_files" ON storage.objects FOR SELECT
  USING (bucket_id = 'document-templates' AND auth.role() = 'authenticated');
