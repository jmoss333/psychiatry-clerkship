# Git + Netlify-from-Git Plan — Psychiatry Clerkship Library

**Owner:** Joshua Moss, MD · **Created:** 2026-07-01 · **Updated:** 2026-07-28
**Goal:** put the library under version control and move both sites to *deploy-on-push* so concurrent editing (multiple chats/sessions) can never again silently clobber the live sites.

> **Status (2026-07-07): build-on-push is LIVE and verified on both sites.** §1 cleanup ✅ · §2 pushed to `jmoss333/psychiatry-clerkship` (private) ✅ · §6 media migrated to Git LFS (100 `.m4a` + 7 `.mp4`) ✅ · resident source/deploy drift reconciled ✅ · Netlify LFS env vars set on both sites ✅ · both sites git-linked and production deploys ready ✅ · media verified live as real files, not pointer stubs ✅ · build-ignore hook added to skip doc-only rebuilds (§7) ✅. **The manual `netlify deploy --dir` flow can be retired.** Ongoing watch-item: Git-LFS bandwidth (see §6).

---

## 0. What's already done (2026-07-01)
- **Repo initialized** at `~/Psychiatry-Clerkship-Library` with a clean baseline commit `a7793cc` (361 files, ~12 MB). `git fsck` clean, working tree clean.
- **`.gitignore`** added — versions the curated *text* source (markdown, HTML, build scripts, JSON config) and excludes large binaries (audio/video/decks/PDFs under `**/_source/` + download folders) and generated build output. Ignored files still live on disk; use Git LFS later if you want them versioned.
- **Build scripts made session-portable** (`_automation/site_build/build_deploy.py`, `resident_section.py`): paths now derive from the script location and honor `OUT_DIR` / `MS3_DIR` env vars — exactly what CI needs.

## 0b. Completed 2026-07-02
- **Pushed to GitHub** — private repo `jmoss333/psychiatry-clerkship`, `main` in sync.
- **Media → Git LFS** — 100 `.m4a` (~344 MB) plus 7 `.mp4` files tracked and pushed; `git lfs fsck` OK. `.gitattributes` covers `*.mp3/*.m4a/*.wav/*.mp4`; deploy-critical media types are un-ignored in `.gitignore`.
- **Resident source/deploy drift reconciled** — 4 tools that were hand-copied into the deploy dir (`orientation-video`, `rp-agitation`, `rp-brief-psych`, `rp-canon-quiz`) are now built from git-tracked `_prototypes/` via `resident_section.py`, with faithful nav placement + search keywords. A fresh resident build is now **byte-identical** to the live site (was missing these 4 before).
- **Netlify LFS env vars set** on both sites: `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` for builds. These are required before the repo is cloned, so they must stay in Netlify site environment settings.
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
- ⚠️ **Git LFS must be enabled or media deploys as pointer stubs.** Set `GIT_LFS_ENABLED=true` plus `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` in each Netlify site's build environment. **This must live in the Netlify UI env vars, NOT `netlify.toml`** — `netlify.toml` is read *after* the repo is cloned, too late to affect the LFS checkout. This is why the committed `netlify.toml` only carries the shared build-ignore hook.
- Build image includes Python 3 by default; if needed set env `PYTHON_VERSION=3.11`. The scripts use only the standard library (no `pip install`).
- Confirm each site's **publish dir** and **build command** in its own settings (one repo can back multiple sites with different commands).
- Keep build command / publish dir / LFS env vars in each site's **UI settings** (two sites need different commands from one repo, and the LFS env var can't live in `netlify.toml` anyway). The repo `netlify.toml` is deliberately minimal — it carries **only** the shared build-ignore hook (§7), no build command or env, so it does not override either site's UI build settings.

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
**Done:** the **100 `.m4a` files (~344 MB)** — landmark-trial overviews (`07_Evidence_and_Reading/Landmark_Trials/audio/`) and NotebookLM briefs (`…/openevidence_notebooklm_brief_audio_2026-06-30/`) — plus **7 `.mp4` files** are now Git LFS-tracked and pushed (`git lfs fsck` OK). Both Netlify sites must have `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4`. A local build confirms media lands in both `_build/ms3` and `_build/res`. **Still verify empirically after LFS changes:** media URLs should return real multi-MB files (HTTP 200, appropriate audio/video content type), not ~130-byte pointer stubs — see §3 caution. Historical context (why this mattered) below.

<sub>Originally these were **gitignored**, so a git-CI build would have deployed both sites **without audio** (silent regression); the manual `netlify deploy --dir` flow didn't hit this because it copies audio from local disk. That risk is closed once the empirical check passes.</sub>

**Fix — track the media with Git LFS** (`.gitattributes` already added for `*.mp3/*.m4a/*.wav/*.mp4`). Run natively:
```bash
cd ~/Psychiatry-Clerkship-Library
git lfs install
# stop ignoring the audio types so LFS can track them (keep decks/PDFs ignored):
sed -i '' '/^\*\.mp3$/d;/^\*\.m4a$/d;/^\*\.wav$/d' .gitignore
git add .gitattributes .gitignore
git add 07_Evidence_and_Reading/Landmark_Trials/audio \
        13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30
git lfs ls-files | head        # verify the 100 files are LFS-tracked (not regular blobs)
git commit -m "chore: track site audio via Git LFS (landmark + NotebookLM briefs)"
git push
```
**2026-07-07 incident note:** the MS3 production build failed when Netlify checked out LFS pointer stubs for audio. Recovery was: `git lfs push --all origin`, confirm `GIT_LFS_ENABLED=true`, add `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4`, and trigger a new production deploy. The targeted guard is now `13_Faculty_Resources/_automation/site_build/check_lfs_media.py`, and the operational checklist is `13_Faculty_Resources/_automation/site_build/NETLIFY_LFS_RUNBOOK.md`.
**Quota note:** the current tree has roughly 433 MB of LFS-tracked media, which fits GitHub LFS free storage (1 GB), but LFS **bandwidth** is 1 GB/mo free and full CI checkouts can pull those objects → budget a **$5/mo 50 GB data pack** if you build often. Also confirm Netlify builds actually check out LFS objects (Netlify supports Git LFS; verify `/audio`, `/audio_oe`, and video URLs are populated on the deployed site).

