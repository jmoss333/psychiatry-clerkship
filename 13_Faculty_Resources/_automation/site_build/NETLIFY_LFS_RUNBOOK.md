# Netlify + Git LFS Deploy Runbook

**Purpose:** keep the MS3 and resident Netlify sites from publishing Git LFS pointer stubs instead of real audio/video files.

## Site Settings

| Site | Netlify site id | Build command | Publish directory |
| --- | --- | --- | --- |
| `une-ms3-psychiatry` | `94717a39-679b-4c78-ae02-7b19e809592e` | `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` | `_build/ms3` |
| `mmc-psychiatry-residents-sanford` | `af64d5d4-e0b5-4f03-9857-be40e3b48329` | `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` | `_build/res` |

### How media reach the build — two paths

| Path | Who fetches | GitHub LFS bandwidth per build | Status |
| --- | --- | --- | --- |
| **Cached pull (target, 2026-09-02)** | `lfs_pull_cached.sh`, run by `build_and_check.sh` before the site build, from a per-site object store under `$NETLIFY_CACHE_DIR` that Netlify persists between builds | ~0 MB steady state; one full fetch (~433 MB) after a cache clear | Code shipped; activates once the legacy env vars below are **removed** |
| **Legacy clone-time fetch** | Netlify's clone, because `GIT_LFS_ENABLED=true` is set on the site | ~433 MB on **every** production build of **each** site | Caused Incident pattern 2 |

Legacy Netlify environment variables (both sites) — **remove them** to switch a site to the cached path:

| Key | Value | Scope | What it does |
| --- | --- | --- | --- |
| `GIT_LFS_ENABLED` | `true` | builds | Netlify fetches every LFS object during checkout, before the build command runs. |
| `GIT_LFS_FETCH_INCLUDE` | `*.m4a,*.mp4` | builds | Narrows that clone-time fetch. `lfs_pull_cached.sh` honours it too if left set. |

While `GIT_LFS_ENABLED` is still set, `lfs_pull_cached.sh` finds real bytes already in the tree, does nothing, and prints a reminder — nothing breaks, but nothing is saved either. Keep build command and publish directory in the Netlify UI. Do not move any of this into `netlify.toml`; two sites share one repo with different build outputs, and a clone-time LFS fetch happens before `netlify.toml` is read.

**Switch-over (per site, Netlify UI → Site configuration → Environment variables):**

1. Delete `GIT_LFS_ENABLED` and `GIT_LFS_FETCH_INCLUDE`.
2. Deploys → Trigger deploy → **Clear cache and deploy site** (the first cached-path build must fetch everything once; ~433 MB).
3. Read the build log: expect `lfs-cache: 106 pointer stub(s) … -> pulling via cache`, then `lfs-cache: OK — pulled … ~4xx MB downloaded … store now 4xx MB`, then `lfs-media: OK`.
4. Merge or trigger any second deploy: expect `~0 MB downloaded from GitHub this build`. That line is the bandwidth meter from now on.
5. Play one landmark-trial audio file on the live site (end-to-start seek) per the deploy skill.

## Incident pattern 1 — objects missing on the server

Symptom: Netlify build fails with many errors like:

```text
Git-LFS pointer stub shipped (not real bytes): ./audio/...
```

Cause: Netlify received the small LFS pointer text files instead of the real audio/video bytes, because the objects were never pushed (`git lfs push --all origin` fixes it — see Recovery).

## Incident pattern 2 — GitHub LFS bandwidth quota exhausted (2026-08-30)

Symptom: **every production deploy of both sites fails** at `lfs-media: ERROR — 105 Git LFS pointer stub(s)` (or, on the cached path, at `lfs-cache: ERROR git lfs pull failed … over its data quota`), while deploy previews stay green (they never fetch real bytes) and GitHub Actions CI stays green (`lfs: false` checkout). Nothing in the repo changed. GitHub has emailed the account owner *"You have used 90% / 100% of the Git LFS bandwidth included for the jmoss333 account"*.

Cause: GitHub meters LFS **bandwidth** per account — 10 GB/month on the current plan, reset on the 1st. On the legacy path each production build of each site re-downloads ~433 MB, so ~11 merges to `main` spend the month's quota; on 2026-08-30 the 90% and 100% notices arrived 40 minutes apart and deploys failed until the 2026-09-01 reset. Nothing on the Netlify side is wrong; retrying, clearing cache, or `git lfs push` does not help.

Recovery, in order:

1. **Stop the bleed:** switch both sites to the cached-pull path (see Switch-over above). This is the fix.
2. **Need a deploy before the reset?** Buy a GitHub data pack (50 GB bandwidth + 50 GB storage per pack, github.com/settings/billing) — it applies immediately — or wait for the 1st. Nothing in the repo can route around a refused download.
3. Watch the meter: each build now logs `~N MB downloaded from GitHub this build`. Anything but `~0` outside a cache-clear or a media change is a regression.

## Recovery (pattern 1)

From a local clone with GitHub LFS permissions:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library
git lfs install
git lfs pull
git lfs fsck
git lfs push --all origin
```

Then in Netlify:

1. Confirm the site is on the cached-pull path (legacy env vars removed) — or, if still on the legacy path, that both legacy env vars are present.
2. Trigger a production deploy from `main`.
3. If the build still sees stubs, retry with cleared build cache (this also empties the LFS object store, so the next build fetches everything once).

## Local Verification

Before pushing deploy-sensitive changes:

```bash
python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py _build/ms3
python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py _build/res
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

The dedicated LFS preflight is intentionally stricter in local/production builds and softer in GitHub Actions/deploy-preview contexts, where LFS bandwidth may be intentionally skipped. `lfs_pull_cached.sh` is a no-op outside Netlify (and inside GitHub Actions), so local builds behave exactly as before; its behaviour is pinned by `tests/lfs-pull-cached.test.mjs` against a shimmed `git-lfs` so the suite never spends bandwidth.

## Known Good State

On 2026-07-07, MS3 production was recovered after:

- `git lfs push --all origin` uploaded `106/106` LFS objects.
- `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` was added to the MS3 Netlify project.
- A new `main` deploy published Netlify deploy `6a4d3fff50019b000854a8f3`.
- The resident site was also configured with `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` for builds.
