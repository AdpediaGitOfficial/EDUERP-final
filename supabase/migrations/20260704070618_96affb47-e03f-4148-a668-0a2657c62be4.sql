
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $seed$
DECLARE
  v_teacher uuid := '11111111-1111-1111-1111-111111111008';
  v_pwd     text := crypt('Teacher@123', gen_salt('bf'));
  v_c8a   uuid := '4a99fe58-59b1-4503-b833-213f4e16d92b';
  v_c9b   uuid := 'bde05e4b-561e-4a91-a355-648b2fe665b3';
  v_c10a  uuid := 'ac43dc1d-505d-4b49-91c1-4298c1d5bd40';
  v_s8a   uuid := 'e1ea2e15-aff0-434d-857b-a0a8d87e25b2';
  v_s9b   uuid := 'bf0edb11-ecd3-4a70-9193-b4192c4795f3';
  v_s10a  uuid := '6917de0b-2637-44a2-be0d-e606fb15c43e';

  fnames_m text[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan','Rohan','Aryan','Kabir','Advait','Dhruv','Yash','Ansh','Kartik','Ritvik','Shaurya','Rudra','Ved','Neel','Arnav','Om'];
  fnames_f text[] := ARRAY['Aanya','Aadhya','Diya','Ananya','Pari','Anika','Navya','Kiara','Myra','Sara','Ishita','Riya','Anaya','Prisha','Siya','Aarohi','Meera','Anvi','Tara','Zara','Nitya','Advika','Amaira','Kavya','Ira'];
  snames  text[] := ARRAY['Sharma','Verma','Iyer','Nair','Menon','Kapoor','Kumar','Reddy','Rao','Singh','Gupta','Joshi','Mehta','Patel','Desai','Chatterjee','Bose','Bhat','Krishnan','Pillai','Agarwal','Malhotra','Shah','Chopra','Sinha'];
  parent_titles text[] := ARRAY['Rajesh','Suresh','Anil','Vikram','Manoj','Sanjay','Deepak','Amit','Praveen','Ravi','Sunita','Kavita','Rekha','Meena','Anjali','Sushma','Neha','Pooja','Priya','Lakshmi'];

  v_row     record;
  i         int;
  v_class   uuid;
  v_subject uuid;
  v_grade   text;
  v_sec     text;
  v_sid     uuid;
  v_pid     uuid;
  v_stu     uuid;
  v_fn      text;
  v_sn      text;
  v_full    text;
  v_email   text;
  v_padd    int;
  v_start   int;
  v_roll    int;
  v_fee_id  uuid;
  v_fee_amt numeric;
  v_status_txt text;
  v_hw_titles text[] := ARRAY[
    'Algebra Worksheet - Ch 4','Linear Equations Practice Set','Geometry Ch 6 Exercises','Trigonometry Basics Homework',
    'Quadratic Equations Set A','Probability Assignment','Statistics Data Handling','Real Numbers Practice',
    'Polynomials Worksheet','Coordinate Geometry Ch 7','Surface Area & Volume','Constructions Practice',
    'Circles Ch 10 Exercises','Arithmetic Progressions','Triangles Similarity Set','Areas Related to Circles',
    'Introduction to Trigonometry','Mensuration Practice Set'
  ];
  v_hw_class uuid;
  v_hw_subj  uuid;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_teacher,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'anjali.nair@school.edu', v_pwd, now(),
    jsonb_build_object('provider','email','providers', ARRAY['email']),
    jsonb_build_object('full_name','Anjali Nair'),
    now(), now(),'','','',''
  ) ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email = EXCLUDED.email,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    updated_at = now();

  INSERT INTO public.profiles(id, full_name, email, phone)
  VALUES (v_teacher,'Anjali Nair','anjali.nair@school.edu','+91 98450 10008')
  ON CONFLICT (id) DO UPDATE SET full_name='Anjali Nair', email='anjali.nair@school.edu', phone='+91 98450 10008';

  DELETE FROM public.user_roles WHERE user_id = v_teacher;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_teacher, 'teacher');

  INSERT INTO public.teachers(id, full_name, email, phone, subject, qualification, experience_years, joined_date, status)
  VALUES (v_teacher,'Anjali Nair','anjali.nair@school.edu','+91 98450 10008','Mathematics','M.Sc. Mathematics, B.Ed.',9,'2017-06-15','active')
  ON CONFLICT (id) DO UPDATE SET
    full_name='Anjali Nair', email='anjali.nair@school.edu', phone='+91 98450 10008',
    subject='Mathematics', qualification='M.Sc. Mathematics, B.Ed.', experience_years=9,
    joined_date='2017-06-15', status='active';

  INSERT INTO public.teacher_classes(teacher_id, class_id)
  VALUES (v_teacher, v_c8a), (v_teacher, v_c9b), (v_teacher, v_c10a)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.timetable WHERE teacher_id = v_teacher;
  FOR i IN 1..5 LOOP
    INSERT INTO public.timetable(class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room) VALUES
      (v_c8a,  v_s8a,  v_teacher, i, '09:00','09:45','Room 8A'),
      (v_c9b,  v_s9b,  v_teacher, i, '09:50','10:35','Room 9B'),
      (v_c10a, v_s10a, v_teacher, i, '11:30','12:15','Room 10A'),
      (v_c9b,  v_s9b,  v_teacher, i, '14:00','14:45','Room 9B');
  END LOOP;

  IF (SELECT COUNT(*) FROM public.students s JOIN public.classes c ON c.id=s.class_id
      WHERE c.id IN (v_c8a,v_c9b,v_c10a)) < 112 THEN

    FOR v_row IN
      SELECT * FROM (VALUES
        (v_c8a,  v_s8a,  'Grade 8',  'A', 34, 5),
        (v_c9b,  v_s9b,  'Grade 9',  'B', 33, 5),
        (v_c10a, v_s10a, 'Grade 10', 'A', 33, 5)
      ) AS t(class_id, subject_id, grade, sec, add_count, start_roll)
    LOOP
      v_class := v_row.class_id; v_subject := v_row.subject_id;
      v_grade := v_row.grade; v_sec := v_row.sec;
      v_padd := v_row.add_count; v_start := v_row.start_roll;

      SELECT id, amount INTO v_fee_id, v_fee_amt FROM public.fee_structures
        WHERE class_id = v_class ORDER BY created_at LIMIT 1;

      FOR i IN 1..v_padd LOOP
        v_roll := v_start + i - 1;
        IF (v_roll % 2) = 0 THEN
          v_fn := fnames_m[1 + ((v_roll * 7) % array_length(fnames_m,1))];
        ELSE
          v_fn := fnames_f[1 + ((v_roll * 11) % array_length(fnames_f,1))];
        END IF;
        v_sn := snames[1 + ((v_roll * 3) % array_length(snames,1))];
        v_full := v_fn || ' ' || v_sn;
        v_sid := gen_random_uuid();
        v_email := lower(regexp_replace(v_grade,'\s+','','g')) || v_sec || '.' || i || '.' || substr(v_sid::text,1,4) || '@school.edu';

        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
          v_sid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          v_email, crypt('Student@123', gen_salt('bf')), now(),
          jsonb_build_object('provider','email','providers', ARRAY['email']),
          jsonb_build_object('full_name', v_full),
          now(), now(),'','','',''
        );
        INSERT INTO public.profiles(id, full_name, email)
          VALUES (v_sid, v_full, v_email)
          ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name;
        INSERT INTO public.user_roles(user_id, role) VALUES (v_sid, 'student') ON CONFLICT DO NOTHING;

        v_stu := gen_random_uuid();
        INSERT INTO public.students(id, profile_id, class_id, admission_no, roll_no, admission_date)
        VALUES (v_stu, v_sid, v_class,
          'ADM-2025-' || lpad((abs(hashtext(v_sid::text)) % 9000 + 1000)::text, 4, '0') || '-' || v_roll,
          lpad(v_roll::text, 2, '0'),
          (current_date - ((v_roll * 7) || ' days')::interval)::date
        );

        v_pid := gen_random_uuid();
        v_email := 'parent.' || lower(regexp_replace(v_grade,'\s+','','g')) || v_sec || '.' || i || '.' || substr(v_pid::text,1,4) || '@example.com';
        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
          v_pid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          v_email, crypt('Parent@123', gen_salt('bf')), now(),
          jsonb_build_object('provider','email','providers', ARRAY['email']),
          jsonb_build_object('full_name', parent_titles[1 + (v_roll % array_length(parent_titles,1))] || ' ' || v_sn),
          now(), now(),'','','',''
        );
        INSERT INTO public.profiles(id, full_name, email, phone)
          VALUES (v_pid,
            parent_titles[1 + (v_roll % array_length(parent_titles,1))] || ' ' || v_sn,
            v_email,
            '+91 9' || lpad(((abs(hashtext(v_pid::text)) % 900000000) + 100000000)::text, 9, '0'))
          ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, phone=EXCLUDED.phone;
        INSERT INTO public.user_roles(user_id, role) VALUES (v_pid, 'parent') ON CONFLICT DO NOTHING;
        INSERT INTO public.parent_student(parent_id, student_id, relationship)
          VALUES (v_pid, v_stu, CASE WHEN (v_roll % 3)=0 THEN 'mother' ELSE 'father' END)
          ON CONFLICT DO NOTHING;

        IF v_fee_id IS NOT NULL THEN
          INSERT INTO public.fee_assignments(student_id, structure_id, title, amount_due, amount_paid, due_date, status)
          VALUES (v_stu, v_fee_id, v_grade || ' ' || v_sec || ' - Q1 Fee', v_fee_amt,
                  CASE WHEN (v_roll % 4)=0 THEN 0
                       WHEN (v_roll % 4)=1 THEN v_fee_amt/2
                       ELSE v_fee_amt END,
                  (current_date + interval '15 days')::date,
                  CASE WHEN (v_roll % 4)=0 THEN 'pending'::fee_status
                       WHEN (v_roll % 4)=1 THEN 'partial'::fee_status
                       ELSE 'paid'::fee_status END);
        END IF;

        FOR i IN 0..20 LOOP
          IF EXTRACT(DOW FROM (current_date - i)) BETWEEN 1 AND 5 THEN
            v_status_txt := CASE
                WHEN (abs(hashtext(v_stu::text || i)) % 100) < 92 THEN 'present'
                WHEN (abs(hashtext(v_stu::text || i)) % 100) < 96 THEN 'late'
                WHEN (abs(hashtext(v_stu::text || i)) % 100) < 98 THEN 'excused'
                ELSE 'absent'
              END;
            INSERT INTO public.attendance(student_id, class_id, date, status, marked_by)
            VALUES (v_stu, v_class, (current_date - i)::date, v_status_txt::attendance_status, v_teacher)
            ON CONFLICT (student_id, date) DO NOTHING;
          END IF;
        END LOOP;

      END LOOP;
    END LOOP;
  END IF;

  DELETE FROM public.homework WHERE teacher_id = v_teacher;
  FOR i IN 1..18 LOOP
    IF (i % 3) = 1 THEN v_hw_class := v_c8a;  v_hw_subj := v_s8a;
    ELSIF (i % 3) = 2 THEN v_hw_class := v_c9b; v_hw_subj := v_s9b;
    ELSE v_hw_class := v_c10a; v_hw_subj := v_s10a;
    END IF;
    INSERT INTO public.homework(class_id, subject_id, teacher_id, title, description, assigned_date, due_date, status)
    VALUES (v_hw_class, v_hw_subj, v_teacher,
            v_hw_titles[1 + ((i-1) % array_length(v_hw_titles,1))],
            'Complete the exercises and submit for review.',
            (current_date - ((i % 7) || ' days')::interval)::date,
            (current_date + (((i % 10) + 1) || ' days')::interval)::date,
            'active');
  END LOOP;

  DELETE FROM public.exams WHERE class_id IN (v_c9b, v_c10a) AND (name LIKE 'Term 2%' OR name LIKE 'Board Prep%');
  INSERT INTO public.exams(class_id, subject_id, name, exam_date, max_marks, term) VALUES
    (v_c9b,  v_s9b,  'Term 2 Unit Test - Mathematics', (current_date + interval '12 days')::date, 50, 'Term 2'),
    (v_c10a, v_s10a, 'Board Prep Mock - Mathematics',  (current_date + interval '25 days')::date, 80, 'Term 2');
END $seed$;
