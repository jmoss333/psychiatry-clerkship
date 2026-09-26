#!/usr/bin/env bash
# SessionStart hook: print the repo's vitals so a cold session starts with the facts that
# usually take ten minutes to rediscover. Output becomes session context. Report-only —
# this script installs nothing and changes nothing. Every probe degrades to a one-line
# "unavailable" rather than failing the hook.

set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || { echo "vitals: git not available"; exit 0; }

# Run a command under a time limit. macOS ships no `timeout` (coreutils), and until 2026-09-26
# every probe below was wrapped in a bare `timeout`: on the Mac each one exited 127 before it
# started, so "open PRs for this branch: none", an empty scheduled-runs list and "egress: probe
# unavailable" were printed as findings when nothing had been checked. perl is on every macOS
# and Linux image; alarm+exec kills the command when the limit passes.
bounded() {
  local limit="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$limit" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$limit" "$@"
  else perl -e 'alarm shift; exec @ARGV or exit 127' "$limit" "$@"; fi
}

echo "== clerkship vitals =="
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git rev-parse --short HEAD 2>/dev/null)"

# The shared .git/config — every worktree reads it, and a test fixture that inherited a hook's
# GIT_DIR has corrupted it twice (core.bare=true, a fixture [user], LFS filters set to `cat`).
# When that happens every git probe below prints nonsense and the gates can fail open, so say it
# first and loudly. Report-only: the repair is per line and the owner's (the tool prints it).
if [ -f bin/check_git_config_health.py ]; then
  if CFG_HEALTH="$(python3 bin/check_git_config_health.py --root "$ROOT" 2>&1)"; then
    echo "git config: healthy (no core.bare=true, fixture identity or non-git-lfs filter)"
  else
    echo "!!! $CFG_HEALTH" | sed '2,$s/^/    /'
  fi
fi

# Offline and report-only: stale remote knowledge is explicitly labelled as cached.
# Run before the slower network probes so divergence is visible even if they time out.
if [ -f bin/sync_status.py ]; then
  python3 bin/sync_status.py || echo "sync: report unavailable (not evidence of synchronization)"
fi

# Coordination: other worktrees active right now, paths this branch shares with another
# worktree or open PR, and work sitting uncommitted or unpushed. Derived from git on every run
# (no claims file to keep), report-only, budgeted to 5s — most recently touched worktrees first,
# and a sweep the budget cut short says PARTIAL rather than reading as clear.
if [ -f bin/coordination_report.py ]; then
  CR_PRS=""
  command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && CR_PRS="--prs"
  bounded 10 python3 bin/coordination_report.py --vitals --budget 5 $CR_PRS
  [ $? -gt 2 ] && echo "coordination: report unavailable (not evidence that nobody else is working)"
fi

# Git LFS — the single most common sandbox trap.
if git lfs version >/dev/null 2>&1; then
  echo "git-lfs: installed ($(git lfs ls-files 2>/dev/null | wc -l | tr -d ' ') tracked media files)"
else
  PHANTOM=$(git status --porcelain -- '*.m4a' '*.mp3' '*.wav' '*.mp4' 2>/dev/null | wc -l | tr -d ' ')
  echo "git-lfs: ABSENT — $PHANTOM media files will show as modified. That is the missing smudge filter,"
  echo "         not a change. Never stage or checkout-restore them (clerkship-deploy skill, trap 1)."
fi

# Local gates.
HOOK_DIR="$(git rev-parse --git-common-dir 2>/dev/null)/hooks"
PRE_COMMIT="not installed"; PRE_PUSH="not installed"
[ -f "$HOOK_DIR/pre-commit" ] && grep -q precommit_gate "$HOOK_DIR/pre-commit" 2>/dev/null && PRE_COMMIT="installed"
[ -f "$HOOK_DIR/pre-push" ] && grep -q verify.sh "$HOOK_DIR/pre-push" 2>/dev/null && PRE_PUSH="installed"
# Hooks installed before 2026-09-24 exit 0 when they cannot find the work tree, i.e. they gate
# nothing exactly when the repository is broken. They are copies, so re-installing is the fix.
[ "$PRE_COMMIT" = installed ] && ! grep -q 'FAILS CLOSED' "$HOOK_DIR/pre-commit" 2>/dev/null \
  && PRE_COMMIT="installed but STALE (fails open)"
