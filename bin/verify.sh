#!/usr/bin/env bash
# verify.sh — the full local gate, in one command.
#
# WHY THIS EXISTS: CI runs again (Actions billing restored 2026-08-22), but the gate is still
# worth having locally: it mirrors ci.yml's build-test-validate job step for step, so a failure
# is caught before the push rather than twenty minutes later, and it is one deterministic
# command a human can re-run and compare. Installed as a pre-push hook by bin/install-hooks.sh.
# This script's stdout is what goes in the PR body.
#
#   bash bin/verify.sh            # full battery
#   bash bin/verify.sh --quick    # skip the two site builds (fast inner loop; NOT a gate run)
#
# Exits non-zero if ANY step fails. Installed as a pre-push hook by bin/install-hooks.sh.
#
# COVERAGE: this mirrors ci.yml's build-test-validate job step for step, and
# bin/check-verify-coverage.py fails the run if ci.yml grows a gate this file does not
# carry. That guard exists because the mirroring was hand-maintained and silently drifted
# to 4 of 28 python gates — which is how #377 shipped a broken tests/maintenance and a
# broken tool inventory, and #380 a broken test_longitudinal_case, with nothing red.
# Adding a gate to ci.yml means adding it here too, or naming it in that script's ALLOWED.
#
# It does NOT run the Playwright smoke suite: that has its own deps, needs three servers
# on 4200/4201/4202 (its config has no webServer block), and its visual baselines are
# Ubuntu-only. Run it separately — see bin/verify-smoke.sh.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
REPO="$PWD"

# Git exports GIT_DIR and friends into hooks, and this script IS a pre-push hook. Several
# suites build throwaway git repos with `git init <tmp>` + `git -C <tmp> config …`; GIT_DIR
# outranks -C for config resolution, so under the hook those fixture writes land in the
# REAL repository. That is not hypothetical: it set core.bare=true and user.name=Fixture on
# this repo on 2026-08-20, which breaks `git status`, `git grep`, and `git push` everywhere,
# including the other worktrees. Scrub the inherited git environment before running anything.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR \
      GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_QUARANTINE_PATH \
      GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

FAILED=()
step() {
  local name="$1"; shift
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then
    printf '  PASS  %-42s %s\n' "$name" "$(printf '%s' "$out" | tail -1 | cut -c1-58)"
  else
    printf '  FAIL  %-42s (exit %d)\n' "$name" "$rc"
    printf '%s\n' "$out" | tail -15 | sed 's/^/        | /'
    FAILED+=("$name")
  fi
}

# ci.yml greps for machine-specific paths and fails when it FINDS them, so the exit codes
# invert: git grep returns 1 for "clean" and 0 for "violations". Do not express that as
# `! git grep …` — that also maps git's own errors (exit 128, e.g. no work tree) to success,
# which is how this step reported PASS while printing "fatal: this operation must be run in
# a work tree". Any exit code other than 0 or 1 is a broken check, not a passing one.
lint_machine_paths() {
  local out rc
  out="$(git grep -nE "/(Users|sessions)/[a-z]" -- "*.py" 2>&1)"; rc=$?
  case $rc in
    1) echo "no hard-coded machine paths in tracked *.py"; return 0 ;;
    0) echo "$out"; return 1 ;;
    *) echo "git grep could not run (exit $rc): $out"; return 2 ;;
  esac
}

echo "verify.sh — $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo "─────────────────────────────────────────────────────────────────────"

# --- contract: CLAUDE.md and AGENTS.md are byte-identical (CI enforces this) ---
step "CLAUDE.md/AGENTS.md byte-parity"      diff -q CLAUDE.md AGENTS.md

# --- contract: this script still mirrors ci.yml's gate (it silently drifted before) ---
step "gate coverage vs ci.yml"              python3 bin/check-verify-coverage.py

