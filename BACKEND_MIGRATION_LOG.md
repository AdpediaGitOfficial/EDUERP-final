# BACKEND_MIGRATION_LOG — Supabase → NestJS

Branch: `nestjs-backend-migration`. Module-by-module migration per the discipline in the brief:
nothing is marked migrated until it is tested against a real database, and the frontend's data
layer for a module is only cut over after its API is verified.

**Honest status up front:** this branch delivers Phases 1–4 fully (extraction, skeleton, auth,
RLS→guard framework) plus **all fifteen Phase 5 modules API-side**, verified by **57 passing end-to-end tests**
against the real schema and seed data. What is NOT done: the per-module
**frontend data-layer cutover** (dashboards/lists still query `@supabase/supabase-js`), and the
deeper write paths listed per module below — both flip module by module using the dual-session
pattern now in place.

**Frontend auth cutover: DONE and UI-verified.** The app now authenticates against the NestJS
API using a dual-session (strangler) model — `src/lib/api/client.ts` holds the API session
(access token + auto-refresh + auth-change events) as the PRIMARY identity source
(`use-current-user.ts`, route guard, sign-out), while a best-effort legacy Supabase login keeps
not-yet-migrated modules working in production. Verified end-to-end in a real browser against
the local full stack (Postgres + NestJS + built frontend): all four demo roles log in through
the UI, land on /dashboard with the correct identity and role-scoped navigation, sign out, and
a wrong password is rejected — 13/13 UI checks pass (screenshots in
`docs/screenshots/nestjs-auth/`). Locally the unmigrated dashboard widgets show empty states
because Supabase is unreachable from this environment — expected; in production the legacy
session feeds them until each module's frontend flips.

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

| #   | Module                    | API                                                                             | Frontend cut over | Verified                                                                                                                                                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Users/Profiles            | **Migrated**                                                                    | Not yet           | e2e: admin list, self-read, teacher→student/parent profile scope, student→foreign profile 403                                                                                                                     |
| 2   | Students                  | **Migrated** (read paths)                                                       | Not yet           | e2e: admin 5212, teacher ≤7 classes subset, parent exactly 1 child, student self-only, foreign id → 404                                                                                                           |
| 3   | Staff/Teachers            | **Migrated** (read paths)                                                       | Not yet           | e2e: admin full directory (221 staff, 24+ teachers); teacher self-row only (by-email match, exactly as `teachers_self_read`); student zero teachers; class assignments own-or-admin                               |
| 4   | Classes/Academics         | **Migrated** (read paths)                                                       | Not yet           | e2e: all 4 roles read 100 sections (`*_read_auth: true`); class detail resolves subjects + student count; timetable filters by teacher                                                                            |
| 5   | Attendance                | **Migrated** (read + mark)                                                      | Not yet           | e2e: student self-only, parent child-only, teacher class-subset < admin; teacher marks own class (upsert on student+date), foreign class 403, student 403                                                         |
| 6   | Homework/Gradebook        | **Migrated** (core paths)                                                       | Not yet           | e2e: all roles read (`homework_read_auth`); teacher creates, student 403; exam results student self-only / teacher class scope; submissions read+grade scoped                                                     |
| 7   | Fees/Payments             | **Migrated** (read + record-payment)                                            | Not yet           | e2e: parent/student child-only invariant, admin school-wide totals; teacher payment write 403; admin payment insert fires `update_fee_on_payment` trigger (amount_paid recomputed — verified)                     |
| 8   | HR                        | **Migrated** (leave read/create/decide, balances, payroll runs, expense claims) | Not yet           | e2e: admin all, own-rows subset for staff, student payroll zero rows, student leave decision 403                                                                                                                  |
| 9   | Finance                   | **Migrated** (expenses read/create, running ledger)                             | Not yet           | e2e: accountant                                                                                                                                                                                                   | admin only; teacher/parent/student 403 on expenses AND ledger |
| 10  | Library                   | **Migrated** (catalog, loans, return)                                           | Not yet           | e2e: catalog readable by every role (`lb_read_all`); loans self/child scoped, teacher zero rows, return admin-only. Catalog empty in migration-only dataset (prod seeded out-of-band) — rule asserted, not counts |
| 11  | Fleet                     | **Migrated** (vehicles/drivers/routes/route-students reads)                     | Not yet           | e2e: fleet_manager                                                                                                                                                                                                | admin                                                         | reception read (admin verified; fleet/reception accounts exist only in prod), teacher/student 403, parent sees only child's routes |
| 12  | Assets                    | **Migrated** (registry, allocations)                                            | Not yet           | e2e: admin+teacher read (`a_read_staff`), parent/student 403, allocations admin-only                                                                                                                              |
| 13  | Complaints                | **Migrated** (list/create/status/messages)                                      | Not yet           | e2e: parent files + sees own, admin sees all, non-raiser teacher does NOT see it, status workflow admin-only                                                                                                      |
| 14  | Communication             | **Migrated** (announcements w/ audience scoping, broadcasts, holidays)          | Not yet           | e2e: teachers-only announcement invisible to student, student create 403, holidays readable by all                                                                                                                |
| 15  | Reports/Analytics + Audit | **Migrated** (admin dashboard aggregates, audit log)                            | Not yet           | e2e: aggregates match real data (5212 students, 100 classes, fee totals), non-admin 403                                                                                                                           |

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

