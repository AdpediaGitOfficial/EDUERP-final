-- Student–Parent relationship model (extends the existing parent_student /
-- profiles model — NOT a second Parents table). Adds parent search keys, the
-- guardian relationship flags, and a DB-level guarantee against duplicate roll
-- numbers within a class (the concrete, enforceable form of "an active student
-- must have a valid class + roll" — see the note on the activation rule below).

-- 1. Parent search/identity fields on profiles --------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_no text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company     text;

-- Deterministic parent code for existing parent-role profiles (searchable).
UPDATE public.profiles p
SET parent_code = 'PAR-' || upper(substr(replace(p.id::text, '-', ''), 1, 8))
FROM public.user_roles ur
WHERE ur.user_id = p.id AND ur.role = 'parent' AND p.parent_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_parent_code
  ON public.profiles (parent_code) WHERE parent_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_passport ON public.profiles (passport_no) WHERE passport_no IS NOT NULL;

-- 2. Guardian relationship flags on the mapping table -------------------------
ALTER TABLE public.parent_student ADD COLUMN IF NOT EXISTS is_primary        boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_student ADD COLUMN IF NOT EXISTS pickup_permission boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_student ADD COLUMN IF NOT EXISTS fee_responsible   boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_student ADD COLUMN IF NOT EXISTS emergency_contact boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_student ADD COLUMN IF NOT EXISTS lives_with        boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_student ADD COLUMN IF NOT EXISTS status            text    NOT NULL DEFAULT 'active';

-- Backfill: the first-linked guardian per student becomes primary + fee-owner.
WITH firsts AS (
  SELECT DISTINCT ON (student_id) id FROM public.parent_student ORDER BY student_id, id
)
UPDATE public.parent_student ps
SET is_primary = true, fee_responsible = true
FROM firsts f
WHERE ps.id = f.id AND ps.is_primary = false;

-- 3. Roll-number integrity -----------------------------------------------------
-- DB-level: no two students in the same class may share a roll number. This is
-- the enforceable core of the "active student needs class + section + roll"
-- rule; a blanket status trigger is intentionally NOT added because the enum has
-- no pre-placement state and existing/seeded active students may predate a
-- class assignment — a blocking trigger would break fresh provisioning. New
-- placements go through the admission service, which assigns rolls via
-- next_roll_no() below and is guarded by this index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_class_roll
  ON public.students (class_id, roll_no)
  WHERE class_id IS NOT NULL AND roll_no IS NOT NULL AND roll_no <> '';

-- Per-class sequential roll generator (ports the seed logic: strip non-digits,
-- take the max, add one, zero-pad). Reused by the admit service.
CREATE OR REPLACE FUNCTION public.next_roll_no(p_class uuid)
RETURNS text AS $$
DECLARE mx int;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(roll_no, '\D', '', 'g'), '') AS int)), 0)
    INTO mx FROM public.students WHERE class_id = p_class;
  RETURN lpad((mx + 1)::text, 2, '0');
END;
$$ LANGUAGE plpgsql;