### 6a. If LFS bandwidth becomes a real problem — escape hatch (NOT needed yet)
**Decision recorded 2026-07-02; do not act unless GitHub LFS bandwidth actually bites.** First just watch GitHub → repo → Settings → "Git LFS" usage for a couple of weeks. Netlify likely caches LFS objects across builds, so the 1 GB/mo bandwidth is mainly consumed when the audio *changes*, not every build. If it stays low, leave everything as-is.

If it does creep toward the limit, in order of preference:
1. **Zero-effort stopgap:** buy the **$5/mo GitHub 50 GB LFS data pack**. No re-architecture.
2. **Real fix — move audio off git to object storage + CDN, reference by absolute URL.** Removes audio from the repo entirely: no LFS, no build-time checkout, no GitHub LFS bandwidth meter. The build scripts would emit `<audio src="https://cdn/…/xyz.m4a">` instead of copying local files into `_build/*/audio*`.
   - **Cloudflare R2** (recommended): S3-compatible, **zero egress fees**, cheap storage, public bucket + custom domain. Best fit for "serve static audio forever, cheaply."
   - **Backblaze B2**: similar; free egress via the Cloudflare CDN alliance.
   - **AWS S3 + CloudFront**: works but egress costs + more setup.
   - **Netlify Blobs**: Netlify-native but aimed at runtime KV data; serving static media wants a function — more friction than R2 for plain assets.
   - Migration touch-points: (a) upload the 100 `.m4a` to the bucket; (b) in `build_deploy.py`/`resident_section.py`, swap the local audio-copy step for URL rewriting; (c) keep the manual `netlify deploy --dir` flow working during transition; (d) then un-track audio from LFS. Pull current R2 + Netlify docs before writing any of it.
3. **Do NOT** use a database (e.g. Netlify's Neon/Postgres extension) for this — it's for relational data, not media blobs; it trades the LFS bandwidth cap for function compute + egress + latency and is strictly worse.

**Sequencing:** linking the repos (§3) is harmless, but **don't treat build-on-push as your deploy mechanism until the first CI build is verified to include audio.** Until then, keep the manual `netlify deploy --dir` flow (§5), which includes audio from disk. If a first CI build ships audio-less, roll back with one manual deploy.

## 7. Build-ignore hook — skip redundant doc-only rebuilds (2026-07-02)
Both sites build-on-push, so a commit that changes only planning docs would still trigger two full rebuilds + redeploys. `netlify.toml` registers a shared build-ignore hook to skip those:

> ⚠️ **What it does and doesn't save.** It saves **build minutes** and avoids a **redundant production redeploy**. It does **NOT** save Git-LFS bandwidth: Netlify fetches LFS objects during the repo *clone*, which runs **before** the ignore hook (netlify.toml is read post-clone), so a skipped build has already paid the transfer. Curb LFS bandwidth via §6 (batch pushes / data pack), not this hook.

- **Script:** `13_Faculty_Resources/_automation/site_build/netlify-ignore.sh`
- **Rule:** SKIP the build only when **every** changed file is either a Markdown doc under
  `13_Faculty_Resources/_automation/` or any file under
  `13_Faculty_Resources/_automation/surveillance/`. The surveillance tree contains operational
  code, configuration, and generated audit state that the learner-site builders do not read. Any
  other change — content, tools, build scripts, audio, or non-surveillance config — builds normally.
  The hook fails safe toward BUILD on an empty cache, unreadable diff, or no changes.
- **Exit convention:** `0` = Netlify cancels the build; non-zero = build proceeds.
- **Gotcha baked in:** do not use `grep -q` on a `git diff` pipe — its early exit SIGPIPEs `git diff` and, under `pipefail`, flips the pipeline exit code. The script captures output and tests emptiness instead.

To broaden what's skippable, widen the ignore pattern in the script (e.g. add other non-deployed doc paths). To verify after any change: `CACHED_COMMIT_REF=<old> COMMIT_REF=<new> bash …/netlify-ignore.sh; echo $?`.

**Post-first-push check:** confirm the minimal `netlify.toml` didn't disturb either site's UI build command / publish dir (it shouldn't — it sets only `ignore`). If a deploy ever uses the wrong publish dir, delete `netlify.toml` and move the ignore command into each site's UI ("Ignore builds").

## 8. Scheduled operations and hosted evidence (2026-07-28)

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
  Surveillance artifacts may include bounded authoritative-source excerpts, but neither class of
  artifact may contain credentials, learner identity, patient data, or PHI.
- GitHub can compare the red-team receipt with the canonical SP pack in git. Only the external,
  authenticated Netlify deadman can separately compare it with the latest hosted SP deploy.

---
*Prepared 2026-07-01; deployment migration completed 2026-07-02; scheduled-operations handoff linked
2026-07-28. Baseline commit `a7793cc`. Manual deploys can remain retired; follow the maintenance
runbook and watch Git-LFS bandwidth per §6/§7.*
