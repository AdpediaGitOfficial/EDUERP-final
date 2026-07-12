-- Staff personal / statutory fields to reach parity with a full HR staff record.
-- Purely additive columns on public.staff — nothing existing changes, so no
-- current behaviour breaks. Idempotent.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS gender          text,
  ADD COLUMN IF NOT EXISTS marital_status  text,
  ADD COLUMN IF NOT EXISTS father_name     text,
  ADD COLUMN IF NOT EXISTS mother_name     text,
  ADD COLUMN IF NOT EXISTS biometric_id    text,
  ADD COLUMN IF NOT EXISTS staff_category  text;

-- Biometric IDs are used as an attendance-device key, so they must be unique
-- when present. A partial unique index leaves the many NULLs unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS staff_biometric_id_key
  ON public.staff (biometric_id)
  WHERE biometric_id IS NOT NULL;
