-- Alignment with production row identities.
--
-- Migration 20260704063758 truncates classes/subjects and reseeds them with
-- gen_random_uuid() ids. In production, that run produced specific ids which the
-- LATER migration 20260704070618 references as hardcoded UUIDs (Grade 8 A,
-- Grade 9 B, Grade 10 A and their Mathematics subjects). Locally the reseed
-- produces different ids, so remap those six rows to the production UUIDs.
-- Safe at this point in the chain: homework/timetable/attendance are empty
-- (truncated by the same migration), so only subjects.class_id needs moving.

DO $$
DECLARE
  cls RECORD;
BEGIN
  FOR cls IN
    SELECT * FROM (VALUES
      ('Grade 8',  'A', '4a99fe58-59b1-4503-b833-213f4e16d92b'::uuid, 'e1ea2e15-aff0-434d-857b-a0a8d87e25b2'::uuid),
      ('Grade 9',  'B', 'bde05e4b-561e-4a91-a355-648b2fe665b3'::uuid, 'bf0edb11-ecd3-4a70-9193-b4192c4795f3'::uuid),
      ('Grade 10', 'A', 'ac43dc1d-505d-4b49-91c1-4298c1d5bd40'::uuid, '6917de0b-2637-44a2-be0d-e606fb15c43e'::uuid)
    ) AS t(name, section, class_uuid, math_uuid)
  LOOP
    -- Re-key the class: insert the copy under the production id, move children, drop the old row.
    INSERT INTO public.classes (id, name, section, academic_year)
    SELECT cls.class_uuid, c.name, c.section, c.academic_year
    FROM public.classes c
    WHERE c.name = cls.name AND c.section = cls.section AND c.id <> cls.class_uuid
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.subjects s SET class_id = cls.class_uuid
    FROM public.classes c
    WHERE s.class_id = c.id AND c.name = cls.name AND c.section = cls.section AND c.id <> cls.class_uuid;

    DELETE FROM public.classes
    WHERE name = cls.name AND section = cls.section AND id <> cls.class_uuid;

    -- Re-key that class's Mathematics subject to the production id.
    UPDATE public.subjects SET id = cls.math_uuid
    WHERE class_id = cls.class_uuid AND code = 'MATH' AND id <> cls.math_uuid;
  END LOOP;
END $$;

-- Subject-teacher accounts that exist in production (seeded there outside migrations)
-- and are referenced by hardcoded UUID in 20260704073225 (homework seeding).
-- Emails/names synthesized locally; ids are the production ids that matter for FKs.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('238b2e3f-59fc-4d24-83ec-c1e037a80ef3'::uuid, 'Priya Deshmukh',  'priya.deshmukh@school.edu',  'English'),
      ('faa6a9fd-5390-4816-9352-14d681f88d46'::uuid, 'Ramesh Tiwari',   'ramesh.tiwari@school.edu',   'Hindi'),
      ('33cdef5d-f9e3-4738-a646-03f0787a3681'::uuid, 'Sneha Kulkarni',  'sneha.kulkarni@school.edu',  'Science'),
      ('63933251-6df3-4d51-8a75-886e0d645898'::uuid, 'Arun Bhattacharya','arun.bhattacharya@school.edu','Social Studies'),
      ('0a2906f0-4065-4e95-a166-4fddd14ae97f'::uuid, 'Kiran Rao',       'kiran.rao@school.edu',       'Computer Science'),
      ('e67efc37-aab4-42b4-8758-779a843691e4'::uuid, 'Lakshmi Iyer',    'lakshmi.iyer@school.edu',    'Sanskrit'),
      ('8e48fb47-d713-4b99-8c8c-9d7233c732ce'::uuid, 'Vikas Chauhan',   'vikas.chauhan@school.edu',   'Physical Education')
    ) AS v(id, full_name, email, subject)
  LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (t.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      t.email, crypt('Teacher@123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', t.full_name), now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, email)
    VALUES (t.id, t.full_name, t.email)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role) VALUES (t.id, 'teacher') ON CONFLICT DO NOTHING;

    INSERT INTO public.teachers (id, full_name, email, subject, status)
    VALUES (t.id, t.full_name, t.email, t.subject, 'active')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
