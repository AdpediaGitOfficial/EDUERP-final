
-- STAFF
CREATE TABLE public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  dob DATE,
  department TEXT NOT NULL,
  designation TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reporting_manager_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin_all_staff" ON public.staff FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff_read_own" ON public.staff FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "other_roles_read_staff" ON public.staff FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'fleet_manager'));
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE TABLE public.salary_structures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  designation TEXT UNIQUE NOT NULL,
  base_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowances JSONB NOT NULL DEFAULT '{}'::jsonb,
  standard_deductions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_structures TO authenticated;
GRANT ALL ON public.salary_structures TO service_role;
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin_ss" ON public.salary_structures FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant_read_ss" ON public.salary_structures FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER trg_salary_structures_updated BEFORE UPDATE ON public.salary_structures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payroll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin_pr" ON public.payroll_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant_read_pr" ON public.payroll_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'accountant'));
CREATE POLICY "staff_read_own_pr" ON public.payroll_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.profile_id = auth.uid()));
CREATE TRIGGER trg_payroll_runs_updated BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  approver_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  approver_comment TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin_lr" ON public.leave_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff_read_own_lr" ON public.leave_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.profile_id = auth.uid()));
CREATE POLICY "staff_create_own_lr" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.profile_id = auth.uid()));
CREATE TRIGGER trg_leave_requests_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.leave_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  year INT NOT NULL,
  leave_type TEXT NOT NULL,
  allotted INT NOT NULL DEFAULT 0,
  used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, year, leave_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin_lb" ON public.leave_balances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff_read_own_lb" ON public.leave_balances FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.profile_id = auth.uid()));
CREATE TRIGGER trg_leave_balances_updated BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.staff_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_documents TO authenticated;
GRANT ALL ON public.staff_documents TO service_role;
ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin_sd" ON public.staff_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff_read_own_sd" ON public.staff_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.profile_id = auth.uid()));
CREATE TRIGGER trg_staff_documents_updated BEFORE UPDATE ON public.staff_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  vendor TEXT,
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'approved',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_admin_exp" ON public.expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payment_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  bank_ref TEXT,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(payment_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reconciliations TO authenticated;
GRANT ALL ON public.payment_reconciliations TO service_role;
ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_admin_recon" ON public.payment_reconciliations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.admission_enquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name TEXT NOT NULL,
  parent_name TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  grade_applying TEXT,
  enquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  converted_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  admission_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admission_enquiries TO authenticated;
GRANT ALL ON public.admission_enquiries TO service_role;
ALTER TABLE public.admission_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_admin_ae" ON public.admission_enquiries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_admission_enquiries_updated BEFORE UPDATE ON public.admission_enquiries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.admission_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enquiry_id UUID NOT NULL REFERENCES public.admission_enquiries(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admission_documents TO authenticated;
GRANT ALL ON public.admission_documents TO service_role;
ALTER TABLE public.admission_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_admin_ad" ON public.admission_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.visitor_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  meeting_person TEXT,
  department TEXT,
  id_reference TEXT,
  photo_url TEXT,
  check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_logs TO authenticated;
GRANT ALL ON public.visitor_logs TO service_role;
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_admin_vl" ON public.visitor_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_visitor_logs_updated BEFORE UPDATE ON public.visitor_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fleet_vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_no TEXT UNIQUE NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'bus',
  model TEXT,
  capacity INT NOT NULL DEFAULT 40,
  purchase_date DATE,
  insurance_expiry DATE,
  permit_expiry DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_fv" ON public.fleet_vehicles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rec_read_fv" ON public.fleet_vehicles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_fleet_vehicles_updated BEFORE UPDATE ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  license_no TEXT UNIQUE NOT NULL,
  license_expiry DATE,
  phone TEXT,
  years_experience INT NOT NULL DEFAULT 0,
  assigned_vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_dr" ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rec_read_dr" ON public.drivers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.transport_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_routes TO authenticated;
GRANT ALL ON public.transport_routes TO service_role;
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_tr" ON public.transport_routes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rec_read_tr" ON public.transport_routes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_transport_routes_updated BEFORE UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.route_stops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INT NOT NULL DEFAULT 1,
  eta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_stops TO authenticated;
GRANT ALL ON public.route_stops TO service_role;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_rs" ON public.route_stops FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rec_read_rs" ON public.route_stops FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_route_stops_updated BEFORE UPDATE ON public.route_stops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.route_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES public.route_stops(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  pickup_time TEXT,
  drop_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(route_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_students TO authenticated;
GRANT ALL ON public.route_students TO service_role;
ALTER TABLE public.route_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_rec_admin_rst" ON public.route_students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_route_students_updated BEFORE UPDATE ON public.route_students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vehicle_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  lat NUMERIC(9,6) NOT NULL,
  lng NUMERIC(9,6) NOT NULL,
  gps_connected BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_positions TO authenticated;
GRANT ALL ON public.vehicle_positions TO service_role;
ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_vp" ON public.vehicle_positions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rec_read_vp" ON public.vehicle_positions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'reception'));

CREATE TABLE public.fuel_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  liters NUMERIC(10,2) NOT NULL,
  cost NUMERIC(12,2) NOT NULL,
  odometer INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_logs TO authenticated;
GRANT ALL ON public.fuel_logs TO service_role;
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_fl" ON public.fuel_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fuel_logs_updated BEFORE UPDATE ON public.fuel_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vehicle_maintenance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type TEXT NOT NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendor TEXT,
  next_due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_maintenance TO authenticated;
GRANT ALL ON public.vehicle_maintenance TO service_role;
ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_admin_vm" ON public.vehicle_maintenance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'fleet_manager') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicle_maintenance_updated BEFORE UPDATE ON public.vehicle_maintenance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.teacher_qualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  degree TEXT NOT NULL,
  institution TEXT,
  year INT,
  certification TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_qualifications TO authenticated;
GRANT ALL ON public.teacher_qualifications TO service_role;
ALTER TABLE public.teacher_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm_hr_tq" ON public.teacher_qualifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "teacher_own_tq" ON public.teacher_qualifications FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

CREATE TABLE public.teacher_experience (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  employer TEXT NOT NULL,
  role TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_experience TO authenticated;
GRANT ALL ON public.teacher_experience TO service_role;
ALTER TABLE public.teacher_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm_hr_te" ON public.teacher_experience FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "teacher_own_te" ON public.teacher_experience FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

CREATE TABLE public.teacher_performance_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  rating NUMERIC(3,1) NOT NULL,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_performance_reviews TO authenticated;
GRANT ALL ON public.teacher_performance_reviews TO service_role;
ALTER TABLE public.teacher_performance_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm_hr_tpr" ON public.teacher_performance_reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "teacher_own_tpr" ON public.teacher_performance_reviews FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

CREATE TABLE public.teacher_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_attendance TO authenticated;
GRANT ALL ON public.teacher_attendance TO service_role;
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm_hr_ta" ON public.teacher_attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "teacher_own_ta" ON public.teacher_attendance FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());
