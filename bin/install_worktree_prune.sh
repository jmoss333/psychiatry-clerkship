#!/usr/bin/env bash
# install_worktree_prune.sh -- the weekly Mac job that removes safe agent worktrees, shares the
# identical files left in the rest (bin/lean_worktrees.py share: copy-on-write clones of the media
# and build output git already stores), and warns when the disk is nearly full. See
# bin/prune_worktrees.py for exactly what "safe" means.
#
# WHY A LOCAL JOB. The worktrees live on the owner's Mac; no GitHub Actions workflow can see or
# remove them. launchd (macOS's own scheduler) runs the job every Sunday at 09:00 local time, and
# runs a missed run when the Mac next wakes. It does not need Claude or any session to be open.
#
# WHAT IT INSTALLS (nothing inside the repository):
#   ~/Library/Application Support/PsychiatryClerkship/prune_worktrees.py   copies of the two
#   ~/Library/Application Support/PsychiatryClerkship/lean_worktrees.py    scripts, so the job never
#       depends on which branch the main checkout has checked out
#   ~/Library/LaunchAgents/com.psychiatry-clerkship.worktree-prune.plist   the schedule
#   ~/Library/Logs/psychiatry-clerkship-worktree-prune.log                 every run's report
# Re-run this after bin/prune_worktrees.py changes, to refresh the installed copy.
#
# Usage:
#   bash bin/install_worktree_prune.sh              # install (or refresh) the weekly job
#   bash bin/install_worktree_prune.sh --run-now    # install, then run it once immediately
#   bash bin/install_worktree_prune.sh --uninstall  # remove the job and the installed copy
set -euo pipefail

LABEL="com.psychiatry-clerkship.worktree-prune"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# A worktree's own checkout is not the repository to prune from: resolve to the main checkout.
MAIN="$(git -C "$REPO" worktree list --porcelain | awk 'NR==1 && $1=="worktree" { sub(/^worktree /, ""); print; exit }')"
SUPPORT="$HOME/Library/Application Support/PsychiatryClerkship"
SCRIPT="$SUPPORT/prune_worktrees.py"
LEAN="$SUPPORT/lean_worktrees.py"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/psychiatry-clerkship-worktree-prune.log"
DOMAIN="gui/$(id -u)"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installs a macOS launchd job; run it on the Mac that holds the repository." >&2
  exit 2
fi

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$SCRIPT" "$LEAN"
  echo "Removed the weekly worktree job ($LABEL). The log is kept at $LOG."
  exit 0
fi

python3 "$REPO/bin/prune_worktrees.py" --self-test >/dev/null || {
  echo "prune_worktrees.py failed its self-test; nothing installed." >&2
  exit 1
}

mkdir -p "$SUPPORT" "$(dirname "$PLIST")" "$(dirname "$LOG")"
cp "$REPO/bin/prune_worktrees.py" "$SCRIPT"
cp "$REPO/bin/lean_worktrees.py" "$LEAN"

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
# zsh -l loads the login PATH (Homebrew's git, git-lfs and gh), which launchd does not provide.
# Prune first (removed copies need no sharing), then share; `;` so a low-disk warning from the
# prune step (exit 1) still lets the share step free space.
COMMAND="python3 \"$SCRIPT\" --repo \"$MAIN\" --apply --notify; python3 \"$LEAN\" --repo \"$MAIN\" share --apply"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>$(xml "$COMMAND")</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL: every Sunday 09:00, repository $MAIN"
echo "  script copy: $SCRIPT"
echo "  log:         $LOG"

if [ "${1:-}" = "--run-now" ]; then
  launchctl kickstart "$DOMAIN/$LABEL"
  echo "Started one run now; its report goes to the log."
fi
