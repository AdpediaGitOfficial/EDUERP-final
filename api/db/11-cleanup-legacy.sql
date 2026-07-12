-- ===========================================================================
-- Legacy cleanup after the demo regeneration: drop empty junk classes and their
-- orphaned dependents, remove unreferenced junk fee structures, and backfill
-- student_details for the preserved demo students. Idempotent & safe: only ever
-- touches classes with ZERO students and fee structures referenced by nobody.
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  canonical text[] := ARRAY['Nursery','KG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
                            'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
BEGIN
  -- Classes to remove: no students, AND either a non-canonical name/section or a
  -- duplicate canonical (name, section) whose sibling row keeps the students.
  CREATE TEMP TABLE _drop_classes ON COMMIT DROP AS
    SELECT c.id
    FROM public.classes c
    WHERE NOT EXISTS (SELECT 1 FROM public.students s WHERE s.class_id = c.id)
      AND (
        c.name <> ALL(canonical)
        OR c.section IS NULL
        OR c.section <> ALL(ARRAY['A','B','C','D'])
        OR EXISTS (  -- a populated class with the same name+section already exists
          SELECT 1 FROM public.students s2 JOIN public.classes c2 ON c2.id = s2.class_id
          WHERE c2.name = c.name AND c2.section IS NOT DISTINCT FROM c.section
        )
      );

  -- Clear dependents that reference the doomed classes (all rows are for
  -- 0-student classes, so no student data is affected).
  DELETE FROM public.homework            WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.exams               WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.timetable           WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.subjects            WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.teacher_classes     WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.attendance          WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.admission_enquiries WHERE class_id IN (SELECT id FROM _drop_classes);
  DELETE FROM public.classes             WHERE id IN (SELECT id FROM _drop_classes);

  -- Remove fee structures nobody references (junk duplicates from dev runs).
  DELETE FROM public.fee_structures fs
  WHERE NOT EXISTS (SELECT 1 FROM public.fee_assignments fa WHERE fa.structure_id = fs.id)
    AND (fs.name LIKE 'Notify Spec Fee%' OR fs.name LIKE 'Cutover Fee%');

  -- Backfill student_details for the preserved demo students that lack a row.
  INSERT INTO public.student_details (student_id, first_name, last_name, nationality, current_address)
  SELECT s.id,
         split_part(p.full_name, ' ', 1),
         nullif(regexp_replace(p.full_name, '^\S+\s*', ''), ''),
         'Indian',
         '21 Baker Street, Bengaluru'
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE NOT EXISTS (SELECT 1 FROM public.student_details d WHERE d.student_id = s.id);

  RAISE NOTICE 'Cleanup complete: % classes removed.', (SELECT count(*) FROM _drop_classes);
END $$;

COMMIT;
