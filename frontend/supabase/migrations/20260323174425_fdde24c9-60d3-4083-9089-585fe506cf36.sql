
-- Allow providers to view their own provider record
CREATE POLICY "Providers can view own provider" ON public.providers
FOR SELECT USING (
  has_role(auth.uid(), 'provider'::app_role) AND
  contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- Allow providers to update limited fields on their own provider record
CREATE POLICY "Providers can update own provider" ON public.providers
FOR UPDATE USING (
  has_role(auth.uid(), 'provider'::app_role) AND
  contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);
