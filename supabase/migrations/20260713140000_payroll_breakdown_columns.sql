-- Payroll breakdown columns: store the per-run detail the payroll sheet shows
-- (gross, days worked, and the split of deductions into attendance / statutory /
-- other) alongside the existing base_salary/allowances/deductions/net_salary.
-- Additive and idempotent.
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS working_days integer,
  ADD COLUMN IF NOT EXISTS days_worked numeric(6, 2),
  ADD COLUMN IF NOT EXISTS gross_salary numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_deduction numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS statutory_deductions numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions numeric(12, 2) DEFAULT 0;
