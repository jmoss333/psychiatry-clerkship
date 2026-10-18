# Build & deploy

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The two learner sites, the satellites, the release train and its spend tripwire, Git LFS and its quota, analytics gating, and the build-freshness and LFS-stub guards every build-reading test must use.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

```bash
# Build one site + run the static-QA publish gate. This IS each site's Netlify build command.
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3   # → _build/ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res   # → _build/res
```

### Two sites, one repo; the Netlify settings live in the UI — [judgment]
- **Two sites, one repo.** Build command and publish dir are set **per-site in the Netlify UI**, not
  in `netlify.toml` (kept intentionally minimal — one toml can't express two sites, and it's read
  *after* the clone). The legacy `GIT_LFS_ENABLED` / `GIT_LFS_FETCH_INCLUDE` env vars were
  **removed** from both sites on 2026-09-14 (next bullet but one). See `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`.

### The learner sites publish from `release` through the release train — [gate: .github/workflows/production-release-train.yml; .github/workflows/maintenance-release-watch.yml]
- **The two learner sites publish from `release`, not `main`** (since 2026-09-25). A merge to
  `main` deploys nothing learner-facing: `.github/workflows/production-release-train.yml`
  fast-forwards `release` to the newest main commit whose required checks are BOTH green, at
  09:05, 15:05 and 21:05 UTC, and its "Run workflow" button is the publish-now path for an
  urgent (e.g. safety) fix. Why: every Netlify production deploy is billed (15 credits) and
  publishing per merge cost two per merge. Never push to `release` by hand except to repair it;
  it only ever fast-forwards. A scheduled run HOLDS (red) if Netlify shows more than 12
  billable production deploys across all five sites in the last 24 h -- the spend tripwire
  that stands in for the auto-recharge ceiling Netlify does not offer; publish-now is never
  held. A held or failed publish is not silent: `maintenance-release-watch.yml` (10:05 UTC)
  compares what both sites serve with `main` and goes red into the escalation issue (the
  faculty console's "What learners see" panel shows the same reading on demand, and both name
  the pages learners are served as awaiting re-signature — information, never the verdict). The
  satellite sites (sp-proxy, faculty console, workforce tour)
  still build from `main`. Deploy previews: `https://deploy-preview-{PR}--{slug}.netlify.app`.

### Git LFS: never commit a pointer stub — [gate: 13_Faculty_Resources/_automation/site_build/check_lfs_media.py; .claude/hooks/lfs_guard.py]
- **Git LFS** tracks `*.mp3 *.m4a *.wav *.mp4`. Never commit LFS **pointer stubs** (~133 B) in place
  of real media — the build's LFS gate fails the deploy. In sandboxes without LFS installed, audio
  shows as false "modified"; don't commit those.

### LFS bandwidth is metered per fresh clone, not per build — [judgment]
- **LFS bandwidth is metered per GitHub account (10 GB/mo).** If *every* production deploy of both
  sites fails the LFS gate while previews and CI stay green and nothing changed, it is the quota,
  not the code (2026-08-30 outage) — see `site_build/NETLIFY_LFS_RUNBOOK.md` "Incident pattern 2".
  **The cost is per fresh clone (~455 MB), not per build or merge:** a cache-reusing production
  build downloads nothing, so ~11 "Clear cache and deploy"s spend the month — never clear the
  cache to retry an LFS failure. `site_build/lfs_pull_cached.sh` is shipped but **inert**:
  removing `GIT_LFS_ENABLED` (done 2026-09-14) did not engage it, because Netlify's checkout
  materialises LFS objects regardless — do not repeat that switch-over expecting a saving.
  Read the deploy log's checkout gap (~2 s reused, ~70 s fresh clone), not an MB line.

