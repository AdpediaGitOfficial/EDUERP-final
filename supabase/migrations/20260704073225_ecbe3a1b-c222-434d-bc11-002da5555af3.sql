
-- 1. Extend homework
ALTER TABLE public.homework
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS max_marks numeric;

DO $$ BEGIN
  ALTER TABLE public.homework ADD CONSTRAINT homework_priority_chk CHECK (priority IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Submissions table
CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz,
  attachment_url text,
  note text,
  marks numeric,
  remarks text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (homework_id, student_id),
  CONSTRAINT homework_submissions_status_chk CHECK (status IN ('pending','submitted','reviewed','overdue'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_submissions TO authenticated;
GRANT ALL ON public.homework_submissions TO service_role;

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

-- Students see & manage their own submissions
CREATE POLICY "students read own submissions" ON public.homework_submissions
  FOR SELECT TO authenticated
  USING (
    student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (
      SELECT 1 FROM public.parent_student ps
      WHERE ps.parent_id = auth.uid() AND ps.student_id = homework_submissions.student_id
    )
  );

CREATE POLICY "students insert own submissions" ON public.homework_submissions
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid()));

CREATE POLICY "students update own submissions" ON public.homework_submissions
  FOR UPDATE TO authenticated
  USING (student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid()))
  WITH CHECK (student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid()));

CREATE POLICY "teachers grade submissions" ON public.homework_submissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

CREATE TRIGGER hw_sub_updated_at BEFORE UPDATE ON public.homework_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed homework across all subjects for Grade 8-A, 9-B, 10-A
-- Map subject-name -> teacher profile id
WITH sub_teacher AS (
  SELECT s.id AS subject_id, s.class_id, s.name AS subject_name,
    CASE s.name
      WHEN 'Mathematics' THEN '11111111-1111-1111-1111-111111111008'::uuid
      WHEN 'English' THEN '238b2e3f-59fc-4d24-83ec-c1e037a80ef3'::uuid
      WHEN 'Hindi' THEN 'faa6a9fd-5390-4816-9352-14d681f88d46'::uuid
      WHEN 'Science' THEN '33cdef5d-f9e3-4738-a646-03f0787a3681'::uuid
      WHEN 'Social Studies' THEN '63933251-6df3-4d51-8a75-886e0d645898'::uuid
      WHEN 'Computer Science' THEN '0a2906f0-4065-4e95-a166-4fddd14ae97f'::uuid
      WHEN 'Sanskrit' THEN 'e67efc37-aab4-42b4-8758-779a843691e4'::uuid
      WHEN 'Physical Education' THEN '8e48fb47-d713-4b99-8c8c-9d7233c732ce'::uuid
    END AS teacher_id
  FROM public.subjects s
  WHERE s.class_id IN (
    '4a99fe58-59b1-4503-b833-213f4e16d92b',
    'bde05e4b-561e-4a91-a355-648b2fe665b3',
    'ac43dc1d-505d-4b49-91c1-4298c1d5bd40'
  )
    AND s.name <> 'Mathematics'
),
titles AS (
  SELECT * FROM (VALUES
    ('English', ARRAY['Reading Comprehension: The Journey','Essay: My Role Model','Grammar Worksheet: Tenses','Poem Analysis: Daffodils']),
    ('Hindi', ARRAY['निबंध: मेरा विद्यालय','व्याकरण अभ्यास: कारक','पाठ सार लेखन','कविता वाचन']),
    ('Science', ARRAY['Lab Report: Photosynthesis','Diagram: Human Digestive System','Chapter Notes: Force & Pressure','Experiment Writeup']),
    ('Social Studies', ARRAY['Map Work: Indian Rivers','Essay: French Revolution','Chapter Questions: Constitution','Timeline: World Wars']),
    ('Computer Science', ARRAY['HTML Portfolio Page','Python Basics Exercise','Flowchart Assignment','MS Excel Practice Sheet']),
    ('Sanskrit', ARRAY['श्लोक याद करें','अनुवाद अभ्यास','धातु रूप लेखन','संस्कृत निबंध']),
    ('Physical Education', ARRAY['Fitness Log Journal','Sport Rules Summary','Yoga Asana Notes','Diet Plan Worksheet'])
  ) AS t(subject_name, titles)
),
gen AS (
  SELECT st.class_id, st.subject_id, st.teacher_id, st.subject_name,
         t.titles[i] AS title, i
  FROM sub_teacher st
  JOIN titles t ON t.subject_name = st.subject_name
  CROSS JOIN generate_series(1,4) AS i
  WHERE st.teacher_id IS NOT NULL
)
INSERT INTO public.homework (id, class_id, subject_id, teacher_id, title, description, assigned_date, due_date, status, priority, attachment_type, attachment_url, max_marks)
SELECT gen_random_uuid(), class_id, subject_id, teacher_id, title,
       'Please complete the assignment neatly and submit before the due date. Refer to the textbook chapters covered in class.',
       (CURRENT_DATE - ((i*2 - 1))::int)::date,
       (CURRENT_DATE + (CASE i WHEN 1 THEN -2 WHEN 2 THEN 0 WHEN 3 THEN 3 WHEN 4 THEN 7 END))::date,
       'active',
       CASE i WHEN 1 THEN 'high' WHEN 2 THEN 'high' WHEN 3 THEN 'medium' ELSE 'low' END,
       CASE i WHEN 1 THEN 'pdf' WHEN 2 THEN 'document' WHEN 3 THEN 'link' ELSE 'image' END,
       CASE i WHEN 1 THEN 'https://example.com/assignments/'||subject_name||'-worksheet.pdf'
              WHEN 2 THEN 'https://example.com/assignments/'||subject_name||'-brief.docx'
              WHEN 3 THEN 'https://example.com/reference/'||subject_name
              ELSE 'https://example.com/assignments/'||subject_name||'-diagram.png' END,
       CASE i WHEN 1 THEN 20 WHEN 2 THEN 10 WHEN 3 THEN 15 ELSE 25 END
