---
name: clerkship-deploy
description: Use when deploying, verifying, rolling back, or debugging the two clerkship Netlify sites (une-ms3-psychiatry, mmc-psychiatry-residents-sanford) — including the release train and its publish-now button, a held or red release-train run, a red production canary, Git-LFS audio problems, stale-cache deploys, or "modified .m4a files" confusion. Also use before committing anything in this repo from a sandboxed environment.
---

# Clerkship Site Deploy & Verify

One repo (`jmoss333/psychiatry-clerkship`) feeds **two** learner sites:
`une-ms3-psychiatry` (UNE COM MS3) and `mmc-psychiatry-residents-sanford` (MMC residents).
**They publish from the `release` branch, not `main`** (since 2026-09-25): a merge to `main`
deploys nothing learner-facing. The release train
(`.github/workflows/production-release-train.yml`) fast-forwards `release` to the newest
fully green `main` commit at 09:05, 15:05 and 21:05 UTC, and its "Run workflow" button is
publish-now. Each promotion is one production deploy per site. See "Release train" below.
Build command and publish dir live **per-site in the Netlify UI**, not in
`netlify.toml` (which is intentionally minimal — see its header comment and
`GIT_AND_DEPLOY_PLAN.md` §6–7 for why).

## Traps — check these before anything else

1. **Git-LFS false "modified" files (sandbox).** ~106 audio/video files (`*.m4a`, `*.mp3`,
   `*.wav`, `*.mp4`) are LFS-tracked. In environments without `git-lfs` (Cowork sandbox,
   some CI), all of them show as *modified* because the smudge filter is absent.
   **Never commit or checkout-restore these "changes."** Verify first:
   `git lfs version` — if absent, do heavy git work via Desktop Commander or local
   Claude Code instead. Confirm suspicion with `git diff --stat` (pointer-file diffs are
   3 lines each).
2. **Stale LFS assets after deploy.** Netlify fetches LFS during clone, *before* build
   hooks run. If deployed audio is stale or 404s, a normal redeploy won't fix it — use
   **"Deploy without cache"** (Deploys → Trigger deploy → *Clear cache and deploy site*),
   which exists **only in the Netlify dashboard UI** — re-verified 2026-09-10: the
   Cowork Netlify MCP's only write operation is `deploy-site`, which takes a `siteId`
   and nothing else, so it cannot clear the build cache. Drive it via claude-in-chrome.
3. **The Cowork Netlify MCP DOES reach these sites** — re-verified 2026-09-10. An older
   version of this trap said it was authenticated to a different account and 404'd them
   (2026-07-03); that has not been true for some time. `get-projects` returns
   `une-ms3-psychiatry` (`94717a39-679b-4c78-ae02-7b19e809592e`) and
   `mmc-psychiatry-residents-sanford` (`af64d5d4-e0b5-4f03-9857-be40e3b48329`), both on
   team `698be853…`, plan `nf_team_pro`. **Prefer the MCP for reads** — project state,
   deploy status, env vars — it is far cheaper than driving the dashboard. The dashboard
   via claude-in-chrome is still the only path for trap 2's clear-cache deploy and for
   rollback. Lesson: a stale *negative* assertion in a skill is self-sealing — it tells
   every future session not to test the thing, so it can never correct itself. Re-verify
   any "do NOT use X" line here before obeying it.