### Usage analytics are gated by `CLERKSHIP_ANALYTICS`, default off — [gate: 13_Faculty_Resources/_automation/site_build/check-static-site.mjs]
- **`CLERKSHIP_ANALYTICS=off|ms3|res|both`** gates the usage-analytics emitter (`common.py`'s
  `analytics_enabled_for()`), **default `off`**. Per the rollout in
  `docs/superpowers/specs/2026-09-04-usage-analytics-design.md`, enabling it is the repo owner's
  call, not a build default — set it in the Netlify UI per site when the owner decides to enable a
  site (`res` first, then `both`), never as a repo-wide default. Off ships neither `analytics.js`
  nor any `CW_SITE`/`CW_PAGE` tag; `check-static-site.mjs` §12 treats that as a clean, gated build,
  not a failure.

### Where the build pipeline lives — [judgment]
- `13_Faculty_Resources/_automation/site_build/` — the build pipeline: `build_deploy.py` (assembler),
  `build_and_check.sh` (build + gate), `check-static-site.mjs` (static QA), `site_manifest.json` (source→slug map).

### A red node test silently aborts the build; guard on freshness, not existence — [gate: tests/_build_freshness.mjs; bin/_build_freshness.py; tests/_lfs_media.mjs; 13_Faculty_Resources/_automation/site_build/check_lfs_media.py]
- **A red node test silently aborts the build.** `build_and_check.sh` is `set -euo pipefail` and runs
  `node --test tests/*.test.mjs` *before* `build_deploy.py`, so a failing contract test exits early
  and `_build/` keeps serving **stale output** while the script merely looks "failed". If a source
  edit isn't showing up in the built site, run the node suite first.
  The corollary for **build-output tests**: guard on freshness, not existence. A `_build/` older
  than the source under test fails such a test honestly — the page really is not built yet — and
  that red then aborts the only supported fix, so the staleness protects itself. Use
  `staleBuildReason()` from `tests/_build_freshness.mjs`: it skips with the rebuild command when a
  declared input outran the build, and still hard-fails when a *current* build did not produce the
  page (that is a real regression, not a stale tree). Declare every input the assertions depend on
  — a path that does not exist throws, because a typo would make the check vacuously "fresh" and
  retire the contract silently. Note such assertions never run on Netlify or in CI: `node --test`
  runs before **both** `build_and_check.sh` invocations and `_build/` starts absent, so a
  build-output test is a local-only contract — do not rely on CI to catch what it pins.
  The same rule binds the `bin/` checkers that read the built sites: `bin/_build_freshness.py`
  is the Python twin of `tests/_build_freshness.mjs`, and each caller declares only its own
  inputs. Both of its failure modes have shipped here. **Absent** made `check_design_drift.py`
  iterate an empty list and print "design system clean" — a vacuous pass. **Stale** is worse and
  cost two days: a `_build/` 13 days old produced 22 findings (10 C4, 12 C8) against pages the
  source no longer emitted, every one fabricated, and a comparison against clean `main`
  "confirmed" them because both sides read the same stale tree. A checker that reads `_build/`
  must therefore report which sites it could not read and must NOT summarise as clean what it
  never opened — `check_design_drift.py` prints `PARTIAL` and names the sites; guard on
  freshness, not existence, and rebuild before believing any finding against a built page.
  The sibling rule for a test that **spawns** a build (rather than reading `_build/`): guard it
  with `lfsStubReason()` from `tests/_lfs_media.mjs` (JS) or `worktree_stub_reason()` in
  `site_build/check_lfs_media.py` (Python). Without git-lfs installed there is no smudge filter,
  so every LFS-tracked file checks out AS its ~133-byte pointer and `build_deploy.py` aborts in
  `welcome_compass.require_real_files()` — "MS3 Compass required files are invalid: <an .mp4>",
  a red no source edit can clear, which is what made three `ci-build-contract.test.mjs` cases and
  one `evidence_registry` case fail in every sandbox. CI never saw it: `is_soft_context()` already
  exempts the `lfs:false` checkout and deploy previews, so the guard returns null there and the
  contracts still run. **The predicate is defined once**, next to the deploy gate that enforces it;
  do not re-derive "is a pointer stub" in a new place. It returns null — meaning RUN — for every
  answer except a confirmed stub in a hard context, including "cannot tell": a skip guard that
  errs permissive retires real contracts while the suite still reads green.
