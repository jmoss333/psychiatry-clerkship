#!/usr/bin/env bash
# Netlify build-ignore hook (referenced from netlify.toml `[build] ignore`).
#
# Exit 0  => SKIP the build (Netlify cancels the build + deploy).
# Exit !0 => PROCEED with the build.
#
# What this saves: build minutes and a redundant production redeploy on doc-only pushes.
# What it does NOT save: Git-LFS bandwidth. Netlify fetches LFS objects during the repo
# clone, which happens BEFORE this ignore hook runs (netlify.toml is read post-clone), so a
# skipped build has already paid the LFS transfer. To curb LFS bandwidth, batch pushes or
# buy the data pack (see GIT_AND_DEPLOY_PLAN.md §6).
#
# Skip ONLY when every changed file is a Markdown doc under
# 13_Faculty_Resources/_automation/ (planning/status docs that no build script reads).
# Any other change — content markdown, tools, build scripts, audio, config — builds
# normally on both sites. Fails safe toward BUILD whenever anything is uncertain.
#
# NOTE: do not reintroduce `grep -q` on the `git diff` pipe — its early exit sends
# SIGPIPE to `git diff` and, under pipefail, corrupts the pipeline exit code.
set -u

IGNORE_RE='^13_Faculty_Resources/_automation/.*\.md$'

# No cached ref (first build / cleared cache / forced deploy) -> build.
[ -n "${CACHED_COMMIT_REF:-}" ] || { echo "ignore: no CACHED_COMMIT_REF -> build"; exit 1; }
[ -n "${COMMIT_REF:-}" ]        || { echo "ignore: no COMMIT_REF -> build"; exit 1; }

# Can't compute the diff (e.g. rewritten history) -> build.
FILES=$(git diff --name-only "$CACHED_COMMIT_REF" "$COMMIT_REF") || {
  echo "ignore: git diff failed -> build"; exit 1; }

# No changes at all -> build (unusual; safe default).
[ -n "$FILES" ] || { echo "ignore: no changed files -> build"; exit 1; }

# Any changed file NOT matching the ignorable pattern forces a build.
RELEVANT=$(printf '%s\n' "$FILES" | grep -vE "$IGNORE_RE" || true)
if [ -n "$RELEVANT" ]; then
  echo "ignore: build-relevant changes present -> build"
  printf '  %s\n' $RELEVANT
  exit 1
fi

echo "ignore: only _automation/*.md docs changed -> skip build"
exit 0