# --- python validators ---
# This block mirrors the python half of ci.yml's build-test-validate job, step for step.
# It used to carry only the four registry/topic/attestation validators, which is how #377
# shipped a broken tests/maintenance and a broken tool inventory, and how #380 shipped a
# broken test_longitudinal_case — none of those three suites ran here. The "gate coverage"
# step at the bottom now fails if ci.yml grows a gate this file does not mirror.
A=13_Faculty_Resources/_automation
step "validate_registry_schemas"            python3 $A/validate_registry_schemas.py
step "test_validate_registry_schemas"       python3 $A/test_validate_registry_schemas.py
step "validate_topic_meta"                  python3 $A/validate_topic_meta.py
# ci.yml runs this validator's own unit suite inside the "Test — SP Interview and managed
# proxy" step, which check-verify-coverage.py exempts wholesale — so until 2026-09 it ran
# in CI and nowhere else. A change to validate_attestation_consistency.py that broke its
# synthetic-root fixtures therefore passed a green local gate and failed in CI twenty
# minutes later. One line closes that.
step "test_validate_attestation_consistency" python3 $A/test_validate_attestation_consistency.py
step "validate_attestation_consistency"     python3 $A/validate_attestation_consistency.py
step "canonical clinical claims"            python3 bin/validate_canonical_claims.py
step "unit — scheduled maintenance"         bash -c "python3 -m unittest discover -s tests/maintenance -p 'test_*.py'"
step "validate_scheduled_workflows"         python3 $A/maintenance/validate_scheduled_workflows.py
step "unit — media guard"                   python3 $A/site_build/test_media_guard.py
step "unit — shared build logic"            python3 $A/site_build/test_common.py
step "unit — analytics allowlist"           python3 $A/site_build/test_analytics_events.py
step "analytics allowlist freshness"        python3 $A/site_build/analytics_events.py --check
step "unit — metrics collector"             bash -c "cd metrics && node --test tests/*.test.mjs"
step "unit — pairing block renderer"        python3 $A/site_build/test_pairings_block.py
step "unit — front door catalog"            python3 $A/site_build/test_frontdoor_catalog.py
step "unit — path coverage"                 python3 bin/check_path_coverage.py --self-test
step "path coverage (report-only)"          python3 bin/check_path_coverage.py
step "unit — evidence registry"             python3 tools/evidence_registry/test_registry.py
step "unit — claim sweep"                   bash -c "python3 -m unittest discover -s tests/evidence -t . -p 'test_*.py'"
step "validate_evidence_registry"           python3 tools/evidence_registry/validate.py --check-generated
step "unit — citation surveillance"         python3 $A/surveillance/bin/run_citation_check.py --self-test
step "unit — resource intake"               python3 $A/surveillance/bin/run_resource_intake.py --self-test
step "test_validate_claim_anchors"          python3 $A/test_validate_claim_anchors.py
step "validate_claim_anchors"               python3 $A/validate_claim_anchors.py
step "unit — evidence annotations"          python3 $A/validate_evidence_annotations.py --self-test
step "validate_evidence_annotations"        python3 $A/validate_evidence_annotations.py
step "span audit (verbatim vs paper)"       python3 bin/verify_spans.py
step "unit — qbank coherence"              python3 bin/check_qbank_coherence.py --self-test
step "qbank coherence"                     python3 bin/check_qbank_coherence.py
step "test_generate_evidence_drill"         python3 $A/test_generate_evidence_drill.py
step "evidence drill is regenerated"        python3 $A/generate_evidence_drill.py --check
step "test_longitudinal_case"               python3 $A/test_longitudinal_case.py
step "unit — shelf/COMAT qbank"             python3 09_Exam_Prep/shelf_comat_bank/engine/test_qbank.py
step "test_family_systems_scenarios"        python3 $A/test_family_systems_scenarios.py
step "test_validate_rotation_edition_schema"  python3 $A/test_validate_rotation_edition_schema.py
step "validate_rotation_edition_schema"     python3 $A/validate_rotation_edition_schema.py
step "test_validate_rotation_edition_catalog" python3 $A/test_validate_rotation_edition_catalog.py
step "test_reconnect_snapshot_provenance"   python3 $A/test_validate_reconnect_snapshot_provenance.py
step "validate_reconnect_snapshot_provenance" python3 $A/validate_reconnect_snapshot_provenance.py
step "unit — surface governance"            python3 $A/test_surface_governance.py
step "unit — tool governance"               python3 $A/test_validate_tool_governance.py
step "validate_tool_governance"             python3 $A/validate_tool_governance.py
step "lint — no hard-coded machine paths"   lint_machine_paths
# ci.yml runs this with --compare-ref "$BASE_SHA" on PR events; the bare form is its own
# else-branch, so local runs get the same immutability contract minus the base comparison.
step "validate_rotation_edition_catalog"    python3 $A/validate_rotation_edition_catalog.py
step "production rotation edition locked"   python3 bin/check-rotation-edition-locked.py

