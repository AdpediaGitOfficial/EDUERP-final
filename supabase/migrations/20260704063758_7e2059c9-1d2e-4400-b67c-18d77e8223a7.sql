
-- ============================================================
-- 1. HOMEWORK TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homework (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework TO authenticated;
GRANT ALL ON public.homework TO service_role;

ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homework_read_auth" ON public.homework;
DROP POLICY IF EXISTS "homework_teacher_admin_write" ON public.homework;
CREATE POLICY "homework_read_auth" ON public.homework FOR SELECT TO authenticated USING (true);
CREATE POLICY "homework_teacher_admin_write" ON public.homework FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(),'teacher'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(),'teacher'::app_role));

DROP TRIGGER IF EXISTS update_homework_updated_at ON public.homework;
CREATE TRIGGER update_homework_updated_at BEFORE UPDATE ON public.homework
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. WIPE OPERATIONAL DATA
-- ============================================================
TRUNCATE public.homework, public.attendance, public.exam_results, public.exams,
         public.payments, public.fee_assignments, public.fee_structures,
         public.timetable, public.subjects, public.teacher_classes,
         public.parent_student, public.students, public.classes CASCADE;

-- Wipe demo student/parent auth users; keep admins, main teachers, greenwood staff
DELETE FROM auth.users WHERE email LIKE '%@student.test'
                          OR email LIKE '%@parent.test'
                          OR email LIKE '%@student.demo'
                          OR email LIKE '%@parent.demo';

