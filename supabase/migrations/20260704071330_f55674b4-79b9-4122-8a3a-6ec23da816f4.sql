
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female','other'));
-- Deterministic backfill: alternate male/female by admission_no hash so counts stay realistic and stable
UPDATE public.students
SET gender = CASE WHEN (abs(hashtext(COALESCE(admission_no, id::text))) % 2) = 0 THEN 'male' ELSE 'female' END
WHERE gender IS NULL;
