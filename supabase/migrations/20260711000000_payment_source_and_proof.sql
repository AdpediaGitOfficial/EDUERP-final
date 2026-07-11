-- Payment source (offline vs online gateway) + optional proof-of-payment.
-- Both offline (cash/UPI/card/bank/cheque recorded by staff) and online
-- (parent self-service via the payment gateway) write to the SAME payments
-- table; payment_source distinguishes them. proof_url holds an optional
-- screenshot/scan (UPI confirmation, cheque image) captured at record time.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS proof_url text;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_source_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_source_check
  CHECK (payment_source IN ('offline', 'online'));

CREATE INDEX IF NOT EXISTS idx_payments_source ON public.payments (payment_source);
