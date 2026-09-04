# Git + Netlify-from-Git Plan — Psychiatry Clerkship Library

**Owner:** Joshua Moss, MD · **Created:** 2026-07-01 · **Updated:** 2026-07-29
**Goal:** put the library under version control and move both sites to *deploy-on-push* so concurrent editing (multiple chats/sessions) can never again silently clobber the live sites.

> **Status (2026-07-07): build-on-push is LIVE and verified on both sites.** §1 cleanup ✅ · §2 pushed to `jmoss333/psychiatry-clerkship` (private) ✅ · §6 media migrated to Git LFS (100 `.m4a` + 7 `.mp4`) ✅ · resident source/deploy drift reconciled ✅ · Netlify LFS env vars set on both sites ✅ · both sites git-linked and production deploys ready ✅ · media verified live as real files, not pointer stubs ✅ · build-ignore hook added to skip doc-only rebuilds (§7) ✅ — *retired 2026-09-03, see §7*. **The manual `netlify deploy --dir` flow can be retired.** Ongoing watch-item: Git-LFS bandwidth (see §6).

---

## 0. What's already done (2026-07-01)
- **Repo initialized** at `~/Psychiatry-Clerkship-Library` with a clean baseline commit `a7793cc` (361 files, ~12 MB). `git fsck` clean, working tree clean.
- **`.gitignore`** added — versions the curated *text* source (markdown, HTML, build scripts, JSON config) and excludes large binaries (audio/video/decks/PDFs under `**/_source/` + download folders) and generated build output. Ignored files still live on disk; use Git LFS later if you want them versioned.
- **Build scripts made session-portable** (`_automation/site_build/build_deploy.py`, `resident_section.py`): paths now derive from the script location and honor `OUT_DIR` / `MS3_DIR` env vars — exactly what CI needs.

## 0b. Completed 2026-07-02
- **Pushed to GitHub** — private repo `jmoss333/psychiatry-clerkship`, `main` in sync.
- **Media → Git LFS** — 100 `.m4a` (~344 MB) plus 7 `.mp4` files tracked and pushed; `git lfs fsck` OK. `.gitattributes` covers `*.mp3/*.m4a/*.wav/*.mp4`; deploy-critical media types are un-ignored in `.gitignore`.
- **Resident source/deploy drift reconciled** — 4 tools that were hand-copied into the deploy dir (`orientation-video`, `rp-agitation`, `rp-brief-psych`, `rp-canon-quiz`) are now built from git-tracked `_prototypes/` via `resident_section.py`, with faithful nav placement + search keywords. A fresh resident build is now **byte-identical** to the live site (was missing these 4 before).
- **Netlify LFS env vars set** on both sites: `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` for builds. *(Superseded 2026-09-02 — §6a: these are now to be **removed** per site so the cached pull takes over; leaving them set is what spends the LFS bandwidth quota on every build.)*
- **`.netlify/` gitignored** (CLI local state must never be committed).

## 1. ⚠️ One-time cleanup — run in your NATIVE terminal (not Cowork)
The Cowork sandbox mounts your folder in a way that blocks git from deleting its own lock/temp files, so it left some behind. From macOS Terminal:
```bash
cd ~/Psychiatry-Clerkship-Library
rm -f .git/*.lock .git/objects/maintenance.lock
find .git/objects -name 'tmp_obj_*' -delete
git gc --prune=now          # packs objects, clears the ~445 stray temp blobs
git status                  # should be clean; commit a7793cc present
```
**Going forward, run all git operations natively (Terminal) or via Desktop Commander** — not from the Cowork sandbox — to avoid the lock-file issue.

## 2. Push to a PRIVATE GitHub remote
This is a clinical teaching resource. Before pushing:
- **Confirm no PHI** in tracked files (content is synthetic/de-identified by design; the PHI-risk binaries are already gitignored).
- Use a **private** repo.
```bash
gh repo create psychiatry-clerkship --private --source=. --remote=origin
git push -u origin main
```

## 3. Netlify: switch both sites from manual deploy → build-on-push
Today both sites deploy manually via `netlify deploy --dir=…` from whatever session runs it — that's the root of the concurrency collisions. Target: one Git repo → two Netlify sites, each auto-building on push.

