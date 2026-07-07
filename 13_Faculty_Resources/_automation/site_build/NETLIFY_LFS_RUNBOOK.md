# Netlify + Git LFS Deploy Runbook

**Purpose:** keep the MS3 and resident Netlify sites from publishing Git LFS pointer stubs instead of real audio/video files.

## Site Settings

| Site | Netlify site id | Build command | Publish directory |
| --- | --- | --- | --- |
| `une-ms3-psychiatry` | `94717a39-679b-4c78-ae02-7b19e809592e` | `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` | `_build/ms3` |
| `mmc-psychiatry-residents-sanford` | `af64d5d4-e0b5-4f03-9857-be40e3b48329` | `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` | `_build/res` |

Required Netlify environment variables for both sites:

| Key | Value | Scope | Why |
| --- | --- | --- | --- |
| `GIT_LFS_ENABLED` | `true` | builds | Tells Netlify to fetch real Git LFS objects during checkout. |
| `GIT_LFS_FETCH_INCLUDE` | `*.m4a,*.mp4` | builds | Fetches the media types this repo tracks in LFS. |

Keep build command, publish directory, and LFS env vars in the Netlify UI. Do not move these into `netlify.toml`; two sites share one repo with different build outputs, and LFS checkout happens before `netlify.toml` can help.

## Incident Pattern

Symptom: Netlify build fails with many errors like:

```text
Git-LFS pointer stub shipped (not real bytes): ./audio/...
```

Cause: Netlify received the small LFS pointer text files instead of the real audio/video bytes.

## Recovery

From a local clone with GitHub LFS permissions:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library
git lfs install
git lfs pull
git lfs fsck
git lfs push --all origin
```

Then in Netlify:

1. Confirm the two required environment variables above.
2. Trigger a production deploy from `main`.
3. If the build still sees stubs, retry with cleared build cache.

## Local Verification

Before pushing deploy-sensitive changes:

```bash
python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py _build/ms3
python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py _build/res
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

The dedicated LFS preflight is intentionally stricter in local/production builds and softer in GitHub Actions/deploy-preview contexts, where LFS bandwidth may be intentionally skipped.

## Known Good State

On 2026-07-07, MS3 production was recovered after:

- `git lfs push --all origin` uploaded `106/106` LFS objects.
- `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` was added to the MS3 Netlify project.
- A new `main` deploy published Netlify deploy `6a4d3fff50019b000854a8f3`.
- The resident site was also configured with `GIT_LFS_ENABLED=true` and `GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4` for builds.
