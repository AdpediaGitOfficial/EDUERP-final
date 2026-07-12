-- Backfill the extended staff personal/statutory fields for demo realism.
-- Deterministic, idempotent: only touches rows where the field is still NULL,
-- so re-running never overwrites real data and a fresh DB comes up populated.

-- Gender / marital status / category derived from stable per-row hashes so the
-- distribution looks natural without being random (random() would break replays).
UPDATE public.staff
SET
  gender = CASE (abs(hashtext(id::text)) % 2) WHEN 0 THEN 'male' ELSE 'female' END
WHERE gender IS NULL;

UPDATE public.staff
SET
  marital_status = CASE (abs(hashtext(id::text || 'm')) % 3)
    WHEN 0 THEN 'single'
    WHEN 1 THEN 'married'
    ELSE 'married'
  END
WHERE marital_status IS NULL;

UPDATE public.staff
SET
  staff_category = CASE
    WHEN department IN ('Teaching', 'Academics', 'Science', 'Mathematics', 'Languages') THEN 'teaching'
    WHEN department IN ('Administration', 'Finance', 'HR') THEN 'administration'
    WHEN designation ILIKE '%teacher%' OR designation ILIKE '%faculty%' THEN 'teaching'
    ELSE 'non_teaching'
  END
WHERE staff_category IS NULL;

-- Parents' names: plausible placeholders keyed to the employee so the profile
-- page shows a complete record. Only applied where blank.
UPDATE public.staff
SET
  father_name = split_part(full_name, ' ', 1) || 'raj '
    || COALESCE(NULLIF(split_part(full_name, ' ', 2), ''), 'Kumar')
WHERE father_name IS NULL;

UPDATE public.staff
SET
  mother_name = 'Sunita '
    || COALESCE(NULLIF(split_part(full_name, ' ', 2), ''), split_part(full_name, ' ', 1))
WHERE mother_name IS NULL;

-- Biometric IDs: unique attendance-device keys derived from the employee code.
UPDATE public.staff
SET
  biometric_id = 'BIO-' || upper(regexp_replace(employee_code, '[^A-Za-z0-9]', '', 'g'))
WHERE biometric_id IS NULL
  AND employee_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.staff s2
    WHERE s2.biometric_id = 'BIO-' || upper(regexp_replace(public.staff.employee_code, '[^A-Za-z0-9]', '', 'g'))
  );
