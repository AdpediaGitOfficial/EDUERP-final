-- 1. Merge duplicate Grade 1·D (whitespace variant) into the canonical row
UPDATE public.students SET class_id = 'b8f1d0f9-f8aa-4a70-b9d2-9785e21d9ac3'
WHERE class_id = '7f3d1bf6-58a7-4d91-b64e-dab96c06f37e';
UPDATE public.teacher_classes SET class_id = 'b8f1d0f9-f8aa-4a70-b9d2-9785e21d9ac3'
WHERE class_id = '7f3d1bf6-58a7-4d91-b64e-dab96c06f37e';
DELETE FROM public.classes WHERE id = '7f3d1bf6-58a7-4d91-b64e-dab96c06f37e';

-- 2. Trim whitespace anywhere
UPDATE public.classes SET name = TRIM(name) WHERE name <> TRIM(name);
UPDATE public.classes SET section = TRIM(section) WHERE section IS NOT NULL AND section <> TRIM(section);

-- 3. Standardize academic_year to '2025-2026' for the entire active roster
UPDATE public.classes SET academic_year = '2025-2026' WHERE academic_year <> '2025-2026';

-- 4. New metadata columns for the detail view + card
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS capacity int,
  ADD COLUMN IF NOT EXISTS room text,
  ADD COLUMN IF NOT EXISTS class_teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_class_teacher ON public.classes(class_teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_academic_year ON public.classes(academic_year);

-- 5. Uniqueness going forward
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_name_section_year_key;
ALTER TABLE public.classes ADD CONSTRAINT classes_name_section_year_key UNIQUE (name, section, academic_year);

-- 6. Seed reasonable defaults so cards have data:
--    - default capacity 60 (sensible upper bound for existing 52-student sections)
--    - default room derived from grade+section
UPDATE public.classes SET capacity = 60 WHERE capacity IS NULL;
UPDATE public.classes SET room = REPLACE(name, 'Grade ', 'Room ') || COALESCE('-' || section, '')
  WHERE room IS NULL;

-- 7. Auto-assign a class teacher from existing teacher_classes assignments
--    (pick the teacher with the most timetable periods for that class,
--     falling back to any assigned teacher). This wires up the "class teacher"
--     highlight on the detail page without inventing new data.
WITH ranked AS (
  SELECT tc.class_id, tc.teacher_id,
         COUNT(tt.id) AS periods,
         ROW_NUMBER() OVER (
           PARTITION BY tc.class_id
           ORDER BY COUNT(tt.id) DESC, tc.teacher_id
         ) AS rn
  FROM public.teacher_classes tc
  LEFT JOIN public.timetable tt ON tt.class_id = tc.class_id AND tt.teacher_id = tc.teacher_id
  GROUP BY tc.class_id, tc.teacher_id
)
UPDATE public.classes c SET class_teacher_id = r.teacher_id
FROM ranked r
WHERE r.class_id = c.id AND r.rn = 1 AND c.class_teacher_id IS NULL;