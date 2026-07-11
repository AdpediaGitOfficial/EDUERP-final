-- Drop 5 orphaned tables surfaced by the pre-deployment audit.
--
-- All five are empty and have no application code path (no Prisma read/write in
-- api/, no raw SQL, no seed inserts) and no inbound FKs from any retained table:
--   * buses, bus_locations  — legacy transport model, superseded by
--                             fleet_vehicles + transport_routes/route_students
--   * vehicle_positions      — planned live-GPS tracking, never wired
--   * salary_structures      — payroll runs off payroll_runs; this was unused
--   * admission_documents    — reception uses admission_enquiries
--
-- CASCADE also removes their triggers, grants, policies, indexes, and the
-- internal bus_locations -> buses FK. Idempotent (IF EXISTS) so re-applying or
-- building a fresh DB (create-then-drop) is safe.

DROP TABLE IF EXISTS public.bus_locations CASCADE;
DROP TABLE IF EXISTS public.buses CASCADE;
DROP TABLE IF EXISTS public.vehicle_positions CASCADE;
DROP TABLE IF EXISTS public.salary_structures CASCADE;
DROP TABLE IF EXISTS public.admission_documents CASCADE;
