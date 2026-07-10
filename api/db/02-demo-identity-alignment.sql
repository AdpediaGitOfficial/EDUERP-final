-- Align local demo-account UUIDs with production.
--
-- Migration 20260710093153 (the demo identity-chain fix) hardcodes the PRODUCTION
-- auth uids of teacher/student/parent@greenwood.test and the target student row
-- ("Anika Singh", Grade 8 A). Locally those rows were created with random uuids by
-- earlier seed migrations, so re-key them to the production uuids first.
--
-- Runs with session_replication_role = replica (superuser), which suspends FK
-- enforcement and user triggers inside this transaction so primary keys can be
-- updated in place and every referencing column repointed, without copy/delete
-- dances or signup-trigger side effects. Consistency is restored before commit.

BEGIN;
SET LOCAL session_replication_role = replica;

-- Repoint every FK column referencing p_table from p_old to p_new.
CREATE OR REPLACE FUNCTION pg_temp.repoint_fks(p_table regclass, p_old uuid, p_new uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE ref RECORD;
BEGIN
  FOR ref IN
    SELECT con.conrelid::regclass AS reftable, att.attname AS refcol
    FROM pg_constraint con
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
    WHERE con.contype = 'f' AND con.confrelid = p_table
  LOOP
    EXECUTE format('UPDATE %s SET %I = $2 WHERE %I = $1', ref.reftable, ref.refcol, ref.refcol)
      USING p_old, p_new;
  END LOOP;
END $fn$;

DO $$
DECLARE
  acct RECORD;
  v_old uuid;
BEGIN
  -- 1) The three demo accounts: re-key auth.users and the same-uuid profiles row,
  --    then repoint every referencing column of both.
  FOR acct IN
    SELECT * FROM (VALUES
      ('teacher@greenwood.test', '84811e91-6898-4137-ba75-4e39c1adc162'::uuid),
      ('student@greenwood.test', '2c78cd09-8d64-433d-a860-607e32a27cb0'::uuid),
      ('parent@greenwood.test',  'a494bbda-3b91-405d-a7cf-eef93e6386e9'::uuid)
    ) AS v(email, prod_id)
  LOOP
    SELECT id INTO v_old FROM auth.users WHERE email = acct.email;
    IF v_old IS NULL OR v_old = acct.prod_id THEN CONTINUE; END IF;
    UPDATE auth.users      SET id = acct.prod_id WHERE id = v_old;
    UPDATE public.profiles SET id = acct.prod_id WHERE id = v_old;
    PERFORM pg_temp.repoint_fks('public.profiles', v_old, acct.prod_id);
    PERFORM pg_temp.repoint_fks('auth.users', v_old, acct.prod_id);
    RAISE NOTICE 'remapped % -> %', acct.email, acct.prod_id;
  END LOOP;

  -- 2) The target student row (production id referenced by the identity-chain fix):
  --    pick the first Grade 8 A student; 20260710093153 renames it to Anika Singh.
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = '06d681b5-ce57-4d36-99d3-41ae4c6b4d69') THEN
    SELECT s.id INTO v_old
    FROM public.students s
    WHERE s.class_id = '4a99fe58-59b1-4503-b833-213f4e16d92b'
    ORDER BY s.roll_no
    LIMIT 1;
    IF v_old IS NOT NULL THEN
      UPDATE public.students SET id = '06d681b5-ce57-4d36-99d3-41ae4c6b4d69' WHERE id = v_old;
      PERFORM pg_temp.repoint_fks('public.students', v_old, '06d681b5-ce57-4d36-99d3-41ae4c6b4d69');
      RAISE NOTICE 'remapped student % -> 06d681b5', v_old;
    END IF;
  END IF;
END $$;

COMMIT;
