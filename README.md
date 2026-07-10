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
- **Backend**: Supabase (Postgres + Auth + RLS + Storage). Schema and policies live in
  `supabase/migrations/`.

## Getting started

```sh
bun install
cp .env.example .env   # fill in your Supabase project values
bun run dev            # http://localhost:8080
```

### Backend setup

1. Create a Supabase project (or run one locally with `supabase start` — this repo contains
   `supabase/config.toml` and all migrations).
2. Apply migrations: `supabase db push` (or `supabase migration up` locally).
3. Copy the project URL and publishable key into `.env` (see `.env.example` for every variable).
   The service-role key is only needed by server functions (user administration, bulk imports).

Demo accounts (seeded): `admin|teacher|student|parent@greenwood.test`, password `Greenwood@2026`.

## Scripts

| Command                              | Purpose                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `bun run dev`                        | Dev server with HMR on port 8080                                                    |
| `bun run build`                      | Production build → `.output/` (Node server, set `NITRO_PRESET` to retarget)         |
| `bun run start`                      | Run the production build (`PORT` env, default 3000)                                 |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript checks (build first — typecheck needs the generated route tree) |
| `node scripts/verify-regression.mjs` | End-to-end regression checks against the live backend                               |

## Deployment

Standard Node.js deployment — no containers required. See **[DEPLOYMENT.md](DEPLOYMENT.md)** for
the full Linux/Windows guide (Node 22 + PM2 + Nginx + PostgreSQL via Supabase).

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
- `src/integrations/supabase/client.server.ts` (service role) must only be imported from
  server-side code.
- Migration history and verification status: `MIGRATION_LOG.md`.