**Key fact:** the resident site is *derived from* the MS3 build, so its build runs BOTH scripts. Both scripts now accept `OUT_DIR` (and resident accepts `MS3_DIR`), and `/_build/` is gitignored.

**Site A — MS3 (`une-ms3-psychiatry`)**
- Link the GitHub repo to the existing site (Netlify UI → Site config → Build & deploy → Link repository), or `netlify link`.
- Build command:
  ```
  OUT_DIR=_build/ms3 python3 13_Faculty_Resources/_automation/site_build/build_deploy.py
  ```
- Publish directory: `_build/ms3`

**Site B — Resident (`mmc-psychiatry-residents-sanford`)**
- Link the SAME repo to this site.
- Build command:
  ```
  OUT_DIR=_build/ms3 python3 13_Faculty_Resources/_automation/site_build/build_deploy.py && MS3_DIR=_build/ms3 OUT_DIR=_build/res python3 13_Faculty_Resources/_automation/site_build/resident_section.py
  ```
- Publish directory: `_build/res`

**Site IDs (confirmed 2026-07-02, team ReConnect Psychiatry):**
- MS3 `une-ms3-psychiatry` — `94717a39-679b-4c78-ae02-7b19e809592e`
- Resident `mmc-psychiatry-residents-sanford` — `af64d5d4-e0b5-4f03-9857-be40e3b48329`

**Both sites**
- ⚠️ **Media must reach the build as real bytes, not pointer stubs.** Target state (§6a, 2026-09-02): **no** LFS env vars on the site — `site_build/lfs_pull_cached.sh` runs inside the build command and pulls media from Netlify's persistent cache, spending GitHub LFS bandwidth only on objects the cache lacks. Legacy state (2026-07 → 2026-09): `GIT_LFS_ENABLED=true` plus `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` in each site's build environment, which makes Netlify fetch all ~433 MB at clone time on every production build and exhausted the monthly quota on 2026-08-30. Whichever state a site is in, the setting lives in the **Netlify UI env vars, NOT `netlify.toml`** — `netlify.toml` is read *after* the repo is cloned, too late to affect a clone-time fetch. This is why the committed `netlify.toml` carries no build settings at all (only the always-build rule, §7). Switch-over steps: `site_build/NETLIFY_LFS_RUNBOOK.md`.
- Build image includes Python 3 by default; if needed set env `PYTHON_VERSION=3.11`. Netlify installs `requirements.txt` (jsonschema, needed by the build-gate validators) automatically during dependency install.
- Confirm each site's **publish dir** and **build command** in its own settings (one repo can back multiple sites with different commands).
- Keep build command / publish dir in each site's **UI settings** (two sites need different commands from one repo). Any legacy LFS env var still present is UI-only too, and §6a is retiring it. The repo `netlify.toml` is deliberately minimal — it carries **only** `ignore = "/bin/false"` (always build; §7 explains why nothing in this repo may cancel a build), no build command or env, so it does not override either site's UI build settings.

After this, the workflow is: **edit source → commit → push → both sites rebuild and deploy automatically.** No more `netlify deploy` by hand, no more two-session clobbering.

## 4. Working agreement (prevents recurrence)
- **Source is truth; deploy folders are build artifacts.** Never hand-edit `clerkship-hub-deploy/` or `mmc-resident-deploy/` — change the source and rebuild.
- **One change → one commit → one push.** Concurrent sessions now surface as merge conflicts (visible + resolvable), not silent overwrites.
- **Attestation is git-tracked:** `reviewed.json` changes + clinical-content commits give you a provenance trail (who attested what, when).

## 5. Interim (until §3 is wired)
Keep deploying manually, but from **one** session at a time, and always **rebuild from source** first:
```bash
cd ~/Psychiatry-Clerkship-Library/13_Faculty_Resources/_automation/site_build
OUT_DIR=~/clerkship-hub-deploy python3 build_deploy.py
MS3_DIR=~/clerkship-hub-deploy OUT_DIR=~/mmc-resident-deploy python3 resident_section.py
netlify deploy --prod --dir=~/clerkship-hub-deploy      # MS3
netlify deploy --prod --dir=~/mmc-resident-deploy       # Resident
```
> ~~Note: the deployed sites currently carry ~10 pages beyond this build script's list…~~ **Resolved 2026-07-02:** a from-scratch build was diffed against both live deploys. MS3 had **no** real-content gap (the 4 "extra" files were `.netlify/plugins/node_modules` junk). Resident was missing **4 tools**, now reconciled into `resident_section.py` (see §0b). Fresh builds are now byte-identical to live. Re-run this diff after any parallel-session edits.

