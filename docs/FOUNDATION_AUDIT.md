# Enterprise Refactor — Foundation Audit & Roadmap

Audit of the whole application (web `src/`, API `api/src/`, Prisma schema) run as
the first step of the "Foundation First" enterprise refactor. It records the
_actual_ state of the codebase and the prioritized plan to bring it to an
enterprise-grade bar (PowerSchool / Fedena / ERPNext-Education class).

## TL;DR — the app is already clean and data-bound

Contrary to a typical "remove massive tech debt" brief, the audit found the
codebase in good health:

- **Real data, not mocks.** Every page uses `useQuery` + `apiGet`; every chart
  binds to API data with `?? []` fallbacks. No fake statistics, mock arrays,
  placeholder charts, or "coming soon / lorem / TODO" UI strings anywhere.
- **No broken routing.** Every nav `to:` resolves to a real route; no
  commented-out logic blocks; no `TODO/FIXME/HACK/XXX` markers.
- **Consistent shell.** `AppShell` + `PageHeader` are used app-wide; sub-modules
  (HR, Finance, Fleet, Assets, Reception, ESS) share one tabbed layout route.
- **Clean backend wiring.** All 27 API modules are registered/used; PDF, email,
  and payment-gateway services are all referenced.

So "Foundation Cleanup" is genuinely small. The real foundation work is
**standardization** and **building the missing enterprise components**, then the
**HR/Teacher rebuild** — captured as the phased plan below.

## Findings

### Removed in cleanup pass #1 (done)

- Dead exported utilities: `nextStageLabel` (`src/lib/admission-stages.ts`),
  `nextAssetCode` (`src/lib/assets-util.ts`), `firstOfMonth`
  (`src/lib/module-util.ts`) — zero references.
- Orphaned but fully-functional admin page `staff-monitoring.tsx` (calls
  `GET /access/monitoring`) was unreachable — **wired into the admin nav**
  ("Staff Monitoring") rather than deleted.

### Kept deliberately (not debt)

- The 24 unused `src/components/ui/*` shadcn primitives include `drawer`,
  `table`, `dropdown-menu`, `pagination`, `command`, `calendar`,
  `context-menu` — the exact building blocks for the enterprise components we're
  about to build (DataTable, Drawer, CommandPalette, DatePicker). They are not
  imported (so not bundled). **Keep** — deleting then re-adding is churn.
- `children.*` routes are intentional `/children → /students` redirect stubs for
  old bookmarks.
- Login "Demo accounts" panel (`auth.tsx`) and the simulated-payment / UPI stub
  (`fees.tsx`) are deliberate demo affordances / a swappable-gateway placeholder,
  not fake data. Gate behind an env flag when going multi-tenant/production.

### Standardization gaps (the real Phase-1 work)

| Gap                            | Evidence                                                                                                                                                    | Lever                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| No shared **DataTable**        | ~60 route files hand-roll `<table>`                                                                                                                         | Highest                    |
| **StatusBadge** under-adopted  | shared component exists; 29 files still use inline `bg-*-100` badges                                                                                        | High (mechanical)          |
| **QueryError**/skeleton states | used in only ~4 files                                                                                                                                       | Med                        |
| Missing components             | Drawer detail-panel, Filters bar, DatePicker, BulkActionBar, ExportDialog, CommandPalette, PermissionBadge, ImportWizard, shared Timeline / AuditLog viewer | High                       |
| Decorative topbar **search**   | no `value`/`onChange` — false affordance                                                                                                                    | Med → build CommandPalette |
| Monolith pages                 | `students.index` (1838), `fees` (1612), `dashboard` (1603) lines                                                                                            | Med (decompose)            |

### Backend architecture tidy-ups (verify RBAC intent before merging)

- `payments.tsx` route is a subset of `fees.tsx` (both fetch `/payments`).
- `reception.admissions` overlaps the `admissions` module; `reception` transport
  routes overlap the `fleet` module (same tables).
- `teachers` resource is split across `staff.controller` (reads) and
  `teacher-profile.controller` (writes); `staff` reads exist in both
  `staff.controller` and `hr.controller`.
- Prisma: `identities` (auth-schema, unused by app code); `profiles` vs
  `student_details` duplicate name/contact columns; a handful of single-reference
  models to confirm are wired (`asset_amc`, `driver_incidents`, `resignations`,
  `overtime_requests`, `travel_requests`, `vehicle_documents`,
  `vehicle_maintenance`, `admission_stage_history`).

## Phased execution plan (one bounded, committed phase per session)

Following the requested priority order, adapted to the findings:

1. **Design system foundation** — build the shared enterprise components on the
   already-installed primitives: `DataTable` (server pagination + sort + column
   select + row select), `Drawer` detail panel, `FiltersBar`, `DatePicker`,
   `BulkActionBar`, `ExportDialog` (wrap `downloadCsv`), `CommandPalette` /
   global search (replaces the decorative topbar search), `PermissionBadge`,
   `Timeline`/`ActivityFeed`, `AuditLog` viewer, `ImportWizard`.
2. **Standardize adoption** — migrate lists to `DataTable`; replace the 29
   inline-badge sites with `StatusBadge`; apply `QueryError`/skeletons uniformly;
   decompose the three monolith pages.
3. **Database architecture** — master tables (Sessions, Departments,
   Designations, Fee Heads, Leave Types, Exam Types, Grading Schemes, etc.),
   soft deletes + audit tables + version history, resolve the duplicate-column /
   unused-model items above, confirm FKs + indexes.
4. **RBAC** — expand the role set and enforce per-action permissions
   (view/create/edit/delete/approve/export/import/print/bulk) with a shared
   permission layer + `PermissionBadge`.
5. **HR / Teacher rebuild (flagged highest feature priority)** — full employee
   lifecycle (org setup → profile → attendance/leave/payroll/performance →
   exit), teacher-specific workflows, staff directory, on the new components.
6. **Academic chain, Attendance, Timetable, Exams, Fees** — interconnect through
   the master data.
7. **Audit & logging, Performance, Final validation** — activity timeline + audit
   log per module; lazy-load/caching/virtualized tables; end-to-end validation.

Each phase keeps the suite green (currently **265 API tests**) and is committed
and browser-verified before moving on.
