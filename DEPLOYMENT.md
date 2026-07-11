# Deployment Guide — Standard Node.js (no Docker)

Production stack: **Node.js 22 + PM2 + Nginx + PostgreSQL + the NestJS API** on a standard Linux
or Windows server. No containers are used anywhere in this setup.

Two services run under PM2: the **web SSR app** (`greenwood-erp`, nitro build in `.output/`) and
the **NestJS API** (`greenwood-api`, `api/dist/`). The browser reaches the API same-origin via
`/api` (Nginx proxies it), so there is no cross-origin/CORS hop in normal operation. The Supabase
migration is complete — see `BACKEND_MIGRATION_LOG.md`.

## Architecture

```
Browser ── HTTPS ──> Nginx (TLS, gzip, static assets, rate limiting, security headers)
                        │
                        ├── /assets/*      served from disk (immutable, hashed filenames)
                        ├── /api/*  ──────> PM2 ──> NestJS API (api/dist, :3001) ──> PostgreSQL
                        └── everything else ──> PM2 cluster ──> Node SSR web server (.output/, :3000)
```

Two honest notes on the requested stack, so nobody hunts for files that shouldn't exist:

- **Next.js**: this application is built on **TanStack Start**, which produces exactly the same
  deployable artifact class as Next.js standalone output — a plain Node.js SSR server
  (`.output/server/index.mjs`). Swapping to Next.js would be a ground-up rewrite of ~90 routes
  with no deployment benefit; everything in this guide (PM2, Nginx, env-driven config) applies
  identically. See MIGRATION_LOG "On the fixed tech-stack note".
- **Redis**: not required by this architecture and deliberately not installed. Data access is
  PostgreSQL via the NestJS API; auth is stateless JWT (access token + httpOnly refresh cookie),
  so there is no server-side session state for Redis to hold. If you later add server-side caching
  or queues, PM2 + this Nginx config need no changes — add a `REDIS_URL` env var and a client at
  that point.

## 1. Prerequisites

- Linux (Ubuntu 22.04+/Debian 12+/RHEL 9) or Windows Server 2019+
- Node.js **22 LTS** — https://nodejs.org (Linux: use nodesource or `nvm`)
- Bun **1.3+** (build machine only; the production server needs only Node)
- PM2: `npm i -g pm2`
- Nginx 1.24+ (Linux; on Windows use IIS ARR or nginx-for-windows with the same proxy rules)
- **PostgreSQL 16** — a self-managed instance (local, RDS, Cloud SQL, etc.); the app owns the
  database, there is no external BaaS dependency.

## 2. Database setup (once)

```sh
# Create the database + a role, then build the schema from the extracted migrations.
createdb greenwood
DATABASE_URL="postgresql://erp:erp@localhost:5432/greenwood?schema=public" \
  api/db/apply-migrations.sh        # applies the schema (tables, functions, indexes)
```

`api/db/apply-migrations.sh` is the source of truth for the schema (built from
`supabase/migrations/`, retained only as that schema-of-record). Seed/demo data: see the runbook
in `BACKEND_MIGRATION_LOG.md`.

## 3. Build (on the build machine or CI)

```sh
# Web SSR app:
bun install --frozen-lockfile
bun run build                     # → .output/  (self-contained; no node_modules at runtime)
                                  # VITE_API_URL defaults to /api (same-origin via Nginx)

# NestJS API:
cd api
npm ci
npx prisma generate
npm run build                     # → api/dist/
```

