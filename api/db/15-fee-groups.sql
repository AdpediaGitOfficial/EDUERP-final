-- Fee Groups — a named bundle (e.g. "4th Installment Fees 2026-2027") made of
-- one or more components, each with its own amount, due/demand dates and fine.
-- Assignments (a later phase) expand a group into per-student fee lines.
-- Additive and fully idempotent.

CREATE TABLE IF NOT EXISTS public.fee_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  academic_year text NOT NULL DEFAULT '2025-2026',
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  is_archived   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_group_components (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.fee_groups(id) ON DELETE CASCADE,
  fee_type_id     uuid REFERENCES public.fee_types(id) ON DELETE SET NULL,
  label           text NOT NULL,
  amount          numeric(10,2) NOT NULL DEFAULT 0,
  due_date        date,
  demand_date     date,
  fine_amount     numeric(10,2) NOT NULL DEFAULT 0,
  fine_after_days integer,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_group_components_group
  ON public.fee_group_components (group_id);