4. **"Canceled" in a satellite site's deploy list is now NORMAL. In a learner site's, it
   is not.** Re-verified 2026-09-10. Netlify records an ignore-command cancel as a *failed*
   deploy (`state: error`, "Canceled build due to no content change"), which is why the old
   hook (`netlify-ignore.sh`) was retired on 2026-09-03 in favour of `ignore = "/bin/false"`
   everywhere. That was priced as "~40 s per build", correct under build-MINUTE billing and
   wrong under credits: a production deploy is 15 credits (~$0.10) flat and build minutes
   are free, so it charged ~$110/month for byte-identical republishes. Since 2026-09-10 the
   four satellite tomls — `sp-proxy/`, `faculty-console/`, `metrics/`,
   `13_Faculty_Resources/Outreach/alex-tour/` — run
   `site_build/netlify_ignore_scoped.sh <their dir>` and skip a *production* build whose
   diff misses their directory. The ROOT `netlify.toml` still sets `ignore = "/bin/false"`
   on purpose: it governs the two learner sites, which are built from the whole repo.
   **`sp-preview/netlify.toml` sets no `ignore` key and does not need one** — corrected
   2026-09-10. An earlier version of this line said it "takes Netlify's default
   skip-if-unchanged and logs it as an error". It does not. `sp-preview` maps to the project
   `interview-room-faculty-preview` (`f2d991ee-f5e5-43b6-88ab-933fb0cd3c0f`, pinned in
   `sp-preview/.netlify/state.json`), and that project is **CLI-deployed, not git-linked** —
   see `sp-preview/README.md`, and its current production deploy, which reports
   `deploy_source: "cli"`, **`build_id: null`**, `commit_ref: null`, `branch: null`. An
   `ignore` command runs inside Netlify's BUILD pipeline; no build runs here, so the key
   would never be consulted. Adding it changes nothing, omitting it costs nothing.
   **A `netlify.toml` in this repo does NOT imply a git-linked site.** `metrics/netlify.toml`
   is the same class — it has no Netlify project at all. Exactly five projects are git-linked
   to this repo: the two learner sites, `sp-interview-proxy`, `clerkship-faculty-attest`,
   `psychiatry-workforce-tour`. To tell them apart without guessing: a git-linked project's
   `branchVersionOfSite` is `<production branch>--<site>.netlify.app` — `release--` for the
   two learner sites (verified 2026-09-27), `main--` for the satellites — while a CLI-only
   one's is `<deploy-id>--<site>.netlify.app`; or read `deploy_source`/`build_id` from the
   deploy API.
   The cost lever on a CLI site is `--prod` discipline — every `netlify deploy --prod` bills
   ~$0.10 even when the deploy reports "All files already uploaded by a previous deploy";
   drafts (`netlify deploy`, no `--prod`) are free, so iterate on drafts and publish once.
   So: a Canceled entry on a satellite means the
   rule worked; a Canceled entry on `une-ms3-psychiatry` or `mmc-psychiatry-residents-sanford`
   means someone scoped a site that must not be scoped. "Failed" still means read the log.
   Netlify's own "Skipped" (superseded commit) entries are also recorded as errors and
   cannot be prevented from the repo. The alarm that the old rule was protecting now lives
   in `bin/check_netlify_deploy_health.py` (daily, inside `maintenance-production-canary.yml`).
   It is LIVE: the `NETLIFY_AUTH_TOKEN` repository secret exists, and the 2026-09-27 canary
   run printed per-site deploy counts (re-verified 2026-09-27). Without the secret it would
   record `status: "skipped"` and say so rather than pass.
   See `GIT_AND_DEPLOY_PLAN.md` §7 and `_automation/NETLIFY_COST_REDUCTION_PLAN.md`.
