
-- Teachers: restrict broad read
DROP POLICY IF EXISTS teachers_read_auth ON public.teachers;
CREATE POLICY teachers_admin_read ON public.teachers FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY teachers_self_read ON public.teachers FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

-- Fee structures: restrict broad read
DROP POLICY IF EXISTS fs_read_auth ON public.fee_structures;
CREATE POLICY fs_admin_read ON public.fee_structures FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fs_linked_read ON public.fee_structures FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fee_assignments fa
    JOIN public.students s ON s.id = fa.student_id
    WHERE fa.structure_id = fee_structures.id
      AND (
        s.profile_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.parent_student ps
          WHERE ps.student_id = s.id AND ps.parent_id = auth.uid()
        )
      )
  ));

-- Announcements: honor audience column
DROP POLICY IF EXISTS ann_read_auth ON public.announcements;
CREATE POLICY ann_audience_read ON public.announcements FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR audience = 'all'
    OR (audience = 'admins'   AND has_role(auth.uid(), 'admin'::app_role))
    OR (audience = 'teachers' AND has_role(auth.uid(), 'teacher'::app_role))
    OR (audience = 'students' AND has_role(auth.uid(), 'student'::app_role))
    OR (audience = 'parents'  AND has_role(auth.uid(), 'parent'::app_role))
    OR (audience = 'class' AND class_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.class_id = announcements.class_id AND s.profile_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.parent_student ps
        JOIN public.students s ON s.id = ps.student_id
        WHERE ps.parent_id = auth.uid() AND s.class_id = announcements.class_id
      )
      OR EXISTS (SELECT 1 FROM public.teacher_classes tc WHERE tc.teacher_id = auth.uid() AND tc.class_id = announcements.class_id)
    ))
  );

-- Lock down trigger-only SECURITY DEFINER functions from direct execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_fee_on_payment() FROM PUBLIC, anon, authenticated;
