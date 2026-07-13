-- Read-only audit of student/parent accounts that look orphaned — the kind the
-- old "Add a new user" flow could create (a student with no enrolment, a parent
-- with no children). Changes nothing; review before acting. Some rows may be
-- legitimate (an enquiry contact, or a guardian whose only child left the school).
--
--   psql "postgresql://USER:PASS@HOST:5432/DB" -f db/check-orphan-accounts.sql

\echo '== parent-role accounts with NO linked children =='
SELECT p.id, p.full_name, p.email, p.status
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
WHERE NOT EXISTS (
  SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = p.id
)
ORDER BY p.created_at DESC;

\echo '== student rows with NO class AND no admission number (not enrolled) =='
SELECT s.id AS student_id, pr.full_name, pr.email, s.roll_no, s.status
FROM public.students s
JOIN public.profiles pr ON pr.id = s.profile_id
WHERE s.class_id IS NULL
  AND (s.admission_no IS NULL OR s.admission_no = '')
ORDER BY pr.created_at DESC;

\echo '== student-role accounts with NO students row at all (login but no record) =='
SELECT p.id, p.full_name, p.email, p.status
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'student'
WHERE NOT EXISTS (
  SELECT 1 FROM public.students s WHERE s.profile_id = p.id
)
ORDER BY p.created_at DESC;
