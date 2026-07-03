# Git + Netlify-from-Git Plan — Psychiatry Clerkship Library

**Owner:** Joshua Moss, MD · **Created:** 2026-07-01 · **Updated:** 2026-07-02
**Goal:** put the library under version control and move both sites to *deploy-on-push* so concurrent editing (multiple chats/sessions) can never again silently clobber the live sites.

> **Status (2026-07-02): build-on-push is LIVE and verified on both sites.** §1 cleanup ✅ · §2 pushed to `jmoss333/psychiatry-clerkship` (private) ✅ · §6 audio migrated to Git LFS (100 files) ✅ · resident source/deploy drift reconciled ✅ · Netlify LFS env vars set on both sites ✅ · both sites git-linked; latest published deploy = commit `1b1bf51` on `main`, `state: ready` ✅ · audio verified live (HTTP 200, `audio/mp4`, 2.7–3.2 MB real files in both `/audio` and `/audio_oe` on both sites — no pointer stubs) ✅ · build-ignore hook added to skip doc-only rebuilds (§7) ✅. **The manual `netlify deploy --dir` flow can be retired.** Ongoing watch-item: Git-LFS bandwidth (see §6).

---

## 0. What's already done (2026-07-01)
- **Repo initialized** at `~/Psychiatry-Clerkship-Library` with a clean baseline commit `a7793cc` (361 files, ~12 MB). `git fsck` clean, working tree clean.
- **`.gitignore`** added — versions the curated *text* source (markdown, HTML, build scripts, JSON config) and excludes large binaries (audio/video/decks/PDFs under `**/_source/` + download folders) and generated build output. Ignored files still live on disk; use Git LFS later if you want them versioned.
- **Build scripts made session-portable** (`_automation/site_build/build_deploy.py`, `resident_section.py`): paths now derive from the script location and honor `OUT_DIR` / `MS3_DIR` env vars — exactly what CI needs.

## 0b. Completed 2026-07-02
- **Pushed to GitHub** — private repo `jmoss333/psychiatry-clerkship`, `main` in sync.
- **Audio → Git LFS** — 100 `.m4a` (~344 MB) tracked and pushed; `git lfs fsck` OK. `.gitattributes` covers `*.mp3/*.m4a/*.wav`; those types un-ignored in `.gitignore`.
- **Resident source/deploy drift reconciled** — 4 tools that were hand-copied into the deploy dir (`orientation-video`, `rp-agitation`, `rp-brief-psych`, `rp-canon-quiz`) are now built from git-tracked `_prototypes/` via `resident_section.py`, with faithful nav placement + search keywords. A fresh resident build is now **byte-identical** to the live site (was missing these 4 before).
- **Netlify LFS env vars pre-set** on both sites via CLI: `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a` (all contexts). Inert until each site is git-linked.
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
- ⚠️ **Git LFS must be enabled or the audio deploys as pointer stubs.** Set `GIT_LFS_ENABLED=true` (already done 2026-07-02, plus `GIT_LFS_FETCH_INCLUDE=*.m4a`). **This must live in the Netlify UI env vars, NOT `netlify.toml`** — `netlify.toml` is read *after* the repo is cloned, too late to affect the LFS checkout. This is why we don't commit a `netlify.toml`.
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

## 6. ✅ AUDIO — migrated to Git LFS (2026-07-02)
**Done:** the **100 `.m4a` files (~344 MB)** — landmark-trial overviews (`07_Evidence_and_Reading/Landmark_Trials/audio/`) and NotebookLM briefs (`…/openevidence_notebooklm_brief_audio_2026-06-30/`) — are now Git LFS-tracked and pushed (`git lfs fsck` OK), and both Netlify sites have `GIT_LFS_ENABLED=true`. A local build confirms all 100 files land in both `_build/ms3` and `_build/res`. **Still verify empirically:** after the first CI build, confirm audio URLs return a real multi-MB file (HTTP 200, `Content-Type: audio/mp4`), not a ~130-byte pointer stub — see §3 caution. Historical context (why this mattered) below.

<sub>Originally these were **gitignored**, so a git-CI build would have deployed both sites **without audio** (silent regression); the manual `netlify deploy --dir` flow didn't hit this because it copies audio from local disk. That risk is closed once the empirical check passes.</sub>

**Fix — track the audio with Git LFS** (`.gitattributes` already added for `*.mp3/*.m4a/*.wav`). Run natively:
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
**Quota note:** 328 MB fits GitHub LFS free storage (1 GB), but LFS **bandwidth** is 1 GB/mo free and each full CI build pulls the objects (~328 MB) → budget a **$5/mo 50 GB data pack** if you build often. Also confirm the **first Netlify build actually checks out LFS objects** (Netlify supports Git LFS; verify `/audio` and `/audio_oe` are populated on the deployed site).

**Sequencing:** linking the repos (§3) is harmless, but **don't treat build-on-push as your deploy mechanism until the first CI build is verified to include audio.** Until then, keep the manual `netlify deploy --dir` flow (§5), which includes audio from disk. If a first CI build ships audio-less, roll back with one manual deploy.

## 7. Build-ignore hook — protect Git-LFS bandwidth (2026-07-02)
Now that both sites build-on-push and each build re-fetches the LFS audio, **every push costs ~688 MB of LFS bandwidth** (2 sites × ~344 MB) against GitHub's **1 GB/mo free** tier. To avoid burning that on commits that don't change the sites, `netlify.toml` registers a shared build-ignore hook:

- **Script:** `13_Faculty_Resources/_automation/site_build/netlify-ignore.sh`
- **Rule:** SKIP the build only when **every** changed file is a Markdown doc under `13_Faculty_Resources/_automation/` (planning/status docs no build script reads). Any other change — content, tools, build scripts, audio, config — builds normally. Fails safe toward BUILD on empty cache, unreadable diff, or no changes.
- **Exit convention:** `0` = Netlify cancels the build; non-zero = build proceeds.
- **Gotcha baked in:** do not use `grep -q` on a `git diff` pipe — its early exit SIGPIPEs `git diff` and, under `pipefail`, flips the pipeline exit code. The script captures output and tests emptiness instead.

To broaden what's skippable, widen the ignore pattern in the script (e.g. add other non-deployed doc paths). To verify after any change: `CACHED_COMMIT_REF=<old> COMMIT_REF=<new> bash …/netlify-ignore.sh; echo $?`.

**Post-first-push check:** confirm the minimal `netlify.toml` didn't disturb either site's UI build command / publish dir (it shouldn't — it sets only `ignore`). If a deploy ever uses the wrong publish dir, delete `netlify.toml` and move the ignore command into each site's UI ("Ignore builds").

---
*Prepared 2026-07-01; updated 2026-07-02 (repo pushed; audio LFS-migrated; resident build reconciled; both sites git-linked, deploying on push, audio verified live; build-ignore hook added). Baseline commit `a7793cc`. Migration complete — manual deploys can be retired; watch Git-LFS bandwidth per §6/§7.*
