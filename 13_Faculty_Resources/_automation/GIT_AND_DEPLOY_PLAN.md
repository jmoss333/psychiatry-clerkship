# Git + Netlify-from-Git Plan — Psychiatry Clerkship Library

**Owner:** Joshua Moss, MD · **Created:** 2026-07-01
**Goal:** put the library under version control and move both sites to *deploy-on-push* so concurrent editing (multiple chats/sessions) can never again silently clobber the live sites.

---

## 0. What's already done (2026-07-01)
- **Repo initialized** at `~/Psychiatry-Clerkship-Library` with a clean baseline commit `a7793cc` (361 files, ~12 MB). `git fsck` clean, working tree clean.
- **`.gitignore`** added — versions the curated *text* source (markdown, HTML, build scripts, JSON config) and excludes large binaries (audio/video/decks/PDFs under `**/_source/` + download folders) and generated build output. Ignored files still live on disk; use Git LFS later if you want them versioned.
- **Build scripts made session-portable** (`_automation/site_build/build_deploy.py`, `resident_section.py`): paths now derive from the script location and honor `OUT_DIR` / `MS3_DIR` env vars — exactly what CI needs.

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

**Both sites**
- Build image includes Python 3 by default; if needed set env `PYTHON_VERSION=3.11`. The scripts use only the standard library (no `pip install`).
- Confirm each site's **publish dir** and **build command** in its own settings (one repo can back multiple sites with different commands).
- Optional: keep `netlify.toml` per site out of the repo, or use Netlify UI settings, since the two sites need different commands from the same repo.

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
> Note: the deployed sites currently carry ~10 pages beyond this build script's list (added by a parallel session: t_sleep, t_somatic, ect_neuromodulation, etc.). Reconcile those into the build scripts' `md[]`/nav before a clean rebuild, or a from-scratch build will omit them. (A `git`-tracked source makes this reconciliation a normal diff.)

## 6. ⚠️ AUDIO — handle before relying on build-on-push
The sites embed **100 audio files (~328 MB)** — landmark-trial overviews (`07_Evidence_and_Reading/Landmark_Trials/audio/`) and NotebookLM briefs (`…/openevidence_notebooklm_brief_audio_2026-06-30/`). These are currently **gitignored**, so a git-CI build would deploy both sites **without audio** (silent regression). The manual `netlify deploy --dir` flow doesn't hit this because it copies audio from local disk.

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

---
*Prepared 2026-07-01; audio/LFS section added same day. Baseline commit `a7793cc`. Build scripts are session-portable and CI-ready; audio must be LFS-tracked before deploy-on-push.*
