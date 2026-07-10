CREATE OR REPLACE FUNCTION public.update_fee_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total_paid NUMERIC;
  due NUMERIC;
  fa_id UUID;
BEGIN
  fa_id := COALESCE(NEW.fee_assignment_id, OLD.fee_assignment_id);
  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.payments WHERE fee_assignment_id = fa_id AND status = 'successful';
  SELECT amount_due INTO due FROM public.fee_assignments WHERE id = fa_id;
  UPDATE public.fee_assignments
  SET amount_paid = total_paid,
      status = CASE WHEN total_paid >= due THEN 'paid'::fee_status
                    WHEN total_paid > 0 THEN 'partial'::fee_status
                    ELSE 'pending'::fee_status END
  WHERE id = fa_id;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS payments_update_fee ON public.payments;
CREATE TRIGGER payments_update_fee
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_fee_on_payment();