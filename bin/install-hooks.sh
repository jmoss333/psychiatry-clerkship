#!/usr/bin/env bash
# install-hooks.sh — install the pre-push and pre-commit gates.
#
# Git hooks are not version-controlled and are per-clone, and this repo is worked in many
# worktrees (git worktree list shows 7+). Worktrees SHARE .git/hooks with the primary repo,
# so installing once covers them all — but a fresh clone needs this run again, and so does
# every change to this file: the hooks are copies, not links.
#
#   bash bin/install-hooks.sh
#
# The pre-push hook runs bin/verify.sh before every push and blocks the push on failure. Bypass
# with `git push --no-verify` — which should appear in a PR body with a reason, never silently.
#
# BOTH HOOKS FAIL CLOSED (2026-09-24). They used to open with
#     TOP="$(git rev-parse --show-toplevel)"; [ -f "$TOP/bin/verify.sh" ] || exit 0
# which read "no gate script here" as "branch predates the harness" — and so did every failure
# to find the work tree at all. On 2026-09-24 a test fixture run with an inherited GIT_DIR wrote
# core.bare=true into the SHARED .git/config; with extensions.worktreeConfig on, every linked
# worktree then reported "must be run in a work tree", TOP came back empty, "$TOP/bin/verify.sh"
# became "/bin/verify.sh", and the hook exited 0. Pushes for #774, #775 and #782 went out
# ungated while it held. Now:
#   * a work tree the hook cannot locate BLOCKS, and says why (core.bare is the usual cause);
#   * a missing gate script BLOCKS unless the commit being gated has never carried it — a
#     branch that genuinely predates the harness has no bin/verify.sh anywhere in its history,
#     while a gate that is merely missing (deleted, unreadable history) is a gate that is gone.
# tests/install-hooks.test.mjs installs both hooks into a scratch repo with a linked worktree
# and drives each case through real `git push` / `git commit`.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2

HOOK_DIR="$(git rev-parse --git-common-dir)/hooks"   # --git-common-dir, not --git-dir:
mkdir -p "$HOOK_DIR"                                  # worktrees have their own .git file but
                                                      # share the primary's hooks directory.
cat > "$HOOK_DIR/pre-push" <<'HOOK'
#!/usr/bin/env bash
# Installed by bin/install-hooks.sh — edit that file and re-run it; this is a copy.
# Runs bin/verify.sh before every push. FAILS CLOSED: a work tree this hook cannot locate, or a
# bin/verify.sh missing from a commit whose history carries one, blocks the push.
# Bypass with --no-verify and say so in the PR.
set -uo pipefail
GATE=bin/verify.sh
block() {
  printf 'pre-push BLOCKED — %s\n' "$*" >&2
  echo "  Fix it, or push with --no-verify and justify that in the PR." >&2
  exit 1
}
# 0 = the commit's history carries $GATE; 1 = it never did; 2 = git could not tell.
carries_gate() {
  local out
  out="$(git log -1 --format=%H "$1" -- "$GATE" 2>/dev/null)" || return 2
  [ -n "$out" ]
}
if ! TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || [ -z "$TOP" ] || [ ! -d "$TOP" ]; then
  why="cannot locate the work tree (git rev-parse --show-toplevel: $(git rev-parse --show-toplevel 2>&1 | head -1))."
  if [ "$(git config --get core.bare 2>/dev/null)" = true ]; then
    why="$why core.bare=true in the shared config — a test fixture that inherited GIT_DIR has written into this repository (see bin/verify.sh's header). Reset it with: git config --file \"\$(git rev-parse --git-common-dir)/config\" core.bare false"
  fi
  block "$why"
fi
REFS="$(cat)"   # <local ref> <local sha> <remote ref> <remote sha>, one line per ref pushed
if [ ! -f "$TOP/$GATE" ]; then
  SHAS="HEAD"
  while read -r _lref lsha _rref _rsha; do
    case "$lsha" in *[!0]*) SHAS="$SHAS $lsha" ;; esac   # all-zero = a deletion; nothing to gate
  done <<EOF
$REFS
EOF
  for c in $SHAS; do
    carries_gate "$c"
    case $? in
      0) block "$GATE is missing from $TOP, but $c's history carries it: the gate is gone, not absent." ;;
      2) block "$GATE is missing from $TOP and git could not read $c's history to tell whether it belongs there." ;;
    esac
  done
  echo "pre-push: no $GATE, and no commit being pushed ever carried one (the branch predates the harness) — not gating." >&2
  exit 0
fi
cd "$TOP" || block "cannot enter $TOP"
# Git exports GIT_DIR into hooks, and a test fixture that inherits it writes into THIS
# repository (2026-08-20, 2026-09-24). verify.sh scrubs these itself; a branch whose verify.sh
# predates that scrub does not, so the hook scrubs too.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR \
      GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_QUARANTINE_PATH
echo "pre-push: running $GATE"
printf '%s\n' "$REFS" | bash "$TOP/$GATE" || block "$GATE failed."
HOOK
chmod +x "$HOOK_DIR/pre-push"
echo "installed: $HOOK_DIR/pre-push"

# pre-commit: the fast gate (< 2 s) over STAGED content — LFS pointer integrity, agent-doc
# parity, machine paths, crisis literals, dose literals, localStorage namespaces. It shares
# its checks with the Claude Code hooks in .claude/hooks/, so an edit that a session hook
# would have refused is refused again at commit time for anyone editing by hand. Unlike the
# pre-push hook it must NOT scrub GIT_INDEX_FILE: `git commit -a` and partial commits stage
# into a temporary index, and the gate has to read that one.
cat > "$HOOK_DIR/pre-commit" <<'HOOK'
#!/usr/bin/env bash
# Installed by bin/install-hooks.sh — edit that file and re-run it; this is a copy.
# Fast staged-content gate; the full gate is pre-push. FAILS CLOSED: a work tree this hook
# cannot locate, or a gate script missing from a branch whose history carries one, blocks.
# Bypass with --no-verify and say so in the PR.
set -uo pipefail
GATE=.claude/hooks/precommit_gate.py
block() {
  printf 'pre-commit BLOCKED — %s\n' "$*" >&2
  echo "  Fix it, or commit with --no-verify and justify that in the PR." >&2
  exit 1
}
if ! TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || [ -z "$TOP" ] || [ ! -d "$TOP" ]; then
  block "cannot locate the work tree (git rev-parse --show-toplevel: $(git rev-parse --show-toplevel 2>&1 | head -1))."
fi
if [ ! -f "$TOP/$GATE" ]; then
  # An unborn branch (the first commit) has no history to carry the gate.
  if git rev-parse -q --verify HEAD >/dev/null 2>&1; then
    out="$(git log -1 --format=%H HEAD -- "$GATE" 2>/dev/null)" \
      || block "$GATE is missing from $TOP and git could not read HEAD's history to tell whether it belongs there."
    [ -z "$out" ] || block "$GATE is missing from $TOP, but HEAD's history carries it: the gate is gone, not absent."
  fi
  echo "pre-commit: no $GATE, and this branch never carried one (it predates the gate) — not gating." >&2
  exit 0
fi
python3 "$TOP/$GATE" || block "fix the findings above."
HOOK
chmod +x "$HOOK_DIR/pre-commit"
echo "installed: $HOOK_DIR/pre-commit"
echo "(shared by all worktrees of this repo; re-run after a fresh clone or a change to this file)"
