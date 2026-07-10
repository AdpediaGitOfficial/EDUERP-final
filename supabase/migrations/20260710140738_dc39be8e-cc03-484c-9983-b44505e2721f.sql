-- 1. Delete junk students (verified: no attendance/fee/homework/exam/parent/payment links)
DELETE FROM public.route_students
WHERE student_id IN (SELECT id FROM public.students WHERE admission_no IN ('adp','adm','SS-2026-01'));
DELETE FROM public.students WHERE admission_no IN ('adp','adm','SS-2026-01');

-- 2. Status enum + column
DO $$ BEGIN
  CREATE TYPE public.student_status AS ENUM ('active','inactive','alumni');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status public.student_status NOT NULL DEFAULT 'active';

-- 3. Renumber every admission_no -> ADM-2026-##### (stable order by admission_date, created_at, id)
WITH numbered AS (
  SELECT id, 'ADM-2026-' || LPAD(ROW_NUMBER() OVER (ORDER BY admission_date, created_at, id)::text, 5, '0') AS new_no
  FROM public.students
)
UPDATE public.students s SET admission_no = n.new_no FROM numbered n WHERE s.id = n.id;

-- 4. Enforce format going forward
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_admission_no_format;
ALTER TABLE public.students ADD CONSTRAINT students_admission_no_format CHECK (admission_no ~ '^ADM-[0-9]{4}-[0-9]{5}$');

-- 5. Sequence for future admissions
CREATE SEQUENCE IF NOT EXISTS public.student_admission_seq;
SELECT setval('public.student_admission_seq', GREATEST((SELECT COUNT(*) FROM public.students), 1));

-- 6. Next-admission helper (invoker so RLS applies naturally to any future callers)
CREATE OR REPLACE FUNCTION public.next_admission_no()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'ADM-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
         LPAD(nextval('public.student_admission_seq')::text, 5, '0')
$$;
GRANT EXECUTE ON FUNCTION public.next_admission_no() TO authenticated;

-- 7. Indexes to keep search fast
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON public.students(admission_no);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_students_profile_id ON public.students(profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower ON public.profiles(lower(full_name));

-- 8. Server-side search / list function (RLS applies via SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.search_students(
  p_q text DEFAULT NULL,
  p_class_id uuid DEFAULT NULL,
  p_grade_name text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_status public.student_status DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_sort text DEFAULT 'admission_date',
  p_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, admission_no text, roll_no text, admission_date date, gender text,
  status public.student_status, profile_id uuid, full_name text, email text,
  class_id uuid, class_name text, class_section text, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT s.id, s.admission_no, s.roll_no, s.admission_date, s.gender, s.status,
           s.profile_id, p.full_name, p.email, s.class_id,
           c.name AS class_name, c.section AS class_section, s.created_at
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    LEFT JOIN public.classes c ON c.id = s.class_id
    WHERE (p_q IS NULL OR p.full_name ILIKE '%'||p_q||'%' OR s.admission_no ILIKE '%'||p_q||'%' OR c.name ILIKE '%'||p_q||'%')
      AND (p_class_id IS NULL OR s.class_id = p_class_id)
      AND (p_grade_name IS NULL OR c.name = p_grade_name)
      AND (p_section IS NULL OR c.section = p_section)
      AND (p_gender IS NULL OR s.gender = p_gender)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_from_date IS NULL OR s.admission_date >= p_from_date)
      AND (p_to_date IS NULL OR s.admission_date <= p_to_date)
  ), counted AS ( SELECT COUNT(*)::bigint AS c FROM filtered )
  SELECT f.id, f.admission_no, f.roll_no, f.admission_date, f.gender, f.status,
         f.profile_id, f.full_name, f.email, f.class_id, f.class_name, f.class_section,
         (SELECT c FROM counted)
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort='name'           AND p_dir='asc'  THEN f.full_name END ASC NULLS LAST,
    CASE WHEN p_sort='name'           AND p_dir='desc' THEN f.full_name END DESC NULLS LAST,
    CASE WHEN p_sort='admission_no'   AND p_dir='asc'  THEN f.admission_no END ASC NULLS LAST,
    CASE WHEN p_sort='admission_no'   AND p_dir='desc' THEN f.admission_no END DESC NULLS LAST,
    CASE WHEN p_sort='class'          AND p_dir='asc'  THEN f.class_name END ASC NULLS LAST,
    CASE WHEN p_sort='class'          AND p_dir='desc' THEN f.class_name END DESC NULLS LAST,
    CASE WHEN p_sort='admission_date' AND p_dir='asc'  THEN f.admission_date END ASC NULLS LAST,
    CASE WHEN p_sort='admission_date' AND p_dir='desc' THEN f.admission_date END DESC NULLS LAST,
    f.created_at DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END $$;
GRANT EXECUTE ON FUNCTION public.search_students(text,uuid,text,text,text,public.student_status,date,date,text,text,int,int) TO authenticated;

-- 9. Bulk promote helper (admin-enforced in server function; also guarded here)
CREATE OR REPLACE FUNCTION public.promote_students(
  p_from_class uuid, p_to_class uuid, p_exclude uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE moved int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can promote'; END IF;
  UPDATE public.students SET class_id = p_to_class
  WHERE class_id = p_from_class AND status = 'active' AND NOT (id = ANY(COALESCE(p_exclude, ARRAY[]::uuid[])));
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END $$;
GRANT EXECUTE ON FUNCTION public.promote_students(uuid,uuid,uuid[]) TO authenticated;

-- 10. Duplicate detection helper
CREATE OR REPLACE FUNCTION public.find_duplicate_students()
RETURNS TABLE (full_name text, count bigint, student_ids uuid[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.full_name, COUNT(*)::bigint, ARRAY_AGG(s.id)
  FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
  GROUP BY lower(p.full_name), p.full_name
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, p.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.find_duplicate_students() TO authenticated;