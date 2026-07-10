
WITH teacher_pool AS (
  SELECT DISTINCT ON (p.full_name) ur.user_id, p.full_name,
         row_number() OVER (ORDER BY p.full_name) - 1 AS idx
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'teacher'
),
pool_size AS (SELECT COUNT(*)::int AS n FROM teacher_pool),
unassigned AS (
  SELECT id, (row_number() OVER (ORDER BY name, section) - 1) AS idx
  FROM public.classes
  WHERE class_teacher_id IS NULL
)
UPDATE public.classes c
SET class_teacher_id = tp.user_id
FROM unassigned u, teacher_pool tp, pool_size ps
WHERE c.id = u.id
  AND tp.idx = (u.idx % ps.n);

INSERT INTO public.teacher_classes (teacher_id, class_id)
SELECT c.class_teacher_id, c.id
FROM public.classes c
WHERE c.class_teacher_id IS NOT NULL
ON CONFLICT DO NOTHING;