[ "$PRE_PUSH" = installed ] && ! grep -q 'FAILS CLOSED' "$HOOK_DIR/pre-push" 2>/dev/null \
  && PRE_PUSH="installed but STALE (fails open)"
echo "git hooks: pre-commit $PRE_COMMIT · pre-push $PRE_PUSH  (install both: bash bin/install-hooks.sh)"

# Toolchain the gate needs.
PY_DEPS="ok"
python3 -c "import jsonschema, yaml" >/dev/null 2>&1 || PY_DEPS="missing — python3 -m pip install -r requirements.txt (one node test needs jsonschema)"
echo "python deps: $PY_DEPS"
[ -d sp-proxy/node_modules/@netlify/blobs ] && echo "sp-proxy deps: ok" || echo "sp-proxy deps: missing — npm --prefix sp-proxy ci --include=dev (verify.sh installs them itself)"

# Surveillance report freshness — the contents and the generation date are different facts.
STATUS="13_Faculty_Resources/_automation/surveillance/STATUS.md"
if [ -f "$STATUS" ]; then
  GEN=$(grep -m1 -oE '_Generated [0-9]{4}-[0-9]{2}-[0-9]{2}' "$STATUS" | awk '{print $2}')
  if [ -n "$GEN" ]; then
    AGE=$(python3 -c "import datetime as d; print((d.date.today()-d.date.fromisoformat('$GEN')).days)" 2>/dev/null || echo "?")
    echo "surveillance STATUS.md: generated $GEN (${AGE} days ago) — regenerate before reacting to its numbers"
  fi
fi

# Working tree.
DIRTY=$(git status --porcelain 2>/dev/null | grep -vE '\.(m4a|mp3|wav|mp4)$' | wc -l | tr -d ' ')
echo "working tree: $DIRTY non-media change(s)"

# GitHub state, only when gh is authenticated (never on the web sandbox).
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  BR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  PRS=$(bounded 8 gh pr list --head "$BR" --state open --json number,title,isDraft -q '.[] | "#\(.number) \(.title)\(if .isDraft then " (draft)" else "" end)"' 2>/dev/null)
  echo "open PRs for this branch: ${PRS:-none}"
  echo "last scheduled workflow runs:"
  bounded 10 gh run list --event schedule --limit 12 --json name,conclusion,createdAt \
    -q '.[] | "  \(.conclusion // "running")  \(.name)  \(.createdAt[0:10])"' 2>/dev/null | sort -u -k2 | head -12
else
  echo "github: gh not authenticated here — check scheduled-workflow health in the Actions tab yourself (the heartbeat cannot escalate its own failure)"
fi
# Egress capability. Which hosts this environment can reach decides which repo tasks are
# possible today, and sessions have repeatedly burned an hour discovering that the hard way.
# Cached (6h) and hard-bounded to well under 6s. That ceiling is sized against the 30s the WHOLE
# vitals block gets: on a gh-authenticated machine the lines above already commit ~18s, one of
# them unbounded, and a hook killed at 30s loses every vital printed here — which would make a
# cold session strictly worse than no probe at all. The probe reports and gates nothing.
# Opt out with CLERKSHIP_SKIP_EGRESS_PROBE=1.
if [ -z "${CLERKSHIP_SKIP_EGRESS_PROBE:-}" ] && [ -f bin/probe_egress.py ]; then
  bounded 6 python3 bin/probe_egress.py --vitals 2>/dev/null || echo "egress: probe unavailable"
fi

echo "== end vitals =="
exit 0
