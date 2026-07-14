-- Student Houses: a managed master (name + colour) that students are allocated
-- to. Additive and fully idempotent. The legacy free-text student_details.house
-- column is kept for back-compat; house_id is the new source of truth.

CREATE TABLE IF NOT EXISTS public.houses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_details
  ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES public.houses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_details_house ON public.student_details (house_id);

-- Seed four conventional houses once (only when the table is empty).
INSERT INTO public.houses (name, color)
SELECT * FROM (VALUES
  ('Red House',    '#dc2626'),
  ('Blue House',   '#2563eb'),
  ('Green House',  '#16a34a'),
  ('Yellow House', '#d97706')
) AS seed(name, color)
WHERE NOT EXISTS (SELECT 1 FROM public.houses);