Deploy artifact = the `.output/` directory + the `api/` directory (with its `dist/` and
`node_modules/`, since Prisma's client is generated there) + `ecosystem.config.cjs`. Copy them to
the server, e.g. `/var/www/greenwood-erp/`.

## 4. Run under PM2

```sh
cd /var/www/greenwood-erp
export $(grep -v '^#' .env | xargs)          # web env (optional)
export $(grep -v '^#' api/.env | xargs)      # API env: DATABASE_URL, JWT_SECRET, WEB_ORIGIN
pm2 start ecosystem.config.cjs               # starts both greenwood-erp and greenwood-api
pm2 save                                      # persist process list
pm2 startup                                   # generate boot service (systemd) — run the printed command
```

- Both apps use cluster mode; `pm2 reload greenwood-erp greenwood-api` gives zero-downtime deploys.
- Logs: `pm2 logs greenwood-erp` / `pm2 logs greenwood-api` (files under `logs/`).
- **Windows**: PM2 works the same (`pm2 start ecosystem.config.cjs`); for boot persistence use
  `pm2-installer` or `pm2-windows-service` instead of `pm2 startup`.

Verify: `curl http://127.0.0.1:3001/api/health` → `{"status":"ok",...}` (the NestJS API) and
`curl -I http://127.0.0.1:3000/` → `200/307` (the web app).

## 5. Nginx

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/greenwood-erp
# edit: server_name, cert paths, and the /var/www/greenwood-erp asset alias
sudo ln -s /etc/nginx/sites-available/greenwood-erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

TLS: `sudo certbot certonly --webroot -w /var/www/certbot -d erp.example.com`.

What the config provides: HTTP→HTTPS redirect, TLS 1.2/1.3, HTTP/2, HSTS + security headers,
gzip, immutable caching of hashed `/assets/*` straight from disk (bypasses Node), `/api/*` proxied
to the NestJS API (rate limited), `/_serverFn/` RPCs to the web app (rate limited), unlogged
`/api/health` for external monitors.

## 6. Updating a deployment

**The Prisma client MUST be regenerated on every code update.** `schema.prisma` and the generated
client (`node_modules/@prisma/client`) are two separate things: pulling new code that adds a Prisma
model does *not* update the client. If you skip `prisma generate`, the API crashes at runtime with
`TypeError: Cannot read properties of undefined (reading 'findMany')` because `this.prisma.<newModel>`
is `undefined`. `npm ci`/`npm install` now runs `prisma generate` automatically via a `postinstall`
hook, so a clean install is enough — but never restart the API on a stale client.

**If you deploy by pulling the repo directly on the server**, the one-liner that syncs everything
safely (installs deps, regenerates the client, rebuilds — never touches the database) is:

```sh
cd /var/www/greenwood-erp/api && ./scripts/refresh.sh && pm2 reload greenwood-api
```

**If you build on a separate machine and rsync artifacts:**

```sh
# Web:
bun install --frozen-lockfile && bun run build      # on build machine
rsync -a --delete .output/ server:/var/www/greenwood-erp/.output/

# API:
cd api && npm ci && npx prisma generate && npm run build   # npm ci also regenerates via postinstall
rsync -a --delete dist/ node_modules/ server:/var/www/greenwood-erp/api/

ssh server 'cd /var/www/greenwood-erp && pm2 reload greenwood-erp greenwood-api'
```

Schema changes that add **tables/columns**: also apply the new migration SQL to Postgres before the
reload — run the new file(s) from `supabase/migrations/` with `psql -f` against the production
`DATABASE_URL`. Do **not** re-run `api/db/apply-migrations.sh` against a live database — it rebuilds
from scratch and reseeds demo data; it is for first-time setup only.

## 9. Troubleshooting

**API 500s with `Cannot read properties of undefined (reading 'findMany')` (or `create`/`update`),
dashboards show "Couldn't load the dashboard", and forms show "Database error".**
The generated Prisma client is older than `schema.prisma` on this host — new models were added but
the client was never regenerated after the code was pulled/deployed. Fix:

```sh
cd /var/www/greenwood-erp/api
./scripts/refresh.sh        # npm ci (postinstall generate) + prisma generate + build
pm2 reload greenwood-api
```

If some endpoints still fail with a *database* error (e.g. `relation "..." does not exist`) after
that, the release also added tables the running database is missing — apply the new
`supabase/migrations/*.sql` file(s) with `psql -f` against the production `DATABASE_URL`, then reload
again.

## 7. Security checklist

- [x] TLS-only (Nginx redirects HTTP; HSTS 2 years)
- [x] Security headers set by both the app (`src/server.ts`) and Nginx
- [x] Edge rate limiting on `/api/*` and `/_serverFn/` (20 r/s + burst 40 per IP)
- [x] Secrets only in `.env` / `api/.env` on the server (gitignored); no service-role/BaaS key
      exists any more — the frontend has no DB client and the API holds the only DB credentials
- [x] Authorization enforced server-side in the API (RLS policies reproduced as NestJS guards +
      service-layer scoping) — a forged client request cannot read/write outside its role
- [ ] Change the seeded demo-account passwords (or delete the demo accounts) before real use
- [ ] Restrict Postgres network access to the API server + admin IPs

## 8. Monitoring

- `GET /api/health` — API liveness (also used by external uptime checks)
- `pm2 monit` / `pm2 status` — process CPU/memory for both apps
- Nginx `access.log`/`error.log` — edge traffic; app logs via `pm2 logs greenwood-erp|greenwood-api`
