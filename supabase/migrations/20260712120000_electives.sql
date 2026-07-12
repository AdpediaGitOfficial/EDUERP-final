-- Elective offerings + student enrolment with seat capacity and a waitlist.
-- New domain — nothing existing is touched. Idempotent.

CREATE TABLE IF NOT EXISTS public.elective_offerings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text,
  description   text,
  session       text,                               -- academic_year the elective runs in
  grade_level   text,                               -- free-text eligibility hint (e.g. "Grade 9-10")
  seat_capacity int NOT NULL DEFAULT 30,
  subject_id    uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.elective_enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.elective_offerings(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'enrolled',      -- enrolled|waitlisted|dropped
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_elective_enrollments_offering ON public.elective_enrollments (offering_id);
CREATE INDEX IF NOT EXISTS idx_elective_enrollments_student ON public.elective_enrollments (student_id);

-- Two demo electives in the current-ish session so the screen is populated.
INSERT INTO public.elective_offerings (name, code, description, session, grade_level, seat_capacity)
SELECT v.name, v.code, v.description, v.session, v.grade_level, v.seat_capacity
FROM (VALUES
  ('Robotics Club',   'ELE-ROB', 'Hands-on robotics and automation', '2026-2027', 'Grade 6-10', 25),
  ('Creative Writing','ELE-WRI', 'Fiction, poetry and journalism',   '2026-2027', 'Grade 8-12', 30)
) AS v(name, code, description, session, grade_level, seat_capacity)
WHERE NOT EXISTS (SELECT 1 FROM public.elective_offerings o WHERE o.code = v.code);
