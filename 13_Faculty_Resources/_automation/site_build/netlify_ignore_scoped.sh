#!/usr/bin/env bash
# Netlify build-ignore command for the SATELLITE sites — the ones whose entire input is a
# single directory of this monorepo: sp-interview-proxy (sp-proxy/), clerkship-faculty-attest
# (faculty-console/), psychiatry-workforce-tour (13_Faculty_Resources/Outreach/alex-tour/),
# and metrics/ if it is ever given a Netlify project. NOT for the two learner sites, which
# are built from the whole repo and must keep building on every merge to main.
#
# CONTRACT (Netlify): exit 0 = "no content change, do NOT build"; any non-zero = "build".
#
# WHY THIS FILE EXISTS
# Netlify bills a PRODUCTION DEPLOY at 15 credits (~$0.10), flat, regardless of how long the
# build takes. Build minutes, deploy previews, branch deploys and cancelled/failed deploys
# are NOT metered. From 2026-09-03 every satellite carried `ignore = "/bin/false"` — always
# build, never cancel — and the netlify.toml comments priced that as "one ~30 s build per
# event". That was the right price under build-minute billing and the wrong one under
# credits: it charged one production deploy per site per merge to main whether or not that
# site's directory had changed. Measured over the 163 first-parent merges from 2026-08-27 to
# 2026-09-10: alex-tour's directory was touched 2 times and billed 163; sp-proxy 19 and
# billed 163; faculty-console 19 and billed 163. 513 of 815 charged production deploys were
# byte-identical republishes — about $110/month.
# Full numbers: 13_Faculty_Resources/_automation/NETLIFY_COST_REDUCTION_PLAN.md.
#
# WHY `/bin/false` WAS THERE, AND WHAT REPLACES IT
# Netlify files a skip as a FAILED deploy (state "error", message "Canceled build due to no
# content change") and the site's "Deploy failed" email fires on every one of them. That
# email was the only alarm for a genuinely broken production deploy — added after the
# 2026-08-31 GitHub-LFS outage left a broken Interview Room in front of students with nobody
# told — and a routine no-op cancel ringing it makes it worthless. So the alarm moved:
# `bin/check_netlify_deploy_health.py` reads deploy state from the Netlify API, discards
# exactly that cancel message, and runs daily inside maintenance-production-canary.yml.
# TURN OFF the per-site "Deploy failed" email on every site that uses this script, and leave
# it ON for the two learner sites.
#
# FAIL SAFE: every unexpected condition exits non-zero, i.e. BUILDS. Never skip on doubt —
# a wasted build costs a dime, a wrongly skipped one ships stale content to a learner.
#
# USAGE — from a satellite's netlify.toml, with paths relative to the REPO ROOT. Use a TOML
# literal (single-quoted) string so the shell substitution survives verbatim:
#   ignore = 'bash "$(git rev-parse --show-toplevel)/13_Faculty_Resources/_automation/site_build/netlify_ignore_scoped.sh" sp-proxy'
#
# Falsification: tests/maintenance/test_netlify_ignore_scoped.py (run by the "Unit —
# scheduled maintenance" gate in both ci.yml and bin/verify.sh).
set -uo pipefail

say() { printf 'netlify-ignore: %s\n' "$*"; }

if [ "$#" -eq 0 ]; then
  say "no paths given -> BUILD (a scoped ignore with no scope is a bug, not a skip)"
  exit 1
fi

# Deploy previews and branch deploys are free and are the PR gate. Only production is worth
# skipping, and an unset CONTEXT means we do not know where we are.
if [ "${CONTEXT:-}" != "production" ]; then
  say "context=${CONTEXT:-<unset>} is not production -> BUILD"
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$repo_root" ]; then
  say "not inside a git work tree -> BUILD"
  exit 1
fi
cd "$repo_root" || { say "cannot enter repo root -> BUILD"; exit 1; }

base="${CACHED_COMMIT_REF:-}"
head_ref="${COMMIT_REF:-}"
if [ -z "$base" ] || [ -z "$head_ref" ]; then
  say "CACHED_COMMIT_REF/COMMIT_REF not both set (first build, or cache cleared) -> BUILD"
  exit 1
fi

for ref in "$base" "$head_ref"; do
  if ! git cat-file -e "${ref}^{commit}" 2>/dev/null; then
    say "commit ${ref} is not in this clone -> BUILD"
    exit 1
  fi
done

# A path that does not exist at HEAD means the site's inputs moved or the argument is wrong.
# Either way `git diff` would report "no change" forever, so build instead.
for path in "$@"; do
  if ! git cat-file -e "${head_ref}:${path}" 2>/dev/null; then
    say "path '${path}' does not exist at ${head_ref} -> BUILD"
    exit 1
  fi
done

if git diff --quiet "$base" "$head_ref" -- "$@"; then
  say "no change under '$*' between ${base} and ${head_ref} -> SKIP (no production deploy)"
  exit 0
fi

say "change under '$*' between ${base} and ${head_ref} -> BUILD"
exit 1