## 6. ✅ MEDIA — migrated to Git LFS (2026-07-02; hardened 2026-07-07)
**Done:** the **100 `.m4a` files (~344 MB)** — landmark-trial overviews (`07_Evidence_and_Reading/Landmark_Trials/audio/`) and NotebookLM briefs (`12_Media/audio_oe/`) — plus **7 `.mp4` files** are now Git LFS-tracked and pushed (`git lfs fsck` OK). Until 2026-09-02 both Netlify sites needed `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4`; §6a replaces that with the in-build cached pull and those vars are now to be removed. A local build confirms media lands in both `_build/ms3` and `_build/res`. **Still verify empirically after LFS changes:** media URLs should return real multi-MB files (HTTP 200, appropriate audio/video content type), not ~130-byte pointer stubs — see §3 caution. Historical context (why this mattered) below.

<sub>Originally these were **gitignored**, so a git-CI build would have deployed both sites **without audio** (silent regression); the manual `netlify deploy --dir` flow didn't hit this because it copies audio from local disk. That risk is closed once the empirical check passes.</sub>

**Fix — track the media with Git LFS** (`.gitattributes` already added for `*.mp3/*.m4a/*.wav/*.mp4`). Run natively:
```bash
cd ~/Psychiatry-Clerkship-Library
git lfs install
# stop ignoring the audio types so LFS can track them (keep decks/PDFs ignored):
sed -i '' '/^\*\.mp3$/d;/^\*\.m4a$/d;/^\*\.wav$/d' .gitignore
git add .gitattributes .gitignore
git add 07_Evidence_and_Reading/Landmark_Trials/audio \
        12_Media/audio_oe
git lfs ls-files | head        # verify the 100 files are LFS-tracked (not regular blobs)
git commit -m "chore: track site audio via Git LFS (landmark + NotebookLM briefs)"
git push
```
**2026-07-07 incident note:** the MS3 production build failed when Netlify checked out LFS pointer stubs for audio. Recovery was: `git lfs push --all origin`, confirm `GIT_LFS_ENABLED=true`, add `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4`, and trigger a new production deploy. The targeted guard is now `13_Faculty_Resources/_automation/site_build/check_lfs_media.py`, and the operational checklist is `13_Faculty_Resources/_automation/site_build/NETLIFY_LFS_RUNBOOK.md`.
**Quota note:** the current tree has roughly 433 MB of LFS-tracked media, which fits GitHub LFS storage, but LFS **bandwidth** is metered per account (10 GB/mo on the current plan, reset on the 1st). **2026-08-30 incident:** it bit. With `GIT_LFS_ENABLED=true` Netlify re-fetched all ~433 MB on every production build of each site (previews and CI never fetch), so ~11 merges to `main` spent the month; GitHub's 90% and 100% notices arrived 40 minutes apart and every production deploy of both sites failed the LFS gate until the 2026-09-01 reset. Runbook: `site_build/NETLIFY_LFS_RUNBOOK.md`, "Incident pattern 2".

### 6a. LFS bandwidth — cached pull (IMPLEMENTED 2026-09-02) and the remaining escape hatches
**Decision recorded 2026-07-02, revised 2026-09-02 after the 2026-08-30 outage.** The assumption that "Netlify likely caches LFS objects across builds" was wrong for the clone-time fetch; it does not.

**0. Implemented — fetch inside the build, from Netlify's persistent cache.** `site_build/lfs_pull_cached.sh` (run by `build_and_check.sh` before the site build) points `lfs.storage` at `$NETLIFY_CACHE_DIR/git-lfs` — a directory Netlify persists between builds of a site, all contexts — and runs `git lfs pull`, which downloads only objects the store lacks. Steady-state bandwidth ≈ 0 MB/build; one full fetch after a "Clear cache and deploy"; the log prints `~N MB downloaded from GitHub this build` as a running meter. It is a no-op locally and in GitHub Actions. **Activation is a UI step, per site: delete `GIT_LFS_ENABLED` and `GIT_LFS_FETCH_INCLUDE`, then clear-cache deploy once** — until then the clone still pays first and the script just says so. (The §7 build-ignore hook would have saved LFS bandwidth on this path too, but it was retired on 2026-09-03 for the reason given there; a doc-only build on the cached path costs ~0 MB from GitHub anyway.)