FROM gen
ON CONFLICT DO NOTHING;

-- 4. Seed sample submissions to show varied statuses
-- For every student in the 3 classes, mark ~30% as submitted, ~15% reviewed w/ marks
WITH s AS (
  SELECT id, class_id FROM public.students
  WHERE class_id IN (
    '4a99fe58-59b1-4503-b833-213f4e16d92b',
    'bde05e4b-561e-4a91-a355-648b2fe665b3',
    'ac43dc1d-505d-4b49-91c1-4298c1d5bd40'
  )
),
h AS (
  SELECT id, class_id, due_date, max_marks FROM public.homework
  WHERE class_id IN (
    '4a99fe58-59b1-4503-b833-213f4e16d92b',
    'bde05e4b-561e-4a91-a355-648b2fe665b3',
    'ac43dc1d-505d-4b49-91c1-4298c1d5bd40'
  )
),
pairs AS (
  SELECT h.id AS homework_id, s.id AS student_id, h.due_date, h.max_marks,
         (abs(hashtext(h.id::text || s.id::text)) % 100) AS bucket
  FROM h JOIN s ON s.class_id = h.class_id
)
INSERT INTO public.homework_submissions (homework_id, student_id, status, submitted_at, attachment_url, note, marks, remarks, reviewed_at)
SELECT homework_id, student_id,
  CASE
    WHEN bucket < 20 THEN 'reviewed'
    WHEN bucket < 45 THEN 'submitted'
    ELSE 'pending'
  END AS status,
  CASE WHEN bucket < 45 THEN (due_date - 1)::timestamptz + interval '10 hours' ELSE NULL END,
  CASE WHEN bucket < 45 THEN 'https://example.com/submissions/student-work.pdf' ELSE NULL END,
  CASE WHEN bucket < 45 THEN 'Completed all questions.' ELSE NULL END,
  CASE WHEN bucket < 20 THEN GREATEST(0, LEAST(COALESCE(max_marks,20), round((COALESCE(max_marks,20) * (0.7 + (bucket::numeric/100)))::numeric, 1))) ELSE NULL END,
  CASE WHEN bucket < 20 THEN
    (ARRAY['Good work, keep it up!','Well presented. Watch spelling.','Excellent effort.','Clear and concise. Great!','Neat submission.'])[(bucket % 5) + 1]
  ELSE NULL END,
  CASE WHEN bucket < 20 THEN (due_date + 1)::timestamptz + interval '15 hours' ELSE NULL END
FROM pairs
ON CONFLICT (homework_id, student_id) DO NOTHING;

-- Mark overdue: past-due & still pending
UPDATE public.homework_submissions hs
SET status = 'overdue'
FROM public.homework h
WHERE hs.homework_id = h.id AND hs.status = 'pending' AND h.due_date < CURRENT_DATE;
