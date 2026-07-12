-- Academic sessions: a real session entity to replace the free-text
-- classes.academic_year string. Purely additive — classes keep their
-- academic_year column, and sessions are linked by matching name, so nothing
-- that reads academic_year today breaks. Idempotent.

CREATE TABLE IF NOT EXISTS public.academic_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,               -- e.g. "2026-2027"
  start_date       date,
  end_date         date,
  is_current       boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active',     -- active|upcoming|archived|locked
  board            text,
  curriculum       text,
  promotion_locked boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- At most one session may be flagged current.
CREATE UNIQUE INDEX IF NOT EXISTS academic_sessions_one_current
  ON public.academic_sessions (is_current)
  WHERE is_current;

-- Backfill one session per distinct academic_year already on classes. Derive
-- Apr–Mar Indian-academic-year dates when the name is "YYYY-YYYY".
INSERT INTO public.academic_sessions (name, start_date, end_date, status)
SELECT DISTINCT
  c.academic_year,
  CASE WHEN c.academic_year ~ '^\d{4}-\d{4}$'
       THEN make_date(split_part(c.academic_year, '-', 1)::int, 4, 1) END,
  CASE WHEN c.academic_year ~ '^\d{4}-\d{4}$'
       THEN make_date(split_part(c.academic_year, '-', 2)::int, 3, 31) END,
  'active'
FROM public.classes c
WHERE c.academic_year IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.academic_sessions s WHERE s.name = c.academic_year
  );

-- Mark the session with the most active students as current (only if none is).
WITH ranked AS (
  SELECT c.academic_year AS name, COUNT(st.id) AS n
  FROM public.classes c
  LEFT JOIN public.students st ON st.class_id = c.id AND st.status = 'active'
  WHERE c.academic_year IS NOT NULL
  GROUP BY c.academic_year
  ORDER BY n DESC, c.academic_year DESC
  LIMIT 1
)
UPDATE public.academic_sessions s
SET is_current = true, updated_at = now()
FROM ranked r
WHERE s.name = r.name
  AND NOT EXISTS (SELECT 1 FROM public.academic_sessions x WHERE x.is_current);