If bandwidth still creeps (media churn, frequent cache clears), in order of preference:
1. **Zero-effort stopgap:** buy the **$5/mo GitHub 50 GB LFS data pack** (also the only way to deploy *before* the monthly reset once the quota is spent). No re-architecture.
2. **Real fix — move audio off git to object storage + CDN, reference by absolute URL.** Removes audio from the repo entirely: no LFS, no build-time checkout, no GitHub LFS bandwidth meter. The build scripts would emit `<audio src="https://cdn/…/xyz.m4a">` instead of copying local files into `_build/*/audio*`.
   - **Cloudflare R2** (recommended): S3-compatible, **zero egress fees**, cheap storage, public bucket + custom domain. Best fit for "serve static audio forever, cheaply."
   - **Backblaze B2**: similar; free egress via the Cloudflare CDN alliance.
   - **AWS S3 + CloudFront**: works but egress costs + more setup.
   - **Netlify Blobs**: Netlify-native but aimed at runtime KV data; serving static media wants a function — more friction than R2 for plain assets.
   - Migration touch-points: (a) upload the 100 `.m4a` to the bucket; (b) in `build_deploy.py`/`resident_section.py`, swap the local audio-copy step for URL rewriting; (c) keep the manual `netlify deploy --dir` flow working during transition; (d) then un-track audio from LFS. Pull current R2 + Netlify docs before writing any of it.
