---
name: clerkship-deploy
description: Use when deploying, verifying, or debugging the two clerkship Netlify sites (une-ms3-psychiatry, mmc-psychiatry-residents-sanford) — including push-triggered builds, Git-LFS audio problems, stale-cache deploys, or "modified .m4a files" confusion. Also use before committing anything in this repo from a sandboxed environment.
---

# Clerkship Site Deploy & Verify

One repo (`jmoss333/psychiatry-clerkship`) feeds **two** Netlify sites that build on push:
`une-ms3-psychiatry` (UNE COM MS3) and `mmc-psychiatry-residents-sanford` (MMC residents).
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
4. **Nothing in this repo may cancel a Netlify build.** Netlify records an ignore-command
   cancel as a *failed* deploy (`state: error`, "Canceled build due to no content change")
   and the sites' "Deploy failed" email fires on it, so the old build-ignore hook
   (`netlify-ignore.sh`) was retired on 2026-09-03. Re-verified 2026-09-10: no ignore
   script is tracked anywhere, and five of the six tracked `netlify.toml` files set
   `ignore = "/bin/false"` (always build) — root, `faculty-console/`, `metrics/`,
   `sp-proxy/`, `13_Faculty_Resources/Outreach/alex-tour/`. **`sp-preview/netlify.toml`
   sets no `ignore` key**, so that one site can still take Netlify's default
   skip-if-unchanged behaviour and log it as an error. Doc-only pushes now build (~40 s, byte-identical
   output, no service-worker cache churn). A "Canceled" entry in a deploy list means
   someone re-introduced an ignore rule; "Failed" means a real failure — read the log.
   Netlify's own "Skipped" (superseded commit) entries are also recorded as errors and
   cannot be prevented from the repo. See `GIT_AND_DEPLOY_PLAN.md` §7.
5. **"Every production deploy fails, nothing changed" = GitHub LFS bandwidth quota.**
   Signature: both sites red at `lfs-media: ERROR — 105 Git LFS pointer stub(s)` (or
   `lfs-cache: ERROR … over its data quota`), deploy previews green, CI green, and a GitHub
   email "You have used 90%/100% of the Git LFS bandwidth". 10 GB/month per account, reset
   on the 1st (2026-08-30 outage). Retrying, clearing cache, or `git lfs push` cannot fix it.
   Fix = move the site to the cached-pull path (`NETLIFY_LFS_RUNBOOK.md`, Switch-over: delete
   `GIT_LFS_ENABLED` + `GIT_LFS_FETCH_INCLUDE`, clear-cache deploy once); need a deploy
   *before* the reset = buy a GitHub data pack. Read `~N MB downloaded from GitHub this
   build` in the log as the meter.

## Deploy runbook

1. Pre-flight: `git status` (no LFS false-positives staged), `git lfs ls-files | wc -l`
   (expect ~106), confirm you're on the branch each site actually deploys from (check the
   site's UI → Build settings; don't assume `main` — feature branches like `codex/*` are
   common here).
2. Push. Both sites build independently — a green deploy on one says nothing about the other.
3. Watch both deploys in the dashboard. If either fails on missing audio, suspect LFS
   bandwidth/fetch and rerun with "Deploy without cache" (trap 2).

## Post-deploy verification — repeat PER SITE

- Load the site root and one deep content page (hard refresh).
- Play one landmark-trial audio file end-to-start seek — this catches LFS pointer files
  served as text (file loads but is ~130 bytes / unplayable).
- Spot-check `search-index.json`-backed search and one `tools/` page.
- If MS3 and resident sites diverge unexpectedly, diff their publish dirs / build commands
  in the UI before touching the repo.

## Rollback

Netlify UI → Deploys → select last-known-good → "Publish deploy". Instant, no git surgery.
Fix forward in git afterward.
