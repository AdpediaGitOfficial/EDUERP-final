
-- Enums
CREATE TYPE public.attendance_status AS ENUM ('present','absent','late','excused');

-- Subjects
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects_read_auth" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "subjects_admin_all" ON public.subjects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Attendance
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  marked_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_admin_all" ON public.attendance FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "attendance_teacher_class" ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher') AND EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = attendance.class_id))
  WITH CHECK (public.has_role(auth.uid(),'teacher') AND EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = attendance.class_id));
CREATE POLICY "attendance_self_read" ON public.attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id AND s.profile_id = auth.uid()));
CREATE POLICY "attendance_parent_read" ON public.attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = auth.uid() AND ps.student_id = attendance.student_id));

-- Exams
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  exam_date DATE,
  max_marks NUMERIC NOT NULL DEFAULT 100,
  term TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exams_read_auth" ON public.exams FOR SELECT TO authenticated USING (true);
CREATE POLICY "exams_admin_all" ON public.exams FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Exam results
CREATE TABLE public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  marks_obtained NUMERIC NOT NULL DEFAULT 0,
  grade TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_results TO authenticated;
GRANT ALL ON public.exam_results TO service_role;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "results_admin_all" ON public.exam_results FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "results_self_read" ON public.exam_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = exam_results.student_id AND s.profile_id = auth.uid()));
CREATE POLICY "results_parent_read" ON public.exam_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = auth.uid() AND ps.student_id = exam_results.student_id));
CREATE POLICY "results_teacher_read" ON public.exam_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'teacher') AND EXISTS (
    SELECT 1 FROM public.exams e JOIN public.teacher_classes tc ON tc.class_id = e.class_id
    WHERE e.id = exam_results.exam_id AND tc.teacher_id = auth.uid()));

-- Timetable
CREATE TABLE public.timetable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable TO authenticated;
GRANT ALL ON public.timetable TO service_role;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timetable_read_auth" ON public.timetable FOR SELECT TO authenticated USING (true);
CREATE POLICY "timetable_admin_all" ON public.timetable FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Add roll_no to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS roll_no TEXT;

-- Seed some subjects, exams, results, attendance, timetable for existing students
DO $$
DECLARE
  s_rec RECORD;
  c_rec RECORD;
  subj_math UUID; subj_sci UUID; subj_eng UUID;
  exam_id UUID;
  d DATE;
BEGIN
  -- Give students a roll_no if missing
  FOR s_rec IN SELECT id, admission_no FROM public.students WHERE roll_no IS NULL LOOP
    UPDATE public.students SET roll_no = COALESCE(admission_no, substring(s_rec.id::text,1,6)) WHERE id = s_rec.id;
  END LOOP;

  FOR c_rec IN SELECT id, name FROM public.classes LOOP
    INSERT INTO public.subjects (class_id, name, code) VALUES (c_rec.id, 'Mathematics', 'MATH') RETURNING id INTO subj_math;
    INSERT INTO public.subjects (class_id, name, code) VALUES (c_rec.id, 'Science', 'SCI') RETURNING id INTO subj_sci;
    INSERT INTO public.subjects (class_id, name, code) VALUES (c_rec.id, 'English', 'ENG') RETURNING id INTO subj_eng;

    -- Timetable Mon-Fri
    INSERT INTO public.timetable (class_id, subject_id, day_of_week, start_time, end_time, room) VALUES
      (c_rec.id, subj_math, 1, '09:00', '10:00', 'Room A'),
      (c_rec.id, subj_sci,  1, '10:15', '11:15', 'Room B'),
      (c_rec.id, subj_eng,  1, '11:30', '12:30', 'Room A'),
      (c_rec.id, subj_math, 2, '09:00', '10:00', 'Room A'),
      (c_rec.id, subj_sci,  2, '10:15', '11:15', 'Room B'),
      (c_rec.id, subj_math, 3, '09:00', '10:00', 'Room A'),
      (c_rec.id, subj_eng,  3, '10:15', '11:15', 'Room A'),
      (c_rec.id, subj_sci,  4, '09:00', '10:00', 'Room B'),
      (c_rec.id, subj_eng,  4, '10:15', '11:15', 'Room A'),
      (c_rec.id, subj_math, 5, '09:00', '10:00', 'Room A');

    -- 3 exams per class
    INSERT INTO public.exams (class_id, subject_id, name, exam_date, max_marks, term) VALUES
      (c_rec.id, subj_math, 'Math Unit 1', CURRENT_DATE - 30, 100, 'Term 1');
    INSERT INTO public.exams (class_id, subject_id, name, exam_date, max_marks, term) VALUES
      (c_rec.id, subj_sci, 'Science Unit 1', CURRENT_DATE - 20, 100, 'Term 1');
    INSERT INTO public.exams (class_id, subject_id, name, exam_date, max_marks, term) VALUES
      (c_rec.id, subj_eng, 'English Unit 1', CURRENT_DATE - 10, 100, 'Term 1');
  END LOOP;

  -- Results and attendance for each student
  FOR s_rec IN SELECT id, class_id FROM public.students WHERE class_id IS NOT NULL LOOP
    FOR exam_id IN SELECT id FROM public.exams WHERE class_id = s_rec.class_id LOOP
      INSERT INTO public.exam_results (exam_id, student_id, marks_obtained)
      VALUES (exam_id, s_rec.id, 60 + floor(random()*35))
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Attendance for last 16 school days
    FOR i IN 0..21 LOOP
      d := CURRENT_DATE - i;
      IF EXTRACT(DOW FROM d) IN (0,6) THEN CONTINUE; END IF;
      INSERT INTO public.attendance (student_id, class_id, date, status)
      VALUES (s_rec.id, s_rec.class_id, d, CASE WHEN random() < 0.78 THEN 'present'::public.attendance_status WHEN random() < 0.5 THEN 'late'::public.attendance_status ELSE 'absent'::public.attendance_status END)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
