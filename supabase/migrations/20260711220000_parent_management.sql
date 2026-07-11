-- Parent management foundation: standalone parent profile fields, distinct
-- guardian relationship types, and DB-level duplicate-parent prevention.
--
-- A "parent" is a public.profiles row whose auth account holds the 'parent'
-- role in public.user_roles. There is no dedicated parent table, so the
-- uniqueness guard is a trigger scoped to parent-role profiles (a static
-- partial index can't reference user_roles). This closes the hole for ANY
-- entry path — bulk import, direct API, or the UI.

-- 1. Standalone-profile fields (nullable; generic person attributes) ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address     text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS occupation  text;

-- 2. Distinct guardian relationship types on the junction table ---------------
ALTER TABLE public.parent_student
  ADD COLUMN IF NOT EXISTS relationship_type text NOT NULL DEFAULT 'guardian';

-- Backfill from the legacy free-text `relationship` where it maps cleanly.
UPDATE public.parent_student
SET relationship_type = CASE lower(coalesce(relationship, ''))
  WHEN 'father' THEN 'father'
  WHEN 'mother' THEN 'mother'
  WHEN 'emergency' THEN 'emergency_contact'
  WHEN 'emergency_contact' THEN 'emergency_contact'
  ELSE 'guardian'
END
WHERE relationship_type = 'guardian';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parent_student_reltype_check') THEN
    ALTER TABLE public.parent_student
      ADD CONSTRAINT parent_student_reltype_check
      CHECK (relationship_type IN ('father', 'mother', 'guardian', 'emergency_contact'));
  END IF;
END $$;

-- 3. Indexes backing parent search-before-create ------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_national_id ON public.profiles (national_id) WHERE national_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_phone       ON public.profiles (phone)       WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- 4. Parent-identity uniqueness guard -----------------------------------------
CREATE OR REPLACE FUNCTION public.assert_parent_identity_unique(pid uuid)
RETURNS void AS $$
DECLARE
  v_email text; v_phone text; v_nat text; conflict uuid;
BEGIN
  SELECT lower(email), phone, national_id INTO v_email, v_phone, v_nat
  FROM public.profiles WHERE id = pid;

  SELECT p.id INTO conflict
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
  WHERE p.id <> pid
    AND (
      (v_email IS NOT NULL AND lower(p.email) = v_email) OR
      (v_phone IS NOT NULL AND p.phone = v_phone) OR
      (v_nat   IS NOT NULL AND p.national_id = v_nat)
    )
  LIMIT 1;

  IF conflict IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_parent_identity: a parent with this email, mobile, or national ID already exists'
      USING ERRCODE = '23505';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fires when a profile is granted the parent role (the create path).
CREATE OR REPLACE FUNCTION public.trg_user_roles_parent_identity()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'parent' THEN
    PERFORM public.assert_parent_identity_unique(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_parent_identity ON public.user_roles;
CREATE TRIGGER user_roles_parent_identity
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_roles_parent_identity();

-- Fires when an existing parent's identifying fields change.
CREATE OR REPLACE FUNCTION public.trg_profiles_parent_identity()
RETURNS trigger AS $$
BEGIN
  IF (NEW.email IS DISTINCT FROM OLD.email
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.national_id IS DISTINCT FROM OLD.national_id)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.id AND ur.role = 'parent') THEN
    PERFORM public.assert_parent_identity_unique(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_parent_identity ON public.profiles;
CREATE TRIGGER profiles_parent_identity
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_parent_identity();
