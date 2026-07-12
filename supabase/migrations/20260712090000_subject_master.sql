-- Subject master: enrich the thin subjects table (id/class_id/name/code) with the
-- attributes a real academic subject catalogue needs. Purely additive columns —
-- nothing that reads subjects today breaks. Idempotent.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS short_name     text,
  ADD COLUMN IF NOT EXISTS category       text,
  ADD COLUMN IF NOT EXISTS subject_type   text NOT NULL DEFAULT 'compulsory',  -- compulsory|elective|optional
  ADD COLUMN IF NOT EXISTS nature         text NOT NULL DEFAULT 'theory',      -- theory|practical|both
  ADD COLUMN IF NOT EXISTS credits        numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_periods int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pass_marks     numeric(6, 2) NOT NULL DEFAULT 33,
  ADD COLUMN IF NOT EXISTS max_marks      numeric(6, 2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS lab_required   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS department     text,
  ADD COLUMN IF NOT EXISTS color          text,
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true;

-- Derive a short name from the code prefix where blank, for nicer display.
UPDATE public.subjects
SET short_name = COALESCE(NULLIF(short_name, ''), left(regexp_replace(name, '[^A-Za-z]', '', 'g'), 4))
WHERE short_name IS NULL;

-- A light default categorisation from the subject name so the catalogue is not empty.
UPDATE public.subjects
SET category = CASE
  WHEN name ILIKE '%math%' THEN 'Mathematics'
  WHEN name ILIKE '%science%' OR name ILIKE '%physics%' OR name ILIKE '%chemistry%' OR name ILIKE '%biology%' THEN 'Science'
  WHEN name ILIKE '%english%' OR name ILIKE '%hindi%' OR name ILIKE '%language%' OR name ILIKE '%sanskrit%' THEN 'Language'
  WHEN name ILIKE '%comput%' THEN 'Computer Science'
  WHEN name ILIKE '%art%' OR name ILIKE '%draw%' OR name ILIKE '%music%' OR name ILIKE '%craft%' THEN 'Arts'
  WHEN name ILIKE '%social%' OR name ILIKE '%history%' OR name ILIKE '%geograph%' OR name ILIKE '%civic%' THEN 'Social Studies'
  ELSE 'General'
END
WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_active ON public.subjects (is_active);
