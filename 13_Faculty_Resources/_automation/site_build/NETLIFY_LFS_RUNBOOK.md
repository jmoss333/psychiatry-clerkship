# Netlify + Git LFS Deploy Runbook

**Purpose:** keep the MS3 and resident Netlify sites from publishing Git LFS pointer stubs instead of real audio/video files.

## Site Settings

| Site | Netlify site id | Build command | Publish directory |
| --- | --- | --- | --- |
| `une-ms3-psychiatry` | `94717a39-679b-4c78-ae02-7b19e809592e` | `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` | `_build/ms3` |
| `mmc-psychiatry-residents-sanford` | `af64d5d4-e0b5-4f03-9857-be40e3b48329` | `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` | `_build/res` |

### How media reach the build — two paths

| Path | Who fetches | GitHub LFS bandwidth | Status |
| --- | --- | --- | --- |
| **Cached pull (2026-09-02)** | `lfs_pull_cached.sh`, run by `build_and_check.sh` before the site build, from a per-site object store under `$NETLIFY_CACHE_DIR` that Netlify persists between builds | ~0 MB steady state; one full fetch (~455 MB) after a cache clear | Code shipped, **never yet engaged** — see the measurement below |
| **Clone-time fetch (what actually runs)** | Netlify's own checkout | ~455 MB per **fresh clone**; **~0 MB** on a cache-reusing build | Contributed to Incident pattern 2 |

> **Measured 2026-09-14 — removing the env vars did not change either number.**
> `GIT_LFS_ENABLED` and `GIT_LFS_FETCH_INCLUDE` were deleted from both sites and both
> rebuilt clean, and every build since still logs `lfs-cache: … already real bytes ->
> nothing to do`. Netlify's build image ships git-lfs, so its checkout smudges LFS
> objects **whether or not the env var is set**; the cached pull only acts on pointer
> stubs, so it stays idle. Checkout duration, same site, same morning
> (`Preparing Git Reference` → next line):
>
> | Build | Gap | Downloaded |
> | --- | --- | --- |
> | fresh clone (cache cleared) | **69 s** | the full ~455 MB |
> | cache-reusing build | **2 s** | nothing |
>
> So the cost is per **fresh clone**, not per build: ordinary cached production builds
> finish in 41–54 s and fetch nothing. Steady state was already ~0 MB before the change.
> Corroboration: 76 production deploys across both sites between 2026-09-01 and 09-14
> would have been ~33 GB against a 10 GB/month quota had every build re-fetched, yet
> deploys stayed green throughout.
>
> **Do not repeat the switch-over expecting a saving.** Making the cached pull real
> means stopping Netlify's checkout from materialising the objects in the first place —
> which these env vars do not control. Until someone establishes what does, this
> section documents a path that is shipped but inert.

Legacy Netlify environment variables — **already removed from both sites on 2026-09-14**
(kept here because the names still appear in build logs and older deploys):

| Key | Value | Scope | What it does |
| --- | --- | --- | --- |
| `GIT_LFS_ENABLED` | `true` | builds | Netlify fetches every LFS object during checkout, before the build command runs. |
| `GIT_LFS_FETCH_INCLUDE` | `*.m4a,*.mp4` | builds | Narrows that clone-time fetch. `lfs_pull_cached.sh` honours it too if left set. |

Whenever the checkout has already materialised the objects — which, as measured above, it does regardless of these env vars — `lfs_pull_cached.sh` finds real bytes in the tree, does nothing, and says so. Nothing breaks, and nothing is saved. The cached pull runs only in the `production` and `branch-deploy` contexts by default; deploy previews keep shipping pointer stubs behind the soft gate exactly as before, so a new PR never costs LFS bandwidth. To give previews real audio too, set `LFS_CACHE_CONTEXTS=production,branch-deploy,deploy-preview` on the site (one full fetch per site cache, then ~0 — provided Netlify shares the build cache across branches, which is worth confirming from the `lfs-cache:` meter line before leaving it on). Keep build command and publish directory in the Netlify UI. Do not move any of this into `netlify.toml`; two sites share one repo with different build outputs, and a clone-time LFS fetch happens before `netlify.toml` is read.

**Switch-over — performed 2026-09-14, and it did not work. Do not run it again.**

Kept as a record of what was tried, and of what the success criteria would be if someone
finds the real lever:

1. ~~Delete `GIT_LFS_ENABLED` and `GIT_LFS_FETCH_INCLUDE`.~~ Done on both sites. Safe but
   inert. (Dropping the `_FETCH_INCLUDE` filter widened nothing: all 106 LFS files are
   already `.m4a`/`.mp4`, 455 MB either way. It *would* matter if anyone adds a `.mp3` or
   `.wav` — `.gitattributes` tracks both.)
2. ~~Clear cache and deploy site.~~ Done per site. Note this **forces a fresh clone**, so it
   is the expensive case, not the cheap one.
3. Expected `lfs-cache: 106 pointer stub(s) … -> pulling via cache`. **Got** `all 106
   LFS-tracked file(s) are already real bytes -> nothing to do`, on every build since.
4. Expected `~0 MB downloaded from GitHub this build` as an ongoing meter. That line never
   appears, because the cache never runs. Read the checkout gap instead: ~2 s means the
   cached repo was reused and nothing was downloaded; ~70 s means a fresh clone paid ~455 MB.
5. Play one landmark-trial audio file on the live site (end-to-start seek) per the deploy
   skill. Still worth doing after any media change — both sites serve real audio today.

**The open question** for anyone picking this up: what makes Netlify's checkout materialise
LFS objects here, given it is not `GIT_LFS_ENABLED`? Until that is answered, the cached-pull
code is shipped and idle, and the cheapest real lever on bandwidth is simply **clearing the
build cache less often**.

## Incident pattern 1 — objects missing on the server

Symptom: Netlify build fails with many errors like:

```text
Git-LFS pointer stub shipped (not real bytes): ./audio/...
```

Cause: Netlify received the small LFS pointer text files instead of the real audio/video bytes, because the objects were never pushed (`git lfs push --all origin` fixes it — see Recovery).

## Incident pattern 2 — GitHub LFS bandwidth quota exhausted (2026-08-30)

Symptom: **every production deploy of both sites fails** at `lfs-media: ERROR — 105 Git LFS pointer stub(s)` (or, on the cached path, at `lfs-cache: ERROR git lfs pull failed … over its data quota`), while deploy previews stay green (they never fetch real bytes) and GitHub Actions CI stays green (`lfs: false` checkout). Nothing in the repo changed. GitHub has emailed the account owner *"You have used 90% / 100% of the Git LFS bandwidth included for the jmoss333 account"*.

Cause: GitHub meters LFS **bandwidth** per account — 10 GB/month on the current plan, reset on the 1st. Each **fresh clone** re-downloads ~455 MB, so roughly 11 of them spend the month's quota; on 2026-08-30 the 90% and 100% notices arrived 40 minutes apart and deploys failed until the 2026-09-01 reset. Nothing on the Netlify side is wrong; retrying, clearing cache, or `git lfs push` does not help.

> Corrected 2026-09-14: this used to read "each production build of each site re-downloads
> ~433 MB". It does not — a cache-reusing build downloads nothing (2 s checkout, measured
> above), and most builds reuse the cache. Note the irony for the remedy below: **clearing
> the cache forces a fresh clone**, so "clear cache and deploy" is itself one of the ~11,
> and repeating it is a far likelier way to exhaust the quota than merging is.

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