-- ============================================================
-- 3. TEACHER AUTH ACCOUNTS (sync from public.teachers)
-- ============================================================
DO $$
DECLARE t RECORD; new_id uuid;
BEGIN
  FOR t IN SELECT * FROM public.teachers LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = t.email) THEN
      new_id := gen_random_uuid();
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (new_id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        t.email, crypt('Teacher@123', gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', t.full_name),
        false, '', '', '', '');
    END IF;
    -- Force teacher role
    UPDATE public.user_roles SET role='teacher'
      WHERE user_id = (SELECT id FROM auth.users WHERE email = t.email);
  END LOOP;
END $$;

-- ============================================================
-- 4. CLASSES (Grade 1-12)
-- ============================================================
INSERT INTO public.classes (name, section, academic_year) VALUES
  ('Grade 1','A','2026-27'),('Grade 1','B','2026-27'),('Grade 1','C','2026-27'),
  ('Grade 2','A','2026-27'),('Grade 2','B','2026-27'),('Grade 2','C','2026-27'),
  ('Grade 3','A','2026-27'),('Grade 3','B','2026-27'),('Grade 3','C','2026-27'),
  ('Grade 4','A','2026-27'),('Grade 4','B','2026-27'),('Grade 4','C','2026-27'),
  ('Grade 5','A','2026-27'),('Grade 5','B','2026-27'),('Grade 5','C','2026-27'),
  ('Grade 6','A','2026-27'),('Grade 6','B','2026-27'),('Grade 6','C','2026-27'),
  ('Grade 7','A','2026-27'),('Grade 7','B','2026-27'),('Grade 7','C','2026-27'),
  ('Grade 8','A','2026-27'),('Grade 8','B','2026-27'),('Grade 8','C','2026-27'),
  ('Grade 9','A','2026-27'),('Grade 9','B','2026-27'),
  ('Grade 10','A','2026-27'),('Grade 10','B','2026-27'),
  ('Grade 11','Science','2026-27'),('Grade 11','Commerce','2026-27'),
  ('Grade 12','Science','2026-27'),('Grade 12','Commerce','2026-27');

-- ============================================================
-- 5. SUBJECTS PER CLASS
-- ============================================================
DO $$
DECLARE c RECORD; grade_num int;
BEGIN
  FOR c IN SELECT * FROM public.classes LOOP
    grade_num := (regexp_matches(c.name, '\d+'))[1]::int;
    IF grade_num BETWEEN 1 AND 5 THEN
      INSERT INTO public.subjects (class_id,name,code) VALUES
        (c.id,'English','ENG'),(c.id,'Hindi','HIN'),(c.id,'Mathematics','MATH'),
        (c.id,'Environmental Studies','EVS'),(c.id,'Art & Craft','ART'),(c.id,'Physical Education','PE');
    ELSIF grade_num BETWEEN 6 AND 8 THEN
      INSERT INTO public.subjects (class_id,name,code) VALUES
        (c.id,'English','ENG'),(c.id,'Hindi','HIN'),(c.id,'Mathematics','MATH'),
        (c.id,'Science','SCI'),(c.id,'Social Studies','SST'),(c.id,'Computer Science','CS'),
        (c.id,'Sanskrit','SANS'),(c.id,'Physical Education','PE');
    ELSIF grade_num BETWEEN 9 AND 10 THEN
      INSERT INTO public.subjects (class_id,name,code) VALUES
        (c.id,'English','ENG'),(c.id,'Hindi','HIN'),(c.id,'Mathematics','MATH'),
        (c.id,'Science','SCI'),(c.id,'Social Studies','SST'),(c.id,'Computer Science','CS');
    ELSIF c.section = 'Science' THEN
      INSERT INTO public.subjects (class_id,name,code) VALUES
        (c.id,'English','ENG'),(c.id,'Physics','PHY'),(c.id,'Chemistry','CHEM'),
        (c.id,'Mathematics','MATH'),(c.id,'Biology','BIO'),(c.id,'Computer Science','CS');
    ELSE
      INSERT INTO public.subjects (class_id,name,code) VALUES
        (c.id,'English','ENG'),(c.id,'Accountancy','ACC'),(c.id,'Business Studies','BST'),
        (c.id,'Economics','ECO'),(c.id,'Mathematics','MATH');
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 6. ASSIGN CLASS TEACHERS (round-robin)
-- ============================================================
DO $$
DECLARE c RECORD; teacher_ids uuid[]; i int := 0;
BEGIN
  SELECT array_agg(u.id ORDER BY u.email) INTO teacher_ids
    FROM auth.users u JOIN public.teachers t ON t.email = u.email;
  IF teacher_ids IS NULL THEN RETURN; END IF;
  FOR c IN SELECT id FROM public.classes ORDER BY name, section LOOP
    INSERT INTO public.teacher_classes (teacher_id, class_id)
    VALUES (teacher_ids[(i % array_length(teacher_ids,1)) + 1], c.id)
    ON CONFLICT DO NOTHING;
    i := i + 1;
  END LOOP;
END $$;

-- ============================================================
-- 7. STUDENTS + PARENTS
-- ============================================================
DO $$
DECLARE
  c RECORD; grade_num int; i int; new_uid uuid; parent_uid uuid;
  first_names_boy text[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Ishaan','Shaurya','Atharv','Advik','Rohan','Kabir','Reyansh','Ayaan','Dhruv','Yash','Karan','Neel','Veer','Dev','Kartik'];
  first_names_girl text[] := ARRAY['Aanya','Diya','Saanvi','Aadhya','Kiara','Myra','Anaya','Riya','Meera','Sara','Tara','Zara','Ira','Anika','Navya','Ishita','Kavya','Nisha','Pari','Reet'];
  last_names text[] := ARRAY['Sharma','Verma','Iyer','Nair','Menon','Reddy','Rao','Gupta','Malhotra','Kapoor','Kumar','Singh','Chatterjee','Bose','Ghosh','Pillai','Mehta','Shah','Joshi','Patel','Khan','Bansal','Deshpande','Kulkarni','Chauhan','Sinha'];
  parent_prefix text[] := ARRAY['Rajesh','Anil','Suresh','Manoj','Vikram','Ramesh','Deepak','Sanjay','Amit','Ashok'];
  parent_prefix_f text[] := ARRAY['Priya','Sunita','Kavita','Neha','Anjali','Pooja','Divya','Meera','Rekha','Shalini'];
  fn text; ln text; student_name text; parent_name text; email text; adm text; roll int;
BEGIN
  FOR c IN SELECT * FROM public.classes ORDER BY name, section LOOP
    grade_num := (regexp_matches(c.name, '\d+'))[1]::int;
    FOR i IN 1..4 LOOP
      IF i % 2 = 0 THEN
        fn := first_names_boy[1 + (random()*(array_length(first_names_boy,1)-1))::int];
      ELSE
        fn := first_names_girl[1 + (random()*(array_length(first_names_girl,1)-1))::int];
      END IF;
      ln := last_names[1 + (random()*(array_length(last_names,1)-1))::int];
      student_name := fn || ' ' || ln;
      roll := i;
      adm := 'ADM-G' || grade_num::text || COALESCE(c.section,'') || '-' || lpad(roll::text,3,'0');
      email := lower(replace(adm,'-','')) || '@student.demo';

      new_uid := gen_random_uuid();
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (new_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        email, crypt('Student@123', gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', student_name),
        false,'','','','');

      -- students record (profile auto-created by handle_new_user trigger)
      INSERT INTO public.students (profile_id, class_id, admission_no, roll_no, admission_date)
      VALUES (new_uid, c.id, adm, lpad(roll::text,2,'0'),
              current_date - ((random()*365)::int));

      -- parent
      IF i % 2 = 0 THEN
        parent_name := parent_prefix[1 + (random()*(array_length(parent_prefix,1)-1))::int] || ' ' || ln;
      ELSE
        parent_name := parent_prefix_f[1 + (random()*(array_length(parent_prefix_f,1)-1))::int] || ' ' || ln;
      END IF;

      parent_uid := gen_random_uuid();
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (parent_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'parent.' || lower(replace(adm,'-','')) || '@parent.demo',
        crypt('Parent@123', gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', parent_name),
        false,'','','','');
      UPDATE public.profiles SET phone = '+91 98' || (1000000 + (random()*8999999)::int)::text
        WHERE id = parent_uid;
      UPDATE public.user_roles SET role='parent' WHERE user_id = parent_uid;

      INSERT INTO public.parent_student (parent_id, student_id, relationship)
        SELECT parent_uid, s.id, CASE WHEN i%2=0 THEN 'father' ELSE 'mother' END
        FROM public.students s WHERE s.profile_id = new_uid;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 8. TIMETABLE (5 weekdays × 6 periods per class)
-- ============================================================
DO $$
DECLARE
  c RECORD; subs uuid[]; sub_count int; t_id uuid;
  day int; period int;
  starts time[] := ARRAY['08:00'::time,'08:50','09:40','10:45','11:35','12:25'];
  ends   time[] := ARRAY['08:45'::time,'09:35','10:25','11:30','12:20','13:10'];
BEGIN
  FOR c IN SELECT id FROM public.classes LOOP
    SELECT array_agg(id) INTO subs FROM public.subjects WHERE class_id = c.id;
    IF subs IS NULL THEN CONTINUE; END IF;
    sub_count := array_length(subs,1);
    SELECT teacher_id INTO t_id FROM public.teacher_classes WHERE class_id = c.id LIMIT 1;
    FOR day IN 1..5 LOOP
      FOR period IN 1..6 LOOP
        INSERT INTO public.timetable (class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room)
        VALUES (c.id, subs[((day*7 + period) % sub_count) + 1], t_id, day, starts[period], ends[period],
                'Room ' || (100 + (random()*30)::int)::text);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 9. ATTENDANCE (last 15 school days for every student)
-- ============================================================
DO $$
DECLARE
  s RECORD; d date; r numeric; st attendance_status;
BEGIN
  FOR s IN SELECT id, class_id FROM public.students LOOP
    FOR i IN 1..21 LOOP
      d := current_date - i;
      IF extract(dow FROM d) IN (0,6) THEN CONTINUE; END IF;
      r := random();
      st := CASE WHEN r < 0.88 THEN 'present'::attendance_status
                 WHEN r < 0.96 THEN 'late'::attendance_status
                 ELSE 'absent'::attendance_status END;
      INSERT INTO public.attendance (student_id, class_id, date, status)
      VALUES (s.id, s.class_id, d, st) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 10. FEE STRUCTURES + ASSIGNMENTS + Q1 PAYMENTS
-- ============================================================
DO $$
DECLARE
  c RECORD; grade_num int; annual numeric; per_qtr numeric;
  fs_id uuid; s RECORD; qtr int; due_dates date[];
  fa_id uuid;
BEGIN
  due_dates := ARRAY['2026-07-15'::date,'2026-10-15','2027-01-15','2027-04-15'];
  FOR c IN SELECT * FROM public.classes LOOP
    grade_num := (regexp_matches(c.name, '\d+'))[1]::int;
    annual := CASE
      WHEN grade_num BETWEEN 1 AND 5 THEN 24000
      WHEN grade_num BETWEEN 6 AND 8 THEN 32000
      WHEN grade_num BETWEEN 9 AND 10 THEN 40000
      ELSE 48000
    END;
    per_qtr := annual / 4;
    INSERT INTO public.fee_structures (name, class_id, amount, term, academic_year, frequency)
    VALUES (c.name || ' ' || COALESCE(c.section,'') || ' — Tuition', c.id, per_qtr, 'Quarterly', '2026-27', 'quarterly')
    RETURNING id INTO fs_id;

    FOR s IN SELECT id FROM public.students WHERE class_id = c.id LOOP
      FOR qtr IN 1..4 LOOP
        INSERT INTO public.fee_assignments (student_id, structure_id, title, amount_due, due_date)
        VALUES (s.id, fs_id, 'Q' || qtr || ' Tuition — ' || c.name || COALESCE(' ' || c.section,''),
                per_qtr, due_dates[qtr])
        RETURNING id INTO fa_id;
        IF qtr = 1 THEN
          INSERT INTO public.payments (fee_assignment_id, student_id, amount, method, reference, notes)
          VALUES (fa_id, s.id, per_qtr, 'online', 'UPI · Q1 seed', 'Auto-seeded');
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 11. EXAMS (Term 1 with results, Term 2 upcoming)
-- ============================================================
DO $$
DECLARE
  c RECORD; subj RECORD; s RECORD; ex_id uuid;
  marks numeric; grade_letter text;
BEGIN
  FOR c IN SELECT id FROM public.classes LOOP
    FOR subj IN SELECT id, name FROM public.subjects WHERE class_id = c.id LOOP
      -- Term 1 (past)
      INSERT INTO public.exams (class_id, subject_id, name, exam_date, max_marks, term)
      VALUES (c.id, subj.id, subj.name || ' — Mid-Term', current_date - 30, 100, 'Term 1')
      RETURNING id INTO ex_id;
      FOR s IN SELECT id FROM public.students WHERE class_id = c.id LOOP
        marks := 55 + (random()*44)::numeric(5,2);
        grade_letter := CASE
          WHEN marks >= 90 THEN 'A+' WHEN marks >= 80 THEN 'A'
          WHEN marks >= 70 THEN 'B+' WHEN marks >= 60 THEN 'B'
          WHEN marks >= 50 THEN 'C' ELSE 'D' END;
        INSERT INTO public.exam_results (exam_id, student_id, marks_obtained, grade)
        VALUES (ex_id, s.id, round(marks,1), grade_letter);
      END LOOP;

      -- Term 2 (upcoming, no results yet)
      INSERT INTO public.exams (class_id, subject_id, name, exam_date, max_marks, term)
      VALUES (c.id, subj.id, subj.name || ' — Final', current_date + 45, 100, 'Term 2');
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 12. HOMEWORK (3 per class, mixed statuses / due dates)
-- ============================================================
DO $$
DECLARE
  c RECORD; subj RECORD; t_id uuid; i int; picked_subs uuid[];
  titles text[] := ARRAY[
    'Complete exercise problems from the workbook',
    'Prepare a short presentation on the current chapter',
    'Read the assigned chapter and write a summary',
    'Solve the practice paper attached in class',
    'Group project — collaborate and submit the writeup',
    'Revise last week''s topic and attempt the quiz'
  ];
BEGIN
  FOR c IN SELECT id FROM public.classes LOOP
    SELECT array_agg(id) INTO picked_subs FROM public.subjects WHERE class_id = c.id;
    IF picked_subs IS NULL THEN CONTINUE; END IF;
    SELECT teacher_id INTO t_id FROM public.teacher_classes WHERE class_id = c.id LIMIT 1;
    FOR i IN 1..3 LOOP
      INSERT INTO public.homework (class_id, subject_id, teacher_id, title, description,
                                   assigned_date, due_date, status)
      VALUES (c.id,
              picked_subs[1 + ((i-1) % array_length(picked_subs,1))],
              t_id,
              titles[1 + ((i-1) % array_length(titles,1))],
              'Please complete before the due date. Submissions accepted in class.',
              current_date - (i*2),
              current_date + (5 - i*2),
              'active');
    END LOOP;
  END LOOP;
END $$;
