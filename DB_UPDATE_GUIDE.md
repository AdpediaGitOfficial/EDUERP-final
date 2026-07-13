# Updating the live database after a deploy

This project's **SQL migrations in `supabase/migrations/` are the source of truth
for the schema.** Prisma is used only to generate the client — **never** run
`prisma migrate` or `prisma db push` against any database: the models are
relation-light on purpose, and `db push` would try to DROP foreign keys and
indexes. All schema changes ship as additive SQL migrations.

The recent module migrations (`20260711240000_*` onward: SIS, HR org/salary/
loans/appraisals, subjects, classrooms, timetable, electives, promotions,
academic calendar, payroll breakdown, **fees collection**, …) are all
**additive and idempotent** — `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
EXISTS`, `CREATE OR REPLACE FUNCTION`. They add tables/columns/functions and
**never touch your data**. Applying them (even twice) is safe.

## About the "5,201 students"

Those are **demo/seed rows**, not created by migrations. Applying schema updates
will **not** add, remove, or change them. If you want a clean production start
(no demo data), see the optional last section — it's a separate, deliberate step.

---

## 1. Back up first (always)

```bash
pg_dump "$PROD_DATABASE_URL" -Fc -f backup_$(date +%F_%H%M).dump
```
On Supabase you can also take a manual backup / PITR snapshot from the dashboard.

## 2. Point at the database (direct connection)

Use the **direct / session-mode** connection string (Supabase: Project Settings →
Database → Connection string → *Session*, port **5432**). Do **not** use the
transaction pooler (port 6543) — it can't run DDL.

```bash
export DATABASE_URL="postgresql://postgres:PASSWORD@db.rbsrbrwkvqfmqaqunows.supabase.co:5432/postgres"
```

## 3. Apply the schema updates (one command)

```bash
git pull                      # get the latest supabase/migrations/*.sql
DATABASE_URL="$DATABASE_URL" api/db/apply-updates.sh
```

`apply-updates.sh` (production-safe — no demo data):
1. reports any missing tables (`check-schema.sql`),
2. applies every migration `>= 20260711240000` in order (additive, idempotent),
3. runs `reconcile-columns.sql` — a belt-and-braces `ADD COLUMN IF NOT EXISTS`
   for every column the app expects (clears the "Database error" / Prisma P2022),
4. re-checks for missing tables — should print **0 rows**.

Preview without changing anything: `DRY_RUN=1 DATABASE_URL="$DATABASE_URL" api/db/apply-updates.sh`

If step 4 still lists a missing table, that migration is older than the default
cutoff — apply it explicitly, then re-run:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<that-file>.sql
# or lower the cutoff to catch everything since your last deploy:
SINCE=20260701000000 DATABASE_URL="$DATABASE_URL" api/db/apply-updates.sh
```

> ⚠️ **Do NOT run `api/db/apply-migrations.sh` on production.** That script
> rebuilds the schema from scratch **and loads all the demo data** (5k students,
> etc.). It is for local/dev only. Use `apply-updates.sh` for a live server.

## 4. Regenerate the Prisma client & redeploy the API

The Prisma client is generated into `api/node_modules`, so it must be rebuilt on
the deploy host after any schema change:

```bash
cd api
npm ci                # if dependencies changed
npx prisma generate   # regenerate client from schema.prisma (build does this too)
npm run build         # compiles to dist/ (prebuild runs prisma generate)
pm2 restart all       # or: systemctl restart your-api  (restart the Node process)
```

## 5. Rebuild & redeploy the frontend

```bash
cd ..
npm ci
npm run build         # regenerates routeTree.gen.ts + .output/
# deploy .output/ (and restart the SSR server / PM2 process that serves it)
```

## 6. Verify

- `psql "$DATABASE_URL" -f api/db/check-schema.sql` → **0 rows** (no missing tables).
- Log in as an admin and open the newly-shipped screens:
  **Finance → Collection** (+ Due Fees), **HR → Payroll**, **Academics** timetable,
  and confirm **Add Vehicle / New Department / New Job Opening** save without a
  "Database error".

That's the whole update. Schema is additive; existing data (students, fees,
payments, staff) is untouched.

---

## (Optional) Start production with a clean, demo-free dataset

Only if this server should go live **without** the demo students. This **deletes
data** — take a backup first and be sure.

Demo accounts are identifiable by email; deleting a profile cascades to its
student/parent rows and their fees/payments.

```sql
-- DRY RUN: see what would be removed
SELECT count(*) FROM profiles WHERE email LIKE '%@demo.local' OR email LIKE '%@example.com';

-- Remove demo students + parents (cascades to fees/payments/links). Review first!
BEGIN;
DELETE FROM profiles
 WHERE email LIKE '%@demo.local'
    OR email LIKE '%@example.com'
    OR email LIKE '%@parent.greenwood.test';
COMMIT;
```

Keep the real staff/admin logins you use to sign in. After cleanup, re-run
`api/db/check-schema.sql` (schema is unaffected) and reload the app — the
Students list will reflect the trimmed dataset. Adjust the email patterns to
match how your demo data was seeded before running this.
