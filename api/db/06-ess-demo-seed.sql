-- Demo data for Employee Self-Service (ESS).
-- The 221 seeded staff rows aren't linked to any login, so ESS would be empty
-- for every demo account. This links ONE staff record to the teacher demo
-- account (teacher@greenwood.test) and gives that employee a full self-service
-- data set: leave, payroll, expenses, grievance, documents, training,
-- performance, attendance and assigned assets.
-- Re-runnable: demo rows carry stable markers and are cleared first.
BEGIN;

-- The teacher demo profile + its teachers row (Anjali Nair).
-- Resolve ids up front into a temp table for reuse.
CREATE TEMP TABLE _ess_ctx ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.profiles WHERE email = 'teacher@greenwood.test') AS profile_id,
  (SELECT id FROM public.teachers WHERE email ILIKE 'teacher@greenwood.test' LIMIT 1) AS teacher_id;

-- Pick a deterministic staff row (first by employee_code) and link it to the
-- teacher login. Unlink any staff previously pointed at this profile first so
-- re-runs stay on a single employee.
UPDATE public.staff SET profile_id = NULL
  WHERE profile_id = (SELECT profile_id FROM _ess_ctx)
    AND id <> (SELECT id FROM public.staff ORDER BY employee_code LIMIT 1);

UPDATE public.staff s
SET profile_id = (SELECT profile_id FROM _ess_ctx),
    email = 'teacher@greenwood.test'
WHERE s.id = (SELECT id FROM public.staff ORDER BY employee_code LIMIT 1);

-- The chosen staff id.
CREATE TEMP TABLE _ess_staff ON COMMIT DROP AS
SELECT id AS staff_id FROM public.staff
WHERE profile_id = (SELECT profile_id FROM _ess_ctx) LIMIT 1;

-- Link the teachers row to this staff (drives ESS performance + attendance).
UPDATE public.teachers SET staff_id = (SELECT staff_id FROM _ess_staff)
WHERE id = (SELECT teacher_id FROM _ess_ctx);

-- ---- Clear prior demo rows for this employee -------------------------------
DELETE FROM public.leave_requests WHERE staff_id = (SELECT staff_id FROM _ess_staff) AND reason LIKE 'DEMO-ESS%';
DELETE FROM public.leave_balances WHERE staff_id = (SELECT staff_id FROM _ess_staff);
DELETE FROM public.payroll_runs   WHERE staff_id = (SELECT staff_id FROM _ess_staff) AND notes = 'DEMO-ESS';
DELETE FROM public.expense_claims WHERE staff_id = (SELECT staff_id FROM _ess_staff) AND notes LIKE 'DEMO-ESS%';
DELETE FROM public.grievances     WHERE staff_id = (SELECT staff_id FROM _ess_staff) AND subject LIKE 'DEMO-ESS%';
DELETE FROM public.staff_documents WHERE staff_id = (SELECT staff_id FROM _ess_staff) AND title LIKE 'DEMO-ESS%';
DELETE FROM public.training_attendance WHERE staff_id = (SELECT staff_id FROM _ess_staff);
DELETE FROM public.training_programs WHERE title LIKE 'DEMO-ESS%';
DELETE FROM public.teacher_performance_reviews WHERE teacher_id = (SELECT teacher_id FROM _ess_ctx) AND notes LIKE 'DEMO-ESS%';

-- ---- Leave balances (current year) -----------------------------------------
INSERT INTO public.leave_balances (staff_id, year, leave_type, allotted, used)
SELECT (SELECT staff_id FROM _ess_staff), EXTRACT(YEAR FROM CURRENT_DATE)::int, t.lt, t.al, t.us
FROM (VALUES ('casual', 12, 4), ('sick', 10, 2), ('earned', 15, 5)) AS t(lt, al, us);

