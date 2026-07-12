-- HR staff loans & advances: request → approve → disburse → repay.
-- Purely additive; nothing existing is touched. Idempotent.

CREATE TABLE IF NOT EXISTS public.hr_loans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  loan_type      text NOT NULL DEFAULT 'advance',
  principal      numeric(12, 2) NOT NULL,
  interest_rate  numeric(6, 3) NOT NULL DEFAULT 0,   -- annual %, 0 = interest-free
  tenure_months  int NOT NULL DEFAULT 1,
  reason         text,
  status         text NOT NULL DEFAULT 'pending',    -- pending|approved|active|closed|rejected
  disbursed_on   date,
  approved_by    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_loans_staff ON public.hr_loans (staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_loans_status ON public.hr_loans (status);

CREATE TABLE IF NOT EXISTS public.hr_loan_repayments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id        uuid NOT NULL REFERENCES public.hr_loans(id) ON DELETE CASCADE,
  amount         numeric(12, 2) NOT NULL,
  paid_on        date NOT NULL DEFAULT CURRENT_DATE,
  installment_no int,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_loan_repayments_loan ON public.hr_loan_repayments (loan_id);
