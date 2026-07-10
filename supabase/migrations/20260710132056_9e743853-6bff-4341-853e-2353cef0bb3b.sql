
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON public.attendance(class_id, date);
CREATE INDEX IF NOT EXISTS idx_fee_assignments_student_status ON public.fee_assignments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student_hw ON public.homework_submissions(student_id, homework_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student ON public.parent_student(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results(student_id);
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON public.students(admission_no);
CREATE INDEX IF NOT EXISTS idx_students_roll_no ON public.students(roll_no);

INSERT INTO public.classes (name, section)
SELECT g.name, s.section
FROM unnest(ARRAY['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12']) AS g(name)
CROSS JOIN unnest(ARRAY['A','B','C','D','E','F','G','H']) AS s(section)
WHERE NOT EXISTS (
  SELECT 1 FROM public.classes c WHERE c.name = g.name AND c.section = s.section
);

DO $seed$
DECLARE
  target_per_class INT := 52;
  current_students INT;
  fname_pool TEXT[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan','Rudra','Aryan','Kabir','Ansh','Yash','Dev','Aarush','Kartik','Rohan','Veer','Ira','Aadhya','Aanya','Anika','Diya','Ishita','Kiara','Myra','Navya','Pari','Riya','Saanvi','Sara','Tara','Zara','Advika','Prisha','Reet','Tvisha','Anaya'];
  lname_pool TEXT[] := ARRAY['Sharma','Verma','Gupta','Patel','Kumar','Iyer','Menon','Nair','Rao','Reddy','Chatterjee','Bose','Kapoor','Malhotra','Sinha','Chauhan','Joshi','Desai','Bansal','Krishnan','Singh','Ghosh'];
  parent_first_pool TEXT[] := ARRAY['Rajesh','Suresh','Anil','Vikram','Ravi','Mohan','Arun','Deepak','Sanjay','Manoj','Sunita','Kavita','Meena','Priya','Neha','Anita','Poonam','Rekha','Shalini','Uma'];
BEGIN
  SELECT COUNT(*) INTO current_students FROM public.students;
  IF current_students >= 4500 THEN
    RAISE NOTICE 'Seed already applied: % students exist, skipping', current_students;
    RETURN;
  END IF;

  CREATE TEMP TABLE _class_needs ON COMMIT DROP AS
  SELECT c.id AS class_id, c.name AS cname, COALESCE(c.section, 'X') AS csection,
         GREATEST(0, target_per_class - COALESCE((SELECT COUNT(*) FROM public.students s WHERE s.class_id = c.id), 0))::int AS need,
         COALESCE((SELECT MAX(CAST(NULLIF(regexp_replace(s2.roll_no, '\D', '', 'g'), '') AS INT))
                   FROM public.students s2 WHERE s2.class_id = c.id), 0)::int AS start_roll
  FROM public.classes c;

  CREATE TEMP TABLE _new_students ON COMMIT DROP AS
  WITH positions AS (
    SELECT cn.class_id, cn.cname, cn.csection, (cn.start_roll + gs)::int AS roll_num,
           (row_number() OVER (ORDER BY cn.class_id, gs))::int AS seq
    FROM _class_needs cn, generate_series(1, cn.need) gs
    WHERE cn.need > 0
  )
  SELECT
    gen_random_uuid() AS student_profile_id,
    gen_random_uuid() AS student_id,
    gen_random_uuid() AS parent_profile_id,
    class_id, cname, csection,
    lpad(roll_num::text, 2, '0') AS roll_no,
    ('ADM-DEMO-' || lpad(seq::text, 5, '0')) AS adm_no,
    fname_pool[1 + ((seq * 37 - 1) % array_length(fname_pool, 1))] AS fname,
    lname_pool[1 + ((seq * 13 - 1) % array_length(lname_pool, 1))] AS lname,
    parent_first_pool[1 + ((seq * 17 - 1) % array_length(parent_first_pool, 1))] AS pfname,
    CASE WHEN (seq % 2) = 0 THEN 'male' ELSE 'female' END AS gender,
    seq
  FROM positions;

  RAISE NOTICE 'Preparing % new students', (SELECT COUNT(*) FROM _new_students);

  INSERT INTO public.profiles (id, full_name, email)
  SELECT student_profile_id, fname || ' ' || lname,
         'seed.student.' || seq::text || '@demo.local'
  FROM _new_students;

  INSERT INTO public.profiles (id, full_name, email, phone)
  SELECT parent_profile_id, pfname || ' ' || lname,
         'seed.parent.' || seq::text || '@demo.local',
         '9' || lpad(((seq::bigint * 1234567) % 1000000000)::text, 9, '0')
  FROM _new_students;

  INSERT INTO public.students (id, profile_id, class_id, admission_no, roll_no, gender, admission_date)
  SELECT student_id, student_profile_id, class_id, adm_no, roll_no, gender,
         CURRENT_DATE - ((seq % 1500)::int)
  FROM _new_students;

  INSERT INTO public.parent_student (parent_id, student_id, relationship)
  SELECT parent_profile_id, student_id,
    CASE WHEN pfname = ANY (ARRAY['Sunita','Kavita','Meena','Priya','Neha','Anita','Poonam','Rekha','Shalini','Uma']) THEN 'mother' ELSE 'father' END
  FROM _new_students;

  INSERT INTO public.fee_assignments (student_id, structure_id, title, amount_due, amount_paid, due_date, status)
  SELECT ns.student_id,
         (SELECT id FROM public.fee_structures LIMIT 1),
         'Term 1 Tuition',
         15000::numeric,
         CASE WHEN (ns.seq % 10) < 7 THEN 15000::numeric
              WHEN (ns.seq % 10) < 9 THEN 7500::numeric
              ELSE 0::numeric END,
         CURRENT_DATE + (((ns.seq % 60) - 30)::int),
         (CASE WHEN (ns.seq % 10) < 7 THEN 'paid'
               WHEN (ns.seq % 10) < 9 THEN 'partial'
               ELSE 'pending' END)::fee_status
  FROM _new_students ns;

  INSERT INTO public.attendance (student_id, class_id, date, status)
  SELECT ns.student_id, ns.class_id, (CURRENT_DATE - d::int),
    CASE
      WHEN ((ns.seq + d) % 20) = 0 THEN 'absent'::attendance_status
      WHEN ((ns.seq + d) % 15) = 0 THEN 'late'::attendance_status
      WHEN ((ns.seq + d) % 25) = 0 THEN 'excused'::attendance_status
      ELSE 'present'::attendance_status
    END
  FROM _new_students ns
  CROSS JOIN generate_series(0, 59) d
  WHERE EXTRACT(dow FROM (CURRENT_DATE - d::int)) NOT IN (0, 6);

  RAISE NOTICE 'Seed complete';
END $seed$;
