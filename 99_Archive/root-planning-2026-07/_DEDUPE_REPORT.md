# Dedupe Report — June 26, 2026

**Scope:** byte-identical (exact-hash) duplicates in the loose, unversioned file mirrors.
**Method:** every file re-verified identical to a surviving twin immediately before moving, then **moved (never deleted)** to a reversible quarantine with a full restore manifest.
**Result:** **420 files quarantined · ~993 MB reclaimed · 0 skipped · 0 data loss** (an identical copy of every quarantined file remains in place).

---

## What was done

- Quarantine: **`~/_Dedupe_Quarantine_2026-06-26/`** (original relative paths preserved inside).
- Restore manifest: `~/_Dedupe_Quarantine_2026-06-26/RESTORE_MANIFEST.csv` (420 rows: original path · quarantine path · kept canonical · sha256). A copy lives in `99_Archive/RESTORE_MANIFEST_dedupe-2026-06-26.csv`.
- One-command undo: `bash ~/_Dedupe_Quarantine_2026-06-26/RESTORE_ALL.sh` (moves every file back to its original path).
- Reversibility spot-checked on a random sample — all passed (quarantined copy present, original cleared, canonical twin intact, sha256 matches).

### Where the duplicates were (top buckets)
| Count | Location | Nature |
|---|---|---|
| 222 | `~/Clinical/Presentations:Meeting/…` | Recursive "Archived versions/…/Archived versions/" backup trees + duplicate MEDSTAFF DINNER folders |
| 63 | `~/Gen Psych Resources/PGY3 Psychotherapy Seminar/…` | Psychodynamic reading-list PDFs mirrored from the main reading list |
| 48 | `~/Clinical/BHU Annual Fund Brainstorm/…` | Duplicated brainstorm assets |
| 29 | `~/Clinical/ED-Psych-Capstone/…` | Mirror of the repo capstone package |
| 17 | `~/Clinical/reconnect-video-content/…` | Third copy of the RSS video scripts |
| 14 | `~/Clinical/Patient-Resources/New Education Library/…` | Mirror of repo `psychoed-library/` |
| 7 | `~/Gen Psych Resources/Psychodynamic Therapy Reading List/…` | Internal reading-list dups |
| 5 | `~/Media/NotebookLM-Audio/…` | Duplicate audio renders |
| ~15 | FT evidence repo · `~/Clinical/Teaching` · `~/Clinical/Manuals` | Misc mirrors |

**The headline:** the bulk of the clutter is a **`~/Clinical/` mirror** running parallel to the repo and iCloud, much of it recursive backup-of-backup folders. The repo and the curated library are unaffected.

---

## What was deliberately NOT touched

### Tier 1 — repo-internal exact duplicates (127 groups) → defer to a git-based pass
The git repo (`reconnect-psychiatry-system`) had 127 exact-dup groups. **✅ DONE via PR #1134** (Claude Code, 2026-06-26): the entire legacy `teaching/video-content/` directory (13 files — Scripts + QR + INDEX) was removed after re-verifying sha256 on the `origin/main` base; canonical homes are `teaching/video-scripts/` (scripts) and `teaching/video-qr-system/` (QR). Zero functional references remained (`media-mappings.json` already targeted `video-scripts/`); build unaffected. Reversible on the branch until merge.

**Correctly NOT collapsed** (directional test — referenced and/or intentionally distributed): `_site/**` build output · `**/slices/**` data distribution · `staging/**` + `*.SUPERSEDED.*` · `Raw_Records/*_all.csv` exports · `send-to-*/` external deliverables · per-package `tsconfig.json` · generated test artifacts.

**Flagged for decision (left in place):** `manuscript/book-chapters/` ↔ `psychoed-library/patient-journey/book-chapters-{1-5,6-10,16-20}.md` — byte-identical but **both locations are legitimately referenced** (manuscript = authoring source per Revision Tracker/Appendix J-K; patient-journey = the published patient-book reading path). Verdict: **keep both as intentional distribution**; the durable fix is to *generate* the patient-journey copies from the manuscript source (a build step), not delete them.

### Tier 2 — version supersessions (different bytes → your judgment, not auto-moved)
These are *not* byte-identical, so they were not in this pass. Recommendations only:
- **RSSM_Master_v10.docx** (in `~/Downloads` + `rssm-manual/`) → archive once **v11** confirmed canonical.
- **Relational Psychiatry Teaching Manual v1** → archive; keep **v2** + source MD.
- **~12 Family-Therapy deck versions** (Downloads / iCloud / Google Drive: REVAMP, REVAMP2, FINAL Animated, Psychiatrist-Edited, WITH_VIDEO_EMAIL, Blueprint, .key) → **pick one canonical** and I'll quarantine the rest. *Recommend the most recent Psychiatrist-Edited / FINAL-with-video lineage.*

---

## Net effect & next steps
- The loose-mirror clutter is collapsed; ~1 GB reclaimed; nothing lost or unrecoverable.
- **Your call on three things:** (1) green-light the repo-internal git cleanup (Tier 1), (2) name the canonical Family-Therapy deck so I can finish Tier 2, (3) once you've confirmed nothing's missing, delete `~/_Dedupe_Quarantine_2026-06-26/` to actually free the space (until then it's fully reversible).

---

## Tier 2 update — Family-Therapy decks (decision: keep all 4 lineages)

Inventory found the FT "12 versions" are actually **four distinct deliverables** — *Inpatient/Clinical Family Blueprint*, *Didactic REVAMP* lineage, *The Family is the Milieu* talk, and *Case-Teaching REVAMP2* — plus intermediate saves. Per your call, all four lineages are kept; only **byte-identical** copies were quarantined.

- Hashed 26 deck files → **1** true byte-identical twin found.
- Quarantined: `~/Downloads/Family_Therapy_Inpatient_Didactic_FINAL_Animated_Notes (1).pptx` (86 MB) — identical to the iCloud-filed copy, which was kept.
- All other deck versions are genuinely different and were retained. Appended to the same `RESTORE_MANIFEST.csv`.

**Running total quarantined: 421 files (~1.08 GB), fully reversible.**

*Reversible by design. Repo and curated library untouched. Joshua Moss, MD | Psychiatrist*
