# BACKEND_MIGRATION_LOG — Supabase → NestJS

Branch: `nestjs-backend-migration`. Module-by-module migration per the discipline in the brief:
nothing is marked migrated until it is tested against a real database, and the frontend's data
layer for a module is only cut over after its API is verified.

**Honest status up front:** this branch delivers Phases 1–4 fully (extraction, skeleton, auth,
RLS→guard framework) plus the first **seven** Phase 5 modules (users, students, staff/teachers,
classes/academics, attendance, homework/gradebook, fees/payments), all verified by **39 passing
end-to-end tests** against the real schema and seed data. The remaining 8 modules (HR, Finance,
Library, Fleet, Assets, Complaints, Communication, Reports/Analytics) and the frontend cutover
are **NOT migrated yet** — the frontend still runs entirely on `@supabase/supabase-js`,
intentionally, so nothing regresses while API modules land one by one.

## Section 1 — Extracted from Supabase (build checklist)

Source: the repo's 39 migration files (`supabase/migrations/`) — the exact DDL that built the
production schema — plus frontend greps and `supabase/config.toml`. The live project itself is
unreachable from this environment (network policy blocks `*.supabase.co`), which is why the
extraction below is migration-file-based and why a small alignment layer (see "Local rebuild")
was needed for rows that prod acquired outside migrations.

| Item            | Extracted                                              | Notes                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema          | **76 tables**, all in `public`                         | Applied locally 1:1; Prisma introspection produced 78 models (76 public + `auth.users`/`auth.identities`) — `api/prisma/schema.prisma`                                                                                                                                                                                                                           |
| RLS policies    | **189 CREATE POLICY statements → 170 active policies** | Full export: `api/db/rls-policies-extracted.csv` (table, cmd, USING, WITH CHECK). This file is the source of truth for every guard/scoping translation                                                                                                                                                                                                           |
| DB functions    | 15 app functions                                       | `has_role`, `is_parent_of_student`, `is_teacher_of_class`, `is_teacher_of_student`, `get_user_primary_role`, `can_read_staff_directory`, `handle_new_user` (signup trigger), `update_updated_at_column`, `update_fee_on_payment`, `next_admission_no`, `promote_students`, `search_students`, `find_duplicate_students`, `get_class_stats`, `fleet_renewals_due` |
| Triggers        | 37                                                     | Mostly `updated_at` maintenance + `on_auth_user_created` → `handle_new_user` + fee-status recompute on payment                                                                                                                                                                                                                                                   |
| Auth providers  | **Email/password only**                                | No magic link, OAuth, or phone config anywhere; password reset via email flow in `auth.tsx`                                                                                                                                                                                                                                                                      |
| Edge Functions  | **None**                                               | No `supabase/functions/` directory                                                                                                                                                                                                                                                                                                                               |
| Storage buckets | **None**                                               | Zero `storage.buckets` references in migrations, zero `.storage.` calls in the frontend (the `fleet-docs` bucket from an old plan was never built)                                                                                                                                                                                                               |
| Realtime        | **None**                                               | Zero `supabase.channel()` / `postgres_changes` usage in the frontend                                                                                                                                                                                                                                                                                             |

Phase 6 (Storage) and Phase 7 (Realtime) are therefore **N/A — nothing to migrate**, verified
by extraction rather than assumed.

## Local rebuild of the production schema (the test bed)

`api/db/apply-migrations.sh` builds a plain PostgreSQL 16 database from the extracted
migrations. Two support files were required:

- `00-supabase-shim.sql` — recreates the minimal Supabase surface the migrations reference:
  `auth.users` / `auth.identities` tables (including `encrypted_password`), `auth.uid()/email()/
jwt()/role()` helpers (PostgREST-claim-compatible), and the `anon/authenticated/service_role`
  roles. pgcrypto for `crypt()/gen_salt('bf')`.
- `01-preexisting-rows.sql` + `02-demo-identity-alignment.sql` — prod contains rows created by
  Lovable's direct-insert seeds **outside** migrations, which later migrations reference by
  hardcoded UUID. These scripts re-key the locally seeded equivalents to the production UUIDs
  (3 classes, 3 subjects, 7 subject-teacher accounts, the three demo accounts, and the demo
  student row) so the entire chain applies and the identity-chain fix migration lands intact.

