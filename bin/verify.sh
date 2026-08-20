#!/usr/bin/env bash
# verify.sh — the full local gate, in one command.
#
# WHY THIS EXISTS: GitHub Actions is blocked at the account level (billing), so CI is not
# running. The gate is therefore self-reported, and a self-reported gate is only worth
# something if it is one deterministic command that a human can re-run and compare. This
# script's stdout is what goes in the PR body.
#
#   bash bin/verify.sh            # full battery
#   bash bin/verify.sh --quick    # skip the two site builds (fast inner loop; NOT a gate run)
#
# Exits non-zero if ANY step fails. Installed as a pre-push hook by bin/install-hooks.sh.
#
# Mirrors §2 of docs/superpowers/plans/IMPLEMENTATION_HANDOFF_2026-08-20.md. It does NOT run
# the Playwright smoke suite: that has its own deps, needs three servers on 4200/4201/4202
# (its config has no webServer block), and its visual baselines are Ubuntu-only. Run it
# separately — see bin/verify-smoke.sh.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
REPO="$PWD"

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

echo "verify.sh — $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo "─────────────────────────────────────────────────────────────────────"

# --- contract: CLAUDE.md and AGENTS.md are byte-identical (CI enforces this) ---
step "CLAUDE.md/AGENTS.md byte-parity"      diff -q CLAUDE.md AGENTS.md

# --- python validators ---
step "validate_registry_schemas"            python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
step "test_validate_registry_schemas"       python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
step "validate_topic_meta"                  python3 13_Faculty_Resources/_automation/validate_topic_meta.py
step "validate_attestation_consistency"     python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py

# --- node: root static-regression suite ---
# Scoped to the *.test.mjs glob on purpose: tests/smoke/*.spec.js is a separate Playwright
# suite with its own deps and is not runnable from repo root.
step "node --test tests/*.test.mjs"         bash -c 'node --test tests/*.test.mjs'
step "contrast-check"                       node tests/contrast-check.mjs

# --- SP: the duplicated state machine and its parity gate ---
# parity.test.mjs imports sp-proxy/netlify/functions/sp.mjs, so sp-proxy deps must exist or
# the suite dies with ERR_MODULE_NOT_FOUND (@netlify/blobs) — an environment gap that reads
# like a code failure. Install if missing rather than reporting a false red.
if [ ! -d sp-proxy/node_modules ]; then
  echo "  ....  installing sp-proxy deps (required by parity.test.mjs)"
  npm --prefix sp-proxy ci >/dev/null 2>&1 || true
fi
step "sp-proxy test suite"                  npm --prefix sp-proxy test
step "sp-interview suites (incl. parity)"   bash _prototypes/sp-interview/tests/run-all.sh

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
  echo "CI unavailable (Actions billing) — local gate only."
  exit 0
fi
echo "FAILED (${#FAILED[@]}): ${FAILED[*]}"
exit 1
