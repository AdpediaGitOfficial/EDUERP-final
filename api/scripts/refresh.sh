#!/usr/bin/env bash
# Refresh a deployed API checkout after `git pull` (or any code/schema change).
#
# Fixes the most common post-deploy failure:
#   TypeError: Cannot read properties of undefined (reading 'findMany')
# which means the generated Prisma client is older than schema.prisma — a new
# model was added to the schema but `prisma generate` was never re-run on this
# host, so `this.prisma.<newModel>` is undefined at runtime.
#
# Safe to re-run. Touches node_modules / the generated client / dist only —
# it NEVER writes to the database. (Applying new *table* migrations to the DB is
# a separate, deliberate step — see the note printed at the end.)
#
# Usage:
#   cd api && ./scripts/refresh.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> [1/3] Installing dependencies (npm ci; postinstall regenerates the Prisma client)"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> [2/3] Regenerating Prisma client from prisma/schema.prisma"
# Explicit belt-and-suspenders even though postinstall already ran it.
npx prisma generate

echo "==> [3/3] Building API -> dist/"
npm run build

echo
echo "Done. Reload the API process so it picks up the new client + build:"
echo "  pm2 reload greenwood-api     # or: pm2 restart greenwood-api"
echo
echo "If this release ADDS new tables/columns, the running database also needs"
echo "those objects. Apply the new migration SQL from supabase/migrations/ to"
echo "your production database (a single psql -f per new file), then reload."