Result: all 39 migrations apply cleanly. Local data: **5,212 students** (prod reports 5,251 —
the ~39-row delta is prod data inserted outside migrations), **100 classes**, 221 staff,
222,716 attendance rows, 4 demo accounts with correct roles and the production identity chain
(teacher **Anjali Nair** → 7 classes; parent **Priya Singh** → 1 child; student **Anika Singh**
→ own record in Grade 8 A).

Known local gap: hr/accountant/reception/fleet_manager demo accounts don't exist locally (prod
seeded them outside migrations); the local role census is admin/teacher/student/parent. Their
modules migrate later in the order anyway; capture those accounts with `pg_dump` when migrating
production data.

## Phase 2 — NestJS skeleton (`api/`)

- NestJS 11 + **Prisma 6** pointed at the extracted schema — introspected (`prisma db pull`),
  **not** recreated from a spec. `multiSchema` covers `public` + `auth`.
- Layout: `src/modules/{auth,users,students}` live now; `src/common/{guards,decorators}`,
  `src/infra/database`. Remaining modules are listed in `app.module.ts` in dependency order and
  land one at a time.
- `GET /api/health` (DB-probing). Server on :3001 so it can run beside the SSR frontend (:3000).

## Phase 3 — Auth (the critical checkpoint) — **DONE, verified**

- **Password migration outcome: hashes are directly portable.** Supabase stores bcrypt (`$2a$`)
  in `auth.users.encrypted_password`; `bcryptjs.compare()` verifies them unchanged. All four
  demo accounts log in with `Greenwood@2026` through the new API. **No password-reset flow is
  needed.**
- JWT access token (15 min, carries `sub`/`email`/`roles`) + refresh token (7 d) in an
  `httpOnly` cookie scoped to `/api/auth`, rotation on refresh. Endpoints: `POST /api/auth/
{login,register,refresh,logout}`, `GET /api/auth/me`.
- `handle_new_user` trigger ported into the registration service verbatim: profile row created
  atomically with the auth row; first-ever user becomes admin; every later signup defaults to
  `student`; client-supplied roles ignored (anti-privilege-escalation, same as the trigger).
  Idempotent against the still-installed DB trigger so Supabase and the API can coexist during
  the module-by-module window.

## Phase 4 — RLS → guards + service scoping — framework done, applied to 2 modules

- Role-level policies (`has_role(auth.uid(), 'x')`) → `@Roles('x')` + `RolesGuard`.
- Row-level policies → **service-layer scope filters** (a `WhereInput` per role), kept next to
  the query and annotated with the exact policy names they translate.
- RLS "invisible row" semantics preserved: out-of-scope single-row fetches return **404**, roles
  with no policy get **zero rows** (list) — not another user's data, and not a misleading 200.

Non-1:1 translations so far (and how they were resolved):

| RLS construct                                                | Translation                                                                                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `students_*` (4 policies)                                    | One `scopeFilter(actor)` returning admin=all / teacher=classes-via-`teacher_classes` / parent=children-via-`parent_student` / student=self / otherwise Ø |
| `profiles_teacher_read_students` + `_parents` (EXISTS joins) | `teacherCanSeeProfile()` — two Prisma `findFirst` existence probes, same join shape                                                                      |
| `user_roles` keyed on `auth.users` not `profiles`            | Roles fetched by `user_id IN (page ids)` in one query (no N+1)                                                                                           |

## Phase 5 — Module-by-module status

