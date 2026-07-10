
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb,
  ADD COLUMN IF NOT EXISTS bank_details jsonb,
  ADD COLUMN IF NOT EXISTS probation_end_date date,
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS medical_info jsonb,
  ADD COLUMN IF NOT EXISTS background_verification jsonb,
  ADD COLUMN IF NOT EXISTS exit_status text,
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS qualifications jsonb,
  ADD COLUMN IF NOT EXISTS experience_years numeric;

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  head_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  budget numeric DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept_read" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  level int DEFAULT 1,
  salary_grade text,
  min_pay numeric,
  max_pay numeric,
  reports_to uuid REFERENCES public.designations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.designations TO authenticated;
GRANT ALL ON public.designations TO service_role;
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "desig_read" ON public.designations FOR SELECT TO authenticated USING (true);
CREATE POLICY "desig_write" ON public.designations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text,
  positions int DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  opened_at date DEFAULT CURRENT_DATE,
  closes_at date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_openings TO authenticated;
GRANT ALL ON public.job_openings TO service_role;
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_read" ON public.job_openings FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_write" ON public.job_openings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid REFERENCES public.job_openings(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  resume_url text,
  stage text NOT NULL DEFAULT 'applied',
  source text,
  rating int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cand_hr" ON public.candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  shift_type text NOT NULL DEFAULT 'fixed',
  start_time time NOT NULL,
  end_time time NOT NULL,
  weekly_off text[] DEFAULT ARRAY['sunday']::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_read" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_write" ON public.shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sshift_hr" ON public.staff_shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "sshift_self_read" ON public.staff_shifts FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.training_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  program_type text NOT NULL DEFAULT 'workshop',
  provider text,
  start_date date,
  end_date date,
  cost numeric DEFAULT 0,
  description text,
  skill_tags text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_programs TO authenticated;
GRANT ALL ON public.training_programs TO service_role;
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tr_read" ON public.training_programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "tr_write" ON public.training_programs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.training_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  attended boolean DEFAULT false,
  feedback text,
  rating int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_attendance TO authenticated;
GRANT ALL ON public.training_attendance TO service_role;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tra_hr" ON public.training_attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "tra_self" ON public.training_attendance FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending',
  approver_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO authenticated;
GRANT ALL ON public.expense_claims TO service_role;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ec_hr" ON public.expense_claims FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "ec_self" ON public.expense_claims FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));
CREATE POLICY "ec_self_insert" ON public.expense_claims FOR INSERT TO authenticated
  WITH CHECK (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.travel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  destination text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  purpose text,
  advance_amount numeric DEFAULT 0,
  settlement_amount numeric,
  status text NOT NULL DEFAULT 'pending',
  settled_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_requests TO authenticated;
GRANT ALL ON public.travel_requests TO service_role;
ALTER TABLE public.travel_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tv_hr" ON public.travel_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "tv_self" ON public.travel_requests FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  rate_multiplier numeric NOT NULL DEFAULT 1.5,
  status text NOT NULL DEFAULT 'pending',
  approver_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overtime_requests TO authenticated;
GRANT ALL ON public.overtime_requests TO service_role;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ot_hr" ON public.overtime_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "ot_self" ON public.overtime_requests FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.resignations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  submitted_at date NOT NULL DEFAULT CURRENT_DATE,
  last_working_day date NOT NULL,
  reason text,
  manager_status text NOT NULL DEFAULT 'pending',
  hr_status text NOT NULL DEFAULT 'pending',
  clearance jsonb DEFAULT '{}'::jsonb,
  exit_interview jsonb,
  final_settlement_amount numeric,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resignations TO authenticated;
GRANT ALL ON public.resignations TO service_role;
ALTER TABLE public.resignations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "res_hr" ON public.resignations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "res_self" ON public.resignations FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.grievances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  response text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grievances TO authenticated;
GRANT ALL ON public.grievances TO service_role;
ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gr_hr" ON public.grievances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "gr_self" ON public.grievances FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));
CREATE POLICY "gr_self_insert" ON public.grievances FOR INSERT TO authenticated
  WITH CHECK (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.staff_employment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  effective_date date NOT NULL,
  from_value text,
  to_value text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_employment_history TO authenticated;
GRANT ALL ON public.staff_employment_history TO service_role;
ALTER TABLE public.staff_employment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eh_hr" ON public.staff_employment_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "eh_self" ON public.staff_employment_history FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid()));

-- SEED
INSERT INTO public.departments (name, code, budget, description) VALUES
  ('Academics','ACAD',500000,'Teaching faculty and curriculum'),
  ('Administration','ADMIN',200000,'School administration and management'),
  ('Finance','FIN',150000,'Accounts, payroll, procurement'),
  ('Operations','OPS',180000,'Facilities, transport and support staff'),
  ('Human Resources','HR',120000,'People and culture')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.designations (title, level, salary_grade, min_pay, max_pay) VALUES
  ('Principal',5,'G5',80000,150000),
  ('Vice Principal',4,'G4',60000,100000),
  ('Senior Teacher',3,'G3',45000,70000),
  ('Teacher',2,'G2',30000,50000),
  ('Junior Teacher',1,'G1',22000,35000),
  ('Administrator',3,'G3',35000,55000),
  ('Accountant',3,'G3',35000,55000),
  ('HR Executive',3,'G3',35000,55000),
  ('Receptionist',2,'G2',22000,35000),
  ('Driver',1,'G1',18000,28000),
  ('Support Staff',1,'G1',15000,25000)
ON CONFLICT (title) DO NOTHING;

INSERT INTO public.staff (employee_code, full_name, email, phone, department, designation, employment_type, join_date, status, blood_group, skills, experience_years, emergency_contact, bank_details)
SELECT v.employee_code,v.full_name,v.email,v.phone,v.department,v.designation,v.employment_type,v.join_date::date,v.status,v.blood_group,v.skills,v.experience_years,v.emergency_contact::jsonb,v.bank_details::jsonb FROM (VALUES
  ('EMP-101','Rajesh Kumar','rajesh.k@greenwood.test','9111111101','Administration','Administrator','full_time','2020-06-01','active','B+',ARRAY['ops','admin','excel'],6,'{"name":"Priya Kumar","phone":"9000000001","relation":"Spouse"}','{"account":"XXXX1234","ifsc":"HDFC0001","bank":"HDFC"}'),
  ('EMP-102','Sneha Patel','sneha.p@greenwood.test','9111111102','Finance','Accountant','full_time','2021-04-15','active','O+',ARRAY['tally','gst','payroll'],4,'{"name":"Arjun Patel","phone":"9000000002","relation":"Spouse"}','{"account":"XXXX2234","ifsc":"ICIC0001","bank":"ICICI"}'),
  ('EMP-103','Vikram Shah','vikram.s@greenwood.test','9111111103','Human Resources','HR Executive','full_time','2022-01-10','active','A+',ARRAY['recruiting','payroll','training'],3,'{"name":"Meera Shah","phone":"9000000003","relation":"Spouse"}','{"account":"XXXX3234","ifsc":"SBIN0001","bank":"SBI"}'),
  ('EMP-104','Anita Desai','anita.d@greenwood.test','9111111104','Administration','Receptionist','full_time','2023-08-20','active','AB+',ARRAY['communication','office'],2,'{"name":"Kiran Desai","phone":"9000000004","relation":"Spouse"}','{"account":"XXXX4234","ifsc":"AXIS0001","bank":"Axis"}'),
  ('EMP-105','Ramesh Yadav','ramesh.y@greenwood.test','9111111105','Operations','Driver','full_time','2019-03-05','active','O-',ARRAY['driving','logistics'],8,'{"name":"Sita Yadav","phone":"9000000005","relation":"Spouse"}','{"account":"XXXX5234","ifsc":"HDFC0002","bank":"HDFC"}'),
  ('EMP-106','Manoj Verma','manoj.v@greenwood.test','9111111106','Operations','Support Staff','full_time','2018-07-11','active','B-',ARRAY['maintenance'],7,'{"name":"Anjali Verma","phone":"9000000006","relation":"Spouse"}','{"account":"XXXX6234","ifsc":"HDFC0003","bank":"HDFC"}'),
  ('EMP-107','Kavya Reddy','kavya.r@greenwood.test','9111111107','Finance','Accountant','full_time','2024-03-01','active','A+',ARRAY['accounts','audit'],5,'{"name":"Suresh Reddy","phone":"9000000007","relation":"Spouse"}','{"account":"XXXX7234","ifsc":"ICIC0002","bank":"ICICI"}')
) AS v(employee_code,full_name,email,phone,department,designation,employment_type,join_date,status,blood_group,skills,experience_years,emergency_contact,bank_details)
WHERE NOT EXISTS (SELECT 1 FROM public.staff WHERE staff.employee_code = v.employee_code);

UPDATE public.staff SET
  emergency_contact = COALESCE(emergency_contact, '{"name":"Family","phone":"9000000000","relation":"Spouse"}'::jsonb),
  bank_details = COALESCE(bank_details, '{"account":"XXXX0000","ifsc":"HDFC0000","bank":"HDFC"}'::jsonb),
  skills = CASE WHEN skills IS NULL OR array_length(skills,1) IS NULL THEN ARRAY['teaching','curriculum'] ELSE skills END,
  experience_years = COALESCE(experience_years, 5),
  blood_group = COALESCE(blood_group, 'O+')
WHERE emergency_contact IS NULL OR bank_details IS NULL OR blood_group IS NULL;

INSERT INTO public.job_openings (title, department, positions, status, opened_at, closes_at, description) VALUES
  ('Mathematics Teacher','Academics',2,'open',CURRENT_DATE - 20, CURRENT_DATE + 30, 'Grade 6-10 mathematics teacher'),
  ('Front Office Executive','Administration',1,'open',CURRENT_DATE - 10, CURRENT_DATE + 20, 'Reception and student services'),
  ('Junior Accountant','Finance',1,'open',CURRENT_DATE - 5, CURRENT_DATE + 25, 'Support role for finance department');

DO $$
DECLARE
  jr RECORD;
  stages text[] := ARRAY['applied','screening','interview','offer','joined'];
  i int;
  first_names text[] := ARRAY['Aarav','Diya','Rohan','Priya','Karan','Meera','Aditya','Isha','Nikhil','Riya','Sameer','Anya','Vivek','Tara','Rahul'];
  last_names text[] := ARRAY['Sharma','Iyer','Menon','Bose','Kapoor','Rao','Malhotra','Chopra','Singh','Gupta'];
BEGIN
  FOR jr IN SELECT id, title FROM public.job_openings LOOP
    FOR i IN 1..5 LOOP
      INSERT INTO public.candidates (job_opening_id, name, email, phone, stage, source, rating, notes)
      VALUES (
        jr.id,
        first_names[1 + ((random()*14)::int)] || ' ' || last_names[1 + ((random()*9)::int)],
        'candidate' || substr(md5(random()::text),1,6) || '@mail.com',
        '90000' || lpad(((random()*99999)::int)::text, 5, '0'),
        stages[i],
        (ARRAY['referral','naukri','linkedin','walkin'])[1 + ((random()*3)::int)],
        3 + ((random()*2)::int),
        'Applied for ' || jr.title
      );
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.shifts (name, shift_type, start_time, end_time) VALUES
  ('Morning','fixed','08:00','15:30'),
  ('General','fixed','09:00','17:30'),
  ('Evening','fixed','13:00','20:30'),
  ('Rotational','rotational','07:00','19:00')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  s RECORD;
  shift_ids uuid[];
  idx int := 0;
BEGIN
  SELECT ARRAY(SELECT id FROM public.shifts ORDER BY name) INTO shift_ids;
  FOR s IN SELECT id, join_date FROM public.staff LOOP
    IF NOT EXISTS (SELECT 1 FROM public.staff_shifts ss WHERE ss.staff_id = s.id) THEN
      INSERT INTO public.staff_shifts (staff_id, shift_id, effective_from)
      VALUES (s.id, shift_ids[1 + (idx % array_length(shift_ids,1))], s.join_date);
      idx := idx + 1;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.training_programs (title, program_type, provider, start_date, end_date, cost, description, skill_tags) VALUES
  ('Classroom Management Workshop','workshop','InTeach Pvt Ltd', CURRENT_DATE - 30, CURRENT_DATE - 28, 25000,'Two-day intensive workshop', ARRAY['pedagogy','classroom']),
  ('Advanced Excel for Admin Staff','online','Coursera', CURRENT_DATE - 60, CURRENT_DATE - 45, 8000,'Self-paced online course', ARRAY['excel','admin']),
  ('First Aid & Emergency Response','certification','Red Cross', CURRENT_DATE - 15, CURRENT_DATE - 15, 5000,'Certification day', ARRAY['first-aid','safety']),
  ('Digital Pedagogy 2025','workshop','EduTech India', CURRENT_DATE + 10, CURRENT_DATE + 12, 30000,'Upcoming workshop', ARRAY['digital','pedagogy']),
  ('Payroll Compliance Update','online','TaxGuru', CURRENT_DATE - 5, CURRENT_DATE, 6000,'Recent finance regulations', ARRAY['payroll','compliance']),
  ('Leadership Development','certification','IIM Bangalore', CURRENT_DATE - 90, CURRENT_DATE - 60, 75000,'Executive program', ARRAY['leadership']);

INSERT INTO public.training_attendance (program_id, staff_id, attended, rating, feedback)
SELECT tp.id, s.id, true, 3+((random()*2)::int), 'Very useful'
FROM public.training_programs tp
CROSS JOIN LATERAL (SELECT id FROM public.staff ORDER BY random() LIMIT 5) s
WHERE tp.end_date < CURRENT_DATE;

INSERT INTO public.expense_claims (staff_id, category, amount, claim_date, status, notes)
SELECT s.id, v.cat, v.amt, CURRENT_DATE - (v.n*7), v.st, v.note
FROM public.staff s
JOIN (VALUES
  ('EMP-101','travel',3500,1,'approved','Client visit'),
  ('EMP-102','food',850,2,'pending','Team dinner'),
  ('EMP-103','office',1200,3,'approved','Stationery'),
  ('EMP-104','medical',2500,4,'reimbursed','Consultation'),
  ('EMP-105','fuel',1800,5,'pending','Field visit')
) AS v(code,cat,amt,n,st,note) ON s.employee_code = v.code;

INSERT INTO public.travel_requests (staff_id, destination, start_date, end_date, purpose, advance_amount, status)
SELECT s.id, v.dest, v.sd, v.ed, v.purp, v.adv, v.st FROM public.staff s
JOIN (VALUES
  ('EMP-101','Delhi', (CURRENT_DATE + 5)::date, (CURRENT_DATE + 7)::date, 'Education conference', 15000, 'approved'),
  ('EMP-103','Mumbai', (CURRENT_DATE + 15)::date, (CURRENT_DATE + 17)::date, 'Vendor negotiation', 12000, 'pending')
) AS v(code,dest,sd,ed,purp,adv,st) ON s.employee_code = v.code;

INSERT INTO public.overtime_requests (staff_id, work_date, hours, status)
SELECT s.id, CURRENT_DATE - i, 2 + (i%3), CASE WHEN i%2=0 THEN 'approved' ELSE 'pending' END
FROM public.staff s, generate_series(1,3) i
WHERE s.employee_code IN ('EMP-105','EMP-106');

INSERT INTO public.resignations (staff_id, submitted_at, last_working_day, reason, manager_status, hr_status, status, clearance)
SELECT id, CURRENT_DATE - 10, CURRENT_DATE + 20, 'Personal reasons', 'approved','pending','in_progress',
  '{"it_return": false, "assets_return": false, "finance_clearance": false, "hr_clearance": false}'::jsonb
FROM public.staff WHERE employee_code = 'EMP-107' LIMIT 1;

INSERT INTO public.staff_employment_history (staff_id, event_type, effective_date, to_value, notes)
SELECT id, 'joined', join_date, designation, 'Employment start'
FROM public.staff
WHERE NOT EXISTS (SELECT 1 FROM public.staff_employment_history h WHERE h.staff_id = staff.id AND h.event_type = 'joined');

INSERT INTO public.staff_employment_history (staff_id, event_type, effective_date, from_value, to_value, notes)
SELECT id, 'promoted', CURRENT_DATE - 180, 'Teacher','Senior Teacher','Annual promotion cycle'
FROM public.staff WHERE employee_code IN ('EMP-101','EMP-102');

INSERT INTO public.grievances (staff_id, subject, message, status)
SELECT id, 'Cafeteria feedback', 'Menu variety could be improved', 'open'
FROM public.staff WHERE employee_code = 'EMP-104' LIMIT 1;
