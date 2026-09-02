#!/usr/bin/env bash
# lfs_pull_cached.sh — materialise Git-LFS media from a persistent per-site cache, downloading
# from GitHub only the objects the cache does not already hold.
#
# Why this exists (2026-08-30 incident):
#   GitHub meters Git-LFS *bandwidth* per account (10 GB/month on the current plan). With
#   GIT_LFS_ENABLED=true in a site's Netlify env, Netlify fetches every LFS object during the
#   clone of every production build — ~433 MB × two sites per merge to main. At the current
#   merge cadence that exhausts the quota within days of the monthly reset; GitHub then refuses
#   LFS downloads, Netlify checks out ~130-byte pointer stubs, and check_lfs_media.py correctly
#   refuses to publish a site with unplayable audio. Every production deploy fails until the
#   1st of the next month. See NETLIFY_LFS_RUNBOOK.md ("Incident pattern 2").
#
# What this does instead:
#   1. Runs ONLY on Netlify (NETLIFY=true), and by default only in the `production` and
#      `branch-deploy` contexts — deploy previews never fetched LFS (they ship stubs behind a
#      soft gate) and keep doing so, whatever Netlify's cache scoping per branch turns out to
#      be. Opt previews in with LFS_CACHE_CONTEXTS=production,branch-deploy,deploy-preview.
#      Locally and in GitHub Actions it is a no-op — the local checkout (or the deliberate
#      lfs:false CI checkout) is left alone.
#   2. If the clone already materialised real bytes (GIT_LFS_ENABLED still set in the UI), it
#      does nothing but say so — the bandwidth was already spent at clone time.
#   3. Otherwise it points `lfs.storage` at $NETLIFY_CACHE_DIR/git-lfs — a directory Netlify
#      persists between builds of the same site (all contexts) — and runs `git lfs pull`, which
#      downloads only objects missing from that store and checks the rest out from cache.
#      Steady-state bandwidth per build: ~0 MB. First build after a cache clear: one full fetch.
#   4. Reports MB downloaded this build vs served from cache, and on failure names the GitHub
#      quota as the likely cause so the deploy log points at the fix, not at the symptom.
#
# Prerequisite (one-time, per site, in the Netlify UI): remove GIT_LFS_ENABLED and
# GIT_LFS_FETCH_INCLUDE from the site's environment variables so the clone stops fetching.
# Until that is done this script is harmless but saves nothing.
#
# Exit codes: 0 = nothing to do / media materialised; 1 = `git lfs pull` failed on Netlify
# (check_lfs_media.py would fail the build anyway — this just fails earlier, with the cause).
set -uo pipefail

log() { printf 'lfs-cache: %s\n' "$*"; }
# True when $1 opens with the LFS pointer header. Real media start with binary bytes (NULs), so
# sniff via a pipe rather than a command substitution (bash warns and drops NULs there).
is_stub() { LC_ALL=C head -c 20 -- "$1" 2>/dev/null | LC_ALL=C grep -q '^version https://git-'; }

# ── 0. Scope: Netlify builds only (LFS_CACHE_DIR forces a run, for tests) ──────────────────
if [ "${NETLIFY:-}" != "true" ] && [ -z "${LFS_CACHE_DIR:-}" ]; then
  log "not a Netlify build -> skip (media come from the local checkout)"
  exit 0
fi
if [ "${GITHUB_ACTIONS:-}" = "true" ] && [ -z "${LFS_CACHE_DIR:-}" ]; then
  log "GitHub Actions checks out with lfs:false on purpose -> skip"
  exit 0
fi

CTX="${CONTEXT:-production}"
ALLOWED_CTX="${LFS_CACHE_CONTEXTS:-production,branch-deploy}"
if [ -z "${LFS_CACHE_DIR:-}" ] && ! printf ',%s,' "$ALLOWED_CTX" | grep -qF ",$CTX,"; then
  log "context '$CTX' not in LFS_CACHE_CONTEXTS=$ALLOWED_CTX -> skip (previews ship stubs; the media gate is soft there)"
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  log "not a git checkout -> skip"
  exit 0
}
cd "$REPO_ROOT"

# ── 1. Which LFS-tracked files are still pointer stubs? ────────────────────────────────────
# Patterns come from .gitattributes (filter=lfs) so adding a tracked type needs no edit here.
PATTERNS=()
while IFS= read -r pat; do
  [ -n "$pat" ] && PATTERNS+=("$pat")
