
-- progress_notes
CREATE TABLE public.progress_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'neutral' CHECK (tone IN ('positive','neutral','needs_improvement')),
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_progress_notes_student ON public.progress_notes(student_id);
CREATE INDEX idx_progress_notes_date ON public.progress_notes(note_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress_notes TO authenticated;
GRANT ALL ON public.progress_notes TO service_role;
ALTER TABLE public.progress_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pn_admin_all" ON public.progress_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pn_teacher_own" ON public.progress_notes FOR ALL TO authenticated
  USING (teacher_id = auth.uid() AND public.has_role(auth.uid(),'teacher'))
  WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(),'teacher'));
CREATE POLICY "pn_parent_read" ON public.progress_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = progress_notes.student_id AND ps.parent_id = auth.uid()));
CREATE TRIGGER trg_progress_notes_updated BEFORE UPDATE ON public.progress_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- complaints
CREATE TABLE public.complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
  escalated_to_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaints_student ON public.complaints(student_id);
CREATE INDEX idx_complaints_raised_by ON public.complaints(raised_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "c_admin_all" ON public.complaints FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "c_teacher_own" ON public.complaints FOR ALL TO authenticated
  USING (raised_by = auth.uid()) WITH CHECK (raised_by = auth.uid());
CREATE POLICY "c_parent_read" ON public.complaints FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = complaints.student_id AND ps.parent_id = auth.uid()));
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- complaint_messages
CREATE TABLE public.complaint_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaint_msgs_complaint ON public.complaint_messages(complaint_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_messages TO authenticated;
GRANT ALL ON public.complaint_messages TO service_role;
ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_admin_all" ON public.complaint_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cm_read" ON public.complaint_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_messages.complaint_id
    AND (c.raised_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = c.student_id AND ps.parent_id = auth.uid()))));
CREATE POLICY "cm_insert" ON public.complaint_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_messages.complaint_id
    AND (c.raised_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = c.student_id AND ps.parent_id = auth.uid())
      OR public.has_role(auth.uid(),'admin'))));

-- broadcasts (without recipient-based policy first)
CREATE TABLE public.broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all_parents','all_staff','class','user')),
  audience_ref UUID,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_broadcasts_sender ON public.broadcasts(sender_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b_admin_all" ON public.broadcasts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "b_teacher_own" ON public.broadcasts FOR ALL TO authenticated
  USING (sender_id = auth.uid() AND public.has_role(auth.uid(),'teacher'))
  WITH CHECK (sender_id = auth.uid() AND public.has_role(auth.uid(),'teacher'));
CREATE TRIGGER trg_broadcasts_updated BEFORE UPDATE ON public.broadcasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- broadcast_recipients
CREATE TABLE public.broadcast_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(broadcast_id, user_id)
);
CREATE INDEX idx_broadcast_recipients_user ON public.broadcast_recipients(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT ALL ON public.broadcast_recipients TO service_role;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "br_admin_all" ON public.broadcast_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "br_user_read" ON public.broadcast_recipients FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "br_user_update" ON public.broadcast_recipients FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Now safe to reference broadcast_recipients
CREATE POLICY "b_recipients_read" ON public.broadcasts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.broadcast_recipients br WHERE br.broadcast_id = broadcasts.id AND br.user_id = auth.uid()));

-- staff_permissions
CREATE TABLE public.staff_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_admin_all" ON public.staff_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sp_user_read" ON public.staff_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER trg_staff_permissions_updated BEFORE UPDATE ON public.staff_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- permission_audit_log
CREATE TABLE public.permission_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  old_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_perm_audit_target ON public.permission_audit_log(target_user_id);
GRANT SELECT, INSERT ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa_admin_read" ON public.permission_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pa_admin_write" ON public.permission_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND actor_id = auth.uid());

-- assets
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  location TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','fair','poor','damaged')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','maintenance','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "a_read_all" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_admin_all" ON public.assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- library_books
CREATE TABLE public.library_books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  category TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lb_read_all" ON public.library_books FOR SELECT TO authenticated USING (true);
CREATE POLICY "lb_admin_all" ON public.library_books FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_library_books_updated BEFORE UPDATE ON public.library_books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- library_loans
CREATE TABLE public.library_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_library_loans_student ON public.library_loans(student_id);
GRANT SELECT ON public.library_loans TO authenticated;
GRANT ALL ON public.library_loans TO service_role;
ALTER TABLE public.library_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ll_read_all" ON public.library_loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "ll_admin_all" ON public.library_loans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_library_loans_updated BEFORE UPDATE ON public.library_loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- buses
CREATE TABLE public.buses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number TEXT NOT NULL,
  route_name TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  capacity INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buses TO authenticated;
GRANT ALL ON public.buses TO service_role;
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bu_read_all" ON public.buses FOR SELECT TO authenticated USING (true);
CREATE POLICY "bu_admin_all" ON public.buses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_buses_updated BEFORE UPDATE ON public.buses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- bus_locations
CREATE TABLE public.bus_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bus_locations_bus ON public.bus_locations(bus_id, recorded_at DESC);
GRANT SELECT ON public.bus_locations TO authenticated;
GRANT ALL ON public.bus_locations TO service_role;
ALTER TABLE public.bus_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bl_read_all" ON public.bus_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "bl_admin_all" ON public.bus_locations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
