
-- Fix teachers_self_read: match via profiles table joined by auth.uid()
DROP POLICY IF EXISTS teachers_self_read ON public.teachers;
CREATE POLICY teachers_self_read ON public.teachers
  FOR SELECT TO authenticated
  USING (email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()));

-- Revoke EXECUTE on trigger-only SECURITY DEFINER functions from callable roles
REVOKE ALL ON FUNCTION public.update_fee_on_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
