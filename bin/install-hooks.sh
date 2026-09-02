#!/usr/bin/env bash
# install-hooks.sh — install the pre-push gate.
#
# Git hooks are not version-controlled and are per-clone, and this repo is worked in many
# worktrees (git worktree list shows 7+). Worktrees SHARE .git/hooks with the primary repo,
# so installing once covers them all — but a fresh clone needs this run again.
#
#   bash bin/install-hooks.sh
#
# The hook runs bin/verify.sh before every push and blocks the push on failure. Bypass with
# `git push --no-verify` — which should appear in a PR body with a reason, never silently.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2

HOOK_DIR="$(git rev-parse --git-common-dir)/hooks"   # --git-common-dir, not --git-dir:
mkdir -p "$HOOK_DIR"                                  # worktrees have their own .git file but
                                                      # share the primary's hooks directory.
cat > "$HOOK_DIR/pre-push" <<'HOOK'
#!/usr/bin/env bash
# Installed by bin/install-hooks.sh. CI (GitHub Actions) is blocked at the account level, so
# this local gate is the only gate. Bypass with --no-verify and say so in the PR.
set -uo pipefail
TOP="$(git rev-parse --show-toplevel)"
[ -f "$TOP/bin/verify.sh" ] || exit 0    # branch predates the harness; do not block
echo "pre-push: running bin/verify.sh (CI is down — this is the gate)"
bash "$TOP/bin/verify.sh" || {
  echo
  echo "pre-push BLOCKED — bin/verify.sh failed. Fix, or push with --no-verify and justify it."
  exit 1
}
HOOK
chmod +x "$HOOK_DIR/pre-push"
echo "installed: $HOOK_DIR/pre-push"

# pre-commit: the fast gate (< 2 s) over STAGED content — LFS pointer integrity, agent-doc
# parity, machine paths, crisis literals, dose literals, localStorage namespaces. It shares
# its checks with the Claude Code hooks in .claude/hooks/, so an edit that a session hook
# would have refused is refused again at commit time for anyone editing by hand.
cat > "$HOOK_DIR/pre-commit" <<'HOOK'
#!/usr/bin/env bash
# Installed by bin/install-hooks.sh. Fast staged-content gate; the full gate is pre-push.
set -uo pipefail
TOP="$(git rev-parse --show-toplevel)"
[ -f "$TOP/.claude/hooks/precommit_gate.py" ] || exit 0   # branch predates the gate
python3 "$TOP/.claude/hooks/precommit_gate.py" || {
  echo "pre-commit BLOCKED — fix the findings above, or commit with --no-verify and justify it in the PR."
  exit 1
}
HOOK
chmod +x "$HOOK_DIR/pre-commit"
echo "installed: $HOOK_DIR/pre-commit"
echo "(shared by all worktrees of this repo; re-run after a fresh clone)"
