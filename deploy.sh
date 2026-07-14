#!/usr/bin/env bash
#
# One-shot production deploy for EDUERP.
#
#   ./deploy.sh
#
# What it does (in order):
#   1. Backs up the database (pg_dump)                — skip with SKIP_BACKUP=1
#   2. Pulls the latest code for $BRANCH              — skip with SKIP_PULL=1
#   3. Applies pending SQL schema migrations          — db/NN-*.sql, NN >= 14 only.
#      Each file runs at most once (tracked in a schema_migrations table) and the
#      files are idempotent (IF NOT EXISTS / WHERE NOT EXISTS), so re-running is
#      always safe. Demo/seed files (db/00..13-*) are NEVER touched.
#   4. Rebuilds the API   (prisma generate + tsc)     — never `prisma migrate`.
#   5. Rebuilds the frontend (vite build).
#   6. Restarts services                              — via $RESTART_CMD.
#
# Database connection: set DATABASE_URL, or the standard PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE variables. (A Prisma-style URL with a `?schema=...`
# suffix is handled — the query string is stripped for psql.)
#
# Restart: set RESTART_CMD to your process manager, e.g.
#   RESTART_CMD="pm2 restart all" ./deploy.sh
#   RESTART_CMD="sudo systemctl restart eduerp-api eduerp-web" ./deploy.sh
#   RESTART_CMD="docker compose up -d --build" ./deploy.sh
# If unset, the script builds everything and prints a reminder to restart.

set -euo pipefail

BRANCH="${BRANCH:-post-migration-followup}"
MIN_MIGRATION="${MIN_MIGRATION:-14}"   # seed/rebuild files are 00..13 — never applied
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ---- resolve a psql connection (strip Prisma's ?schema=... for libpq) --------
PSQL=(psql -v ON_ERROR_STOP=1 -q)
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL+=("${DATABASE_URL%%\?*}")
fi
command -v psql >/dev/null || die "psql not found on PATH."
"${PSQL[@]}" -c 'SELECT 1' >/dev/null 2>&1 || die "Cannot connect to the database. Set DATABASE_URL or PG* env vars."

# ---- 1. backup ---------------------------------------------------------------
if [[ "${SKIP_BACKUP:-0}" != "1" ]]; then
  if command -v pg_dump >/dev/null; then
    BK="backup-$(date +%F-%H%M%S).dump"
    log "Backing up database → $BK"
    if [[ -n "${DATABASE_URL:-}" ]]; then
      pg_dump "${DATABASE_URL%%\?*}" -Fc -f "$BK"
    else
      pg_dump -Fc -f "$BK"
    fi
  else
    echo "pg_dump not found — skipping backup (set SKIP_BACKUP=1 to silence)."
  fi
else
  log "Skipping backup (SKIP_BACKUP=1)"
fi

# ---- 2. pull code ------------------------------------------------------------
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  log "Pulling latest code ($BRANCH)"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  log "Skipping git pull (SKIP_PULL=1)"
fi

# ---- 3. apply pending schema migrations --------------------------------------
log "Applying schema migrations (db/NN-*.sql, NN >= $MIN_MIGRATION)"
"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

applied=0
for f in $(ls -1 api/db/[0-9][0-9]-*.sql 2>/dev/null | sort -V); do
  num="$(basename "$f" | cut -c1-2)"
  # numeric compare; skip seed/rebuild files below the floor
  [[ "$num" =~ ^[0-9]+$ ]] || continue
  (( 10#$num >= 10#$MIN_MIGRATION )) || continue
  base="$(basename "$f")"
  seen="$("${PSQL[@]}" -tAc "SELECT 1 FROM public.schema_migrations WHERE filename = '$base'")"
  if [[ "$seen" == "1" ]]; then
    echo "  · $base (already applied)"
    continue
  fi
  echo "  → applying $base"
  "${PSQL[@]}" -f "$f"
  "${PSQL[@]}" -c "INSERT INTO public.schema_migrations(filename) VALUES ('$base')
                   ON CONFLICT (filename) DO NOTHING;"
  applied=$((applied+1))
done
echo "  ($applied new migration(s) applied)"

# ---- 4. build API ------------------------------------------------------------
log "Building API (prisma generate + tsc)"
( cd api && npm install --no-audit --no-fund && npm run deploy )

# ---- 5. build frontend -------------------------------------------------------
log "Building frontend (vite build)"
npm install --no-audit --no-fund
npm run build

# ---- 6. restart --------------------------------------------------------------
if [[ -n "${RESTART_CMD:-}" ]]; then
  log "Restarting services: $RESTART_CMD"
  bash -c "$RESTART_CMD"
else
  log "Build complete. Set RESTART_CMD to auto-restart, or restart manually now."
  echo "  e.g.  RESTART_CMD=\"pm2 restart all\" ./deploy.sh"
fi

log "Deploy finished ✔"
