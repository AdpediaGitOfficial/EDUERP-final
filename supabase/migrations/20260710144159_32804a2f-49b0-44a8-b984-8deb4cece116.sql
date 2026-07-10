
-- 1) Round-robin assign class_teacher_id to sections that don't have one.
WITH teacher_pool AS (
  SELECT DISTINCT ON (p.full_name) ur.user_id, p.full_name,
         row_number() OVER (ORDER BY p.full_name) - 1 AS idx
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'teacher'
),
pool_size AS (SELECT COUNT(*)::int AS n FROM teacher_pool),
unassigned AS (
  SELECT id, row_number() OVER (ORDER BY name, section) - 1 AS idx
  FROM public.classes
  WHERE class_teacher_id IS NULL
)
UPDATE public.classes c
SET class_teacher_id = tp.user_id
FROM unassigned u, teacher_pool tp, pool_size ps
WHERE c.id = u.id
  AND tp.idx = (u.idx % ps.n);

-- 2) Also record these as teacher_classes links so "My Students" reflects them.
INSERT INTO public.teacher_classes (teacher_id, class_id)
SELECT c.class_teacher_id, c.id
FROM public.classes c
WHERE c.class_teacher_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3) Aggregate RPC — one round trip, no PostgREST row cap.
CREATE OR REPLACE FUNCTION public.get_class_stats(_class_ids uuid[])
RETURNS TABLE (
  class_id uuid,
  student_count bigint,
  attendance_total bigint,
  attendance_present bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    COALESCE(s.cnt, 0),
    COALESCE(a.total, 0),
    COALESCE(a.present, 0)
  FROM unnest(_class_ids) AS x(id)
  JOIN public.classes c ON c.id = x.id
  LEFT JOIN (
    SELECT class_id, COUNT(*)::bigint AS cnt
    FROM public.students
    WHERE class_id = ANY(_class_ids)
    GROUP BY class_id
  ) s ON s.class_id = c.id
  LEFT JOIN (
    SELECT class_id,
           COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE status IN ('present','late'))::bigint AS present
    FROM public.attendance
    WHERE class_id = ANY(_class_ids)
      AND date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY class_id
  ) a ON a.class_id = c.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_class_stats(uuid[]) TO authenticated;
