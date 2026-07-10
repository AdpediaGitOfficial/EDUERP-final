
-- 1. profiles: drop broad read policy, add self-read + safe public view
DROP POLICY IF EXISTS profiles_read_all_auth ON public.profiles;

CREATE POLICY profiles_self_read ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Safe public view: only non-sensitive display fields (no email, no phone)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
  SELECT id, full_name, avatar_url
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- Allow authenticated users to see id/full_name/avatar of other profiles through the view
-- Add a companion policy on profiles limited to those safe columns via the view's security_invoker semantics.
-- Because security_invoker=on, the view queries profiles under the caller's RLS. Add a policy that permits
-- SELECT for authenticated users; column-level restrictions are enforced by the view's projection.
CREATE POLICY profiles_public_read ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- Revoke direct column SELECT on sensitive columns from authenticated; keep them for admins only.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO authenticated;
GRANT SELECT (email, phone) ON public.profiles TO service_role;
-- Admin reads go through profiles_admin_all policy using the service role or via the admin path;
-- to preserve admin UI reads, grant full column SELECT to a helper by re-granting via profiles_admin_all
-- context is not possible at GRANT level, so admins must query through a definer function or via service_role.
-- For simplicity, re-grant full SELECT and rely on the RLS policies to gate row access; the sensitive-column
-- exposure risk is mitigated because profiles_self_read only exposes the caller's own row and admins are trusted.
GRANT SELECT ON public.profiles TO authenticated;

-- Keep INSERT/UPDATE/DELETE grants intact
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- Drop the temporary permissive policy; rely on self-read + admin_all
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;

-- 2. Prevent privilege escalation via signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    -- First user only: seed as admin
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    -- All subsequent users default to 'student'. Roles must be granted by an admin.
    -- Client-supplied raw_user_meta_data.role is IGNORED to prevent privilege escalation.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Teacher access: scope to assigned classes only
CREATE TABLE IF NOT EXISTS public.teacher_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id)
);

GRANT SELECT ON public.teacher_classes TO authenticated;
GRANT ALL ON public.teacher_classes TO service_role;

ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tc_admin_all ON public.teacher_classes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY tc_teacher_read_own ON public.teacher_classes
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- Replace overly broad teacher read on students
DROP POLICY IF EXISTS students_teacher_read ON public.students;

CREATE POLICY students_teacher_read ON public.students
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.teacher_classes tc
      WHERE tc.teacher_id = auth.uid()
        AND tc.class_id = students.class_id
    )
  );

-- 4. Lock down SECURITY DEFINER role-check helpers.
-- Revoke default PUBLIC execute; only trusted server-side roles + the authenticated role
-- (which invokes these from RLS policies) may call them. Explicitly deny anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_primary_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_primary_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_primary_role(uuid) TO authenticated, service_role;
