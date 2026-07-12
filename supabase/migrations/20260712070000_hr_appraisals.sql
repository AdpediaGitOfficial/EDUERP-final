-- HR performance appraisals: reusable rating criteria, review cycles, and a
-- per-employee appraisal scored against the cycle's criteria. Purely additive;
-- nothing existing (including the legacy performance_reviews table) changes.
-- Idempotent.

-- Reusable, org-wide rating criteria (weighted).
CREATE TABLE IF NOT EXISTS public.hr_appraisal_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  weight      numeric(6, 2) NOT NULL DEFAULT 1,   -- relative weight
  max_score   int NOT NULL DEFAULT 5,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- A review period.
CREATE TABLE IF NOT EXISTS public.hr_appraisal_cycles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  period_start date,
  period_end   date,
  status       text NOT NULL DEFAULT 'draft',      -- draft|active|closed
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One appraisal per (cycle, employee).
CREATE TABLE IF NOT EXISTS public.hr_appraisals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         uuid NOT NULL REFERENCES public.hr_appraisal_cycles(id) ON DELETE CASCADE,
  staff_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reviewer_id      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'pending', -- pending|in_review|completed
  overall_score    numeric(6, 2),                   -- 0..100, computed on save
  self_comments    text,
  manager_comments text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_appraisals_cycle ON public.hr_appraisals (cycle_id);
CREATE INDEX IF NOT EXISTS idx_hr_appraisals_staff ON public.hr_appraisals (staff_id);

-- A score for one criterion within one appraisal.
CREATE TABLE IF NOT EXISTS public.hr_appraisal_ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appraisal_id uuid NOT NULL REFERENCES public.hr_appraisals(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.hr_appraisal_criteria(id) ON DELETE CASCADE,
  score        numeric(6, 2) NOT NULL DEFAULT 0,
  comments     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appraisal_id, criterion_id)
);

-- Starter criteria so the screen is usable on a fresh DB. Seeded only once
-- (guarded on name) so re-running the migration never duplicates them.
INSERT INTO public.hr_appraisal_criteria (name, description, weight, max_score)
SELECT v.name, v.description, v.weight, v.max_score
FROM (VALUES
  ('Job Knowledge',   'Command of role responsibilities and subject matter', 25::numeric, 5),
  ('Quality of Work', 'Accuracy, thoroughness and reliability of output',    25::numeric, 5),
  ('Communication',   'Clarity with students, parents and colleagues',       15::numeric, 5),
  ('Teamwork',        'Collaboration and support across the team',           15::numeric, 5),
  ('Initiative',      'Proactiveness and ownership beyond the brief',        20::numeric, 5)
) AS v(name, description, weight, max_score)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_appraisal_criteria c WHERE c.name = v.name
);
