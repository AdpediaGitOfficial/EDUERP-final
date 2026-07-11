-- User account status for the admin Users management screen.
-- Adds a soft-deactivation flag to profiles so administrators can disable an
-- account (blocking login) without hard-deleting rows that are referenced by
-- payments/attendance/holidays via ON DELETE NO ACTION foreign keys.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status);
