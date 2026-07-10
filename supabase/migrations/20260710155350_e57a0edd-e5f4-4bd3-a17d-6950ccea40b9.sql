-- =====================================================================
-- Fleet Phase 1: driver_incidents, vehicle_documents, route_stops.estimated_minutes,
--                and fleet_renewals_due() helper function.
-- =====================================================================

-- 1) driver_incidents ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  incident_type TEXT NOT NULL, -- 'traffic_violation' | 'accident' | 'complaint' | 'other'
  severity TEXT NOT NULL DEFAULT 'low', -- 'low' | 'medium' | 'high'
  description TEXT NOT NULL,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_incidents_driver ON public.driver_incidents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_incidents_date ON public.driver_incidents(incident_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_incidents TO authenticated;
GRANT ALL ON public.driver_incidents TO service_role;

ALTER TABLE public.driver_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet_admin_di" ON public.driver_incidents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'fleet_manager') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'fleet_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rec_read_di" ON public.driver_incidents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'reception'));

CREATE TRIGGER trg_driver_incidents_updated
  BEFORE UPDATE ON public.driver_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) vehicle_documents --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  doc_kind TEXT NOT NULL, -- 'insurance' | 'permit' | 'rc' | 'fitness' | 'puc' | 'other'
  title TEXT NOT NULL,
  file_path TEXT, -- path in the fleet-docs storage bucket
  issue_date DATE,
  expiry_date DATE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON public.vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_expiry ON public.vehicle_documents(expiry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_documents TO authenticated;
GRANT ALL ON public.vehicle_documents TO service_role;

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet_admin_vd" ON public.vehicle_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'fleet_manager') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'fleet_manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rec_read_vd" ON public.vehicle_documents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'reception'));

CREATE TRIGGER trg_vehicle_documents_updated
  BEFORE UPDATE ON public.vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) route_stops.estimated_minutes -------------------------------------
-- Minutes from route start to this stop, used by the tracking simulation
-- to interpolate vehicle position over time.
ALTER TABLE public.route_stops
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 0;


-- 4) fleet_renewals_due(_days) -----------------------------------------
-- Single source of truth for the dashboard "Renewals Due" card and the
-- Fleet Analytics renewals calendar. Returns one row per expiring document
-- within the given window (default 60 days).
CREATE OR REPLACE FUNCTION public.fleet_renewals_due(_days INTEGER DEFAULT 60)
RETURNS TABLE(
  kind TEXT,       -- 'insurance' | 'permit' | 'license'
  ref_id UUID,     -- vehicle id or driver id
  label TEXT,      -- registration_no or driver name
  expiry_date DATE,
  days_left INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'insurance'::TEXT, v.id, v.registration_no,
         v.insurance_expiry,
         (v.insurance_expiry - CURRENT_DATE)::INTEGER
  FROM public.fleet_vehicles v
  WHERE v.insurance_expiry IS NOT NULL
    AND v.insurance_expiry <= CURRENT_DATE + (_days || ' days')::INTERVAL
    AND v.status <> 'inactive'
  UNION ALL
  SELECT 'permit'::TEXT, v.id, v.registration_no,
         v.permit_expiry,
         (v.permit_expiry - CURRENT_DATE)::INTEGER
  FROM public.fleet_vehicles v
  WHERE v.permit_expiry IS NOT NULL
    AND v.permit_expiry <= CURRENT_DATE + (_days || ' days')::INTERVAL
    AND v.status <> 'inactive'
  UNION ALL
  SELECT 'license'::TEXT, d.id, d.full_name,
         d.license_expiry,
         (d.license_expiry - CURRENT_DATE)::INTEGER
  FROM public.drivers d
  WHERE d.license_expiry IS NOT NULL
    AND d.license_expiry <= CURRENT_DATE + (_days || ' days')::INTERVAL
  ORDER BY 4 ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_renewals_due(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_renewals_due(INTEGER) TO service_role;