# --- node: root static-regression suite ---
# Scoped to the *.test.mjs glob on purpose: tests/smoke/*.spec.js is a separate Playwright
# suite with its own deps and is not runnable from repo root.
step "node --test tests/*.test.mjs"         bash -c 'node --test tests/*.test.mjs'
step "contrast-check"                       node tests/contrast-check.mjs

# --- "what ships" is one derived file, and it must be current (ADR-002) ---
# Fails when a producer (site_manifest.json, cotw_registry.json, site_extras.py) changed
# and shipped_pages.json was not regenerated. The message prints the --write command.
step "unit — shipped_pages derivation"      python3 $A/site_build/test_shipped_pages.py
step "shipped_pages is current"             python3 $A/site_build/shipped_pages.py --check

# --- faculty console: shared modules + the pending-visibility invariant ---
# The invariant fails when any reviewed.json item at status "pending" is outside the
# console's content universe (now derived from shipped_pages.json) and not on the
# documented NOT_REVIEWABLE_IN_CONSOLE allowlist. That is the check that would have
# caught the July 2026 Case-of-the-Week blind spot on the day it opened.
step "node --test faculty-console/*.test.mjs" bash -c 'node --test faculty-console/*.test.mjs'
step "pending items are visible in console"  node faculty-console/check_pending_visible.mjs

# --- SP: the duplicated state machine and its parity gate ---
# parity.test.mjs imports sp-proxy/netlify/functions/sp.mjs (@netlify/blobs) and
# sp-deploy-manifest.test.mjs imports @netlify/zip-it-and-ship-it — a devDependency.
# Deps must exist and include devDeps even under a user-level `npm config omit=dev`,
# or Node resolves nothing (ERR_MODULE_NOT_FOUND) or, worse, a stale copy from a parent
# node_modules and fails with a misleading assertion error. Install with --include=dev
# whenever either package is missing rather than reporting a false red.
if [ ! -d sp-proxy/node_modules/@netlify/blobs ] || [ ! -d sp-proxy/node_modules/@netlify/zip-it-and-ship-it ]; then
  echo "  ....  installing sp-proxy deps incl. dev (required by parity + deploy-manifest tests)"
  npm --prefix sp-proxy ci --include=dev >/dev/null 2>&1 || true
fi
step "sp-proxy test suite"                  npm --prefix sp-proxy test
step "sp-interview suites (incl. parity)"   bash _prototypes/sp-interview/tests/run-all.sh

# Red-team tier 1: the deterministic gate probes from sp-proxy/REDTEAM_CHECKLIST.md,
# run against the real sp.mjs gate logic. No model call, ~1s, so it belongs in the gate.
# It is NOT a red-team pass — sections A, C1/C4/C5, D and E are human/live checks.
# See docs/RED_TEAM_RUNBOOK.md.
step "red-team tier 1 (gate integrity)"     node bin/redteam-offline.mjs

# --- build + static QA gate, both sites ---
if [ $QUICK -eq 0 ]; then
  step "build_and_check ms3"                bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  step "build_and_check res"                bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
else
  echo "  SKIP  build_and_check ms3/res             (--quick; NOT a gate run)"
fi

echo "─────────────────────────────────────────────────────────────────────"
if [ ${#FAILED[@]} -eq 0 ]; then
  [ $QUICK -eq 1 ] && { echo "QUICK PASS — builds skipped, not a gate run"; exit 0; }
  echo "ALL CHECKS PASSED"
  exit 0
fi
echo "FAILED (${#FAILED[@]}): ${FAILED[*]}"
exit 1
