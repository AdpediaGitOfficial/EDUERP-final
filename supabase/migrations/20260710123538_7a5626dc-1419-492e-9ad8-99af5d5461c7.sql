
ALTER TABLE public.teacher_attendance
  ADD COLUMN IF NOT EXISTS check_in_time timestamptz,
  ADD COLUMN IF NOT EXISTS marked_by text NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS marked_by_user uuid,
  ADD COLUMN IF NOT EXISTS correction_reason text;

DO $$ BEGIN
  ALTER TABLE public.teacher_attendance
    ADD CONSTRAINT teacher_attendance_marked_by_check CHECK (marked_by IN ('self','hr','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.teacher_attendance
    ADD CONSTRAINT teacher_attendance_status_check CHECK (status IN ('present','absent','late','half_day','wfh','leave'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid REFERENCES public.teacher_attendance(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  date date NOT NULL,
  from_status text,
  to_status text NOT NULL,
  from_check_in timestamptz,
  to_check_in timestamptz,
  reason text NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_corrections TO authenticated;
GRANT ALL ON public.attendance_corrections TO service_role;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ac_admin_hr ON public.attendance_corrections;
CREATE POLICY ac_admin_hr ON public.attendance_corrections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

DROP POLICY IF EXISTS ac_teacher_read ON public.attendance_corrections;
CREATE POLICY ac_teacher_read ON public.attendance_corrections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = attendance_corrections.teacher_id AND lower(t.email) = lower(auth.email())));

-- Fix teacher_attendance RLS: teacher_id references teachers.id (not auth.uid), so match via email
DROP POLICY IF EXISTS teacher_own_ta ON public.teacher_attendance;
DROP POLICY IF EXISTS adm_hr_ta ON public.teacher_attendance;

CREATE POLICY ta_admin_hr_all ON public.teacher_attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE POLICY ta_teacher_read_own ON public.teacher_attendance
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_attendance.teacher_id AND lower(t.email) = lower(auth.email())));

CREATE POLICY ta_teacher_self_mark ON public.teacher_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    marked_by = 'self'
    AND status IN ('present','half_day','wfh')
    AND date = CURRENT_DATE
    AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_attendance.teacher_id AND lower(t.email) = lower(auth.email()))
  );
