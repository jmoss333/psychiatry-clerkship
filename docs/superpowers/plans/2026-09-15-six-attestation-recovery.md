# Recovery note: six saved faculty attestations stranded on `attest/pending`

**Status:** READ-ONLY INSPECTION. Nothing was reopened, merged, or altered.
**Inspected:** 2026-09-15. **Raised by:** faculty attestation review, 2026-09-14 (shared issue 1).
**Action required:** your approval, then one merge. See "The concrete recovery action".

This is a separate matter from the clinical corrections in this branch, and it was kept
separate deliberately: **none of the six pages below is a page this branch edits.** The
branch touches the 13 pending clinical pages; the six here are different files. There is no
interaction between the two, and the correction work did not wait on this.

## Current state (re-measured today — the review's figures had already moved)

| Fact | At review (2026-09-14) | Now (2026-09-15) |
|---|---|---|
| `origin/main` | `5b60d9c` | **`a898778`** |
| `origin/attest/pending` head | `83e7d9b` | **`83e7d9b` — unchanged** |
| Branch behind main | 119 commits | **125 commits** |
| Branch ahead of main | 6 commits | **6 commits** |
| Merge base | — | `1fefebd` |
| Open review request | none | **still none** |

The pending head has not moved, so nothing new has been saved to it since the review. Main
advanced by 6 commits, which is why the "behind" count grew. Re-measure again before acting:
this repository's main moves fast.

## The six attestations

All six commits are **status-only**. Together they change exactly one file,
`13_Faculty_Resources/reviewed.json` (18 insertions, 24 deletions), and nothing else — no
curriculum content, no build inputs, no code.

| Commit | Date | Slug | Status on branch | Status on main now |
|---|---|---|---|---|
| `54648ac` | 2026-09-08 | `cotw_20260720_bipolar_res.md` | reviewed | pending |
| `c8d3ca6` | 2026-09-08 | `cotw_20260827_bpd_ms3.md` | reviewed | pending |
| `d9d67b5` | 2026-09-11 | `cotw_20260827_bpd_res.md` | reviewed | pending |
| `b6053bb` | 2026-09-11 | `cotw_20260831_catatonia_ms3.md` | reviewed | pending |
| `82f7f2c` | 2026-09-11 | `cotw_20260831_catatonia_res.md` | reviewed | pending |
| `83e7d9b` | 2026-09-14 | `cotw_20260907_fep_ms3.md` | reviewed | pending |

All six are attributed to **Joshua Moss, MD**. This note records that attribution as it
stands in the ledger; it does not verify, vouch for, or re-affirm any of these reviews, and
no attestation has been submitted, confirmed, or created here.

Note `cotw_20260907_fep_ms3.md` (the **MS3** first-episode psychosis page) is one of the six.
This branch corrects `cotw_20260907_fep_res.md`, the **resident** twin. They are separate
source files and separate ledger rows, so recovering the MS3 attestation does not carry any
approval onto the resident page this branch changed. Worth stating because the two pages
share a topic, a date and a registry week, and the twin relationship is exactly the kind of
thing that gets conflated.

## Did their source revisions change?

**No. All six source files are byte-identical between the merge base (`1fefebd`) and current
`origin/main` (`a898778`)** — verified by comparing git blob hashes for each source path as
resolved through `shipped_pages.json`:

| Slug | Source path | Blob base → main |
|---|---|---|
| `cotw_20260720_bipolar_res.md` | `…/2026-07-20_bipolar-mania_Resident.md` | identical |
| `cotw_20260827_bpd_ms3.md` | `…/2026-08-27_borderline-personality-disorder_MS3.md` | identical |
| `cotw_20260827_bpd_res.md` | `…/2026-08-27_borderline-personality-disorder_Resident.md` | identical |
| `cotw_20260831_catatonia_ms3.md` | `…/2026-08-31_catatonia-recognition-workup-treatment_MS3.md` | identical |
| `cotw_20260831_catatonia_res.md` | `…/2026-08-31_catatonia-recognition-workup-treatment_Resident.md` | identical |
| `cotw_20260907_fep_ms3.md` | `…/2026-09-07_first-episode-psychosis_MS3.md` | identical |

