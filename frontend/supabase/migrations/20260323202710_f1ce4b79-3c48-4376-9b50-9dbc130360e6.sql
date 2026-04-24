
ALTER TABLE public.providers
ADD COLUMN service_package_id uuid REFERENCES public.service_packages(id);
