#!/usr/bin/env bash
# Production-safe schema updater.
#
# Applies the recent, additive migrations to an EXISTING (populated) database and
# reconciles any missing columns — WITHOUT touching data and WITHOUT loading any
# demo/seed data. Use this to bring a live server's schema up to date after a
# deploy. It is idempotent: re-running it is a no-op.
#
# It is NOT apply-migrations.sh. apply-migrations.sh rebuilds a database FROM
# SCRATCH and loads demo data (5k students, etc.) — never run that on production.
#
# Usage:
#   DATABASE_URL="postgresql://USER:PASS@HOST:5432/postgres" api/db/apply-updates.sh
# or with PG* vars:
#   PGHOST=... PGUSER=... PGPASSWORD=... DBNAME=postgres api/db/apply-updates.sh
#
# Options (env):
#   SINCE=20260711240000   # apply migrations whose filename >= this prefix
#                          # (default = the recent module batch; all idempotent)
#   DRY_RUN=1              # print what would run, change nothing
#
# NOTE for Supabase: use the DIRECT / session-mode connection string (port 5432),
# NOT the transaction pooler (port 6543) — pooled connections can't run DDL.
set -euo pipefail
cd "$(dirname "$0")/../.."

SINCE="${SINCE:-20260711240000}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)
else
  export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-erp}" PGPASSWORD="${PGPASSWORD:-erp}"
  PSQL=(psql -d "${DBNAME:-greenwood}" -v ON_ERROR_STOP=1)
fi

run() { if [[ "$DRY_RUN" == "1" ]]; then echo "  [dry-run] $*"; else "${PSQL[@]}" "$@"; fi; }

echo "==> 1/4  Checking for missing tables (before) …"
"${PSQL[@]}" -f api/db/check-schema.sql || true

echo "==> 2/4  Applying migrations with prefix >= ${SINCE} (additive, idempotent) …"
for f in supabase/migrations/*.sql; do
  base="$(basename "$f")"
  prefix="${base%%_*}"
  # only 14-digit timestamp-prefixed files, at or after the cutoff
  [[ "$prefix" =~ ^[0-9]{14}$ ]] || continue
  [[ "$prefix" > "$SINCE" || "$prefix" == "$SINCE" ]] || continue
  echo "   -> $base"
  run -q -f "$f"
done

echo "==> 3/4  Reconciling any missing columns (safety net) …"
run -q -f api/db/reconcile-columns.sql

echo "==> 4/4  Checking for missing tables (after) — should be empty …"
"${PSQL[@]}" -f api/db/check-schema.sql || true

echo "done. Now regenerate the Prisma client and restart the API:"
echo "  (cd api && npx prisma generate && npm run build && pm2 restart all)"