**What that does and does not establish.** It establishes that the markdown source each
attestation refers to has not been edited since the branch diverged, so recovering these
records would not carry an approval onto changed source. It does **not** establish that the
rendered page the reviewer actually saw is byte-identical to what would deploy today: these
pages are assembled at build time, and 125 commits of build, theme, template and injection
changes have landed on main since the merge base. It also does not establish a successful
merge, passing checks, or anything about the clinical accuracy of the six pages.

If the rendered-artifact question matters to you, the check is to build both sites at
`a898778` and diff the six rendered pages against a build at `1fefebd`. That was not done
here — it is a real question, not a formality, given how much build machinery moved.

## Will a merge clobber newer ledger entries on main?

**No, provided it is a merge and not a force-push or a branch overwrite.** Two slugs have
changed in `reviewed.json` on main since the merge base, and **neither is one of the six** —
the two change sets are disjoint, so a merge commit preserves both sides. This was the
specific risk worth checking and it is clear.

## Current PR state

There is **no open pull request** for `attest/pending`. The two PRs that ever targeted this
branch are both closed:

- **#568** — "attest: land 5 faculty attestations from 2026-09-04 (rolling review request)" — **MERGED** 2026-09-07
- **#415** — "unstrand attest/pending: land the three stranded faculty attestations (2026-08-23)" — **MERGED** 2026-08-28

The pattern is the point: **this is the third time this branch has stranded.** #415 unstranded
three attestations in August; #568 landed five in September; six more have accumulated since.
Recovering these six fixes the instance, not the cause. The cause is that the console saves
to a long-lived branch and nothing opens or reopens the review request when the previous one
merges, so saved attestations queue silently and the branch falls further behind main each
time. Worth a follow-up issue separate from this merge.

## Merge/check concerns

- **Branch protection requires up-to-date** (ruleset 21202405). At 125 commits behind, the
  branch will need updating before it can merge — `gh pr update-branch <n>` does this
  server-side without triggering the local pre-push hook.
- **Expect required checks to run** against a branch whose base is four-plus months of
  commits old. A red check here is more likely to be staleness than a real defect; refetch
  main and re-check before diagnosing. `bin/pr_preflight.py` answers both questions.
- **Use a merge commit**, per the faculty console's recovery workflow — not a squash, which
  would collapse six separately-dated attestation records into one.
- Concurrent merges on this repository have broken main before even when each PR was green.
  Baseline against clean main before blaming this branch.

## The concrete recovery action requiring approval

One action, needing your authorization (this session has none to push, open, reopen, or merge):

> **Open a review request from `attest/pending` to `main`, update the branch, and merge it
> with a merge commit** — restoring the six existing status records into `reviewed.json` on
> main. It adds no new attestations and no curriculum edits.

Prepared title and body, carried over from the 2026-09-14 review with the figures
re-measured today:

**Title:**
```
attest: recover six saved faculty attestations from September 8–14
```

**Body:**
```
Six faculty attestations are saved on `attest/pending` without an open review request. This
restores the review path for those existing records in `13_Faculty_Resources/reviewed.json`;
it adds no new clinical attestations and no curriculum edits.

The saved records cover resident bipolar mania, both borderline personality disorder pages,
both catatonia pages, and the MS3 first-episode psychosis page. All six commits are
status-only and together touch one file.

Verified 2026-09-15 against main `a898778` (merge base `1fefebd`):
- all six source files are byte-identical between the merge base and current main;
- the two reviewed.json slugs changed on main since the merge base are disjoint from these
  six, so a merge commit preserves both sides.

Not established by that check: the rendered artifacts originally reviewed (125 commits of
build changes have landed since the merge base), a successful merge, or passing checks.

Before merge: recheck current heads, diff, mergeability and required checks. Use a merge
commit, not a squash — squashing would collapse six separately-dated attestation records.
Confirm the refreshed console queue and the learner deployments afterward.
```

## Explicitly not done here

- No attestation submitted, confirmed, reopened, or altered.
- No review receipt created, and no confirmation checked on anyone's behalf.
- `attest/pending` not modified, not rebased, not pushed.
- The six ledger rows left exactly as they are on both branches.
- No content marked clinically approved or learner-ready.