`api/test/{e2e,modules,modules2}.test.ts` — **57/57 pass** against the real schema + seed data
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

## Frontend data-layer cutover — in progress (module by module)

Auth is fully on the API (previous section). Now flipping each page's data layer
from `@supabase/supabase-js` to the API client, verified in a real browser against
the local full stack (Postgres + NestJS + built frontend) before moving on.

Flipped and browser-verified so far (screenshots in `docs/screenshots/nestjs-modules/`):

| Page                 | Endpoint(s)                                                      | Browser check                                                                                                                            |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Announcements        | `GET/POST /announcements`                                        | admin posts a notice → renders; student sees the audience=all notice (API audience scoping), teachers-only stays hidden                  |
| Holidays             | `GET/POST /holidays`                                             | admin adds a holiday → renders; student reads it (`hol_read_auth`)                                                                       |
| Classes (admin)      | `GET /classes` (+ `/years`, `/teacher-options`), `POST /classes` | 100 sections render with real student counts (Grade 8A = 52), 30-day attendance %, class-teacher names, capacity bars — all from the API |
| My Children (parent) | parent-scoped `GET /students`, `POST /students/link-parent`      | Anika Singh + her class render from the parent-scoped endpoint                                                                           |

Ported additionally for the students list: `search_students` (rich filter/sort/
paginate returning total + rows, role-scoped), `find_duplicate_students`, a
`row-extras` batch endpoint (30-day attendance, fee status, exam performance,
guardian contact — scoped to visible ids), and CSV export/promote-preview now
paging the search endpoint. Bulk write actions (admit/promote/route/status) still
run through their TanStack server functions on the legacy Supabase session and
flip in a later pass; students.tsx itself has **0 direct supabase references**.

Supporting API work the classes/children pass: ported the `get_class_stats` DB function into
`AcademicsService.listClasses` (30-day attendance, present = present|late); added
class create + year/teacher-option helpers; added holiday create; added
`POST /students/link-parent` (ps_admin_all — the only write policy, so parent
self-link is rejected exactly as RLS did). module UI checks pass; API suite
now 75/75 (`cutover.test.ts` covers the new write/aggregate endpoints).

`grep -rn supabase` on the four flipped pages: **0 references** each.

Remaining Supabase-coupled pages (dashboards, students list, attendance, gradebook,
fees, HR/finance/fleet/assets/library/complaints/reception pages, reports) continue
on the legacy session and flip in subsequent passes, same discipline.

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

