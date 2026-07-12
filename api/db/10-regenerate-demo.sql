-- ===========================================================================
-- Regenerate the demo database: ~1,000 students with realistic, fully-linked
-- data, while PRESERVING the demo login accounts and the David Fernandez family.
--
-- Re-runnable: wipes all non-preserved students/parents and their dependent
-- rows, then generates a fresh cohort. Every generated account uses the demo
-- password (Greenwood@2026). Run inside a single transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/db/10-regenerate-demo.sql
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  pw       text := '$2a$06$66HHHAJE7g2jWkLtsFlN0.LPuLXIuSd0vhEuvuVPeDAsQQha0oekG';
  n_target int  := 1000;
  fnames_m text[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan','Kabir','Ansh','Dhruv','Yuvan','Ayaan','Atharv','Advik','Rudra','Om','Kartik','Neel','Parth','Shaurya','Devansh','Aryan','Laksh','Veer','Ved','Nirvaan','Rishaan'];
  fnames_f text[] := ARRAY['Aadhya','Ananya','Diya','Ira','Myra','Sara','Anika','Navya','Kiara','Aarohi','Riya','Pari','Siya','Aditi','Prisha','Ishita','Kavya','Meera','Saanvi','Tara','Nisha','Aisha','Avni','Bhavya','Charvi','Divya','Gauri','Jiya','Mahi','Riddhi'];
  lnames   text[] := ARRAY['Sharma','Verma','Gupta','Reddy','Nair','Iyer','Menon','Rao','Patel','Shah','Singh','Kumar','Das','Bose','Chatterjee','Mukherjee','Joshi','Desai','Kulkarni','Deshpande','Pillai','Mehta','Kapoor','Malhotra','Chopra','Bhat','Naidu','Pandey','Mishra','Yadav'];
  streets  text[] := ARRAY['MG Road','Park Street','Nehru Nagar','Gandhi Marg','Lake View','Green Park','Rose Villa','Sunrise Colony','Palm Grove','Hill Top'];
  cities   text[] := ARRAY['Bengaluru','Mumbai','Pune','Chennai','Hyderabad','Delhi','Kolkata','Ahmedabad'];
BEGIN
  -- ---- 0. Preserve sets ----------------------------------------------------
  CREATE TEMP TABLE _keep_students ON COMMIT DROP AS
    SELECT id FROM public.students
    WHERE id IN ('de000000-0000-4000-8000-000000000001',
                 'de000000-0000-4000-8000-000000000002',
                 'de000000-0000-4000-8000-000000000003')
    UNION
    SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.email = 'student@greenwood.test';

  CREATE TEMP TABLE _keep_profiles ON COMMIT DROP AS
    SELECT id FROM public.profiles
      WHERE email IN ('admin@greenwood.test','teacher@greenwood.test','student@greenwood.test',
                      'parent@greenwood.test','david.fernandez@family.demo','maria.fernandez@family.demo')
    UNION
    SELECT user_id FROM public.user_roles WHERE role NOT IN ('student','parent')
    UNION
    SELECT profile_id FROM public.students WHERE id IN (SELECT id FROM _keep_students)
    UNION
    -- keep guardians of preserved students (David/Maria already covered)
    SELECT parent_id FROM public.parent_student WHERE student_id IN (SELECT id FROM _keep_students);

  -- ---- 1. Delete dependent rows for non-preserved students -----------------
  UPDATE public.admission_enquiries SET converted_student_id = NULL
    WHERE converted_student_id IS NOT NULL AND converted_student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.attendance            WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.exam_results          WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.fee_assignments       WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.payments              WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.homework_submissions  WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.progress_notes        WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.complaints            WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.library_loans         WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.route_students        WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.student_medical       WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.student_hostel        WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.student_disciplinary  WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.student_documents     WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.student_activity_log  WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.student_details       WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.parent_student        WHERE student_id NOT IN (SELECT id FROM _keep_students);
  DELETE FROM public.students              WHERE id NOT IN (SELECT id FROM _keep_students);

  -- ---- 2. Delete orphaned student/parent profiles + their auth rows --------
  -- Remove student/parent role rows for non-preserved identities.
  DELETE FROM public.user_roles
    WHERE role IN ('student','parent') AND user_id NOT IN (SELECT id FROM _keep_profiles);
  -- Profiles that now have no roles at all and are not preserved are ex
  -- students / parents / guardian-only rows: delete them and their auth users.
  CREATE TEMP TABLE _drop_profiles ON COMMIT DROP AS
    SELECT p.id FROM public.profiles p
    WHERE p.id NOT IN (SELECT id FROM _keep_profiles)
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = p.id);
  DELETE FROM public.profiles   WHERE id IN (SELECT id FROM _drop_profiles);
  DELETE FROM auth.users        WHERE id IN (SELECT id FROM _drop_profiles);

  -- ---- 3. Canonical classes (Nursery, KG, Grade 1-12) x sections A-D --------
  INSERT INTO public.classes (name, section, academic_year)
  SELECT g, s, '2026-2027'
  FROM unnest(ARRAY['Nursery','KG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
                    'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12']) g
  CROSS JOIN unnest(ARRAY['A','B','C','D']) s
  ON CONFLICT (name, section, academic_year) DO NOTHING;

  -- Assign a class teacher to every canonical A-D class that lacks one.
  WITH ts AS (
    SELECT user_id, row_number() OVER (ORDER BY user_id) AS rn
    FROM public.user_roles WHERE role = 'teacher'
  ), cl AS (
    SELECT id, row_number() OVER (ORDER BY name, section) AS rn,
           (SELECT count(*) FROM ts) AS ntead
    FROM public.classes
    WHERE section IN ('A','B','C','D') AND class_teacher_id IS NULL
  )
  UPDATE public.classes c SET class_teacher_id = ts.user_id
  FROM cl JOIN ts ON ts.rn = ((cl.rn - 1) % NULLIF(cl.ntead,0)) + 1
  WHERE c.id = cl.id;

  -- Give the demo teacher (teacher@greenwood.test) a handful of classes so the
  -- teacher dashboard/roster demo is rich rather than showing a single class.
  DELETE FROM public.teacher_classes
    WHERE teacher_id = '84811e91-6898-4137-ba75-4e39c1adc162';
  INSERT INTO public.teacher_classes (teacher_id, class_id)
  SELECT '84811e91-6898-4137-ba75-4e39c1adc162', id
  FROM public.classes
  WHERE name = 'Grade 8' AND section IN ('A','B','C','D');
  UPDATE public.classes SET class_teacher_id = '84811e91-6898-4137-ba75-4e39c1adc162'
  WHERE name = 'Grade 8' AND section = 'A';

  -- ---- 4. Build family + student generation tables -------------------------
  -- One canonical class per (name, section) — prefer the newest academic year
  -- so we don't spread students across near-duplicate class rows.
  CREATE TEMP TABLE _cls ON COMMIT DROP AS
    WITH picked AS (
      SELECT DISTINCT ON (c.name, c.section) c.id, c.name, c.section
      FROM public.classes c
      WHERE c.section IN ('A','B','C','D')
        AND c.name IN ('Nursery','KG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
                       'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12')
      -- Prefer the class a preserved student already sits in, so the new cohort
      -- joins it instead of spawning a duplicate name+section row.
      ORDER BY c.name, c.section,
               (EXISTS (SELECT 1 FROM public.students s WHERE s.class_id = c.id)) DESC,
               c.academic_year DESC NULLS LAST, c.created_at DESC
    )
    SELECT id, name, section,
           CASE name WHEN 'Nursery' THEN 3 WHEN 'KG' THEN 4
             ELSE 5 + NULLIF(regexp_replace(name,'\D','','g'),'')::int END AS age,
           row_number() OVER (ORDER BY
             CASE name WHEN 'Nursery' THEN 0 WHEN 'KG' THEN 1
               ELSE NULLIF(regexp_replace(name,'\D','','g'),'')::int + 1 END, section) AS rn
    FROM picked;

  -- Families: variable 1-3 children; enough to reach ~n_target students.
  CREATE TEMP TABLE _fam ON COMMIT DROP AS
    SELECT gs AS fam_no,
           gen_random_uuid() AS father_id,
           gen_random_uuid() AS mother_id,
           lnames[1 + (random()*(array_length(lnames,1)-1))::int] AS last_name,
           1 + (random() < 0.35)::int + (random() < 0.15)::int AS n_kids,
           '+91 ' || (70 + (random()*29)::int)::text || ' ' || lpad((random()*99999999)::bigint::text, 8, '0') AS phone,
           (1 + (random()*9)::int)::text || ' ' || streets[1+(random()*(array_length(streets,1)-1))::int]
             || ', ' || cities[1+(random()*(array_length(cities,1)-1))::int] AS address,
           fnames_m[1+(random()*(array_length(fnames_m,1)-1))::int] AS father_first,
           fnames_f[1+(random()*(array_length(fnames_f,1)-1))::int] AS mother_first
    FROM generate_series(1, (n_target)::int) gs;   -- upper bound; trimmed below

  -- Expand to children, then keep only the first n_target.
  CREATE TEMP TABLE _stu ON COMMIT DROP AS
    SELECT row_number() OVER (ORDER BY f.fam_no, k) AS sno,
           f.fam_no,
           gen_random_uuid() AS student_uid,   -- profile / auth id
           gen_random_uuid() AS student_id,    -- students.id
           (random() < 0.5) AS is_male,
           NULL::uuid AS class_id
    FROM _fam f CROSS JOIN LATERAL generate_series(1, f.n_kids) k;
  DELETE FROM _stu WHERE sno > n_target;
  -- Trim families that ended up with no retained children.
  DELETE FROM _fam WHERE fam_no NOT IN (SELECT fam_no FROM _stu);

  -- Spread students evenly across classes (round-robin by sno).
  UPDATE _stu s SET class_id = c.id
  FROM _cls c
  WHERE c.rn = ((s.sno - 1) % (SELECT count(*) FROM _cls)) + 1;

  -- Enrich _stu with name/dob now that gender + class are known.
  ALTER TABLE _stu ADD COLUMN first_name text;
  ALTER TABLE _stu ADD COLUMN dob date;
  UPDATE _stu s SET
    first_name = CASE WHEN s.is_male
                   THEN fnames_m[1+(random()*(array_length(fnames_m,1)-1))::int]
                   ELSE fnames_f[1+(random()*(array_length(fnames_f,1)-1))::int] END,
    dob = make_date(2026 - c.age, 1 + (random()*11)::int, 1 + (random()*27)::int)
  FROM _cls c WHERE c.id = s.class_id;

  -- ---- 5. Insert parent accounts ------------------------------------------
  INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at)
  SELECT father_id, 'father.fam' || fam_no || '@demo.greenwood.test', pw, 'authenticated','authenticated', now()
  FROM _fam ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles p SET
    full_name = f.father_first || ' ' || f.last_name,
    email = 'father.fam' || f.fam_no || '@demo.greenwood.test',
    phone = f.phone, address = f.address,
    occupation = (ARRAY['Engineer','Doctor','Teacher','Businessman','Accountant','Farmer','Officer','Manager'])[1+(random()*7)::int],
    parent_code = 'PAR-F' || lpad(f.fam_no::text, 5, '0')
  FROM _fam f WHERE p.id = f.father_id;
  INSERT INTO public.user_roles (user_id, role) SELECT father_id, 'parent' FROM _fam ON CONFLICT DO NOTHING;

  -- Mothers as login-less guardian profiles (direct insert; no auth row).
  INSERT INTO public.profiles (id, full_name, phone, address, occupation, parent_code)
  SELECT mother_id, mother_first || ' ' || last_name, phone, address,
         (ARRAY['Homemaker','Teacher','Doctor','Nurse','Designer','Manager'])[1+(random()*5)::int],
         'PAR-M' || lpad(fam_no::text, 5, '0')
  FROM _fam ON CONFLICT (id) DO NOTHING;

  -- ---- 6. Insert student accounts + students + details --------------------
  INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at)
  SELECT student_uid, 'student.' || sno || '@demo.greenwood.test', pw, 'authenticated','authenticated', now()
  FROM _stu ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles p SET
    full_name = s.first_name || ' ' || f.last_name,
    email = 'student.' || s.sno || '@demo.greenwood.test'
  FROM _stu s JOIN _fam f ON f.fam_no = s.fam_no WHERE p.id = s.student_uid;
  INSERT INTO public.user_roles (user_id, role) SELECT student_uid, 'student' FROM _stu ON CONFLICT DO NOTHING;

  -- Start new rolls above any preserved student's roll in each class.
  INSERT INTO public.students (id, profile_id, class_id, admission_no, roll_no, gender, status, admission_date)
  SELECT s.student_id, s.student_uid, s.class_id,
         public.next_admission_no(),
         lpad((COALESCE(b.mx, 0)
               + row_number() OVER (PARTITION BY s.class_id ORDER BY s.sno))::text, 2, '0'),
         CASE WHEN s.is_male THEN 'male' ELSE 'female' END,
         'active',
         make_date(2026, 4, 1) + ((random()*120)::int)
  FROM _stu s
  LEFT JOIN (
    SELECT class_id,
           COALESCE(MAX(CAST(NULLIF(regexp_replace(roll_no, '\D', '', 'g'), '') AS int)), 0) AS mx
    FROM public.students GROUP BY class_id
  ) b ON b.class_id = s.class_id;

  INSERT INTO public.student_details (student_id, first_name, last_name, dob, nationality, current_address, permanent_address, religion, category_id)
  SELECT s.student_id, s.first_name, f.last_name, s.dob, 'Indian', f.address, f.address,
         (ARRAY['Hindu','Muslim','Christian','Sikh','Jain'])[1+(random()*4)::int],
         (SELECT id FROM public.student_categories ORDER BY random() LIMIT 1)
  FROM _stu s JOIN _fam f ON f.fam_no = s.fam_no;

  -- ---- 7. Parent <-> student mapping (father primary, mother guardian) -----
  INSERT INTO public.parent_student
    (parent_id, student_id, relationship, relationship_type, is_primary, pickup_permission, fee_responsible, emergency_contact, lives_with)
  SELECT f.father_id, s.student_id, 'parent','father', true, true, true, false, true
  FROM _stu s JOIN _fam f ON f.fam_no = s.fam_no
  ON CONFLICT (parent_id, student_id) DO NOTHING;
  INSERT INTO public.parent_student
    (parent_id, student_id, relationship, relationship_type, is_primary, pickup_permission, fee_responsible, emergency_contact, lives_with)
  SELECT f.mother_id, s.student_id, 'parent','mother', false, true, false, true, true
  FROM _stu s JOIN _fam f ON f.fam_no = s.fam_no
  ON CONFLICT (parent_id, student_id) DO NOTHING;

  -- ---- 8. Fees: one tuition assignment per student -------------------------
  INSERT INTO public.fee_assignments (student_id, title, amount_due, amount_paid, due_date, status)
  SELECT s.student_id, 'Tuition Fee 2026-27',
         (ARRAY[15000,18000,22000,25000])[1+(random()*3)::int],
         0, make_date(2026, 6, 30), 'pending'::fee_status
  FROM _stu s;
  -- Mark ~60% as fully/partly paid for realistic dashboards.
  UPDATE public.fee_assignments fa SET
    amount_paid = CASE WHEN r < 0.4 THEN amount_due ELSE round(amount_due * 0.5) END,
    status      = (CASE WHEN r < 0.4 THEN 'paid' ELSE 'partial' END)::fee_status
  FROM (SELECT student_id, random() AS r FROM _stu) x
  WHERE fa.student_id = x.student_id AND x.r < 0.6;

  -- ---- 9. Attendance: last 40 weekdays, mostly present --------------------
  INSERT INTO public.attendance (student_id, class_id, date, status)
  SELECT s.student_id, s.class_id, d::date,
         (CASE WHEN rr < 0.90 THEN 'present' WHEN rr < 0.95 THEN 'late'
               WHEN rr < 0.98 THEN 'absent' ELSE 'excused' END)::attendance_status
  FROM _stu s
  CROSS JOIN LATERAL (
    SELECT d, random() AS rr FROM generate_series(current_date - 56, current_date, interval '1 day') d
    WHERE extract(dow FROM d) BETWEEN 1 AND 5
  ) days
  ON CONFLICT (student_id, date) DO NOTHING;

  -- ---- 10. Exams + results per class ---------------------------------------
  -- Ensure each active class has at least a couple of subjects.
  INSERT INTO public.subjects (class_id, name)
  SELECT c.id, sub
  FROM _cls c CROSS JOIN unnest(ARRAY['English','Mathematics','Science']) sub
  WHERE NOT EXISTS (SELECT 1 FROM public.subjects s2 WHERE s2.class_id = c.id AND s2.name = sub);

  CREATE TEMP TABLE _exam ON COMMIT DROP AS
    WITH ins AS (
      INSERT INTO public.exams (class_id, subject_id, name, exam_date, max_marks, term)
      SELECT c.id, sj.id, 'Term 1 - ' || sj.name, current_date - 20, 100, 'Term 1'
      FROM _cls c JOIN public.subjects sj ON sj.class_id = c.id
      RETURNING id, class_id
    ) SELECT id, class_id FROM ins;

  INSERT INTO public.exam_results (exam_id, student_id, marks_obtained, grade)
  SELECT e.id, s.student_id, m,
         CASE WHEN m >= 85 THEN 'A' WHEN m >= 70 THEN 'B' WHEN m >= 55 THEN 'C'
              WHEN m >= 40 THEN 'D' ELSE 'E' END
  FROM _stu s
  JOIN _exam e ON e.class_id = s.class_id
  CROSS JOIN LATERAL (SELECT (40 + random()*60)::int AS m) mm
  ON CONFLICT (exam_id, student_id) DO NOTHING;

  RAISE NOTICE 'Regeneration complete: % students generated.', (SELECT count(*) FROM _stu);
END $$;

COMMIT;
