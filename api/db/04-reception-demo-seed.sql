-- Demo data for the Reception module (transport routes/stops + student
-- assignments, visitor logs, admission enquiries). Re-runnable: seeded rows
-- carry a stable marker and are cleared first.
BEGIN;

-- Clear prior demo rows (route_students/route_stops cascade from routes).
DELETE FROM public.route_students
  WHERE route_id IN (SELECT id FROM public.transport_routes WHERE name LIKE 'Demo Route%');
DELETE FROM public.transport_routes WHERE name LIKE 'Demo Route%';
DELETE FROM public.visitor_logs WHERE purpose LIKE '[demo]%';
DELETE FROM public.admission_enquiries WHERE notes = 'demo-reception-seed';

-- Two routes, three stops each.
WITH r AS (
  INSERT INTO public.transport_routes (name)
  VALUES ('Demo Route North'), ('Demo Route South')
  RETURNING id, name
),
s AS (
  INSERT INTO public.route_stops (route_id, name, sequence)
  SELECT r.id, v.stop, v.seq
  FROM r
  CROSS JOIN LATERAL (
    VALUES ('Main Gate', 1), ('Market Square', 2), ('Riverside', 3)
  ) AS v(stop, seq)
  RETURNING id, route_id, sequence
)
-- Assign three students to the North route's three stops. Reference the `r`
-- CTE directly — a re-SELECT of transport_routes here would not see the rows
-- just inserted by the data-modifying CTE above.
INSERT INTO public.route_students (route_id, stop_id, student_id)
SELECT s.route_id, s.id, st.id
FROM s
JOIN r ON r.id = s.route_id AND r.name = 'Demo Route North'
JOIN (SELECT id, row_number() OVER (ORDER BY id) rn FROM public.students LIMIT 3) st
  ON st.rn = s.sequence;

-- Visitor logs: two checked out, one currently in.
INSERT INTO public.visitor_logs (name, purpose, meeting_person, department, check_in, check_out)
VALUES
  ('Ramesh Kumar', '[demo] Fee enquiry', 'Accounts Desk', 'Finance',
   now() - interval '3 hours', now() - interval '2 hours'),
  ('Sunita Rao', '[demo] Admission tour', 'Front Office', 'Reception',
   now() - interval '1 day 2 hours', now() - interval '1 day 1 hour'),
  ('Vendor - StationeryCo', '[demo] Supply delivery', 'Store Keeper', 'Operations',
   now() - interval '40 minutes', NULL);

-- Admission enquiries across the pipeline stages.
INSERT INTO public.admission_enquiries
  (student_name, parent_name, parent_phone, grade_applying, status, notes)
VALUES
  ('Aarav Mehta', 'Nikhil Mehta', '+91 98200 11223', 'Grade 1', 'new', 'demo-reception-seed'),
  ('Diya Sharma', 'Rekha Sharma', '+91 99870 44556', 'Grade 3', 'follow_up', 'demo-reception-seed'),
  ('Kabir Nair', 'Anil Nair', '+91 98330 77889', 'Grade 6', 'follow_up', 'demo-reception-seed'),
  ('Ishaan Roy', 'Pooja Roy', '+91 90045 33221', 'Grade 2', 'converted', 'demo-reception-seed'),
  ('Meera Iyer', 'Suresh Iyer', '+91 98450 66778', 'Grade 8', 'lost', 'demo-reception-seed');

COMMIT;
