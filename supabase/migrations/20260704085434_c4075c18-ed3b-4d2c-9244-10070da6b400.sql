CREATE TYPE public.payment_status AS ENUM ('pending','successful','failed','refunded');
ALTER TABLE public.payments ADD COLUMN status public.payment_status NOT NULL DEFAULT 'successful';
UPDATE public.payments SET status = 'successful' WHERE status IS NULL;