-- Fee Challans — a payable demand voucher generated for a student's outstanding
-- fees (distinct from the post-payment receipt). Additive and idempotent.

CREATE TABLE IF NOT EXISTS public.fee_challans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_no   text NOT NULL,
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title        text,
  notes        text,
  status       text NOT NULL DEFAULT 'generated',
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  due_date     date,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_challans_no ON public.fee_challans (challan_no);
CREATE INDEX IF NOT EXISTS idx_fee_challans_student ON public.fee_challans (student_id);

CREATE TABLE IF NOT EXISTS public.fee_challan_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id        uuid NOT NULL REFERENCES public.fee_challans(id) ON DELETE CASCADE,
  fee_assignment_id uuid REFERENCES public.fee_assignments(id) ON DELETE SET NULL,
  label             text,
  amount            numeric(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fee_challan_items_challan
  ON public.fee_challan_items (challan_id);