3. **Do NOT** use a database (e.g. Netlify's Neon/Postgres extension) for this — it's for relational data, not media blobs; it trades the LFS bandwidth cap for function compute + egress + latency and is strictly worse.

**Sequencing:** linking the repos (§3) is harmless, but **don't treat build-on-push as your deploy mechanism until the first CI build is verified to include audio.** Until then, keep the manual `netlify deploy --dir` flow (§5), which includes audio from disk. If a first CI build ships audio-less, roll back with one manual deploy.

## 7. Build-ignore hook — RETIRED 2026-09-03 (was: skip redundant doc-only rebuilds, 2026-07-02)
From 2026-07-02 to 2026-09-03 `netlify.toml` registered `site_build/netlify-ignore.sh` as a build-ignore hook: it cancelled the build when every changed file was a Markdown doc under `_automation/` or anything under `_automation/surveillance/`, saving a ~40 s build per site per doc-only push. It is gone, and **nothing in this repo may cancel a Netlify build again.** Every `netlify.toml` in the repo (root, `sp-proxy/`, `faculty-console/`, `Outreach/alex-tour/`) now sets `ignore = "/bin/false"` — exit code 1 = "content changed, build" — which also overrides Netlify's *default* rule for the three sites with a base directory (cancel when the commit did not touch that directory).

**Why.** Netlify records an ignore cancel — from the default base-directory rule or from a custom hook, identically — as a **failed deploy**: the API record has `state: "error"` and `error_message: "Failed during stage 'checking build content for changes': Canceled build due to no content change"`; the dashboard shows "Canceled" but files it under the "Unsuccessful" filter (`?status=error`). The "Deploy failed" email notification (added 2026-09-02 to `sp-interview-proxy`, `une-ms3-psychiatry`, `mmc-psychiatry-residents-sanford` after the 2026-08-31 LFS-budget outage went unnoticed) fires on that state, with a body that names only the site and quotes that message — no branch, no context. On 2026-09-02 `sp-interview-proxy` alone recorded ~75 such cancels in a day (58 deploy previews + 16 production merges), zero real failures. An alarm that rings 75 times a day for nothing is no alarm. Netlify's own GitHub commit-status integration, by contrast, reports the same cancel as `success` ("Deploy Preview canceled.") — the classification is inconsistent on Netlify's side, so the only reliable fix is to never produce the state.

**What it costs.** One extra build per site per doc-only push (~40 s on the student sites, ~10–30 s on the small sites), publishing byte-identical output. The service-worker `VERSION` is a content hash that already excludes commit-stamped files (`common.py`, "Service worker emission"), so an identical rebuild does not move it and no learner re-downloads anything. Git-LFS bandwidth is unaffected on either fetch path: the legacy clone-time fetch always ran *before* the hook, and the §6a cached pull reads from Netlify's cache (~0 MB from GitHub). Netlify's own "Skipped" deploys (a newer commit on the same branch superseded a queued build; `skipped: true`, message "Skipped") are also `state: "error"` and cannot be prevented from the repo; whether the email fires on those is unverified as of 2026-09-03.

**Reading a deploy list after this change.** Any "Canceled" entry means someone re-introduced an ignore rule (or removed `ignore = "/bin/false"` from a base-directory site's toml) and the alarm is untrustworthy again. "Failed" means a real failure — read the log.

## 8. Scheduled operations and hosted evidence (2026-07-29)

The [scheduled maintenance operations runbook](maintenance/README.md) is now the operator source of
truth for cadence, artifacts, production canaries, workflow heartbeat provenance, review issues,
rotation readiness, and pause/resume procedures. The
[surveillance runbook](surveillance/README.md) owns the rolling generated-report inbox.

- GitHub cron runs only after the workflow exists on the default branch. A workflow file on a topic
  branch is implementation evidence, not an active schedule.
- The daily public-site canary verifies the deployed root, navigation, search index, and served-media
  cache/integrity contracts. It complements, but does not replace, the build and static-QA gates.
- The Interview Room proxy writes a bounded Netlify Blob health receipt every six hours. GitHub
  checks its public content-free status 15 minutes later; operators still inspect the scheduled
  function inventory/logs after deploy, configuration, or red-team changes.
- GitHub artifacts retain maintenance/surveillance evidence for 90 days; the existing CI smoke
  artifact remains at 14 days. Maintenance receipts do not retain clinical teaching content.
  Surveillance artifacts may include complete normalized public-source baselines for entries
  explicitly configured as `full_text`, plus bounded change excerpts; `signal_only` sources remain
  hash-only. Neither class of artifact may contain credentials, learner identity, patient data, or
  PHI.
- GitHub can compare the red-team receipt with the canonical SP pack in git. Only the external,
  authenticated Netlify deadman can separately compare it with the latest hosted SP deploy.

## 9. Offline-shell service-worker kill switch (SW_KILL)

Both sites ship a service worker (`sw.js`, emitted per-site by `common.py`'s
`emit_service_worker()` from `sw_template.js`) that precaches the shell so it keeps working
offline / after Add to Home Screen. If it ever misbehaves in production (stale content stuck
in the precache, a bad fetch-interception edge case, anything that makes disabling it faster
than debugging it), there is a build-time rollback switch — no code change required.

**To disable (both sites, every client):**
1. In **each** Netlify site's UI — `une-ms3-psychiatry` **and**
   `mmc-psychiatry-residents-sanford` — go to Site config → Environment variables and set
   `SW_KILL=1`.
2. Trigger a new deploy on **both** sites (push a commit, or "Trigger deploy" in the UI). The
   build re-emits `sw.js` with `KILL=true` baked in (see `_SW_KILL_ANCHOR` /
   `emit_service_worker(..., kill=...)` in `common.py`).
3. On every client's next visit, the installed worker's `activate` handler sees `KILL=true`,
   deletes all `cw-precache-*` caches, and calls `self.registration.unregister()` (see
   `sw_template.js`) — no manual per-device action needed, and no forced reload is required
   (the kill takes effect on the worker's normal activate lifecycle).
4. Confirm: open either site, DevTools → Application → Service Workers should show no
   registration (or a controller-less one mid-transition), and Application → Cache Storage
   should show zero `cw-precache-*` entries after one navigation.

**To re-enable:** unset `SW_KILL` (or set it to anything other than `1`) in both sites' env
vars and redeploy both. The next build emits `KILL=false` and registration resumes normally
via the `SW_REGISTER` snippet (`sw_register.js`) on the client's next page load.

Both sites must be flipped together — `SW_KILL` is a per-site Netlify build env var, not a
runtime flag, so leaving one site set and the other unset ships inconsistent offline behavior
between the MS3 and resident learner populations.

---
*Prepared 2026-07-01; deployment migration completed 2026-07-02; scheduled-operations handoff linked
2026-07-29. Baseline commit `a7793cc`. Manual deploys can remain retired; follow the maintenance
runbook and watch Git-LFS bandwidth per §6.*
