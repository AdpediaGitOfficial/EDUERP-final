#!/usr/bin/env bash
# Remove seeded DEMO students + parents for a clean go-live.
#
# DRY-RUN BY DEFAULT: prints exactly what would be deleted and rolls back.
# Add --commit only after you've reviewed the counts and taken a backup.
#
# What it deletes: every profile+login whose email matches the demo pattern
# (default '%@demo.local' — the seed domain, i.e. seed.student.* / seed.parent.*),
# and everything that cascades from it (their student rows, fee assignments,
# payments, attendance, medical/hostel/etc., and parent links).
#
# What it KEEPS: your real staff/admin logins, the demo @greenwood.test logins
# you sign in with, and any real students you admitted (real-email profiles).
#
# Usage:
#   # 1) BACK UP FIRST
#   pg_dump "$DATABASE_URL" -Fc -f backup_$(date +%F_%H%M).dump
#   # 2) Preview (no changes):
#   DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB" api/db/cleanup-demo-data.sh
#   # 3) Apply, once the counts look right:
#   DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB" api/db/cleanup-demo-data.sh --commit
#
# Widen the match if your demo parents use other domains, e.g.:
#   DEMO_LIKE='%@demo.local' DEMO_LIKE2='%@example.com' ... --commit
set -euo pipefail
cd "$(dirname "$0")/../.."

DEMO_LIKE="${DEMO_LIKE:-%@demo.local}"
DEMO_LIKE2="${DEMO_LIKE2:-%@demo.local}"   # second optional pattern (defaults to same = no-op)
FINAL="ROLLBACK"
[[ "${1:-}" == "--commit" ]] && FINAL="COMMIT"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)
else
  export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-erp}" PGPASSWORD="${PGPASSWORD:-erp}"
  PSQL=(psql -d "${DBNAME:-greenwood}" -v ON_ERROR_STOP=1)
fi

echo "Pattern: '$DEMO_LIKE'  (and '$DEMO_LIKE2')   mode: $([[ $FINAL == COMMIT ]] && echo 'COMMIT (will delete)' || echo 'DRY-RUN (rolls back)')"

"${PSQL[@]}" -v like="$DEMO_LIKE" -v like2="$DEMO_LIKE2" <<SQL
BEGIN;
CREATE TEMP TABLE demo_ids ON COMMIT DROP AS
  SELECT id FROM profiles WHERE email LIKE :'like' OR email LIKE :'like2';

\echo '--- matched demo users ---'
SELECT count(*) AS demo_users FROM demo_ids;
\echo '--- of which are students / linked as parents ---'
SELECT
  (SELECT count(*) FROM students  WHERE profile_id IN (SELECT id FROM demo_ids)) AS demo_students,
  (SELECT count(DISTINCT parent_id) FROM parent_student WHERE parent_id IN (SELECT id FROM demo_ids)) AS demo_parents;
\echo '--- rows that will be removed by cascade ---'
SELECT
  (SELECT count(*) FROM fee_assignments WHERE student_id IN (SELECT id FROM students WHERE profile_id IN (SELECT id FROM demo_ids))) AS fee_rows,
  (SELECT count(*) FROM payments       WHERE student_id IN (SELECT id FROM students WHERE profile_id IN (SELECT id FROM demo_ids))) AS payment_rows;
\echo '--- students before ---'
SELECT count(*) AS students_before FROM students;

DELETE FROM students   WHERE profile_id IN (SELECT id FROM demo_ids);
DELETE FROM profiles   WHERE id         IN (SELECT id FROM demo_ids);
DELETE FROM auth.users WHERE id         IN (SELECT id FROM demo_ids);

\echo '--- students after ---'
SELECT count(*) AS students_after FROM students;
\echo '--- integrity: orphaned fees / payments (must be 0) ---'
SELECT
  (SELECT count(*) FROM fee_assignments fa LEFT JOIN students s ON s.id=fa.student_id WHERE s.id IS NULL) AS orphan_fees,
  (SELECT count(*) FROM payments pm       LEFT JOIN students s ON s.id=pm.student_id  WHERE s.id IS NULL) AS orphan_payments;

$FINAL;
SQL

if [[ "$FINAL" == "ROLLBACK" ]]; then
  echo "DRY-RUN complete — nothing was deleted. Re-run with --commit to apply."
else
  echo "COMMITTED. Demo students/parents removed. Reload the app to see the clean list."
fi
