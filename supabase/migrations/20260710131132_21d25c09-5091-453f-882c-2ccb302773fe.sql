
-- ==========================================
-- 1) STAFF: remove broad SELECT for accountant/reception/fleet_manager
-- ==========================================
DROP POLICY IF EXISTS "other_roles_read_staff" ON public.staff;

-- Safe directory view — non-sensitive columns only.
-- security_invoker=off so authorized roles can query it without needing
-- SELECT on the underlying staff table.
CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = off) AS
SELECT
  id,
  employee_code,
  full_name,
  department,
  designation,
  status,
  photo_url
FROM public.staff
WHERE status = 'active';

REVOKE ALL ON public.staff_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_directory TO authenticated;
GRANT ALL ON public.staff_directory TO service_role;

-- Restrict the view to roles that actually need a directory lookup.
CREATE OR REPLACE FUNCTION public.can_read_staff_directory()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'fleet_manager'::app_role)
$$;

-- Gate the view via a rule-friendly wrapper: create a security barrier view
-- combining the role check.
CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = off, security_barrier = on) AS
SELECT
  id, employee_code, full_name, department, designation, status, photo_url
FROM public.staff
WHERE status = 'active'
  AND public.can_read_staff_directory();

REVOKE ALL ON public.staff_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_directory TO authenticated;
GRANT ALL ON public.staff_directory TO service_role;

-- ==========================================
-- 2) BUS_LOCATIONS: remove world-readable SELECT
-- ==========================================
DROP POLICY IF EXISTS "bl_read_all" ON public.bus_locations;

CREATE POLICY "bl_read_transport_staff" ON public.bus_locations
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'fleet_manager'::app_role)
  OR public.has_role(auth.uid(), 'reception'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
);
