-- Give every ACTIVE staff member who has no salary structure a basic starting
-- structure, so payroll can produce real numbers instead of zeros. The basic pay
-- is taken from the matching designation's min_pay (by title), falling back to a
-- flat default. PF is enabled by default (the usual statutory case).
--
-- Reversible: every seeded row is tagged notes='auto-seeded from designation', so
-- you can remove them with
--   DELETE FROM public.hr_salary_structures WHERE notes='auto-seeded from designation';
--
-- Safe to re-run: it only inserts for staff that still lack a structure.
--   psql "postgresql://USER:PASS@HOST:5432/DB" -f db/backfill-salary-structures.sql

INSERT INTO public.hr_salary_structures
  (staff_id, basic, earnings, deductions, pf_enabled, esi_enabled, pt_enabled,
   tds_enabled, effective_from, notes)
SELECT
  s.id,
  COALESCE(d.min_pay, 20000)::numeric AS basic,
  '[]'::jsonb,
  '[]'::jsonb,
  true, false, false, false,
  DATE '2020-01-01',   -- effective from far in the past so it applies to any payroll month
  'auto-seeded from designation'
FROM public.staff s
LEFT JOIN public.designations d ON lower(d.title) = lower(s.designation)
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_salary_structures ss WHERE ss.staff_id = s.id
  );

\echo 'active staff now covered by a salary structure:'
SELECT count(DISTINCT ss.staff_id) AS covered,
       (SELECT count(*) FROM public.staff WHERE status='active') AS active_staff
FROM public.hr_salary_structures ss
JOIN public.staff s ON s.id = ss.staff_id AND s.status = 'active';
