
-- Extend library_loans for borrower identification (student OR teacher) + fines tracking
ALTER TABLE public.library_loans
  ALTER COLUMN student_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS borrower_type TEXT NOT NULL DEFAULT 'student' CHECK (borrower_type IN ('student','teacher')),
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fine_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_status TEXT NOT NULL DEFAULT 'none' CHECK (fine_status IN ('none','pending','paid','waived')),
  ADD COLUMN IF NOT EXISTS fine_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ensure exactly one of student_id/teacher_id matches the borrower_type
ALTER TABLE public.library_loans DROP CONSTRAINT IF EXISTS library_loans_borrower_check;
ALTER TABLE public.library_loans
  ADD CONSTRAINT library_loans_borrower_check CHECK (
    (borrower_type = 'student' AND student_id IS NOT NULL AND teacher_id IS NULL) OR
    (borrower_type = 'teacher' AND teacher_id IS NOT NULL AND student_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_library_loans_teacher ON public.library_loans(teacher_id);
CREATE INDEX IF NOT EXISTS idx_library_loans_fine_status ON public.library_loans(fine_status);
