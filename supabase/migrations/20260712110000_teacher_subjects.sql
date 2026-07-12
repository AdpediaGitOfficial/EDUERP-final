-- Teacher ↔ subject assignment. Today teacher_classes maps a teacher to a whole
-- class; this adds an explicit teacher-to-subject-in-a-class mapping with a role,
-- which is what timetabling and workload need. Additive. Idempotent.

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id   uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'subject_teacher',  -- subject_teacher|lab_teacher|assistant|coordinator
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id, subject_id, role)
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_class ON public.teacher_subjects (class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON public.teacher_subjects (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON public.teacher_subjects (subject_id);

-- Backfill from the timetable: wherever a teacher already teaches a subject in a
-- class, record the assignment so the module reflects the running schedule.
INSERT INTO public.teacher_subjects (teacher_id, class_id, subject_id, role)
SELECT DISTINCT t.teacher_id, t.class_id, t.subject_id, 'subject_teacher'
FROM public.timetable t
WHERE t.teacher_id IS NOT NULL
  AND t.subject_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_subjects ts
    WHERE ts.teacher_id = t.teacher_id
      AND ts.class_id = t.class_id
      AND ts.subject_id = t.subject_id
      AND ts.role = 'subject_teacher'
  );
