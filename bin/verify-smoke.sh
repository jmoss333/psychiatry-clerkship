#!/usr/bin/env bash
# verify-smoke.sh — the non-visual Playwright smoke specs, with their servers.
#
# Separate from bin/verify.sh because this suite has its own deps and needs three static
# servers. playwright.config.js has NO webServer block, so CLAUDE.md's documented
# `npx playwright test` fails every spec with ECONNREFUSED until the servers exist.
#
#   bash bin/verify-smoke.sh                 # nav-crawl + aria-live + lfs-integrity
#   SPECS="nav-crawl.spec.js" bash bin/verify-smoke.sh
#
# VISUAL SPECS ARE DELIBERATELY EXCLUDED. Baselines are generated on Ubuntu/Chromium by the
# "Refresh visual baselines" workflow_dispatch and will false-diff on macOS. Never regenerate
# them locally.
#
# ⚠ A port answering 200 is NOT proof it serves YOUR build. A stale http.server from another
# worktree answers with the right page titles and the wrong code. This script always starts
# its own servers from THIS worktree's _build/ and refuses to reuse a port it did not open.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
REPO="$PWD"
SPECS="${SPECS:-nav-crawl.spec.js aria-live.spec.js lfs-integrity.spec.js}"

for d in _build/ms3 _build/res; do
  [ -d "$d" ] || { echo "missing $d — run bin/verify.sh (or build_and_check.sh) first"; exit 2; }
done

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

serve() { # port, dir
  local port="$1" dir="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $port already in use — refusing to trust a server this script did not start."
    echo "  A stale server from another worktree serves the right titles and the wrong code."
    echo "  Free it:  lsof -nP -iTCP:$port -sTCP:LISTEN   then kill the PID"
    exit 2
  fi
  python3 -m http.server "$port" --directory "$REPO/$dir" >/dev/null 2>&1 &
  PIDS+=($!)
}

serve 4200 _build/ms3
serve 4201 _build/res
serve 4202 faculty-console

for port in 4200 4201 4202; do
  for _ in $(seq 1 20); do
    curl -sf "http://localhost:$port/" >/dev/null 2>&1 && break
    sleep 0.5
  done
done
echo "servers up: 4200 (ms3) 4201 (res) 4202 (faculty-console)"

[ -d tests/smoke/node_modules ] || (cd tests/smoke && npm ci >/dev/null 2>&1)

# shellcheck disable=SC2086
(cd tests/smoke && npx playwright test $SPECS --reporter=list)
rc=$?
echo "───────────────────────────────────────────────"
[ $rc -eq 0 ] && echo "SMOKE PASSED (non-visual: $SPECS)" || echo "SMOKE FAILED (exit $rc)"
exit $rc
