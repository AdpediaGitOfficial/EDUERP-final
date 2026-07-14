-- ============================================================================
--  EDUERP — demo/test data remediation & integrity fix.
--
--  NOT a numbered migration on purpose: deploy.sh only auto-applies
--  db/NN-*.sql, so this file NEVER runs on production automatically.
--  Run it manually against a demo / staging database:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/db/seed-integrity.sql
--
--  It is idempotent and re-runnable. It:
--    1. deletes clone-test junk classes (empty + unreferenced)
--    2. cleans orphan academic rows
--    3. gives every active student a class, a unique roll, and a parent
--    4. rebuilds a conflict-free weekly timetable for every real class and
--       derives teacher↔class, teacher↔subject and class-teacher from it
--    5. backfills staff attendance and transport assignments
--  Verify afterwards with db/integrity-check.sql (all counts should be 0).
-- ============================================================================
BEGIN;

-- 1) Remove clone-test junk classes (academic_year like 'CLONE-…' / '2026-27',
--    no active students). They are unreferenced, but clean children defensively.
CREATE TEMP TABLE _junk ON COMMIT DROP AS
  SELECT c.id FROM classes c
  WHERE (c.academic_year LIKE 'CLONE-%' OR c.academic_year = '2026-27')
    AND NOT EXISTS (SELECT 1 FROM students s WHERE s.class_id = c.id AND s.status = 'active');

DELETE FROM timetable        WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM teacher_subjects WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM teacher_classes  WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM attendance       WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM exams            WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM homework         WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM announcements    WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM fee_structures   WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM fee_groups       WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM promotion_records WHERE from_class_id IN (SELECT id FROM _junk)
                                 OR to_class_id   IN (SELECT id FROM _junk);
UPDATE admission_enquiries SET class_id = NULL WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM subjects         WHERE class_id IN (SELECT id FROM _junk);
DELETE FROM classes          WHERE id       IN (SELECT id FROM _junk);

-- 2) Clean orphan academic rows (point at rows that no longer exist).
DELETE FROM timetable t
  WHERE NOT EXISTS (SELECT 1 FROM classes c  WHERE c.id = t.class_id)
     OR (t.subject_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subjects s  WHERE s.id = t.subject_id))
     OR (t.teacher_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teachers te WHERE te.id = t.teacher_id));
DELETE FROM teacher_classes tc
  WHERE NOT EXISTS (SELECT 1 FROM classes c  WHERE c.id = tc.class_id)
     OR NOT EXISTS (SELECT 1 FROM teachers t WHERE t.id = tc.teacher_id);
DELETE FROM teacher_subjects ts
  WHERE NOT EXISTS (SELECT 1 FROM classes c   WHERE c.id = ts.class_id)
     OR NOT EXISTS (SELECT 1 FROM teachers t  WHERE t.id = ts.teacher_id)
     OR NOT EXISTS (SELECT 1 FROM subjects su WHERE su.id = ts.subject_id);

-- 3) Every active student → a class, a unique roll, and at least one parent.
--    3a. assign class-less students round-robin across real classes.
WITH cls AS (
  SELECT id, row_number() OVER (ORDER BY name, section) - 1 AS rn, count(*) OVER () AS n FROM classes
),
homeless AS (
  SELECT id, row_number() OVER (ORDER BY created_at) - 1 AS rn
  FROM students WHERE status = 'active' AND class_id IS NULL
)
UPDATE students s
SET class_id = (SELECT id FROM cls WHERE cls.rn = (h.rn % (SELECT n FROM cls LIMIT 1)))
FROM homeless h WHERE s.id = h.id;

--    3b. give a unique roll to anyone missing one (continue past the class max).
WITH maxroll AS (
  SELECT class_id, COALESCE(MAX(NULLIF(regexp_replace(roll_no, '\D', '', 'g'), '')::int), 0) AS mx
  FROM students WHERE status = 'active' AND roll_no ~ '\d' GROUP BY class_id
),
need AS (
  SELECT id, class_id, row_number() OVER (PARTITION BY class_id ORDER BY admission_no) AS rn
  FROM students WHERE status = 'active' AND (roll_no IS NULL OR roll_no = '')
)
UPDATE students s
SET roll_no = lpad((COALESCE(m.mx, 0) + n.rn)::text, 2, '0')
FROM need n LEFT JOIN maxroll m ON m.class_id = n.class_id
WHERE s.id = n.id;

--    3c. link parent-less students to an existing parent account (round-robin).
WITH parents AS (
  SELECT user_id AS parent_id, row_number() OVER (ORDER BY user_id) - 1 AS rn, count(*) OVER () AS n
  FROM user_roles WHERE role = 'parent'
),
noparent AS (
  SELECT s.id, row_number() OVER (ORDER BY s.created_at) - 1 AS rn
  FROM students s WHERE s.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM parent_student ps WHERE ps.student_id = s.id)
)
INSERT INTO parent_student (parent_id, student_id, relationship, relationship_type, is_primary, status)
SELECT (SELECT parent_id FROM parents WHERE parents.rn = (np.rn % (SELECT n FROM parents LIMIT 1))),
       np.id, 'guardian', 'guardian', true, 'active'
FROM noparent np
WHERE (SELECT n FROM parents LIMIT 1) > 0;

