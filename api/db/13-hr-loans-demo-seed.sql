-- Demo HR loans across statuses so the Loans screen is populated on a fresh DB.
-- Idempotent: keyed on a deterministic reason marker; re-running inserts nothing new.

-- Active loan with two repayments (partly repaid), interest-free advance.
WITH s AS (
  SELECT id FROM public.staff ORDER BY employee_code LIMIT 1
), ins AS (
  INSERT INTO public.hr_loans (staff_id, loan_type, principal, interest_rate, tenure_months, reason, status, disbursed_on)
  SELECT s.id, 'advance', 60000, 0, 12, 'DEMO: salary advance', 'active', CURRENT_DATE - 60
  FROM s
  WHERE NOT EXISTS (SELECT 1 FROM public.hr_loans WHERE reason = 'DEMO: salary advance')
  RETURNING id
)
INSERT INTO public.hr_loan_repayments (loan_id, amount, paid_on, installment_no)
SELECT ins.id, 5000, CURRENT_DATE - 30, 1 FROM ins
UNION ALL
SELECT ins.id, 5000, CURRENT_DATE - 1, 2 FROM ins;

-- Pending personal loan (awaiting approval), interest-bearing.
INSERT INTO public.hr_loans (staff_id, loan_type, principal, interest_rate, tenure_months, reason, status)
SELECT (SELECT id FROM public.staff ORDER BY employee_code OFFSET 1 LIMIT 1),
       'personal', 120000, 9, 24, 'DEMO: home renovation', 'pending'
WHERE NOT EXISTS (SELECT 1 FROM public.hr_loans WHERE reason = 'DEMO: home renovation');

-- Closed festival loan (fully repaid).
WITH s AS (
  SELECT id FROM public.staff ORDER BY employee_code OFFSET 2 LIMIT 1
), ins AS (
  INSERT INTO public.hr_loans (staff_id, loan_type, principal, interest_rate, tenure_months, reason, status, disbursed_on)
  SELECT s.id, 'festival', 20000, 0, 4, 'DEMO: festival advance', 'closed', CURRENT_DATE - 150
  FROM s
  WHERE NOT EXISTS (SELECT 1 FROM public.hr_loans WHERE reason = 'DEMO: festival advance')
  RETURNING id
)
INSERT INTO public.hr_loan_repayments (loan_id, amount, paid_on, installment_no)
SELECT ins.id, 20000, CURRENT_DATE - 120, 1 FROM ins;