| Admin dashboard | `GET /reports/admin-dashboard` (one endpoint porting ~13 client aggregations) | KPIs (5,212 students, ₹17.9M dues, 207 teachers, net position, fee-collection rate), 6-month revenue/expense trend, fee-by-grade, enrollment, staff mix, 30-day attendance trend, payment-mode donut, defaulters, activity feed — all real; 21 chart surfaces render, no runtime errors |
| Teacher/Student/Parent dashboards + teacher self-attendance | `GET /reports/{teacher,student,parent}-dashboard`, `GET /attendance/my-teacher`, `POST /attendance/mark-self` | teacher: 7 classes + today's schedule; student: own attendance/tests; parent: linked child (Anika Singh, 100% attendance, 34/0 homework); teacher self-mark (once/day, 409 on repeat). **dashboard.tsx now 0 supabase refs** |
| Attendance marking (teacher) | `GET /attendance` (existing rows), `POST /attendance/mark` (bulk upsert on student_id+date) | Grade 8·A roster of 52 students loads from the API, status toggles, "Save attendance" bulk-upserts (POST returns `{ok,marked:52}`), success toast now renders. **attendance.tsx now 0 supabase refs** |
| Fees (admin + parent) | `GET /fees/structures`, `POST /fees/structures`, `POST /fees/assign`, `GET /fees/assignments`, `GET/POST /payments` | admin: fee structures + bulk class assignment + assignments/payments (fa_admin_all, pay_admin_all); parent: self-scoped child fees (fa_parent_read); parent self-pay honestly returns 403 (pay_admin_all is the only write policy). **fees.tsx now 0 supabase refs** |
| App-wide toast host (bug fix) | — | Found `<Toaster />` was never mounted anywhere, so every `toast.*` in the authenticated app was silently swallowed (pre-existing, unrelated to migration). Mounted a single `<Toaster />` in `__root.tsx`; toasts now render on every route. |
| Gradebook (admin/teacher) | `GET /exams`, `POST /exams`, `GET /exam-results`, `POST /exam-results` (bulk upsert) | Admin picks any class, teacher only their own; exam list + per-student marks table load from the API. Exams/results are **admin-write** per RLS (`exams_admin_all`, `results_admin_all`) — teachers are read-only and get a clean 403 on writes (verified). Admin created an exam and saved marks in-browser (POST → 201, "Saved N marks" toast). **gradebook.tsx now 0 supabase refs** |
| Assignments (student) | `GET /assignments`, `POST /assignments/submit` | Student sees own-class homework joined with their own submission (priority, attachment, teacher name, marks/remarks); self-submit upserts their submission row ("students insert/update own"). Today/Upcoming/Overdue/Completed + By-Subject render from the API. **assignments.tsx now 0 supabase refs** |
| HR dashboard | `GET /hr/dashboard` (one endpoint porting 6 client queries) | HR/admin only (`hr_admin_*`); headcount/active/teachers/on-leave, pending leave+payroll, disbursed, open positions, avg rating, 30-day teacher-attendance %, headcount-by-department bar+pie. **hr.index.tsx now 0 supabase refs** |
| HR leave | `GET /hr/leave-requests`, `GET /hr/leave-balances`, `PATCH /hr/leave-requests/:id/decision` | Requests + yearly balances by staff; HR/admin approve/reject (`hr_admin_lr`). Fixed a latent FK bug — `approver_id` references `staff.id`, not the profile id, so it now resolves the approver's staff record (null when none). **hr.leave.tsx now 0 supabase refs** |
| HR payroll | `GET /hr/payroll-runs` | Monthly payroll history with staff name/code/designation and paid/pending totals (`hr_admin_pr` + accountant read). **hr.payroll.tsx now 0 supabase refs** |
| HR expenses | `GET /hr/expense-claims`, `PATCH /hr/expense-claims/:id/decision` | Claims list + approve/reject (`ec_hr`: admin\|hr\|accountant). Same `approver_id -> staff.id` FK fix. Verified in-browser: admin approve → 200 + toast; teacher → 403. **hr.expenses.tsx now 0 supabase refs** |
| Finance dashboard | `GET /finance/dashboard?from=&to=` (one endpoint porting ~8 client queries) | accountant\|admin only (`acc_admin_exp`); period-bound revenue/refunds/payroll/expenses + today's collections; period-independent outstanding, 6-month trend, this-vs-last-term collection efficiency, fee-by-class bars, top-10 overdue. Period toggle re-queries server-side (no more shipping 5k+ payment rows to the client). **finance.index.tsx now 0 supabase refs** |
| Finance ledger | `GET /finance/ledger` | Combined income (successful payments) + expenses, sorted by date, with income/expense totals + net. Added a `status = successful` filter to match the page. **finance.ledger.tsx now 0 supabase refs** |
| Finance expenses | `GET /finance/expenses`, `POST /finance/expenses` | List + add expense (accountant\|admin). **finance.expenses.tsx now 0 supabase refs** |
| Finance reconciliation | `GET /finance/reconciliation/payments`, `GET/POST /finance/reconciliation`, `DELETE /finance/reconciliation/:paymentId` | Match payments to bank refs; reconcile is an idempotent upsert on the unique `payment_id`, undo deletes. Payments now key off real columns (`paid_at`/`receipt_no`, not the non-existent `payment_date`/`transaction_id` the old page referenced). Verified in-browser: reconcile → 201, undo → 200. **finance.reconciliation.tsx now 0 supabase refs** |

