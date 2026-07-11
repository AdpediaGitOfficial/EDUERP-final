# Greenwood School ERP

A full-featured school management system: role-based portals (Admin, Teacher, Student, Parent,
HR, Accountant, Reception, Fleet Manager) covering students, classes, attendance, gradebook,
fees & payments, finance, HR & payroll, reception/admissions, fleet, assets, library, analytics,
communication, and complaints.

## Tech stack

- **Frontend/SSR**: React 19 + [TanStack Start](https://tanstack.com/start) (file-based TanStack
  Router, server functions), Vite 8, Nitro (Node server output)
- **UI**: Tailwind CSS v4 (CSS-first config in `src/styles.css`), shadcn/ui, lucide icons,
  Recharts
- **Data**: TanStack React Query 5, react-hook-form + zod
- **Backend**: self-hosted **NestJS + Prisma** API in `api/`, backed by PostgreSQL. Identity is
  JWT (access + refresh); the former Supabase RLS policies are reproduced as NestJS guards and
  service-layer scoping. The Supabase migration is complete — see `BACKEND_MIGRATION_LOG.md`.
  (`supabase/migrations/` is retained only as the schema-of-record the API's Prisma schema and
  `api/db/apply-migrations.sh` are built from.)

## Getting started

```sh
bun install
cp .env.example .env   # set VITE_API_URL (see api/.env.example for the API's own env)
bun run dev            # http://localhost:8080
```

### Backend setup

The API lives in `api/` (NestJS + Prisma). See `BACKEND_MIGRATION_LOG.md` for the full runbook.

1. Start PostgreSQL and build the schema: `api/db/apply-migrations.sh` (applies the extracted
   migrations to a fresh database).
2. Configure `api/.env` from `api/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, …),
   then `cd api && npm ci && npx prisma generate && npm run start`.
3. Point the web app at it via `VITE_API_URL` (default `/api`; use `http://localhost:3001/api`
   in development).

Demo accounts (seeded): `admin|teacher|student|parent@greenwood.test`, password `Greenwood@2026`.

## Scripts

| Command                              | Purpose                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `bun run dev`                        | Dev server with HMR on port 8080                                                    |
| `bun run build`                      | Production build → `.output/` (Node server, set `NITRO_PRESET` to retarget)         |
| `bun run start`                      | Run the production build (`PORT` env, default 3000)                                 |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript checks (build first — typecheck needs the generated route tree) |

## Deployment

Standard Node.js deployment — no containers required. See **[DEPLOYMENT.md](DEPLOYMENT.md)** for
the full Linux/Windows guide (Node 22 + PM2 + Nginx + PostgreSQL + the NestJS API).

- Quick version: `bun run build && node .output/server/index.mjs` (the build output in
  `.output/` is self-contained — copy it to the server, no `node_modules` needed).
- Process manager: `pm2 start ecosystem.config.cjs` (config in repo root).
- Reverse proxy: `deploy/nginx.conf` (TLS termination, gzip, static asset caching,
  security headers, `/api/health` for load-balancer checks).
- Managed platforms: build with `NITRO_PRESET=vercel|netlify|cloudflare-module`.

CI (`.github/workflows/ci.yml`) runs lint, build, and typecheck on every push/PR.

## Project conventions

- Design tokens are frozen in `DESIGN_SYSTEM.md` — treat it as the visual-parity contract.
- `src/routeTree.gen.ts` is generated; never edit it.
- The web app talks to the backend only through `src/lib/api/client.ts` (`apiGet`/`apiPost`/
  `apiFetch`); there is no direct database or Supabase client in the frontend.
- Migration history and verification status: `MIGRATION_LOG.md` and `BACKEND_MIGRATION_LOG.md`.
