-- Fix: new accounts must not default to the 'student' role, and clean up the
-- spurious student roles that default already stamped onto non-students.
--
-- Root cause: handle_new_user() (on_auth_user_created, AFTER INSERT on
-- auth.users) inserted role='student' for every account after the first admin.
-- The demo seed and any direct auth.users insert therefore stacked a stray
-- 'student' role onto parent/teacher/staff accounts — so a parent had
-- has_role('student') = true and showed up under the Student role filter.
--
-- No path relies on this default: the app's provisionAccount() assigns the real
-- role (delete-then-insert), signUp() inserts its own default, and the seed
-- inserts each account's role explicitly. So the default is removed outright.
-- Idempotent and safe to re-run.

-- 1) Stop defaulting new accounts to 'student'. Keep first-user admin bootstrap.
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
  )
  ON CONFLICT (id) DO NOTHING;

  -- Bootstrap the very first account as admin so a fresh install is usable.
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Every other account is left role-less here; the application (provisionAccount)
  -- or the seed assigns the correct role explicitly. We intentionally do NOT
  -- default to 'student' — that stacked a spurious student role onto every
  -- parent/staff account.
  RETURN NEW;
END;
$function$;

-- 2) Remove the spurious 'student' role from accounts that are provably NOT
--    students: no students row AND they carry some other role (parent/teacher/
--    staff/admin) or are a linked guardian. An account whose ONLY role is
--    'student' with no students row is left untouched for manual review.
DELETE FROM public.user_roles ur
WHERE ur.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = ur.user_id)
  AND (
        EXISTS (SELECT 1 FROM public.user_roles u2
                WHERE u2.user_id = ur.user_id AND u2.role <> 'student')
        OR EXISTS (SELECT 1 FROM public.parent_student ps
                   WHERE ps.parent_id = ur.user_id)
      );