## Payments/Fees feature enhancement (offline + online + reconciliation)

Schema: added `payment_source` (`offline`\|`online`, default `offline`, checked) and
`proof_url` to `payments` (`supabase/migrations/20260711000000_*`). Online and offline
payments are the SAME entity in the SAME table, distinguished only by `payment_source`.

| Area | Endpoint(s) | Behaviour |
| --- | --- | --- |
| Offline record (staff) | `POST /payments` (admin\|accountant) | Methods Cash/UPI/Card/Bank/Cheque. Reference **mandatory for any non-cash method** (400 otherwise). Duplicate guard: same invoice+amount+reference within 5 min → 409, override with `force:true`. Optional `proofUrl` (data-URL screenshot/scan) + `notes`. Returns the full receipt payload so the UI shows the receipt immediately. |
| Parent online pay | `POST /payments/online` (parent\|student) | Scoped to the caller's own child's invoice (`fa_parent_read`); a foreign invoice 404s, admin is 403. Runs the **swappable** `PaymentGatewayService` (sandbox — no real PSP), then writes a `payment_source='online'` row via the shared writer. Successful → confirmation notification + instant receipt; failed → no row. |
| Fee-due notification | fired from `POST /fees/assign` | `NotificationsService` sends an in-app broadcast (via `broadcasts`/`broadcast_recipients`, the same inbox) + a **swappable** `EmailService` stub to the linked parents. Only real accounts (`auth.users`) receive it, so seed-only parent profiles can't roll back the broadcast. |
| Payments list | `GET /payments?source=` | Now returns `receiptNo`/`status`/`paymentSource`/`feeTitle`/`proofUrl`; accountant sees all. Admin worklist adds a **Pending reconciliation** quick-filter (unpaid invoices) + an **in-person UPI kiosk** (static school-UPI QR). |
| Consistency (re-verified) | — | Every path (offline cash/UPI/card/bank/cheque, online gateway) writes to `payments`; the `update_fee_on_payment` trigger recomputes invoice `amount_paid`/`status`; dashboards count `status='successful'` regardless of source. **Reconciled exactly**: DB this-month total = admin `collectedMonth` = finance `revenue` = ledger credits = ₹1,085,750.00 (7 online + 147 offline). Seed adds 6 online + 3 offline-UPI demo payments + a past parent receipt (`api/db/03-payment-demo-seed.sql`). API suite 89/89; 13 browser checks pass. |
| Library (admin) | `GET /library/books`, `POST /library/books`, `GET /library/loans`, `POST /library/loans` (issue), `POST /library/loans/:id/return`, `POST /library/loans/:id/fine` | Catalog + circulation + fines. Enriched loan rows (borrower name/class/subject/employee-code, fine fields). Issue decrements available copies and return restores one, both in a transaction; return records an optional pending fine; settle marks paid/waived. All writes admin-only (`lb_admin_all`/`ll_admin_all`) — teacher add-book → 403; double-return → clean 400. Verified in-browser: add book (201 + toast), issue→return→settle round-trip. **library.tsx now 0 supabase refs** |
| Complaints (admin/teacher/parent) | `GET /complaints`, `POST /complaints`, `PATCH /complaints/:id/status`, `GET/POST /complaints/:id/messages`, `POST /complaints/:id/escalate` | Threaded complaints with reply (sender name resolved via profiles), escalate, and status workflow. Fixed a latent constraint mismatch — the old page's `in_progress`/`closed` violate `complaints_status_check` (allows `open`\|`in_review`\|`resolved`); both DTO and dropdown now match the DB (invalid status → 400). Verified in-browser: raise (201) + reply (201). **complaints.tsx now 0 supabase refs** |
