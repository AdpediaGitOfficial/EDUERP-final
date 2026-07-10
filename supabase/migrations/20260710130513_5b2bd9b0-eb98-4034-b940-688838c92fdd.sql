
-- Teachers can read profiles of students in their assigned classes
CREATE POLICY "profiles_teacher_read_students" ON public.profiles
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.teacher_classes tc ON tc.class_id = s.class_id
    WHERE s.profile_id = profiles.id AND tc.teacher_id = auth.uid()
  )
);

-- Teachers can read profiles of parents of students in their assigned classes
CREATE POLICY "profiles_teacher_read_parents" ON public.profiles
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.parent_student ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.teacher_classes tc ON tc.class_id = s.class_id
    WHERE ps.parent_id = profiles.id AND tc.teacher_id = auth.uid()
  )
);

-- Teachers can read parent_student links for their students
CREATE POLICY "ps_teacher_read" ON public.parent_student
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.teacher_classes tc ON tc.class_id = s.class_id
    WHERE s.id = parent_student.student_id AND tc.teacher_id = auth.uid()
  )
);

-- Teachers can read fee assignments for their students (read-only)
CREATE POLICY "fa_teacher_read" ON public.fee_assignments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.teacher_classes tc ON tc.class_id = s.class_id
    WHERE s.id = fee_assignments.student_id AND tc.teacher_id = auth.uid()
  )
);
