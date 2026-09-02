#!/usr/bin/env bash
# SessionStart hook: print the repo's vitals so a cold session starts with the facts that
# usually take ten minutes to rediscover. Output becomes session context. Report-only —
# this script installs nothing and changes nothing. Every probe degrades to a one-line
# "unavailable" rather than failing the hook.

set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || { echo "vitals: git not available"; exit 0; }

echo "== clerkship vitals =="
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git rev-parse --short HEAD 2>/dev/null)"

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
  PRS=$(timeout 8 gh pr list --head "$BR" --state open --json number,title,isDraft -q '.[] | "#\(.number) \(.title)\(if .isDraft then " (draft)" else "" end)"' 2>/dev/null)
  echo "open PRs for this branch: ${PRS:-none}"
  echo "last scheduled workflow runs:"
  timeout 10 gh run list --event schedule --limit 12 --json name,conclusion,createdAt \
    -q '.[] | "  \(.conclusion // "running")  \(.name)  \(.createdAt[0:10])"' 2>/dev/null | sort -u -k2 | head -12
else
  echo "github: gh not authenticated here — check scheduled-workflow health in the Actions tab yourself (the heartbeat cannot escalate its own failure)"
fi
echo "== end vitals =="
exit 0
