-- HR compensation: reusable salary templates + per-employee salary structures
-- ("Set Salary"). Purely additive — no existing table is touched. Idempotent.
--
-- earnings/deductions are JSON arrays of { label, amount } line items. Statutory
-- components (PF/ESI/PT/TDS) are computed by the API from the flags below at the
-- standard Indian rates, so they are never double-counted as manual line items.

CREATE TABLE IF NOT EXISTS public.hr_salary_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text NOT NULL UNIQUE,
  description text,
  basic       numeric(12, 2) NOT NULL DEFAULT 0,
  earnings    jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  pf_enabled  boolean NOT NULL DEFAULT true,
  esi_enabled boolean NOT NULL DEFAULT true,
  pt_enabled  boolean NOT NULL DEFAULT true,
  tds_enabled boolean NOT NULL DEFAULT false,
  tds_amount  numeric(12, 2) NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_salary_structures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id    uuid REFERENCES public.hr_salary_templates(id) ON DELETE SET NULL,
  basic          numeric(12, 2) NOT NULL DEFAULT 0,
  earnings       jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  pf_enabled     boolean NOT NULL DEFAULT true,
  esi_enabled    boolean NOT NULL DEFAULT true,
  pt_enabled     boolean NOT NULL DEFAULT true,
  tds_enabled    boolean NOT NULL DEFAULT false,
  tds_amount     numeric(12, 2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_structures_template
  ON public.hr_salary_structures (template_id);

-- Two starter templates so the screen is populated on a fresh DB.
INSERT INTO public.hr_salary_templates
  (name, code, description, basic, earnings, deductions, pf_enabled, esi_enabled, pt_enabled, tds_enabled)
VALUES
  ('Teaching — Standard', 'TPL-TEACH', 'Default structure for teaching staff', 30000,
   '[{"label":"House Rent Allowance","amount":12000},{"label":"Conveyance","amount":3000},{"label":"Special Allowance","amount":5000}]'::jsonb,
   '[]'::jsonb, true, false, true, true),
  ('Support — Standard', 'TPL-SUPPORT', 'Default structure for support staff', 15000,
   '[{"label":"House Rent Allowance","amount":6000},{"label":"Conveyance","amount":2000}]'::jsonb,
   '[]'::jsonb, true, true, true, false)
ON CONFLICT (code) DO NOTHING;
