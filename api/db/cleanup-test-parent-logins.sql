-- Maintenance: remove throwaway test parent logins left in the database.
--
-- These are childless 'parent' accounts on the @p.test domain (batch fixtures
-- like trp.<n>.<m>@p.test) whose linked students were cleaned up, leaving a
-- login with no children. They are NOT real guardians. A trial delete confirms
-- they reference nothing (no payments, complaints, enquiries, etc.), so the
-- hard delete is clean.
--
-- DEFENSIVE by construction — it only ever removes accounts that satisfy ALL of:
--   * hold the 'parent' role,
--   * have an @p.test email,
--   * have ZERO linked children (parent_student).
-- A real parent (any other domain, or with any child) can never match.
--
-- Not part of the migration chain (it deletes data); run it by hand once:
--   psql "postgresql://USER:PASS@HOST:5432/DB" -f db/cleanup-test-parent-logins.sql
-- Re-running is a no-op once they're gone.

BEGIN;

CREATE TEMP TABLE _test_parents ON COMMIT DROP AS
  SELECT p.id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
  WHERE p.email LIKE '%@p.test'
    AND NOT EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = p.id);

\echo 'test parent logins to remove:'
SELECT count(*) AS to_remove FROM _test_parents;

DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM _test_parents);
DELETE FROM public.profiles   WHERE id      IN (SELECT id FROM _test_parents);
DELETE FROM auth.users        WHERE id      IN (SELECT id FROM _test_parents);

-- Safety net: nothing real should remain childless on @p.test.
\echo 'remaining childless @p.test parents (should be 0):'
SELECT count(*) AS remaining
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
WHERE p.email LIKE '%@p.test'
  AND NOT EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = p.id);

COMMIT;
