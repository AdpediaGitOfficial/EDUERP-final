-- Academic calendar: exams, events, PTMs, sports/annual days, vacations and
-- teacher training tied to a session. Complements the existing holidays table
-- (which the calendar read view folds in). Additive. Idempotent.

CREATE TABLE IF NOT EXISTS public.academic_calendar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session     text,
  title       text NOT NULL,
  description text,
  event_type  text NOT NULL DEFAULT 'event',   -- exam|event|ptm|sports|annual_day|vacation|training|holiday|working_day
  start_date  date NOT NULL,
  end_date    date,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_session ON public.academic_calendar (session);
CREATE INDEX IF NOT EXISTS idx_academic_calendar_start ON public.academic_calendar (start_date);

-- A few demo events in the 2026-2027 session so the calendar is populated.
INSERT INTO public.academic_calendar (session, title, event_type, start_date, end_date)
SELECT v.session, v.title, v.event_type, v.start_date::date, v.end_date::date
FROM (VALUES
  ('2026-2027', 'First Term Examinations', 'exam',        '2026-09-14', '2026-09-25'),
  ('2026-2027', 'Parent-Teacher Meeting',  'ptm',         '2026-10-10', NULL),
  ('2026-2027', 'Annual Sports Day',        'sports',      '2026-11-21', NULL),
  ('2026-2027', 'Winter Vacation',          'vacation',    '2026-12-25', '2027-01-05'),
  ('2026-2027', 'Annual Day',               'annual_day',  '2027-02-14', NULL),
  ('2026-2027', 'Teacher Training Workshop','training',    '2027-01-08', '2027-01-09')
) AS v(session, title, event_type, start_date, end_date)
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_calendar c WHERE c.title = v.title AND c.session = v.session
);
