# Deployment Guide — Standard Node.js (no Docker)

Production stack: **Node.js 22 + PM2 + Nginx + PostgreSQL (Supabase)** on a standard Linux or
Windows server. No containers are used anywhere in this setup.

## Architecture

```
Browser ── HTTPS ──> Nginx (TLS, gzip, static assets, rate limiting, security headers)
                        │
                        ├── /assets/*      served from disk (immutable, hashed filenames)
                        └── everything else ──> PM2 cluster ──> Node SSR server (.output/)
                                                                    │
                                                                    └──> PostgreSQL + Auth + Storage
                                                                         (Supabase — cloud or self-hosted)
```

Two honest notes on the requested stack, so nobody hunts for files that shouldn't exist:

- **Next.js**: this application is built on **TanStack Start**, which produces exactly the same
  deployable artifact class as Next.js standalone output — a plain Node.js SSR server
  (`.output/server/index.mjs`). Swapping to Next.js would be a ground-up rewrite of ~90 routes
  with no deployment benefit; everything in this guide (PM2, Nginx, env-driven config) applies
  identically. See MIGRATION_LOG "On the fixed tech-stack note".
- **Redis**: not required by this architecture and deliberately not installed. Data access,
  auth-session storage, and realtime are handled by PostgreSQL/Supabase; the app keeps no
  server-side session state (JWT bearer auth), so there is nothing for Redis to hold. If you
  later add server-side caching or queues, PM2 + this Nginx config need no changes — add a
  `REDIS_URL` env var and a client at that point.

## 1. Prerequisites

- Linux (Ubuntu 22.04+/Debian 12+/RHEL 9) or Windows Server 2019+
- Node.js **22 LTS** — https://nodejs.org (Linux: use nodesource or `nvm`)
- Bun **1.3+** (build machine only; the production server needs only Node)
- PM2: `npm i -g pm2`
- Nginx 1.24+ (Linux; on Windows use IIS ARR or nginx-for-windows with the same proxy rules)
- A PostgreSQL backend via Supabase — either a Supabase Cloud project (recommended) or
  self-hosted Supabase (`supabase start` on the server, or the Supabase self-hosting guide).

## 2. Database setup (once)

```sh
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push                  # applies supabase/migrations/ (schema, RLS, functions)
```

Seed/demo data and moving off an old project: see the runbook in MIGRATION_LOG.md Phase 4.

## 3. Build (on the build machine or CI)

```sh
bun install --frozen-lockfile
cp .env.example .env              # fill in Supabase values (VITE_* are inlined at build time)
bun run build                     # → .output/  (self-contained; no node_modules needed at runtime)
```

Deploy artifact = the `.output/` directory + `ecosystem.config.cjs`. Copy them to the server,
e.g. `/var/www/greenwood-erp/`.

## 4. Run under PM2

```sh
cd /var/www/greenwood-erp
export $(grep -v '^#' .env | xargs)      # or set env in ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 save                                  # persist process list
pm2 startup                               # generate boot service (systemd) — run the printed command
```

- Cluster mode uses every CPU core; `pm2 reload greenwood-erp` gives zero-downtime deploys.
- Logs: `pm2 logs greenwood-erp` (files under `logs/`).
- **Windows**: PM2 works the same (`pm2 start ecosystem.config.cjs`); for boot persistence use
  `pm2-installer` or `pm2-windows-service` instead of `pm2 startup`.

Verify: `curl http://127.0.0.1:3000/api/health` → `{"status":"ok",...}`.

## 5. Nginx

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/greenwood-erp
# edit: server_name, cert paths, and the /var/www/greenwood-erp asset alias
sudo ln -s /etc/nginx/sites-available/greenwood-erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

TLS: `sudo certbot certonly --webroot -w /var/www/certbot -d erp.example.com`.

What the config provides: HTTP→HTTPS redirect, TLS 1.2/1.3, HTTP/2, HSTS + security headers,
gzip, immutable caching of hashed `/assets/*` straight from disk (bypasses Node), rate limiting
on `/_serverFn/` RPCs, unlogged `/api/health` for external monitors.

## 6. Updating a deployment

```sh
bun install --frozen-lockfile && bun run build      # on build machine
rsync -a --delete .output/ server:/var/www/greenwood-erp/.output/
ssh server 'cd /var/www/greenwood-erp && pm2 reload greenwood-erp'
```

Database changes ship as new files in `supabase/migrations/` → `supabase db push` before the
app reload.

## 7. Security checklist

- [x] TLS-only (Nginx redirects HTTP; HSTS 2 years)
- [x] Security headers set by both the app (`src/server.ts`) and Nginx
- [x] RPC rate limiting at the edge (`/_serverFn/`, 20 r/s + burst 40 per IP)
- [x] Secrets only in `.env` on the server (gitignored); service-role key never reaches the
      client bundle (`client.server.ts` is server-only, enforced by import protection)
- [x] Row-Level Security on every table (see `supabase/migrations/`) — API access is scoped per
      role even if the app layer is bypassed
- [ ] Change the seeded demo-account passwords (or delete the demo accounts) before real use
- [ ] Restrict Postgres/Supabase network access to the app server + admin IPs

## 8. Monitoring

- `GET /api/health` — liveness (also used by PM2 max-memory restarts and external uptime checks)
- `pm2 monit` / `pm2 status` — process CPU/memory
- Nginx `access.log`/`error.log` — edge traffic; app logs via `pm2 logs`
