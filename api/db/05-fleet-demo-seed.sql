-- Demo data for the Fleet module (vehicles, drivers, fuel + maintenance logs).
-- Re-runnable: every seeded row carries a stable marker and is cleared first.
-- Some documents are set to expire within 60 days so the renewals panel and the
-- dashboard's "renewals due" buckets have data to show.
BEGIN;

-- Clear prior demo rows (fuel/maintenance cascade from vehicles).
DELETE FROM public.drivers WHERE license_no LIKE 'DEMO-DL-%';
UPDATE public.transport_routes SET vehicle_id = NULL, driver_id = NULL
  WHERE name LIKE 'Demo Route%';
DELETE FROM public.fleet_vehicles WHERE registration_no LIKE 'DEMO-%';

-- Five vehicles: mostly active, one in maintenance, one with soon-expiring docs.
WITH v AS (
  INSERT INTO public.fleet_vehicles
    (registration_no, vehicle_type, model, capacity, purchase_date, insurance_expiry, permit_expiry, status)
  VALUES
    ('DEMO-MH12-AB-1201', 'bus', 'Tata Starbus', 42, DATE '2021-06-15',
     CURRENT_DATE + 10, CURRENT_DATE + 200, 'active'),           -- insurance urgent
    ('DEMO-MH12-AB-1202', 'bus', 'Ashok Leyland Lynx', 50, DATE '2020-03-10',
     CURRENT_DATE + 240, CURRENT_DATE + 45, 'active'),           -- permit soon
    ('DEMO-MH12-CD-3303', 'van', 'Force Traveller', 17, DATE '2022-09-01',
     CURRENT_DATE + 320, CURRENT_DATE + 300, 'active'),
    ('DEMO-MH12-CD-3304', 'van', 'Mahindra Supro', 15, DATE '2019-11-20',
     CURRENT_DATE + 400, CURRENT_DATE + 380, 'maintenance'),
    ('DEMO-MH12-EF-5505', 'bus', 'Eicher Skyline', 40, DATE '2023-01-05',
     CURRENT_DATE + 500, CURRENT_DATE + 500, 'inactive')
  RETURNING id, registration_no
),
vn AS (
  SELECT id, row_number() OVER (ORDER BY registration_no) AS rn FROM v
)
-- Four drivers; two licences expiring within 60 days. Assign each to a vehicle.
INSERT INTO public.drivers
  (full_name, license_no, license_expiry, phone, years_experience, assigned_vehicle_id)
SELECT d.full_name, d.license_no, d.expiry, d.phone, d.exp_years, vn.id
FROM (
  VALUES
    ('Suresh Yadav',   'DEMO-DL-1001', CURRENT_DATE + 20,  '+91 98200 10001', 12, 1),
    ('Ramlal Prasad',  'DEMO-DL-1002', CURRENT_DATE + 55,  '+91 98200 10002', 8,  2),
    ('Iqbal Khan',     'DEMO-DL-1003', CURRENT_DATE + 400, '+91 98200 10003', 15, 3),
    ('Ganesh Pawar',   'DEMO-DL-1004', CURRENT_DATE + 500, '+91 98200 10004', 5,  4)
) AS d(full_name, license_no, expiry, phone, exp_years, rn)
JOIN vn ON vn.rn = d.rn;

-- Link the two demo routes (from the reception seed) to demo vehicles + drivers.
UPDATE public.transport_routes t SET
  vehicle_id = v.id,
  driver_id  = dr.id
FROM (SELECT id, row_number() OVER (ORDER BY registration_no) rn FROM public.fleet_vehicles WHERE registration_no LIKE 'DEMO-%') v
JOIN (SELECT id, assigned_vehicle_id FROM public.drivers WHERE license_no LIKE 'DEMO-DL-%') dr
  ON dr.assigned_vehicle_id = v.id
JOIN (SELECT id, row_number() OVER (ORDER BY name) rn FROM public.transport_routes WHERE name LIKE 'Demo Route%') r
  ON r.rn = v.rn
WHERE t.id = r.id;

-- Fuel logs across the last two months (drives the dashboard fuel spend).
INSERT INTO public.fuel_logs (vehicle_id, date, liters, cost, odometer)
SELECT v.id, CURRENT_DATE - (g.n * 12), 55 + g.n * 3, 5200 + g.n * 350, 12000 + g.n * 900
FROM (SELECT id FROM public.fleet_vehicles WHERE registration_no LIKE 'DEMO-%' ORDER BY registration_no LIMIT 3) v
CROSS JOIN generate_series(0, 3) AS g(n);

-- Maintenance records (drives the dashboard maintenance spend).
INSERT INTO public.vehicle_maintenance (vehicle_id, service_date, service_type, cost, notes)
SELECT v.id, CURRENT_DATE - (g.n * 20),
       (ARRAY['Oil change', 'Brake service', 'Tyre rotation'])[1 + (g.n % 3)],
       2500 + g.n * 800, 'demo maintenance'
FROM (SELECT id FROM public.fleet_vehicles WHERE registration_no LIKE 'DEMO-%' ORDER BY registration_no LIMIT 4) v
CROSS JOIN generate_series(0, 1) AS g(n);

COMMIT;
