#!/usr/bin/env bash
# build_and_check.sh — build one site, then run the static QA harness as a publish gate.
#
# Usage:  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3|res
#
# This is the Netlify build command for BOTH sites (set per-site in the Netlify UI,
# NOT in netlify.toml — see GIT_AND_DEPLOY_PLAN.md):
#   une-ms3-psychiatry (publish _build/ms3):
#     bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
#   mmc-psychiatry-residents-sanford (publish _build/res):
#     bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
#
# Gate semantics:
# - check_lfs_media.py gives a targeted Git-LFS media preflight before the broader QA.
# - check-static-site.mjs handles static integrity and broader safety rules.
# - check_search_quality.py catches high-value abbreviation/search regressions.
#
# HARD findings (broken nav/search targets,
# dose literals in rp-*/-trainer tools, invalid JSON, missing <title>/viewport,
# non-namespaced storage keys, orphaned content-convention source pages not wired into
# the build's source map, Git-LFS pointer stubs shipped in place of real media bytes)
# exit non-zero and FAIL the deploy. SOFT findings only
# warn — do not set STRICT=1 here or every metadata gap blocks production.
set -euo pipefail

SITE="${1:?usage: build_and_check.sh ms3|res}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$(cd "$HERE/../../.." && pwd)"   # repo root

MS3_OUT="$LIB/_build/ms3"
RES_OUT="$LIB/_build/res"

python3 "$LIB/13_Faculty_Resources/_automation/validate_topic_meta.py"
python3 "$LIB/13_Faculty_Resources/_automation/validate_attestation_consistency.py"
python3 "$LIB/13_Faculty_Resources/_automation/validate_registry_schemas.py"
python3 "$LIB/13_Faculty_Resources/_automation/validate_reconnect_snapshot_provenance.py"
python3 "$LIB/13_Faculty_Resources/_automation/validate_tool_governance.py"

case "$SITE" in
  ms3)
    echo "── build: MS3 → $MS3_OUT"
    OUT_DIR="$MS3_OUT" python3 "$HERE/build_deploy.py"
    echo "── LFS media preflight: $MS3_OUT"
    python3 "$HERE/check_lfs_media.py" "$MS3_OUT"
    echo "── QA gate: $MS3_OUT"
    node "$HERE/check-static-site.mjs" "$MS3_OUT"
    echo "── Search quality: $MS3_OUT"
    python3 "$HERE/check_search_quality.py" "$MS3_OUT" ms3
    echo "── Anki decks → $MS3_OUT/anki (fail-soft)"
    bash "$HERE/build_anki.sh" "$MS3_OUT" || true
    ;;
  res)
    # Resident derives from the MS3 build, so build both; gate the published dir.
    echo "── build: MS3 (base) → $MS3_OUT"
    OUT_DIR="$MS3_OUT" python3 "$HERE/build_deploy.py"
    echo "── build: Resident → $RES_OUT"
    MS3_DIR="$MS3_OUT" OUT_DIR="$RES_OUT" python3 "$HERE/resident_section.py"
    echo "── LFS media preflight: $RES_OUT"
    python3 "$HERE/check_lfs_media.py" "$RES_OUT"
    echo "── QA gate: $RES_OUT"
    node "$HERE/check-static-site.mjs" "$RES_OUT"
    echo "── Search quality: $RES_OUT"
    python3 "$HERE/check_search_quality.py" "$RES_OUT" resident
    echo "── Anki decks → $RES_OUT/anki (fail-soft)"
    bash "$HERE/build_anki.sh" "$RES_OUT" || true
    ;;
  *)
    echo "unknown site '$SITE' (expected ms3|res)" >&2
    exit 2
    ;;
esac

echo "── build_and_check: $SITE OK"
