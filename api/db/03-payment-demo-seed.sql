-- Demo payments spanning both sources (online gateway + offline staff-recorded),
-- so the Payments/Ledger/dashboards have realistic data for BOTH paths.
-- Re-runnable: every seeded row is tagged notes='demo-payment-seed' and cleared
-- first. The update_fee_on_payment trigger recomputes each invoice's
-- amount_paid/status, so deleting + reinserting keeps invoices consistent.
--
-- Demo parent: parent@greenwood.test -> child Anika Singh
--   (student 06d681b5-ce57-4d36-99d3-41ae4c6b4d69).
BEGIN;

DELETE FROM public.payments WHERE notes = 'demo-payment-seed';

-- (A) 6 ONLINE payments (gateway) across pending invoices of OTHER students.
WITH picks AS (
  SELECT id, student_id, amount_due, amount_paid,
         row_number() OVER (ORDER BY id) AS rn
  FROM public.fee_assignments
  WHERE status = 'pending'
    AND amount_due > amount_paid
    AND student_id <> '06d681b5-ce57-4d36-99d3-41ae4c6b4d69'
  ORDER BY id
  LIMIT 6
)
INSERT INTO public.payments
  (student_id, fee_assignment_id, amount, method, reference, payment_source, status, notes, paid_at)
SELECT student_id, id, amount_due - amount_paid,
       (ARRAY['upi', 'card', 'upi', 'bank', 'card', 'upi'])[rn],
       'GW-ONLINE-' || upper(substr(id::text, 1, 8)),
       'online', 'successful', 'demo-payment-seed',
       now() - (rn * interval '2 days')
FROM picks;

-- (B) 3 OFFLINE UPI payments with realistic transaction references — the
--     in-person reconciliation flow (parent pays UPI at the counter, staff
--     records it after with the UPI txn id).
WITH picks AS (
  SELECT id, student_id, amount_due, amount_paid
  FROM public.fee_assignments
  WHERE status = 'pending'
    AND amount_due > amount_paid
    AND student_id <> '06d681b5-ce57-4d36-99d3-41ae4c6b4d69'
  ORDER BY id
  OFFSET 6 LIMIT 3
),
numbered AS (
  SELECT id, student_id, amount_due, amount_paid,
         row_number() OVER (ORDER BY id) AS rn
  FROM picks
)
INSERT INTO public.payments
  (student_id, fee_assignment_id, amount, method, reference, payment_source, status, notes, paid_at)
SELECT student_id, id, amount_due - amount_paid,
       'upi',
       (ARRAY['429011563287', '518904772210', '604417789923'])[rn],
       'offline', 'successful', 'demo-payment-seed',
       now() - (rn * interval '1 day')
FROM numbered;

-- (C) Demo parent: one past ONLINE payment (with a receipt) on Anika's oldest
--     pending invoice, leaving her remaining invoices pending to demo Pay Online.
WITH one AS (
  SELECT id, amount_due
  FROM public.fee_assignments
  WHERE student_id = '06d681b5-ce57-4d36-99d3-41ae4c6b4d69' AND status = 'pending'
  ORDER BY due_date
  LIMIT 1
)
INSERT INTO public.payments
  (student_id, fee_assignment_id, amount, method, reference, payment_source, status, notes, paid_at)
SELECT '06d681b5-ce57-4d36-99d3-41ae4c6b4d69', id, amount_due,
       'upi', 'UPI anika.parent@okhdfc · GW-DEMO-ANIKA',
       'online', 'successful', 'demo-payment-seed',
       now() - interval '10 days'
FROM one;

COMMIT;
