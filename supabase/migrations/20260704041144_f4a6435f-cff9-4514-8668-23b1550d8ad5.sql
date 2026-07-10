
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student', 'parent');
CREATE TYPE public.fee_status AS ENUM ('pending', 'paid', 'overdue', 'partial');
CREATE TYPE public.holiday_type AS ENUM ('holiday', 'vacation', 'exam', 'event');
CREATE TYPE public.announcement_audience AS ENUM ('all', 'admins', 'teachers', 'students', 'parents', 'class');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_primary_role(_user_id UUID)
RETURNS app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'teacher' THEN 2 WHEN 'student' THEN 3 WHEN 'parent' THEN 4 END
  LIMIT 1
$$;

-- Auto-create profile + first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSIF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  section TEXT,
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  admission_no TEXT UNIQUE,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Parent-Student link
CREATE TABLE public.parent_student (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent',
  UNIQUE (parent_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_student TO authenticated;
GRANT ALL ON public.parent_student TO service_role;
ALTER TABLE public.parent_student ENABLE ROW LEVEL SECURITY;

-- Fee structures
CREATE TABLE public.fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  term TEXT,
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structures TO authenticated;
GRANT ALL ON public.fee_structures TO service_role;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;

-- Fee assignments
CREATE TABLE public.fee_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  structure_id UUID REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount_due NUMERIC(10,2) NOT NULL,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status fee_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_assignments TO authenticated;
GRANT ALL ON public.fee_assignments TO service_role;
ALTER TABLE public.fee_assignments ENABLE ROW LEVEL SECURITY;

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_assignment_id UUID NOT NULL REFERENCES public.fee_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual',
  reference TEXT,
  receipt_no TEXT UNIQUE NOT NULL DEFAULT ('RCPT-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,8)),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience announcement_audience NOT NULL DEFAULT 'all',
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Holidays
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type holiday_type NOT NULL DEFAULT 'holiday',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- ===== RLS POLICIES =====

-- profiles: everyone signed in can read (needed for parent/teacher lookups); own can update; admin all
CREATE POLICY "profiles_read_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles: user can read own; admin all
CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- classes: all authenticated read; admin write
CREATE POLICY "classes_read_auth" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "classes_admin_write" ON public.classes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- students: admin/teacher read all; parent read their linked; student read own
CREATE POLICY "students_admin_all" ON public.students FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "students_teacher_read" ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "students_self_read" ON public.students FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "students_parent_read" ON public.students FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = students.id AND ps.parent_id = auth.uid())
);

-- parent_student: admin all; parent read own
CREATE POLICY "ps_admin_all" ON public.parent_student FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ps_parent_read" ON public.parent_student FOR SELECT TO authenticated USING (parent_id = auth.uid());

-- fee_structures: authenticated read; admin write
CREATE POLICY "fs_read_auth" ON public.fee_structures FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_admin_write" ON public.fee_structures FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- fee_assignments: admin all; student self via students.profile_id; parent via link
CREATE POLICY "fa_admin_all" ON public.fee_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "fa_student_read" ON public.fee_assignments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = fee_assignments.student_id AND s.profile_id = auth.uid())
);
CREATE POLICY "fa_parent_read" ON public.fee_assignments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = fee_assignments.student_id AND ps.parent_id = auth.uid())
);

-- payments: admin all; student/parent read
CREATE POLICY "pay_admin_all" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pay_student_read" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.profile_id = auth.uid())
);
CREATE POLICY "pay_parent_read" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = payments.student_id AND ps.parent_id = auth.uid())
);

-- announcements: authenticated read (client filters by role); admin/teacher write
CREATE POLICY "ann_read_auth" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "ann_admin_write" ON public.announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ann_teacher_insert" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher') AND author_id = auth.uid());
CREATE POLICY "ann_author_delete" ON public.announcements FOR DELETE TO authenticated USING (author_id = auth.uid());

-- holidays: everyone read; admin write
CREATE POLICY "hol_read_auth" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "hol_admin_write" ON public.holidays FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-update fee_assignment status when payment inserted
CREATE OR REPLACE FUNCTION public.update_fee_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_paid NUMERIC;
  due NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.payments WHERE fee_assignment_id = NEW.fee_assignment_id;
  SELECT amount_due INTO due FROM public.fee_assignments WHERE id = NEW.fee_assignment_id;
  UPDATE public.fee_assignments
  SET amount_paid = total_paid,
      status = CASE WHEN total_paid >= due THEN 'paid'::fee_status
                    WHEN total_paid > 0 THEN 'partial'::fee_status
                    ELSE 'pending'::fee_status END
  WHERE id = NEW.fee_assignment_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_update_fee_on_payment
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_fee_on_payment();
