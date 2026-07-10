
DO $$
DECLARE
  hashed text := crypt('Greenwood@2026', gen_salt('bf'));
  rec record;
  new_id uuid;
  target_class uuid;
  roll int;
  adm text;
  slug text;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('Aditi Verma','Grade 1','A'), ('Rohan Malhotra','Grade 1','A'), ('Sara Khan','Grade 1','A'), ('Aryan Gupta','Grade 1','A'),
    ('Meera Nair','Grade 2','A'), ('Kabir Joshi','Grade 2','A'), ('Zoya Ahmed','Grade 2','A'), ('Yash Patel','Grade 2','A'),
    ('Riya Kapoor','Grade 3','B'), ('Arjun Reddy','Grade 3','B'), ('Ishita Bose','Grade 3','B'), ('Neel Shah','Grade 3','B'),
    ('Tara Menon','Grade 4','A'), ('Veer Chauhan','Grade 4','A'), ('Anaya Iyer','Grade 4','A'), ('Dhruv Sinha','Grade 4','A'),
    ('Nia Pillai','Grade 5','B'), ('Ayan Saxena','Grade 5','B'), ('Kiara Ghosh','Grade 5','B'), ('Reyansh Bhat','Grade 5','B'),
    ('Maya Iyer','Grade','6'), ('Dev Mehta','Grade','6'), ('Nora Singh','Grade','6'), ('Karan Roy','Grade','6'),
    ('Diya Iyer','Grade','6'), ('Faris Kapoor','Grade','6'), ('Liam Khan','Grade','6'), ('Aisha Rao','Grade','6'),
    ('Dev Joshi','Grade','6'), ('Ethan Ahmed','Grade','6'), ('Nikhil Sharma','Grade','6')
  ) AS t(full_name, cname, csec)
  LOOP
    slug := lower(regexp_replace(rec.full_name, '\s+', '.', 'g')) || '@student.test';
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = slug) THEN
      new_id := gen_random_uuid();
      INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      VALUES ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', slug, hashed, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.full_name, 'role', 'student'),
        now(), now(), '', '', '', '');
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), new_id, new_id::text,
        jsonb_build_object('sub', new_id::text, 'email', slug), 'email', now(), now(), now());
    ELSE
      SELECT id INTO new_id FROM auth.users WHERE email = slug;
    END IF;

    SELECT id INTO target_class FROM public.classes WHERE name = rec.cname AND section = rec.csec LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM public.students WHERE profile_id = new_id) THEN
      SELECT COALESCE(MAX(CASE WHEN roll_no ~ '^[0-9]+$' THEN roll_no::int END), 0) + 1
        INTO roll FROM public.students WHERE class_id = target_class;
      adm := 'ADM-2026-' || lpad((100 + (SELECT COUNT(*) FROM public.students))::text, 4, '0');
      INSERT INTO public.students (profile_id, class_id, admission_no, roll_no, admission_date)
      VALUES (new_id, target_class, adm, lpad(roll::text, 2, '0'), now());
    END IF;
  END LOOP;
END $$;
