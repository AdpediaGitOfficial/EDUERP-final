-- ============================================================================
--  EDUERP — demo payroll seed (salary structures + a couple of months of runs).
--
--  NOT a numbered migration on purpose: deploy.sh only auto-applies db/NN-*.sql,
--  so this NEVER runs on production automatically. Run it manually on a demo /
--  staging database to make the Payroll module non-empty:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/db/seed-payroll.sql
--
--  Idempotent & re-runnable. It:
--    1. ensures a default salary template exists
--    2. gives every ACTIVE staff member without a structure that template
--    3. generates payroll_runs for the previous + current month (previous month
--       marked paid, current month pending) using the same formula as the API's
--       generate endpoint (minus attendance/loan effects, which are demo-zero).
--  After this, "Generate payroll" in the app refreshes/extends these cleanly.
-- ============================================================================
BEGIN;

-- 1) Default template ---------------------------------------------------------
INSERT INTO hr_salary_templates (name, code, basic, earnings, deductions,
                                 pf_enabled, esi_enabled, pt_enabled, tds_enabled, tds_amount, is_active)
SELECT 'Standard Staff', 'STD-STAFF', 30000,
       '[{"label":"HRA","amount":12000},{"label":"Conveyance","amount":3000},{"label":"Special Allowance","amount":5000}]'::jsonb,
       '[]'::jsonb, true, true, true, false, 0, true
WHERE NOT EXISTS (SELECT 1 FROM hr_salary_templates WHERE code = 'STD-STAFF');

-- 2) Structure for every active staff member who has none ---------------------
INSERT INTO hr_salary_structures (staff_id, template_id, basic, earnings, deductions,
                                  pf_enabled, esi_enabled, pt_enabled, tds_enabled, tds_amount, effective_from)
SELECT s.id, t.id, t.basic, t.earnings, t.deductions,
       t.pf_enabled, t.esi_enabled, t.pt_enabled, t.tds_enabled, t.tds_amount,
       DATE '2020-01-01'
FROM staff s
CROSS JOIN (SELECT * FROM hr_salary_templates WHERE code = 'STD-STAFF' LIMIT 1) t
WHERE s.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM hr_salary_structures x WHERE x.staff_id = s.id)
ON CONFLICT (staff_id) DO NOTHING;

-- 3) Generate runs for the previous + current month (skipping already-paid) ---
--    net = gross − statutory (PF/ESI/PT/TDS per flags) − other. Same formula as
--    the API generate endpoint; attendance/loan deductions are demo-zero.
WITH months AS (
  SELECT date_trunc('month', CURRENT_DATE)::date               AS m, 'pending' AS st
  UNION ALL
  SELECT (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date, 'paid'
),
calc AS (
  SELECT ss.staff_id,
         m.m AS month,
         m.st AS status,
         sc.basic AS basic,
         sc.earn  AS earnings,
         (sc.basic + sc.earn) AS gross,
         (CASE WHEN ss.pf_enabled  THEN LEAST(sc.basic, 15000) * 0.12 ELSE 0 END)
       + (CASE WHEN ss.esi_enabled AND (sc.basic + sc.earn) <= 21000 THEN (sc.basic + sc.earn) * 0.0075 ELSE 0 END)
       + (CASE WHEN ss.pt_enabled  THEN (CASE WHEN (sc.basic + sc.earn) > 15000 THEN 200 ELSE 0 END) ELSE 0 END)
       + (CASE WHEN ss.tds_enabled THEN ss.tds_amount ELSE 0 END) AS statutory,
         sc.other AS other
  FROM hr_salary_structures ss
  JOIN staff s ON s.id = ss.staff_id AND s.status = 'active'
  CROSS JOIN months m
  CROSS JOIN LATERAL (
    SELECT ss.basic AS basic,
           COALESCE((SELECT SUM((e->>'amount')::numeric) FROM jsonb_array_elements(ss.earnings)   e), 0) AS earn,
           COALESCE((SELECT SUM((d->>'amount')::numeric) FROM jsonb_array_elements(ss.deductions) d), 0) AS other
  ) AS sc
)
INSERT INTO payroll_runs (staff_id, month, base_salary, allowances, gross_salary,
                          working_days, days_worked, attendance_deduction,
                          statutory_deductions, other_deductions, deductions, net_salary,
                          status, pay_date)
SELECT c.staff_id, c.month,
       round(c.basic, 2), round(c.earnings, 2), round(c.gross, 2),
       EXTRACT(DAY FROM (date_trunc('month', c.month) + INTERVAL '1 month - 1 day'))::int,
       EXTRACT(DAY FROM (date_trunc('month', c.month) + INTERVAL '1 month - 1 day'))::int,
       0,
       round(c.statutory, 2), round(c.other, 2), round(c.statutory + c.other, 2),
       round(GREATEST(0, c.gross - c.statutory - c.other), 2),
       c.status,
       CASE WHEN c.status = 'paid' THEN (c.month + INTERVAL '1 month - 1 day')::date ELSE NULL END
FROM calc c
ON CONFLICT (staff_id, month) DO NOTHING;  -- never disturb existing / paid runs

COMMIT;
