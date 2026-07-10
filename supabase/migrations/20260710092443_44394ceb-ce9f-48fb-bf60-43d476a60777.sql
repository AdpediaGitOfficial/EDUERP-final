
-- Buses: restrict driver info to staff (admin/teacher)
DROP POLICY IF EXISTS bu_read_all ON public.buses;
CREATE POLICY bu_read_staff ON public.buses FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Library loans: admin (existing), student self, or their parent
DROP POLICY IF EXISTS ll_read_all ON public.library_loans;
CREATE POLICY ll_read_self ON public.library_loans FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = library_loans.student_id AND s.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = library_loans.student_id AND ps.parent_id = auth.uid())
  );

-- Exams: restrict reads to staff
DROP POLICY IF EXISTS exams_read_auth ON public.exams;
CREATE POLICY exams_read_staff ON public.exams FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Assets: restrict reads to staff
DROP POLICY IF EXISTS a_read_all ON public.assets;
CREATE POLICY a_read_staff ON public.assets FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Teachers self read: match via JWT email with strict non-empty checks
DROP POLICY IF EXISTS teachers_self_read ON public.teachers;
CREATE POLICY teachers_self_read ON public.teachers FOR SELECT TO authenticated
  USING (
    email IS NOT NULL
    AND length(email) > 0
    AND auth.email() IS NOT NULL
    AND length(auth.email()) > 0
    AND lower(email) = lower(auth.email())
  );
