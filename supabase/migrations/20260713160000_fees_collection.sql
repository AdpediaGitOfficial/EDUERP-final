-- Fees Collection module.
-- 1) Per-line discount / fine on a payment and the account it was deposited to,
--    so a staff collection can apply a concession or late fine and still produce
--    an accurate receipt.
-- 2) A reminder audit log for the Due Fees list (who was reminded, on which
--    channel, for how much, and when).
-- Additive and idempotent.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS discount numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_account text;

CREATE TABLE IF NOT EXISTS public.fee_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  channel    text NOT NULL,          -- sms | whatsapp | email | in_app
  amount     numeric(10, 2) NOT NULL DEFAULT 0,
  message    text,
  sent_by    uuid,                   -- profiles/users id of the sender (nullable)
  delivered  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fee_reminders_student ON public.fee_reminders(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_reminders_created ON public.fee_reminders(created_at);
