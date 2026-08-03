# Session Handoff — Psychiatry Clerkship Library

**Date:** 2026-06-26 · **Owner:** Joshua Moss, MD · **Status:** Consolidation complete; library live and populated.
**Purpose:** let a future session (Cowork or Claude Code) resume cold without re-deriving anything.

---

## What this is
A single-source-of-truth **Psychiatry Clerkship Library** at `~/Psychiatry-Clerkship-Library/` for a 6-week adult inpatient rotation, built multi-track (MS3 → Sub-I → Resident → CAP → SW/Nursing → Patients/Families). It is a **navigation layer + new content**, not a fork: card-catalog READMEs point to source-of-truth assets across the repo, iCloud, Notion, and Google Drive.

## What was done this session
1. **9-phase audit** across local repo, iCloud, Notion, Google Drive → `_AUDIT_AND_ROADMAP.md` (the master plan: inventory, dedupe, gap analysis, architecture, 6-week curriculum, roadmap) + `_MASTER_INDEX.xlsx` (67 assets; 50 Exists, 0 Create gaps left).
2. **Scaffolded the tree** (57 folders, 17 card-catalog READMEs).
3. **Integrated the parallel Codex audit** (`~/psychiatry-clerkship-library-audit-2026-06-27/`): adopted its 15-file **MS3 Student Pack** → `14_Tracks/MS3/Student_Ready_Pack/` and its 11,700-file **census** → `00_START_HERE/_audit-census-codex/`. Verdict + merge log in `_CODEX_AUDIT_INTEGRATION.md`.
4. **Built 6 interactive teaching tools** (single-file HTML, React 18 UMD, Clinical Warm, signed, disclaimers, fictional composites only): MSE builder (+Language/Interview tab), Decisional Capacity, Oral Presentation (+timer), Violence Risk (+Brøset), Withdrawal CIWA-Ar/COWS, Reflection+PIF.
5. **Dedupe** — `_DEDUPE_REPORT.md`:
   - Loose mirrors: **420 byte-identical files quarantined (~993 MB)** → `~/_Dedupe_Quarantine_2026-06-26/` (reversible; `RESTORE_MANIFEST.csv` + `RESTORE_ALL.sh`).
   - Tier 2 FT decks: kept all 4 lineages; quarantined **1** identical 86 MB twin. Running total **421 files (~1.08 GB)**.
   - Tier 1 repo-internal: **done via PR #1134** (Claude Code) — removed legacy `teaching/video-content/` (13 files); canonical = `teaching/video-scripts/` + `teaching/video-qr-system/`.
6. **Primary-source download list** → `07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md` (tiered, MaineHealth access notes).

## Canonical decisions (locked)
- Landmark library: repo MD canonical; Notion DB = live view; Google Drive = export.
- RSSM **v11** (archive v10) · Teaching Manual **v2** (archive v1) · video scripts → `teaching/video-scripts/`.
- Family-Therapy decks: **4 distinct deliverables kept** (Blueprint, Didactic-REVAMP, Milieu, Case-Teaching); only exact twins removed.
- `book-chapters` (manuscript ↔ patient-journey): **keep both** (intentional distribution); durable fix = generate patient-journey copies from manuscript (build step, not delete).
- Internal RSS/RSSM naming retained for trainees; strip for any public mirror.
- **PHI:** all cases fictional composites; nothing patient-identifiable anywhere.

## Open items / next actions
1. **Merge PR #1134** (github.com/jmoss333/reconnect-psychiatry-system/pull/1134) to finalize Tier 1.
2. **Quarantine cleanup:** once nothing's missing, `rm -rf ~/_Dedupe_Quarantine_2026-06-26/` to reclaim ~1 GB (or `bash …/RESTORE_ALL.sh` to undo).
3. **Online psychoed site URL:** not in repo; the connected Netlify connector returns no projects. Get it with `netlify status` / `netlify open:site` run in the repo via Desktop Commander (real shell where Netlify CLI is authed), or the Netlify dashboard (siteId `3ebfb354-3ef4-4c59-81fb-dcc279cab40c`). Source builds via `tools-suite/` → `build_netlify.py` → `_site/` → GitHub Actions (`main-tools-release.yml`).
4. **Download Tier-1 primary sources** via MaineHealth; offer to make a checklist spreadsheet + verified PMID/DOI appendix.
5. **Stale note:** `12_Media/README.md` still says "merge `video-content/Scripts/`" — flip to ✅ resolved (PR #1134).
6. **Optional book-chapters collapse** (if desired): one-line Claude Code prompt in chat history; recommend the generate-from-manuscript build instead.
7. **Roadmap remainder (R4–R6):** Book+Podcast Library v1 (spec in `~/Library_Plan_and_Audit_Roadmap.md`); media index; student-safe AI prompt set; public mirror (RSS naming stripped); activate Sub-I/Resident/CAP/SW/Nursing track overlays.

## Key file map
| Thing | Path |
|---|---|
| Front door | `~/Psychiatry-Clerkship-Library/README.md` |
| Master plan / audit | `…/_AUDIT_AND_ROADMAP.md` |
| Master index (67) | `…/_MASTER_INDEX.xlsx` |
| Codex integration verdict | `…/_CODEX_AUDIT_INTEGRATION.md` |
| Dedupe report | `…/_DEDUPE_REPORT.md` |
| Download list | `…/07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md` |
| 6 interactive tools | `…/02_Clinical_Skills/…`, `…/03_Core_Topics/SUD_Withdrawal/`, `…/04_Acute_and_Safety/…` |
| MS3 student pack | `…/14_Tracks/MS3/Student_Ready_Pack/` |
| Census + parallel reports | `…/00_START_HERE/_audit-census-codex/` |
| Quarantine + restore | `~/_Dedupe_Quarantine_2026-06-26/` |
| Source repo | `~/Code/reconnect-psychiatry-system/` |

## Conventions to keep
Single-file HTML clinical tools (React 18 UMD, raw `React.createElement`, no Babel), Clinical Warm tokens, footer signature `Joshua Moss, MD | Psychiatrist`, educational disclaimers, fictional composites only. Heavy repo work → Claude Code, not Cowork. Reuse before create; one canonical per concept.
