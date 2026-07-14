-- ============================================================================
--  EDUERP — read-only data-integrity check.
--
--  Prints one row per invariant with a violation count and PASS/FAIL flag.
--  Makes NO changes. Safe to run against any database at any time:
--     psql "$DATABASE_URL" -f api/db/integrity-check.sql
--
--  A clean database returns FAIL = 0 for every row. To remediate a demo/
--  staging database that fails, run db/seed-integrity.sql (never on prod).
--
--  Notes on the schema this checks:
--   * timetable/teacher_classes/teacher_subjects.teacher_id and
--     classes.class_teacher_id all FK → auth.users(id): the scheduling
--     "teacher" is a teacher-role user, not a row in the HR `teachers` table.
--   * parent_student.parent_id FK → profiles(id) (== the user's id).
--   * "subjects without a teacher" is scoped to ACTIVE subjects — inactive
--     (is_active = false) subjects are intentionally unscheduled.
-- ============================================================================
WITH checks(sort, label, violations) AS (

  -- students -------------------------------------------------------------
  SELECT 1, 'active students without a class',
         (SELECT count(*) FROM students WHERE status = 'active' AND class_id IS NULL)
  UNION ALL
  SELECT 2, 'active students without a parent/guardian',
         (SELECT count(*) FROM students s WHERE s.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM parent_student ps WHERE ps.student_id = s.id))
  UNION ALL
  SELECT 3, 'duplicate roll numbers within a class',
         (SELECT count(*) FROM (
            SELECT class_id, roll_no FROM students
            WHERE status = 'active' AND COALESCE(roll_no,'') <> ''
            GROUP BY class_id, roll_no HAVING count(*) > 1) d)

  -- classes --------------------------------------------------------------
  UNION ALL
  SELECT 4, 'classes without any active students',
         (SELECT count(*) FROM classes c WHERE NOT EXISTS
            (SELECT 1 FROM students s WHERE s.class_id = c.id AND s.status = 'active'))
  UNION ALL
  SELECT 5, 'classes without a class teacher',
         (SELECT count(*) FROM classes WHERE class_teacher_id IS NULL)
  UNION ALL
  SELECT 6, 'classes without any subjects',
         (SELECT count(*) FROM classes c WHERE NOT EXISTS
            (SELECT 1 FROM subjects s WHERE s.class_id = c.id))
  UNION ALL
  SELECT 7, 'classes without any timetable entries',
         (SELECT count(*) FROM classes c WHERE NOT EXISTS
            (SELECT 1 FROM timetable t WHERE t.class_id = c.id))

  -- subjects / teachers --------------------------------------------------
  UNION ALL
  SELECT 8, 'active subjects without a teacher',
         (SELECT count(*) FROM subjects su WHERE COALESCE(su.is_active, true)
            AND NOT EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = su.id))

  -- orphan rows ----------------------------------------------------------
  UNION ALL
  SELECT 9, 'orphan timetable rows (dangling class/subject/teacher)',
         (SELECT count(*) FROM timetable t
            WHERE NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = t.class_id)
               OR (t.subject_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subjects s  WHERE s.id  = t.subject_id))
               OR (t.teacher_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.teacher_id)))
  UNION ALL
  SELECT 10, 'orphan teacher_classes rows',
         (SELECT count(*) FROM teacher_classes tc
            WHERE NOT EXISTS (SELECT 1 FROM classes c    WHERE c.id = tc.class_id)
               OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = tc.teacher_id))
  UNION ALL
  SELECT 11, 'orphan teacher_subjects rows',
         (SELECT count(*) FROM teacher_subjects ts
            WHERE NOT EXISTS (SELECT 1 FROM classes c    WHERE c.id = ts.class_id)
               OR NOT EXISTS (SELECT 1 FROM subjects s   WHERE s.id = ts.subject_id)
               OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ts.teacher_id))
  UNION ALL
  SELECT 12, 'orphan route_students rows (dangling student)',
         (SELECT count(*) FROM route_students r WHERE NOT EXISTS
            (SELECT 1 FROM students s WHERE s.id = r.student_id))

  -- timetable conflicts --------------------------------------------------
  UNION ALL
  SELECT 13, 'teacher double-booked (same day + start time)',
         (SELECT count(*) FROM (
            SELECT teacher_id, day_of_week, start_time FROM timetable
            WHERE teacher_id IS NOT NULL
            GROUP BY teacher_id, day_of_week, start_time HAVING count(*) > 1) d)
  UNION ALL
  SELECT 14, 'room double-booked (same day + start time)',
         (SELECT count(*) FROM (
            SELECT room, day_of_week, start_time FROM timetable
            WHERE COALESCE(room,'') <> ''
            GROUP BY room, day_of_week, start_time HAVING count(*) > 1) d)
  UNION ALL
  SELECT 15, 'class scheduled in two places at once',
         (SELECT count(*) FROM (
            SELECT class_id, day_of_week, start_time FROM timetable
            GROUP BY class_id, day_of_week, start_time HAVING count(*) > 1) d)
)
SELECT lpad(sort::text, 2, '0') AS "#",
       label                    AS "invariant",
       violations               AS "violations",
       CASE WHEN violations = 0 THEN 'PASS' ELSE 'FAIL' END AS "result"
FROM checks
ORDER BY sort;
