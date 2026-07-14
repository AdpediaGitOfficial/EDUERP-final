-- Group-based fee assignment: expand a Fee Group's components into per-student
-- fee lines, carrying the fine and the demand date ("show to parents on").
-- Additive and fully idempotent.

ALTER TABLE public.fee_assignments
  ADD COLUMN IF NOT EXISTS demand_date date;

ALTER TABLE public.fee_assignments
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.fee_groups(id) ON DELETE SET NULL;

ALTER TABLE public.fee_assignments
  ADD COLUMN IF NOT EXISTS fee_type_id uuid REFERENCES public.fee_types(id) ON DELETE SET NULL;

ALTER TABLE public.fee_assignments
  ADD COLUMN IF NOT EXISTS fine_amount numeric(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_fee_assignments_group
  ON public.fee_assignments (group_id);
