-- HR org-setup master data: governs the previously free-text employment_type
-- and leave_type fields and adds a pay-grade master. Purely additive — no
-- existing table or column is changed, so nothing that works today breaks.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.hr_employment_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  code       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_pay_grades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  code       text NOT NULL UNIQUE,
  level      int NOT NULL DEFAULT 1,
  min_salary numeric,
  max_salary numeric,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_leave_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text NOT NULL UNIQUE,
  annual_quota  int NOT NULL DEFAULT 0,
  is_paid       boolean NOT NULL DEFAULT true,
  carry_forward boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hr_employment_types (name, code) VALUES
  ('Full Time', 'full_time'), ('Part Time', 'part_time'), ('Contract', 'contract'),
  ('Probation', 'probation'), ('Intern', 'intern'), ('Visiting', 'visiting')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.hr_pay_grades (name, code, level, min_salary, max_salary) VALUES
  ('Grade 1 - Support',   'G1', 1, 15000, 25000),
  ('Grade 2 - Junior',    'G2', 2, 25000, 40000),
  ('Grade 3 - Executive', 'G3', 3, 40000, 65000),
  ('Grade 4 - Manager',   'G4', 4, 65000, 100000),
  ('Grade 5 - Leadership','G5', 5, 100000, 200000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.hr_leave_types (name, code, annual_quota, is_paid, carry_forward) VALUES
  ('Casual Leave',    'casual',    12, true,  false),
  ('Sick Leave',      'sick',      12, true,  false),
  ('Earned Leave',    'earned',    18, true,  true),
  ('Maternity Leave', 'maternity', 180, true, false),
  ('Paternity Leave', 'paternity', 15, true,  false),
  ('Comp Off',        'comp_off',  0,  true,  true),
  ('Unpaid Leave',    'unpaid',    0,  false, false)
ON CONFLICT (code) DO NOTHING;
