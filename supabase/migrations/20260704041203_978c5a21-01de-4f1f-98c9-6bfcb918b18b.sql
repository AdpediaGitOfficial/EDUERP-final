
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_fee_on_payment() FROM PUBLIC, anon, authenticated;
-- has_role and get_user_primary_role are safe: they only read the caller's own roles, and are needed by RLS policies.
