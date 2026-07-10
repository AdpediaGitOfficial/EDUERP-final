
-- Fix infinite recursion between students and parent_student RLS policies.
-- The recursion: students_parent_read → parent_student → ps_teacher_read → students → ...
-- Break the cycle with SECURITY DEFINER helper functions that bypass RLS.

CREATE OR REPLACE FUNCTION public.is_parent_of_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student
    WHERE student_id = _student_id AND parent_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.teacher_classes tc ON tc.class_id = s.class_id
    WHERE s.id = _student_id AND tc.teacher_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_classes
    WHERE class_id = _class_id AND teacher_id = auth.uid()
  )
$$;

-- Rewrite students policies
DROP POLICY IF EXISTS students_parent_read ON public.students;
DROP POLICY IF EXISTS students_teacher_read ON public.students;

CREATE POLICY students_parent_read ON public.students
  FOR SELECT TO authenticated
  USING (public.is_parent_of_student(id));

CREATE POLICY students_teacher_read ON public.students
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'::app_role) AND public.is_teacher_of_class(class_id));

-- Rewrite parent_student teacher policy to use definer function
DROP POLICY IF EXISTS ps_teacher_read ON public.parent_student;

CREATE POLICY ps_teacher_read ON public.parent_student
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'::app_role) AND public.is_teacher_of_student(student_id));
