
DO $$
DECLARE
  hashed text := crypt('Greenwood@2026', gen_salt('bf'));
  rec record;
  new_id uuid;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('admin@greenwood.test', 'Admin User', 'admin'),
    ('teacher@greenwood.test', 'Teacher User', 'teacher'),
    ('student@greenwood.test', 'Student User', 'student'),
    ('parent@greenwood.test', 'Parent User', 'parent')
  ) AS t(email, full_name, role_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = rec.email) THEN
      new_id := gen_random_uuid();
      INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      VALUES ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', rec.email, hashed, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.full_name, 'role', rec.role_name),
        now(), now(), '', '', '', '');

      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), new_id, new_id::text,
        jsonb_build_object('sub', new_id::text, 'email', rec.email),
        'email', now(), now(), now());
    END IF;
  END LOOP;
END $$;
