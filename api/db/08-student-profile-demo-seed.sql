-- Student profile detail demo data for the Fernandez family (seeded in
-- 07-student-parent-family-seed.sql): medical, hostel, disciplinary, documents,
-- and a couple of activity-log entries so the new student-profile tabs render
-- with realistic content out of the box. Fully idempotent — safe to re-run.

DO $$
DECLARE
  st1 uuid := 'de000000-0000-4000-8000-000000000001'; -- Liam (Grade 1)
  st2 uuid := 'de000000-0000-4000-8000-000000000002'; -- (Grade 2)
  st3 uuid := 'de000000-0000-4000-8000-000000000003'; -- (Grade 3)
  admin_id uuid;
BEGIN
  -- Only proceed if the family students exist.
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = st1) THEN
    RAISE NOTICE 'Fernandez family not seeded; skipping student-profile demo.';
    RETURN;
  END IF;

  SELECT id INTO admin_id FROM public.profiles WHERE email = 'admin@greenwood.test' LIMIT 1;

  -- ---- Medical (1:1 upsert) -----------------------------------------------
  INSERT INTO public.student_medical
    (student_id, blood_group, allergies, chronic_conditions, physician_name, physician_phone,
     emergency_contact_name, emergency_contact_phone, notes, updated_by)
  VALUES
    (st1, 'O+', 'Peanuts, dust', NULL, 'Dr. A. Rao', '+91 98765 40001',
     'David Fernandez', '+91 98765 43210', 'Carries an EpiPen in school bag.', admin_id),
    (st2, 'A+', NULL, 'Mild asthma', 'Dr. A. Rao', '+91 98765 40001',
     'Maria Fernandez', '+91 98765 43211', 'Inhaler kept with class teacher.', admin_id),
    (st3, 'B+', NULL, NULL, 'Dr. A. Rao', '+91 98765 40001',
     'David Fernandez', '+91 98765 43210', NULL, admin_id)
  ON CONFLICT (student_id) DO UPDATE SET
    blood_group = EXCLUDED.blood_group,
    allergies = EXCLUDED.allergies,
    chronic_conditions = EXCLUDED.chronic_conditions,
    physician_name = EXCLUDED.physician_name,
    physician_phone = EXCLUDED.physician_phone,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  -- ---- Hostel (1:1 upsert) — st3 is a boarding resident -------------------
  INSERT INTO public.student_hostel
    (student_id, is_resident, hostel_block, room_no, bed_no, warden_name, warden_phone,
     check_in_date, notes, updated_by)
  VALUES
    (st3, true, 'Block B', 'B-204', '2', 'Mr. Sunil Warden', '+91 98765 45000',
     CURRENT_DATE - INTERVAL '120 days', 'Weekend home visits allowed.', admin_id)
  ON CONFLICT (student_id) DO UPDATE SET
    is_resident = EXCLUDED.is_resident,
    hostel_block = EXCLUDED.hostel_block,
    room_no = EXCLUDED.room_no,
    bed_no = EXCLUDED.bed_no,
    warden_name = EXCLUDED.warden_name,
    warden_phone = EXCLUDED.warden_phone,
    check_in_date = EXCLUDED.check_in_date,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  -- ---- Disciplinary (guarded inserts keep this idempotent) ----------------
  INSERT INTO public.student_disciplinary
    (student_id, incident_date, category, severity, description, action_taken, status, reported_by)
  SELECT st2, CURRENT_DATE - INTERVAL '20 days', 'conduct', 'minor',
         'Repeatedly late to morning assembly.', 'Verbal counselling; parents informed.',
         'resolved', admin_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_disciplinary
    WHERE student_id = st2 AND description = 'Repeatedly late to morning assembly.'
  );

  -- ---- Documents (guarded inserts) ----------------------------------------
  INSERT INTO public.student_documents
    (student_id, doc_type, title, issued_date, verified, uploaded_by)
  SELECT v.student_id, v.doc_type, v.title, v.issued_date, v.verified, admin_id
  FROM (VALUES
    (st1, 'birth_certificate', 'Birth Certificate', CURRENT_DATE - INTERVAL '6 years', true),
    (st1, 'photo', 'Passport Photo', CURRENT_DATE - INTERVAL '60 days', true),
    (st2, 'transfer_certificate', 'Transfer Certificate (prev. school)', CURRENT_DATE - INTERVAL '1 year', true),
    (st3, 'birth_certificate', 'Birth Certificate', CURRENT_DATE - INTERVAL '8 years', true)
  ) AS v(student_id, doc_type, title, issued_date, verified)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_documents d
    WHERE d.student_id = v.student_id AND d.title = v.title
  );

  -- ---- Activity log (guarded so re-runs don't duplicate) ------------------
  INSERT INTO public.student_activity_log (student_id, event_type, description, actor_id, created_at)
  SELECT v.student_id, v.event_type, v.description, admin_id, now() - v.ago
  FROM (VALUES
    (st1, 'enrolled', 'Enrolled and profile created.', INTERVAL '200 days'),
    (st2, 'enrolled', 'Enrolled and profile created.', INTERVAL '200 days'),
    (st3, 'enrolled', 'Enrolled as boarding resident.', INTERVAL '200 days')
  ) AS v(student_id, event_type, description, ago)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_activity_log a
    WHERE a.student_id = v.student_id AND a.event_type = v.event_type
  );

  RAISE NOTICE 'Student-profile demo data seeded for the Fernandez family.';
END $$;
