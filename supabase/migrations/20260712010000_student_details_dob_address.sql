-- Student DOB and current/permanent addresses live on the student_details
-- extension (the admission wizard captures them; emergency contact reuses the
-- existing student_medical columns).
ALTER TABLE public.student_details
  ADD COLUMN IF NOT EXISTS dob               date,
  ADD COLUMN IF NOT EXISTS current_address   text,
  ADD COLUMN IF NOT EXISTS permanent_address text;