5. **"Every production deploy fails, nothing changed" = GitHub LFS bandwidth quota.**
   Signature: both sites red at `lfs-media: ERROR — 105 Git LFS pointer stub(s)` (or
   `lfs-cache: ERROR … over its data quota`), deploy previews green, CI green, and a GitHub
   email "You have used 90%/100% of the Git LFS bandwidth". 10 GB/month per account, reset
   on the 1st (2026-08-30 outage). Retrying, clearing cache, or `git lfs push` cannot fix it.
   The cost is per **fresh clone** (~455 MB): a cache-reusing build downloads nothing, so
   clearing the cache is what spends the quota — never clear it to retry. The cached-pull
   switch-over (delete `GIT_LFS_ENABLED` + `GIT_LFS_FETCH_INCLUDE`) was done on both sites
   on 2026-09-14 and is **inert**: Netlify's checkout fetches LFS objects regardless, so do
   not repeat it. Need a deploy *before* the reset = buy a GitHub data pack. Read the
   deploy log's checkout gap (~2 s reused, ~70 s fresh clone) as the meter; the `~N MB
   downloaded` line never prints (`NETLIFY_LFS_RUNBOOK.md`, "How media reach the build").
6. **A red release-train run is usually the spend tripwire, not a failure — and it turns
   the canary and heartbeat red behind it.** Before a scheduled promotion the train counts
   billable production deploys in the trailing 24 h and HOLDS (exit 1, red) if publishing
   would pass its budget; the run summary prints the per-site counts, so read them before
   assuming anything is broken. On 2026-09-27 the 09:05 slot held with 14 green merges
   waiting because the *satellites* had spent a single all-sites budget (#851 splits it into
   a learner budget and an all-sites runaway ceiling; the numbers live in
   `release_train.py`). A held train then makes `release` lag `main`, and anything that
   judges production with `main`'s specs goes red on changes that have not shipped — that
   morning the canary failed #839's new assertion against a healthy site, and the workflow
   heartbeat reported both. Before calling a canary failure a site defect, check whether
   the failing assertion exists at the revision production serves:
   `git grep -n '<assertion text>' <served-sha> -- tests/smoke`, with the served SHA from
   `production_revision_parity.py` (#857 makes the canary crawl with the served revision's
   own specs).

## Release train

- **A merge deploys nothing learner-facing.** It lands on `main`; the train moves `release`
  at the next slot (09:05, 15:05, 21:05 UTC; GitHub's cron often starts it 10–20 min late)
  to the newest `main` commit whose required checks are BOTH green, and only ever
  fast-forwards. Never push `release` by hand except to repair it.
- **Publish now:** Actions → "Production — Release train" → Run workflow (give a reason).
  Use it for a safety or crisis-contact fix, or after a held slot when the merges matter
  today. It is never held by cost; it only warns.
- **Receipt:** each promotion dispatches `production-release-verification.yml` for the exact
  commit it published. That run, not the train's, says whether the publish landed.
- **Daily release watch:** `maintenance-release-watch.yml` (10:05 UTC, after the morning
  slot has built) runs `node bin/release_watch.mjs` — the faculty console's "What learners
  see" reading, against what each site serves — and goes red when any train run in the last
  26 h was held or failed (not only the newest), the sites serve different commits, `release` is unserved, `main`'s newest merge
  failed its checks, or merged work has waited over 24 h (exit 1), or when it could not read
  both sites (exit 2). A red run lands in the rolling escalation issue; its step summary
  lists every merged change not yet live. `GITHUB_TOKEN=… node bin/release_watch.mjs` gives
  the same answer locally (a sandbox that cannot reach the sites reports exit 2, not a pass).
- **What is live right now:** both sites report the commit they were built from in
  `/tool-governance.json`; `python3 13_Faculty_Resources/_automation/maintenance/production_revision_parity.py --attempts 1 --retry-delay 0 --out "$TMPDIR/served-revision.json"`
  prints it for both and fails if they differ.
- **Satellites are different:** `sp-interview-proxy`, `clerkship-faculty-attest` and
  `psychiatry-workforce-tour` still build from `main` on every merge that touches their
  directory (trap 4).

## Deploy runbook

1. Pre-flight: `git status` (no LFS false-positives staged), `git lfs ls-files | wc -l`
   (expect ~106).
2. Merge to `main` through a PR with the required checks green. Nothing publishes yet.
3. Publish: wait for the next train slot, or run publish-now. Read the run summary:
   "promoted" (with the SHA), "nothing new to publish", or "HELD" (trap 6).
4. Watch both learner-site deploys in the dashboard or the Netlify MCP (trap 3) — they build
   independently, and a green deploy on one says nothing about the other. If one fails the
   LFS gate, rule out the bandwidth quota FIRST (trap 5); never clear the cache to retry an
   LFS failure. Trap 2's "Deploy without cache" is for stale media on a deploy that
   succeeded, not for a failed one.
5. Confirm the release verification receipt for that SHA went green.

## Post-deploy verification — repeat PER SITE

- Load the site root and one deep content page (hard refresh).
- Play one landmark-trial audio file end-to-start seek — this catches LFS pointer files
  served as text (file loads but is ~130 bytes / unplayable).
- Spot-check `search-index.json`-backed search and one `tools/` page.
- If MS3 and resident sites diverge unexpectedly, diff their publish dirs / build commands
  in the UI before touching the repo.

## Rollback

A rollback alone does not hold under the train, because the bad commit is already on
`release`, and the next promotion ships whatever newer green `main` holds — including the bad
commit unless it has been reverted. Netlify documents that with auto publishing on, any new
Git-triggered production deploy overwrites a rolled-back version (docs "Manage deploys →
Rollbacks", checked 2026-09-27). So, for EACH learner site:

1. Netlify UI → Deploys → last-known-good → **Publish deploy**. Instant; no rebuild, no cost.
2. Optionally **Lock to stop auto publishing** on the same Deploys list, so a train slot cannot
   overwrite the rollback while the fix is in flight. Netlify still builds new deploys; it
   just does not publish them.
3. Revert (or fix) on `main` through a PR, then run publish-now. `release` only ever
   fast-forwards — never reset it backwards to undo a publish.
4. If you locked: **Unlock to start auto publishing**, confirm the fixed deploy is the
   published one (publish it by hand if not), and check both sites serve the same revision.
