-- Fee concessions with an approval workflow: staff request a discount for a
-- student, an admin approves/rejects, and on approval the amount reduces the
-- student's outstanding dues. Additive and fully idempotent.

CREATE TABLE IF NOT EXISTS public.fee_concessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_assignment_id uuid REFERENCES public.fee_assignments(id) ON DELETE SET NULL,
  type              text NOT NULL DEFAULT 'flat',   -- 'flat' | 'percent'
  value             numeric(10,2) NOT NULL DEFAULT 0,
  amount            numeric(10,2) NOT NULL DEFAULT 0,
  reason            text,
  status            text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  requested_by      uuid,
  reviewed_by       uuid,
  review_note       text,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_concessions_student ON public.fee_concessions (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_concessions_status ON public.fee_concessions (status);
