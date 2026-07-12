-- SIS foundation: the normalized data layer for the enterprise Student
-- Information System. Everything is additive — a 1:1 student_details extension
-- (keeps the hot students table lean), two admin masters (categories,
-- custom-field definitions), and height/weight on the existing medical table.
-- No existing table is rewritten; parent/guardian modelling stays on the
-- existing profiles + parent_student mapping.

-- ---------------------------------------------------------------------------
-- Student categories master (General / SC / ST / OBC / … — per school)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_categories_name
  ON public.student_categories (lower(name));

INSERT INTO public.student_categories (name)
SELECT v FROM (VALUES ('General'), ('SC'), ('ST'), ('OBC')) AS t(v)
WHERE NOT EXISTS (
  SELECT 1 FROM public.student_categories c WHERE lower(c.name) = lower(t.v)
);

-- ---------------------------------------------------------------------------
-- Custom admission-form field definitions (label + type: text | dropdown).
-- Values are stored per-student in student_details.custom (jsonb, keyed by id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_custom_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options    jsonb NOT NULL DEFAULT '[]'::jsonb,
  active     boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_custom_fields_type_chk CHECK (field_type IN ('text', 'dropdown'))
);

-- ---------------------------------------------------------------------------
-- Student details (1:1 extension of students) — the SIS personal/identity,
-- academic-extras, bank, and custom-field data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_details (
  student_id         uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  first_name         text,
  middle_name        text,
  last_name          text,
  category_id        uuid REFERENCES public.student_categories(id) ON DELETE SET NULL,
  house              text,
  religion           text,
  caste              text,
  sub_caste          text,
  mother_tongue      text,
  place_of_birth     text,
  nationality        text DEFAULT 'Indian',
  aadhaar_no         text,
  pen_sssm_id        text,
  bpl                boolean NOT NULL DEFAULT false,
  rte                boolean NOT NULL DEFAULT false,
  biometric_id       text,
  previous_school    text,
  opening_due_balance numeric NOT NULL DEFAULT 0,
  bank_name          text,
  bank_account       text,
  bank_ifsc          text,
  photo_url          text,
  student_phone      text,
  student_email      text,
  custom             jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_details_category ON public.student_details (category_id);

-- ---------------------------------------------------------------------------
-- Height / weight belong with the rest of the medical record.
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_medical
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS weight_kg numeric;

-- ---------------------------------------------------------------------------
-- Parent detail fields used by the admission Father/Mother blocks.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qualification  text,
  ADD COLUMN IF NOT EXISTS annual_income  numeric;
