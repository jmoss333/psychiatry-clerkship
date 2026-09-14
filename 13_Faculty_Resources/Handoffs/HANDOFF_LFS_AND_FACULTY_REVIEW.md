# Handoff: Fix LFS Media Gate & Faculty Review Queue

**Prepared for:** Claude Code / next session  
**Date:** 2026-09-14  
**Status:** PR #626 created; LFS blocker identified; ready to unblock & continue  
**Branch:** `claude/repo-issues-review-g3pqoq` (commit f2c048e)

---

## Current State

### ✅ Completed (This Session)
- Dependencies installed (`jsonschema`, git hooks)
- ISBN derivation task: **51/51 books** have ISBN-13s derived from ISBN-10
- PR #626 created, assessed, and documented with standing-down comment
- Root cause analysis: LFS media pointer stub blocking both site builds

### ❌ Blocking Issue (Environmental)
**File:** `_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4`  
**Problem:** Committed as Git LFS pointer stub (~133 B) instead of actual media (35.5 MB)  
**Error message:**
```
BUILD ABORTED — MS3 Compass: MS3 Compass required files are invalid:
_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4
```

**Reference:** `13_Faculty_Resources/Handoffs/HANDOFF_orientation-video-ms3.md` (lines 75–81)

---

## Task 1: Fix the LFS Gate (Unblock PR #626)

### What Needs to Happen

The orientation video MP4 file must be replaced with actual bytes (not a pointer stub). This is a data blocker, not a code issue.

### Steps

1. **Obtain the actual media file**
   - File: `Inpatient_Psych_Orientation.mp4` (~35.5 MB)
   - Location: Should exist at `_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4`
   - Current state: Git LFS pointer stub (check with: `cat _prototypes/orientation-video/Inpatient_Psych_Orientation.mp4 | head -c 200`)
   - Expected: Binary MP4 data

2. **Replace the pointer with actual file**
   ```bash
   # Option A: If you have the file locally
   git lfs install  # Ensure LFS is installed locally
   # Then replace the file with actual bytes
   git add _prototypes/orientation-video/Inpatient_Psych_Orientation.mp4
   
   # Option B: If the file is in storage/S3/CDN
   # Download it and place at the path above, then:
   git add _prototypes/orientation-video/Inpatient_Psych_Orientation.mp4
   ```

3. **Verify LFS tracking**
   ```bash
   git lfs ls-files  # Should show the .mp4 as tracked
   ```

4. **Push and verify CI**
   ```bash
   git push -u origin claude/repo-issues-review-g3pqoq
   ```
   - Watch PR #626 CI checks
   - Expected: `build-test-validate` should pass; Netlify previews should deploy successfully
   - Confirmation: When the MS3 and resident site Netlify checks turn ✅

### Success Criteria
- [ ] `build-test-validate` check passes on PR #626
- [ ] Both MS3 and resident site Netlify previews are green
- [ ] No pointer stubs remain in git history for media files

---

## Task 2: Faculty Review Queue (After LFS is Fixed)

Once PR #626 CI is green, merge it and move to the faculty review work.

### Context

The work queue shows **23 pages pending clinical review** (out of 126 shipped pages). This is autonomous work: the `faculty-console` (clerkship-faculty-attest site) reads `reviewed.json` and shows pending items to faculty.

### What Faculty Review Means

1. **Attestation model:** Each shipped page must have a `reviewed.json` entry with `"status": "reviewed"` and a reviewer's name + date
2. **Pending pages:** Shipped pages with status `"pending"` (or missing entirely from `reviewed.json`) appear in the faculty console's "Needs review" queue
3. **Your role:** Mark pages `"status": "reviewed"` once clinical accuracy is confirmed (faculty review happens separately; you're recording that it's been done)

### How to Access the Queue

**Faculty console:** https://clerkship-faculty-attest.netlify.app (dev preview: wait for PR #626 to merge)

**Local queue inspection:**
```bash
python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check-build
# Shows all 126 shipped pages + review status
```

**Review ledger:**
```bash
# File: 13_Faculty_Resources/reviewed.json
# Currently: ~103 reviewed, 23 pending
```

### Typical Faculty Review Entry

```json
"page-slug": {
  "status": "reviewed",
  "at": "2026-09-14",
  "by": "Joshua Moss, MD"
}
```

### Next Steps for Faculty Review

1. **Merge PR #626** (once LFS is fixed and CI is green)
2. **Identify priority pages** — work backward from `reviewed.json` to find the 23 pending entries
3. **Verify clinical accuracy** — spot-check each pending page's content
4. **Update `reviewed.json`** — move pages from `"pending"` to `"reviewed"` as they're confirmed
5. **Commit and push** — each PR should represent a coherent review batch (e.g., "Evidence section reviewed", "Tools reviewed")
6. **Watch the faculty console** — verified pages should disappear from the "Needs review" queue

### Coverage Note

While faculty review is in progress, the egress probe shows:
- ✅ Package index reachable (npm, pip)
- ❌ DOI resolution blocked (egress restriction)
- ❌ Podcast backfill blocked (egress restriction)

Faculty review does not depend on external egress, so it's the highest-value work available right now.

---

## Files to Know

- **PR #626:** https://github.com/jmoss333/psychiatry-clerkship/pull/626
- **Standing-down comment:** Explains the LFS blocker (posted in PR)
- **Handoff reference:** `13_Faculty_Resources/Handoffs/HANDOFF_orientation-video-ms3.md` (lines 75–81)
- **Audit ledger:** `13_Faculty_Resources/reviewed.json` (review status + attestation)
- **Faculty console:** `faculty-console/content-universe.mjs` (reads `shipped_pages.json` + `reviewed.json`)

---

## Quick Checklist

**Before Starting Task 1:**
- [ ] Understand the LFS media blocker (not a code issue; data is missing)
- [ ] Know where to find the actual MP4 file
- [ ] Review lines 75–81 of the handoff for LFS setup

**Before Starting Task 2:**
- [ ] PR #626 is merged
- [ ] `build-test-validate` is green
- [ ] Both Netlify deploy previews are live

---

## Egress Status (for Reference)

```
✅ Open:  github-api, package-index, github-git, npm
❌ Blocked: doi, apify, netlify-sites, netlify-api, pubmed-direct, podcast, instrument-custodians
```

Faculty review does not require any blocked hosts — it's pure local work.

---

**Questions?** Check CLAUDE.md §6 (LFS), the handoff file, or the standing-down comment on PR #626.
