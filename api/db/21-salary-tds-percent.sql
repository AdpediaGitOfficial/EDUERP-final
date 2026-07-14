-- Salary TDS as a percentage option.
-- When tds_is_percent = true, tds_amount is read as a % of gross; otherwise it
-- stays a flat rupee amount. Additive + idempotent; safe to re-run.
ALTER TABLE public.hr_salary_templates
  ADD COLUMN IF NOT EXISTS tds_is_percent boolean NOT NULL DEFAULT false;

ALTER TABLE public.hr_salary_structures
  ADD COLUMN IF NOT EXISTS tds_is_percent boolean NOT NULL DEFAULT false;
