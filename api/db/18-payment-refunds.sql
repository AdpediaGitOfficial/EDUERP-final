-- Payment refunds — a refund ledger against a payment. Net collection in the
-- Transactions views = payments − refunds. Additive and fully idempotent.

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount      numeric(10,2) NOT NULL,
  reason      text,
  method      text,
  refunded_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON public.payment_refunds (payment_id);
