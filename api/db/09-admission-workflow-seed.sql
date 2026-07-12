-- Admission workflow demo: 15 admission_enquiries spanning every stage of the
-- pipeline — drafts, submitted, under review, document/parent verification, fee
-- assignment, class allocation, approved, rejected, and fully-admitted records
-- linked to real students with parents + portal accounts (the Fernandez family).
-- Also guarantees a 3rd parent with 2+ children. Fully idempotent (guarded by
-- student_name / link existence).

DO $$
DECLARE
  admin_id   uuid;
  priya_id   uuid;
  david_id   uuid := 'da000000-0000-4000-8000-000000000001';
  g1a_class  uuid;
  g2a_class  uuid;
  g1a_fee    uuid;
  g2a_fee    uuid;
  st1 uuid := 'de000000-0000-4000-8000-000000000001';
  st2 uuid := 'de000000-0000-4000-8000-000000000002';
  st3 uuid := 'de000000-0000-4000-8000-000000000003';
  st1_no text; st2_no text; st3_no text;
  st1_cls uuid; st2_cls uuid; st3_cls uuid;
  second_child uuid;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE email = 'admin@greenwood.test' LIMIT 1;
  SELECT id INTO priya_id FROM public.profiles WHERE email = 'parent@greenwood.test' LIMIT 1;
  IF admin_id IS NULL THEN RAISE NOTICE 'No admin; skipping admission seed.'; RETURN; END IF;

  SELECT id INTO g1a_class FROM public.classes WHERE name = 'Grade 1' AND section = 'A' LIMIT 1;
  SELECT id INTO g2a_class FROM public.classes WHERE name = 'Grade 2' AND section = 'A' LIMIT 1;
  SELECT id INTO g1a_fee FROM public.fee_structures WHERE name ILIKE 'Grade 1 A%' LIMIT 1;
  SELECT id INTO g2a_fee FROM public.fee_structures WHERE name ILIKE 'Grade 2 A%' LIMIT 1;

  -- ---- 3rd multi-child parent: give Priya Singh a second child -------------
  IF priya_id IS NOT NULL THEN
    IF (SELECT count(*) FROM public.parent_student WHERE parent_id = priya_id) < 2 THEN
      SELECT s.id INTO second_child
      FROM public.students s
      WHERE NOT EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = s.id)
      LIMIT 1;
      IF second_child IS NOT NULL THEN
        INSERT INTO public.parent_student
          (parent_id, student_id, relationship_type, is_primary, fee_responsible, emergency_contact)
        VALUES (priya_id, second_child, 'mother', true, true, true)
        ON CONFLICT (parent_id, student_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- ---- 15 admission enquiries across stages -------------------------------
  -- Non-admitted stages: pure metadata rows (no side-effects). Guarded by name.
  INSERT INTO public.admission_enquiries
    (student_name, applicant_dob, applicant_gender, grade_applying, previous_school,
     applicant_address, stage, status, enquiry_date, reviewer_id, class_id, section,
     fee_structure_id, parent_id, rejection_reason, admission_no,
     submitted_at, approved_at, created_at)
  SELECT v.student_name, v.dob, v.gender, v.grade, v.prev_school, v.addr, v.stage, v.status,
         CURRENT_DATE - v.ago_days, v.reviewer, v.class_id, v.section, v.fee, v.parent,
         v.reject, v.adm_no, v.submitted, v.approved, now() - (v.ago_days || ' days')::interval
  FROM (VALUES
    -- draft ×2 (nothing assigned yet)
    ('Aarav Mehta',    DATE '2020-03-14', 'male',   'Grade 1', NULL,               'MG Road, Pune',       'draft',                 'new',       2,  NULL::uuid, NULL::uuid, NULL, NULL::uuid, NULL::uuid, NULL, NULL::text, NULL::timestamptz, NULL::timestamptz),
    ('Diya Kapoor',    DATE '2020-07-02', 'female', 'Grade 1', NULL,               'Baner, Pune',         'draft',                 'new',       1,  NULL,       NULL,       NULL, NULL,       NULL,       NULL, NULL,              NULL,              NULL),
    -- submitted ×2 (admission_no issued)
    ('Kabir Sharma',   DATE '2019-11-20', 'male',   'Grade 2', 'Little Angels',    'Kothrud, Pune',       'submitted',             'new',       5,  NULL,       NULL,       NULL, NULL,       NULL,       NULL, 'ADM-2026-06001',  now() - interval '5 days',  NULL),
    ('Anaya Reddy',    DATE '2019-09-08', 'female', 'Grade 2', 'Sunrise School',   'Hinjewadi, Pune',     'submitted',             'new',       4,  NULL,       NULL,       NULL, NULL,       NULL,       NULL, 'ADM-2026-06002',  now() - interval '4 days',  NULL),
    -- under_review ×1
    ('Vivaan Nair',    DATE '2019-05-16', 'male',   'Grade 2', 'St. Xavier',       'Wakad, Pune',         'under_review',          'in_review', 7,  NULL,       NULL,       NULL, NULL,       NULL,       NULL, 'ADM-2026-06003',  now() - interval '7 days',  NULL),
    -- document_verification ×1
    ('Ira Bose',       DATE '2019-02-11', 'female', 'Grade 2', 'Green Valley',     'Aundh, Pune',         'document_verification', 'in_review', 8,  NULL,       NULL,       NULL, NULL,       NULL,       NULL, 'ADM-2026-06004',  now() - interval '8 days',  NULL),
    -- parent_verification ×1 (parent linked)
    ('Reyansh Gupta',  DATE '2019-01-30', 'male',   'Grade 2', 'DAV Public',       'Viman Nagar, Pune',   'parent_verification',   'in_review', 9,  NULL,       NULL,       NULL, NULL,       NULL,       NULL, 'ADM-2026-06005',  now() - interval '9 days',  NULL),
    -- fee_assignment ×1 (fee chosen)
    ('Myra Joshi',     DATE '2019-04-22', 'female', 'Grade 2', 'Podar Intl',       'Kalyani Nagar, Pune', 'fee_assignment',        'in_review', 10, NULL,       NULL,       NULL, NULL,       NULL,       NULL, 'ADM-2026-06006',  now() - interval '10 days', NULL),
    -- class_allocation ×1 (class chosen)
    ('Advait Rao',     DATE '2019-06-18', 'male',   'Grade 2', 'Euro School',      'Magarpatta, Pune',    'class_allocation',      'in_review', 11, NULL,       NULL,       'A',  NULL,       NULL,       NULL, 'ADM-2026-06007',  now() - interval '11 days', NULL),
    -- approved ×1 (ready to admit — class + parent set)
    ('Saanvi Iyer',    DATE '2019-08-05', 'female', 'Grade 2', 'Vibgyor',          'Hadapsar, Pune',      'approved',              'in_review', 12, NULL,       NULL,       'A',  NULL,       NULL,       NULL, 'ADM-2026-06008',  now() - interval '12 days', now() - interval '1 day'),
    -- rejected ×2
    ('Arjun Malhotra', DATE '2019-10-12', 'male',   'Grade 2', 'ABC School',       'Pimpri, Pune',        'rejected',              'closed',    15, NULL,       NULL,       NULL, NULL,       NULL, 'Seat quota full for the requested grade.', 'ADM-2026-06009', now() - interval '15 days', NULL),
    ('Kiara Menon',    DATE '2019-12-01', 'female', 'Grade 2', 'XYZ Academy',      'Chinchwad, Pune',     'rejected',              'closed',    16, NULL,       NULL,       NULL, NULL,       NULL, 'Incomplete documentation after follow-up.', 'ADM-2026-06010', now() - interval '16 days', NULL)
  ) AS v(student_name, dob, gender, grade, prev_school, addr, stage, status, ago_days,
         reviewer, class_id, section, fee, parent, reject, adm_no, submitted, approved)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admission_enquiries a WHERE a.student_name = v.student_name
  );

  -- Backfill reviewer / class / fee / parent on the rows we just (or previously) made,
  -- so the later-stage records look fully populated without hardcoding volatile ids.
  UPDATE public.admission_enquiries SET reviewer_id = admin_id
    WHERE reviewer_id IS NULL
      AND stage IN ('under_review','document_verification','parent_verification',
                    'fee_assignment','class_allocation','approved','rejected');
  UPDATE public.admission_enquiries SET parent_id = COALESCE(priya_id, david_id)
    WHERE parent_id IS NULL AND student_name IN ('Reyansh Gupta','Myra Joshi','Advait Rao','Saanvi Iyer');
  UPDATE public.admission_enquiries SET fee_structure_id = g2a_fee
    WHERE fee_structure_id IS NULL AND g2a_fee IS NOT NULL
      AND student_name IN ('Myra Joshi','Advait Rao','Saanvi Iyer');
  UPDATE public.admission_enquiries SET class_id = g2a_class
    WHERE class_id IS NULL AND g2a_class IS NOT NULL
      AND student_name IN ('Advait Rao','Saanvi Iyer');

  -- ---- admitted ×3: document the Fernandez siblings' completed admissions ---
  SELECT admission_no, class_id INTO st1_no, st1_cls FROM public.students WHERE id = st1;
  SELECT admission_no, class_id INTO st2_no, st2_cls FROM public.students WHERE id = st2;
  SELECT admission_no, class_id INTO st3_no, st3_cls FROM public.students WHERE id = st3;

  INSERT INTO public.admission_enquiries
    (student_name, applicant_gender, grade_applying, stage, status, enquiry_date, reviewer_id,
     class_id, section, fee_structure_id, parent_id, converted_student_id, admission_no,
     submitted_at, approved_at, admitted_at, created_at)
  SELECT v.name, v.gender, v.grade, 'admitted', 'converted', CURRENT_DATE - 60, admin_id,
         v.cls, 'A', g1a_fee, david_id, v.sid, v.adm_no,
         now() - interval '60 days', now() - interval '45 days', now() - interval '40 days',
         now() - interval '60 days'
  FROM (VALUES
    ('Liam Fernandez',   'male', 'Grade 1', st1_cls, st1, st1_no),
    ('Sofia Fernandez',  'female','Grade 2', st2_cls, st2, st2_no),
    ('Mateo Fernandez',  'male', 'Grade 3', st3_cls, st3, st3_no)
  ) AS v(name, gender, grade, cls, sid, adm_no)
  WHERE v.sid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.admission_enquiries a WHERE a.converted_student_id = v.sid
    );

  RAISE NOTICE 'Admission workflow demo seeded (15 records across stages).';
END $$;
