#!/usr/bin/env bash
# Rebuild the local database from the extracted Supabase migrations.
# Usage: PGHOST=localhost PGUSER=erp PGPASSWORD=erp DBNAME=greenwood ./apply-migrations.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DBNAME="${DBNAME:-greenwood}"
export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-erp}" PGPASSWORD="${PGPASSWORD:-erp}"

psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f api/db/00-supabase-shim.sql
for f in supabase/migrations/*.sql; do
  # 20260710093153 hardcodes the production uuids of the demo accounts; align
  # the locally-seeded rows to those uuids right before it runs.
  if [[ "$f" == *"20260710093153"* ]]; then
    psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f api/db/02-demo-identity-alignment.sql
  fi
  echo "applying $(basename "$f")"
  psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f "$f"
  # 20260704063758 truncates + reseeds classes/subjects with random ids; remap
  # the rows that later migrations reference by hardcoded production UUID.
  if [[ "$f" == *"20260704063758"* ]]; then
    psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f api/db/01-preexisting-rows.sql
  fi
done
# Demo payments (online + offline UPI) once the schema + base data are in place.
psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f api/db/03-payment-demo-seed.sql
# Reception demo data (routes/stops/assignments, visitors, admission enquiries).
psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f api/db/04-reception-demo-seed.sql
# Fleet demo data (vehicles/drivers, fuel + maintenance logs).
psql -d "$DBNAME" -q -v ON_ERROR_STOP=1 -f api/db/05-fleet-demo-seed.sql
echo "done."
