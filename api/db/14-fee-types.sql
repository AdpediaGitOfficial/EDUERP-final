-- Fee Types catalogue — the named fee heads (Tuition, Admission, Transport, …)
-- that Fee Groups will be composed from. Additive and fully idempotent.

CREATE TABLE IF NOT EXISTS public.fee_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'other',
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique name so the catalogue can't get duplicate heads.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_types_name ON public.fee_types (lower(name));

-- Seed a sensible default catalogue (only rows that don't already exist).
INSERT INTO public.fee_types (name, category)
SELECT v.name, v.category
FROM (VALUES
  ('Tuition Fee',    'tuition'),
  ('Admission Fee',  'admission'),
  ('Transport Fee',  'transport'),
  ('Hostel Fee',     'hostel'),
  ('Library Fee',    'library'),
  ('Exam Fee',       'exam'),
  ('Laboratory Fee', 'other'),
  ('Miscellaneous',  'other')
) AS v(name, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fee_types ft WHERE lower(ft.name) = lower(v.name)
);
