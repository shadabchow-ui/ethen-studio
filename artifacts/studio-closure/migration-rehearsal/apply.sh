#!/bin/sh
# MUSE-004 migration rehearsal apply script (disposable PG17 only; never production).
# Usage (needs a live PG17 + psql, e.g. owner machine or CI):
#   createdb studio_rehearsal
#   MONOLITH=/path/to/ethen sh artifacts/studio-closure/migration-rehearsal/apply.sh
# Applies the seed, then the 19 Studio files in manifest order, then re-applies
# every file to prove/deny idempotent re-run behavior. Exits non-zero on any
# first-apply failure; re-run failures are reported per file (49 CREATE POLICY
# statements are known non-idempotent — see STUDIO_MIGRATION_MANIFEST.md).
set -u
: "${MONOLITH:?set MONOLITH to the monolith checkout path}"
: "${PGDATABASE:=studio_rehearsal}"
HERE=$(dirname "$0")
FILES="20260921080000_studio_v5_j02_data.sql
20260921140000_studio_v5_j03_policy.sql
20260921180000_studio_v5_j04_economics.sql
20260921220000_studio_v5_j05_runtime.sql
20260921230000_studio_v5_j06_catalog.sql
20260922010000_studio_v5_j07_media.sql
20260922090000_studio_v5_j10_identity.sql
20260922100000_studio_v5_j11_audio.sql
20260922110000_studio_v5_j12_canvas.sql
20260922120000_studio_v5_j13_runs.sql
20260922130000_studio_v5_j14_timeline.sql
20260922140000_studio_v5_j15_composites.sql
20260922150000_studio_v5_j16_realtime.sql
20260922160000_studio_v5_j17_agent.sql
20260922170000_studio_v5_j18_collaboration.sql
20260922180000_studio_v5_j19_gateway.sql
20260923120000_studio_v5_m2_catalog.sql
20260923130000_studio_v5_provider_operations.sql
20260923140000_studio_v5_m4_record_operation_merge.sql"
echo "== seed =="
psql -v ON_ERROR_STOP=1 -f "$HERE/seed.sql" || exit 1
echo "== first apply (must be clean) =="
for f in $FILES; do
  echo "-- $f"
  psql -v ON_ERROR_STOP=1 -f "$MONOLITH/supabase/migrations/$f" || exit 1
done
echo "== second apply (idempotency probe; failures reported, not fatal) =="
rerun_fail=0
for f in $FILES; do
  if psql -v ON_ERROR_STOP=1 -f "$MONOLITH/supabase/migrations/$f" >/dev/null 2>&1; then
    echo "REPLAY_OK $f"
  else
    echo "REPLAY_FAIL $f"
    rerun_fail=$((rerun_fail + 1))
  fi
done
echo "rerun_failures=$rerun_fail (expected 5: j04 j05 j06 j07 m2 policy creates)"