-- 3d. ensure every real class has subjects (default set if somehow missing).
INSERT INTO subjects (class_id, name, code, is_active, weekly_periods)
SELECT c.id, x.name, x.code, true, 6
FROM classes c
CROSS JOIN (VALUES ('English','ENG'),('Mathematics','MAT'),('Science','SCI'),
                   ('Social Studies','SST'),('Second Language','LAN')) AS x(name, code)
WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.class_id = c.id);

-- 4) Rebuild a conflict-free weekly timetable for every class, then derive the
--    teacher mappings from it (guarantees full coverage + zero double-booking).
DELETE FROM timetable;

WITH rc AS (   -- real classes, indexed; each gets its own room (no room clashes)
  SELECT c.id, row_number() OVER (ORDER BY c.name, c.section) - 1 AS cidx FROM classes c
),
tch AS (       -- teacher-role users, indexed. NB: timetable/teacher_classes/
               -- teacher_subjects/class_teacher_id all FK → auth.users(id),
               -- so the scheduling "teacher" is a teacher-role user, not a
               -- row in the HR `teachers` table.
  SELECT DISTINCT user_id AS id,
         dense_rank() OVER (ORDER BY user_id) - 1 AS tidx,
         (SELECT count(DISTINCT user_id) FROM user_roles WHERE role = 'teacher') AS tn
  FROM user_roles WHERE role = 'teacher'
),
slots AS (     -- 5 days x 6 periods = 30 slots, slotidx 0..29
  SELECT d AS day_of_week, p AS period,
         (ARRAY['08:00','08:50','09:40','10:45','11:35','12:25']::time[])[p + 1] AS start_time,
         (ARRAY['08:45','09:35','10:25','11:30','12:20','13:10']::time[])[p + 1] AS end_time,
         ((d - 1) * 6 + p) AS slotidx
  FROM generate_series(1, 5) d, generate_series(0, 5) p
),
csub AS (      -- subjects per class, cycled to fill the 30 slots
  SELECT class_id, id AS subject_id,
         row_number() OVER (PARTITION BY class_id ORDER BY name) - 1 AS sidx,
         count(*) OVER (PARTITION BY class_id) AS scount
  FROM subjects WHERE COALESCE(is_active, true)
)
INSERT INTO timetable (class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room)
SELECT rc.id, cs.subject_id, t.id, s.day_of_week, s.start_time, s.end_time, 'R' || (rc.cidx + 1)
FROM rc
CROSS JOIN slots s
JOIN csub cs ON cs.class_id = rc.id AND cs.sidx = (s.slotidx % cs.scount)
JOIN tch  t  ON t.tidx = ((rc.cidx + s.slotidx) % t.tn);  -- Latin square ⇒ unique teacher per slot

-- 4a. teacher↔class and teacher↔subject, derived from the new timetable.
DELETE FROM teacher_classes;
INSERT INTO teacher_classes (teacher_id, class_id)
SELECT DISTINCT teacher_id, class_id FROM timetable;

DELETE FROM teacher_subjects;
INSERT INTO teacher_subjects (teacher_id, class_id, subject_id, role)
SELECT DISTINCT teacher_id, class_id, subject_id, 'primary' FROM timetable WHERE subject_id IS NOT NULL;

-- 4b. class teacher = the teacher of that class's first weekly period.
WITH ct AS (
  SELECT DISTINCT ON (class_id) class_id, teacher_id
  FROM timetable ORDER BY class_id, day_of_week, start_time
)
UPDATE classes c SET class_teacher_id = ct.teacher_id FROM ct WHERE c.id = ct.class_id;

-- 5) Staff attendance — mark active teachers present for the last 14 weekdays
--    (only where not already recorded), so HR/monitoring dashboards aren't empty.
INSERT INTO teacher_attendance (teacher_id, date, status)
SELECT t.id, d::date, 'present'
FROM teachers t
CROSS JOIN generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') d
WHERE t.status = 'active'
  AND EXTRACT(ISODOW FROM d) < 6                          -- weekdays only
  AND NOT EXISTS (SELECT 1 FROM teacher_attendance ta WHERE ta.teacher_id = t.id AND ta.date = d::date);

-- 6) Transport — assign ~150 students to routes/stops (round-robin) so the
--    transport module and student "Transport" tab have data.
WITH rs AS (
  SELECT r.id AS route_id, st.id AS stop_id,
         row_number() OVER (ORDER BY r.id, st.id) - 1 AS rn, count(*) OVER () AS n
  FROM transport_routes r JOIN route_stops st ON st.route_id = r.id
),
pick AS (
  SELECT id, row_number() OVER (ORDER BY admission_no) - 1 AS rn
  FROM students WHERE status = 'active'
    AND NOT EXISTS (SELECT 1 FROM route_students x WHERE x.student_id = students.id)
  LIMIT 150
)
INSERT INTO route_students (route_id, stop_id, student_id, pickup_time, drop_time)
SELECT rs.route_id, rs.stop_id, p.id, '07:30', '15:30'   -- text columns
FROM pick p JOIN rs ON rs.rn = (p.rn % (SELECT n FROM rs LIMIT 1))
WHERE (SELECT n FROM rs LIMIT 1) > 0;

COMMIT;
