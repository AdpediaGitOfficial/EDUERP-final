-- Live vehicle GPS positions (rebuilt properly after the orphaned-table cleanup).
-- One current-position row per vehicle; a tracking device / driver app upserts it.
CREATE TABLE IF NOT EXISTS public.vehicle_positions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL UNIQUE REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  lat           numeric(9, 6) NOT NULL,
  lng           numeric(9, 6) NOT NULL,
  speed_kph     numeric(6, 2),
  heading       numeric(5, 2),
  gps_connected boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_updated
  ON public.vehicle_positions (updated_at DESC);