| #    | Module                                                                            | API                                  | Frontend cut over | Verified                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Users/Profiles                                                                    | **Migrated**                         | Not yet           | e2e: admin list, self-read, teacher→student/parent profile scope, student→foreign profile 403                                                                                                 |
| 2    | Students                                                                          | **Migrated** (read paths)            | Not yet           | e2e: admin 5212, teacher ≤7 classes subset, parent exactly 1 child, student self-only, foreign id → 404                                                                                       |
| 3    | Staff/Teachers                                                                    | **Migrated** (read paths)            | Not yet           | e2e: admin full directory (221 staff, 24+ teachers); teacher self-row only (by-email match, exactly as `teachers_self_read`); student zero teachers; class assignments own-or-admin           |
| 4    | Classes/Academics                                                                 | **Migrated** (read paths)            | Not yet           | e2e: all 4 roles read 100 sections (`*_read_auth: true`); class detail resolves subjects + student count; timetable filters by teacher                                                        |
| 5    | Attendance                                                                        | **Migrated** (read + mark)           | Not yet           | e2e: student self-only, parent child-only, teacher class-subset < admin; teacher marks own class (upsert on student+date), foreign class 403, student 403                                     |
| 6    | Homework/Gradebook                                                                | **Migrated** (core paths)            | Not yet           | e2e: all roles read (`homework_read_auth`); teacher creates, student 403; exam results student self-only / teacher class scope; submissions read+grade scoped                                 |
| 7    | Fees/Payments                                                                     | **Migrated** (read + record-payment) | Not yet           | e2e: parent/student child-only invariant, admin school-wide totals; teacher payment write 403; admin payment insert fires `update_fee_on_payment` trigger (amount_paid recomputed — verified) |
| 8–15 | HR, Finance, Library, Fleet, Assets, Complaints, Communication, Reports/Analytics | **Not migrated**                     | Not yet           | —                                                                                                                                                                                             |

Write paths for Students (admit/promote/bulk ops — currently TanStack server functions calling
`search_students`/`promote_students`/`next_admission_no`) migrate together with the frontend
cutover for that module, so reads and writes flip at once per module.

**Frontend:** still 100% on `@supabase/supabase-js` by design. The per-module cutover
(replace `.from('x')` calls → API client, then grep that module's files for `supabase` = 0)
starts with Users/Students next session, against a reachable database, per the
never-two-modules-at-once rule.

## Phase 8 — Functions/triggers porting status

Ported now: `handle_new_user` (registration). Pending, tied to their modules:
`update_fee_on_payment` (Fees), `next_admission_no`/`promote_students`/`search_students`/
`find_duplicate_students` (Students writes), `get_class_stats` (Academics), `fleet_renewals_due`
(Fleet), `can_read_staff_directory` (Staff). `update_updated_at_column` stays a DB trigger
(harmless, keeps timestamps correct for both stacks during coexistence).

## Phase 9 — Regression verification (current state)

`api/test/e2e.test.ts` + `api/test/modules.test.ts` — **39/39 pass** against the real schema + seed data
(`npm test` in `api/`, ~2 s):

| Check                                                                                                                                         | Result                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Login all 4 demo accounts with migrated hashes                                                                                                | **PASS**                                                                                         |
| Identity-chain names resolve (Anjali Nair / Anika Singh / Priya Singh)                                                                        | **PASS**                                                                                         |
| Wrong password rejected; tokenless `/me` rejected; refresh rotation works                                                                     | **PASS**                                                                                         |
| Students scoping per extracted RLS (admin/teacher/parent/student/no-policy)                                                                   | **PASS**                                                                                         |
| Cross-tenant probe: student fetching another student's record → 404                                                                           | **PASS**                                                                                         |
| Modules 3–7 per-role scoping (staff directory, teacher self-read-by-email, attendance mark rights, homework write rights, fee/payment scopes) | **PASS** — 20 additional cases                                                                   |
| Write-path/trigger coexistence: payment insert recomputes fee status via the still-active DB trigger                                          | **PASS**                                                                                         |
| Parent→child guardian link intact through the new API                                                                                         | **PASS**                                                                                         |
| Users module scoping incl. teacher 403 on admin directory                                                                                     | **PASS**                                                                                         |
| N+1 check on migrated endpoints                                                                                                               | **PASS** — list endpoints are 2–3 fixed queries (count + page + roles batch); no per-row queries |
| Full-app regression (all dashboards, all roles, production data)                                                                              | **PENDING** — requires the remaining modules + frontend cutover; do not claim before then        |

## How to run

```sh
# 1. Database (PostgreSQL 16, pgcrypto)
createdb greenwood && api/db/apply-migrations.sh
# 2. API
cd api && cp .env.example .env   # set JWT_SECRET + DATABASE_URL
npm install && npx prisma generate
npm run start:dev                # http://localhost:3001/api/health
npm test                         # 19 e2e tests against the DB
```
