-- Add direct FK from user_roles.user_id to profiles.id so PostgREST can
-- resolve embedded queries like profiles?select=*,user_roles(role).
-- The existing FKs to auth.users can't be traversed across schemas by PostgREST.

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
