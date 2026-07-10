
DO $$
DECLARE
  first_names text[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan','Rohan','Kabir','Dhruv','Aryan','Karthik','Rahul','Rajesh','Sanjay','Amit','Vikram','Nikhil','Manish','Deepak','Prakash','Suresh','Ramesh','Naveen','Anil','Ashok','Harish','Ganesh','Vinod','Pankaj','Sandeep','Yogesh','Ravi','Kunal','Tarun','Varun','Gaurav','Ananya','Diya','Aadhya','Aanya','Pari','Anika','Navya','Kiara','Myra','Sara','Priya','Neha','Pooja','Kavita','Sunita','Anjali','Meera','Divya','Rekha','Shweta','Sneha','Rashmi','Nisha','Preeti','Ritu','Suman','Geeta','Lakshmi','Radha','Seema','Nidhi','Swati','Payal','Sonia','Arti','Manju','Reena','Jyoti','Bhavna','Ishita'];
  last_names text[] := ARRAY['Sharma','Verma','Gupta','Singh','Kumar','Patel','Shah','Iyer','Nair','Menon','Reddy','Rao','Mishra','Tiwari','Yadav','Joshi','Desai','Kapoor','Malhotra','Chopra','Bhatia','Agarwal','Bansal','Jain','Sinha','Das','Bose','Ghosh','Chatterjee','Mukherjee','Banerjee','Roy','Sen','Dutta','Pillai','Krishnan','Subramaniam','Venkatesh','Naidu','Choudhary'];
  subjects text[] := ARRAY['Mathematics','English','Hindi','Science','Physics','Chemistry','Biology','Social Studies','History','Geography','Economics','Computer Science','Physical Education','Art & Craft','Music','Sanskrit'];
  quals text[] := ARRAY['B.Ed, M.A.','B.Ed, M.Sc.','M.Ed','B.Ed, M.Com.','Ph.D','B.Ed, B.A.','B.Ed, B.Sc.'];
  fn text; ln text; nm text; em text; sub text; qual text; expy int;
  i int;
  staff_row_id uuid;
BEGIN
  FOR i IN 1..184 LOOP
    fn := first_names[1 + floor(random()*array_length(first_names,1))::int];
    ln := last_names[1 + floor(random()*array_length(last_names,1))::int];
    nm := fn || ' ' || ln;
    em := lower(fn) || '.' || lower(ln) || i::text || '@greenwood.school';
    sub := subjects[1 + floor(random()*array_length(subjects,1))::int];
    qual := quals[1 + floor(random()*array_length(quals,1))::int];
    expy := 1 + floor(random()*20)::int;

    INSERT INTO public.staff (employee_code, full_name, email, phone, department, designation, employment_type, join_date, status, experience_years, qualifications)
    VALUES (
      'TCH-' || lpad((2000 + i)::text, 4, '0'),
      nm, em,
      '+91' || (7000000000 + floor(random()*999999999))::bigint::text,
      'Academic', 'Teacher', 'full_time',
      CURRENT_DATE - (floor(random()*3650)::int),
      'active', expy,
      jsonb_build_array(qual)
    )
    RETURNING id INTO staff_row_id;

    INSERT INTO public.teachers (full_name, email, phone, subject, qualification, experience_years, joined_date, status, staff_id)
    VALUES (
      nm, em,
      '+91' || (7000000000 + floor(random()*999999999))::bigint::text,
      sub, qual, expy,
      CURRENT_DATE - (floor(random()*3650)::int),
      'active', staff_row_id
    );
  END LOOP;

  FOR i IN 1..30 LOOP
    fn := first_names[1 + floor(random()*array_length(first_names,1))::int];
    ln := last_names[1 + floor(random()*array_length(last_names,1))::int];
    nm := fn || ' ' || ln;
    em := lower(fn) || '.' || lower(ln) || 'nt' || i::text || '@greenwood.school';
    INSERT INTO public.staff (employee_code, full_name, email, phone, department, designation, employment_type, join_date, status, experience_years)
    VALUES (
      'STF-' || lpad((3000 + i)::text, 4, '0'),
      nm, em,
      '+91' || (7000000000 + floor(random()*999999999))::bigint::text,
      (ARRAY['Administration','Accounts','Human Resources','Reception','Maintenance','Operations'])[1 + floor(random()*6)::int],
      (ARRAY['Clerk','Assistant','Officer','Coordinator','Executive','Support Staff'])[1 + floor(random()*6)::int],
      'full_time',
      CURRENT_DATE - (floor(random()*3650)::int),
      'active', 1 + floor(random()*15)::int
    );
  END LOOP;
END $$;
