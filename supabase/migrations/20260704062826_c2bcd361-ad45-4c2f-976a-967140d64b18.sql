
CREATE TABLE public.teachers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  subject TEXT NOT NULL,
  qualification TEXT,
  experience_years INT NOT NULL DEFAULT 0,
  joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.teachers TO authenticated;
GRANT ALL ON public.teachers TO service_role;

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_read_auth" ON public.teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "teachers_admin_all" ON public.teachers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.teachers (full_name, email, phone, subject, qualification, experience_years, joined_date, status) VALUES
('Anjali Sharma','anjali.sharma@greenwood.test','+91 98200 11201','Mathematics','M.Sc, B.Ed',12,'2018-06-10','active'),
('Rakesh Iyer','rakesh.iyer@greenwood.test','+91 98200 11202','Physics','M.Sc, B.Ed',9,'2019-04-15','active'),
('Priya Menon','priya.menon@greenwood.test','+91 98200 11203','Chemistry','M.Sc, Ph.D',14,'2016-07-01','active'),
('Suresh Nair','suresh.nair@greenwood.test','+91 98200 11204','Biology','M.Sc, B.Ed',7,'2020-06-20','active'),
('Kavita Deshpande','kavita.deshpande@greenwood.test','+91 98200 11205','English','M.A, B.Ed',11,'2017-08-05','active'),
('Arjun Malhotra','arjun.malhotra@greenwood.test','+91 98200 11206','Hindi','M.A, B.Ed',6,'2021-05-12','active'),
('Neha Kulkarni','neha.kulkarni@greenwood.test','+91 98200 11207','Social Studies','M.A, B.Ed',8,'2020-01-18','active'),
('Vikram Singh','vikram.singh@greenwood.test','+91 98200 11208','Computer Science','M.Tech',10,'2018-09-01','active'),
('Meera Pillai','meera.pillai@greenwood.test','+91 98200 11209','Economics','M.A, B.Ed',13,'2016-06-22','active'),
('Ravi Verma','ravi.verma@greenwood.test','+91 98200 11210','Physical Education','B.P.Ed',5,'2022-04-10','active'),
('Sunita Rao','sunita.rao.staff@greenwood.test','+91 98200 11211','Art & Craft','B.F.A',9,'2019-07-15','active'),
('Amit Chatterjee','amit.chatterjee@greenwood.test','+91 98200 11212','History','M.A, B.Ed',15,'2015-06-01','active'),
('Divya Reddy','divya.reddy@greenwood.test','+91 98200 11213','Geography','M.A, B.Ed',7,'2020-08-11','active'),
('Manoj Gupta','manoj.gupta@greenwood.test','+91 98200 11214','Sanskrit','M.A',10,'2018-05-25','active'),
('Pooja Bansal','pooja.bansal@greenwood.test','+91 98200 11215','Music','M.A Music',8,'2019-11-03','active');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