done < <(awk '$0 !~ /^[[:space:]]*#/ && $0 ~ /filter=lfs/ {print $1}' .gitattributes 2>/dev/null)
if [ "${#PATTERNS[@]}" -eq 0 ]; then
  log "no filter=lfs patterns in .gitattributes -> nothing tracked, skip"
  exit 0
fi

stubs=0
real=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if is_stub "$f"; then
    stubs=$((stubs + 1))
  else
    real=$((real + 1))
  fi
done < <(git ls-files -- "${PATTERNS[@]}")

if [ "$stubs" -eq 0 ]; then
  log "all $real LFS-tracked file(s) are already real bytes -> nothing to do"
  log "NOTE: the clone fetched them (GIT_LFS_ENABLED is still set on this site), which spends"
  log "      the full LFS bandwidth on EVERY build. Remove GIT_LFS_ENABLED and"
  log "      GIT_LFS_FETCH_INCLUDE from the site's env vars to let this cache take over."
  exit 0
fi
log "$stubs pointer stub(s) among $((stubs + real)) LFS-tracked file(s) -> pulling via cache"

# ── 2. git-lfs must exist in the build image ───────────────────────────────────────────────
if ! git lfs version >/dev/null 2>&1; then
  log "WARN git-lfs is not available in this environment; cannot materialise media."
  log "     check_lfs_media.py will report the stubs and fail the deploy."
  exit 0
fi

# ── 3. Persistent object store under Netlify's between-builds cache ────────────────────────
CACHE_ROOT="${LFS_CACHE_DIR:-${NETLIFY_CACHE_DIR:-${NETLIFY_BUILD_BASE:-/opt/buildhome}/cache}}"
STORE="$CACHE_ROOT/git-lfs"
mkdir -p "$STORE" || { log "WARN cannot create $STORE; falling back to .git/lfs (no reuse)"; STORE=""; }
if [ -n "$STORE" ]; then
  git config lfs.storage "$STORE"
  log "object store: $STORE"
fi
before_mb=$(du -sm "${STORE:-.git/lfs}" 2>/dev/null | cut -f1)
before_mb=${before_mb:-0}

# ── 4. Pull: downloads only objects missing from the store, checks out the rest from it ────
PULL_ARGS=()
if [ -n "${GIT_LFS_FETCH_INCLUDE:-}" ]; then
  PULL_ARGS+=(--include="$GIT_LFS_FETCH_INCLUDE")
  log "honouring GIT_LFS_FETCH_INCLUDE=$GIT_LFS_FETCH_INCLUDE"
fi
start=$(date +%s)
if out=$(git lfs pull "${PULL_ARGS[@]}" 2>&1); then
  rc=0
else
  rc=$?
fi
elapsed=$(( $(date +%s) - start ))
after_mb=$(du -sm "${STORE:-.git/lfs}" 2>/dev/null | cut -f1)
after_mb=${after_mb:-0}
downloaded=$(( after_mb - before_mb ))
[ "$downloaded" -lt 0 ] && downloaded=0

if [ "$rc" -ne 0 ]; then
  log "ERROR git lfs pull failed (exit $rc) after ${elapsed}s:"
  printf '%s\n' "$out" | sed 's/^/  | /'
  if printf '%s' "$out" | grep -qiE 'quota|bandwidth|data pack|rate limit|429|403'; then
    log "This is the GitHub Git-LFS BANDWIDTH QUOTA (per account, resets on the 1st of the month)."
    log "Until it resets, or a data pack is bought (github.com/settings/billing), every build that"
    log "needs objects the cache does not hold will fail here. Objects already in $STORE still work."
  fi
  exit 1
fi

# Re-count: anything still a stub after a successful pull means the include filter excluded it.
left=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  is_stub "$f" && left=$((left + 1))
done < <(git ls-files -- "${PATTERNS[@]}")

log "OK — pulled in ${elapsed}s; ~${downloaded} MB downloaded from GitHub this build, store now ${after_mb} MB"
if [ "$left" -gt 0 ]; then
  log "NOTE $left LFS-tracked file(s) remain stubs (outside GIT_LFS_FETCH_INCLUDE?); the media gate"
  log "     fails only on stubs that reach the built site."
fi
exit 0
