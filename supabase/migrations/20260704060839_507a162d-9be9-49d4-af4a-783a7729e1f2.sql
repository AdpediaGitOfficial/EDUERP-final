DO $$ BEGIN
  CREATE TYPE public.fee_frequency AS ENUM ('one_time','monthly','quarterly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS frequency public.fee_frequency NOT NULL DEFAULT 'one_time';