-- ---- Leave requests --------------------------------------------------------
INSERT INTO public.leave_requests (staff_id, leave_type, start_date, end_date, days, status, reason)
VALUES
  ((SELECT staff_id FROM _ess_staff), 'casual', CURRENT_DATE + 7,  CURRENT_DATE + 8,  2, 'pending',  'DEMO-ESS family function'),
  ((SELECT staff_id FROM _ess_staff), 'sick',   CURRENT_DATE - 20, CURRENT_DATE - 19, 2, 'approved', 'DEMO-ESS fever'),
  ((SELECT staff_id FROM _ess_staff), 'earned', CURRENT_DATE - 60, CURRENT_DATE - 56, 5, 'approved', 'DEMO-ESS vacation');

-- ---- Payroll (last 3 months) -----------------------------------------------
INSERT INTO public.payroll_runs (staff_id, month, base_salary, allowances, deductions, net_salary, status, pay_date, notes)
SELECT (SELECT staff_id FROM _ess_staff),
       (date_trunc('month', CURRENT_DATE)::date - (g.n || ' months')::interval)::date,
       60000, 12000, 8000, 64000, 'paid',
       (date_trunc('month', CURRENT_DATE)::date - (g.n || ' months')::interval)::date + 4,
       'DEMO-ESS'
FROM generate_series(0, 2) AS g(n);

-- ---- Expense claims --------------------------------------------------------
INSERT INTO public.expense_claims (staff_id, category, amount, claim_date, status, notes)
VALUES
  ((SELECT staff_id FROM _ess_staff), 'travel',   2400, CURRENT_DATE - 10, 'approved', 'DEMO-ESS site visit cab'),
  ((SELECT staff_id FROM _ess_staff), 'supplies', 1300, CURRENT_DATE - 3,  'pending',  'DEMO-ESS classroom material');

-- ---- Grievance -------------------------------------------------------------
INSERT INTO public.grievances (staff_id, subject, message, status)
VALUES ((SELECT staff_id FROM _ess_staff), 'DEMO-ESS AC not working', 'The staff-room air conditioner has been down for a week.', 'open');

-- ---- Documents -------------------------------------------------------------
INSERT INTO public.staff_documents (staff_id, doc_type, title, uploaded_at, expiry_date)
VALUES
  ((SELECT staff_id FROM _ess_staff), 'id_proof',    'DEMO-ESS Aadhaar card',   now() - interval '200 days', NULL),
  ((SELECT staff_id FROM _ess_staff), 'certificate', 'DEMO-ESS B.Ed degree',    now() - interval '400 days', NULL);

-- ---- Training --------------------------------------------------------------
WITH prog AS (
  INSERT INTO public.training_programs (title, program_type, provider, start_date, end_date)
  VALUES ('DEMO-ESS Classroom Tech Workshop', 'workshop', 'EduTrain India', CURRENT_DATE - 30, CURRENT_DATE - 29)
  RETURNING id
)
INSERT INTO public.training_attendance (program_id, staff_id, attended, feedback, rating)
SELECT prog.id, (SELECT staff_id FROM _ess_staff), true, 'Very useful session', 4 FROM prog;

-- ---- Performance review (teacher-scoped) -----------------------------------
INSERT INTO public.teacher_performance_reviews (teacher_id, period, rating, notes)
SELECT (SELECT teacher_id FROM _ess_ctx), to_char(CURRENT_DATE, 'YYYY') || '-H1', 4.3, 'DEMO-ESS Strong classroom management.'
WHERE (SELECT teacher_id FROM _ess_ctx) IS NOT NULL;

-- ---- Assigned assets -------------------------------------------------------
UPDATE public.assets
SET assigned_to_profile_id = (SELECT profile_id FROM _ess_ctx),
    assigned_to_label = 'Anjali Nair',
    status = 'in_use'
WHERE id IN (
  SELECT id FROM public.assets
  WHERE assigned_to_profile_id IS DISTINCT FROM (SELECT profile_id FROM _ess_ctx)
  ORDER BY asset_code LIMIT 2
);

COMMIT;
