-- Multi-child family seed proving the student–parent model:
-- 2 parents (David + Maria Fernandez), 3 sibling students in different grades,
-- and 6 mapping rows connecting each parent to each child with distinct flags.
-- Idempotent: fixed UUIDs + ON CONFLICT / guarded updates. Password for every
-- seeded account is the demo password (Greenwood@2026).
DO $$
DECLARE
  pw    text := '$2a$06$66HHHAJE7g2jWkLtsFlN0.LPuLXIuSd0vhEuvuVPeDAsQQha0oekG';
  david uuid := 'da000000-0000-4000-8000-000000000001';
  maria uuid := 'da000000-0000-4000-8000-000000000002';
  k1 uuid := 'dc000000-0000-4000-8000-000000000001';
  k2 uuid := 'dc000000-0000-4000-8000-000000000002';
  k3 uuid := 'dc000000-0000-4000-8000-000000000003';
  st1 uuid := 'de000000-0000-4000-8000-000000000001';
  st2 uuid := 'de000000-0000-4000-8000-000000000002';
  st3 uuid := 'de000000-0000-4000-8000-000000000003';
  c1 uuid; c2 uuid; c3 uuid;
BEGIN
  SELECT id INTO c1 FROM public.classes WHERE name = 'Grade 1' ORDER BY section LIMIT 1;
  SELECT id INTO c2 FROM public.classes WHERE name = 'Grade 2' ORDER BY section LIMIT 1;
  SELECT id INTO c3 FROM public.classes WHERE name = 'Grade 3' ORDER BY section LIMIT 1;

  -- ---- Parents --------------------------------------------------------------
  INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at)
  VALUES
    (david, 'david.fernandez@family.demo', pw, 'authenticated', 'authenticated', now()),
    (maria, 'maria.fernandez@family.demo', pw, 'authenticated', 'authenticated', now())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET full_name='David Fernandez', email='david.fernandez@family.demo',
    phone='+91 90000 10001', national_id='NID-DAVID-001', occupation='Engineer',
    company='Acme Corp', address='21 Baker Street', parent_code='PAR-DAVID001' WHERE id=david;
  UPDATE public.profiles SET full_name='Maria Fernandez', email='maria.fernandez@family.demo',
    phone='+91 90000 10002', national_id='NID-MARIA-002', occupation='Doctor',
    company='City Hospital', address='21 Baker Street', parent_code='PAR-MARIA002' WHERE id=maria;

  DELETE FROM public.user_roles WHERE user_id IN (david, maria);
  INSERT INTO public.user_roles (user_id, role) VALUES (david, 'parent'), (maria, 'parent')
  ON CONFLICT DO NOTHING;

  -- ---- Students (3 siblings, different grades) -------------------------------
  INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at)
  VALUES
    (k1, 'liam.fernandez@student.demo',  pw, 'authenticated', 'authenticated', now()),
    (k2, 'sofia.fernandez@student.demo', pw, 'authenticated', 'authenticated', now()),
    (k3, 'noah.fernandez@student.demo',  pw, 'authenticated', 'authenticated', now())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET full_name='Liam Fernandez',  email='liam.fernandez@student.demo'  WHERE id=k1;
  UPDATE public.profiles SET full_name='Sofia Fernandez', email='sofia.fernandez@student.demo' WHERE id=k2;
  UPDATE public.profiles SET full_name='Noah Fernandez',  email='noah.fernandez@student.demo'  WHERE id=k3;

  DELETE FROM public.user_roles WHERE user_id IN (k1, k2, k3);
  INSERT INTO public.user_roles (user_id, role) VALUES (k1,'student'),(k2,'student'),(k3,'student')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.students (id, profile_id, class_id, admission_no, roll_no, gender, status, admission_date)
  VALUES
    (st1, k1, c1, public.next_admission_no(), public.next_roll_no(c1), 'male',   'active', CURRENT_DATE),
    (st2, k2, c2, public.next_admission_no(), public.next_roll_no(c2), 'female', 'active', CURRENT_DATE),
    (st3, k3, c3, public.next_admission_no(), public.next_roll_no(c3), 'male',   'active', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  -- ---- Mapping: each parent to each child (6 rows) with flags ----------------
  INSERT INTO public.parent_student
    (parent_id, student_id, relationship, relationship_type, is_primary, pickup_permission, fee_responsible, emergency_contact, lives_with)
  VALUES
    (david, st1, 'parent','father', true,  true,  true,  false, true),
    (maria, st1, 'parent','mother', false, true,  false, true,  true),
    (david, st2, 'parent','father', true,  true,  true,  false, true),
    (maria, st2, 'parent','mother', false, true,  false, true,  true),
    (david, st3, 'parent','father', true,  true,  true,  false, true),
    (maria, st3, 'parent','mother', false, true,  false, true,  true)
  ON CONFLICT (parent_id, student_id) DO NOTHING;
END $$;
