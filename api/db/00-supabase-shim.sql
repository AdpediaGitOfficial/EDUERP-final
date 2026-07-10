-- Supabase-compatibility shim for running the extracted migrations on plain PostgreSQL.
-- Recreates the minimal surface of Supabase's managed schemas that the app's migrations
-- reference: the auth schema (users, identities, uid()/email()/jwt() helpers) and the
-- anon/authenticated/service_role grants. RLS itself is NOT relied on by the NestJS API
-- (which connects as an app user and enforces scoping in the service layer), but the
-- policies are still created so the extracted RBAC rules remain inspectable in pg_policies.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roles Supabase migrations GRANT to.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users: the columns the app's trigger (handle_new_user) and FKs touch,
-- plus encrypted_password so Supabase bcrypt hashes can be imported as-is.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud text,
  role text,
  email text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  is_super_admin boolean DEFAULT false,
  phone text,
  confirmation_token text DEFAULT '',
  email_change text DEFAULT '',
  email_change_token_new text DEFAULT '',
  recovery_token text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  provider_id text,
  provider text NOT NULL DEFAULT 'email',
  identity_data jsonb DEFAULT '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Request-scoped identity helpers, PostgREST-compatible: read the JWT claims that a
-- SET LOCAL "request.jwt.claim.sub" = '<uuid>' establishes. The NestJS layer does not
-- use these (it scopes queries itself), but the RLS policies compile against them and
-- they make the policies exercisable in tests via SET LOCAL.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.email', true), '') $$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
