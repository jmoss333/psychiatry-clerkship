# 12 · Media
- ✅ **RSS video scripts (10)** → `teaching/video-scripts/` (🔀 merge the duplicate `teaching/video-content/Scripts/` dir).
- ✅ **Video QR system** → `teaching/video-qr-system/`.
- ✅ **NotebookLM audio overviews (13 projects)** → `teaching/notebooklm-projects/`.
- ✅ **FTM audio library** → `_assets/ftm-audio/` (by-topic).
- ➕ **Book + Podcast library** (verified seed catalog) → build from `~/Library_Plan_and_Audit_Roadmap.md`.

**Status tags:** ✅ Exists · 🔧 Revise · ➕ Expand · ✳️ Create · 🔀 Merge · 🗄️ Archive

## audio_oe/

50 OpenEvidence NotebookLM landmark-trial brief recordings (`.m4a`, Git LFS) +
`MANIFEST.csv`. **Hard deploy input**: `site_build/build_deploy.py` copies these
to `/audio_oe/` on both sites and deck-aligns them into `quizzes.json`; a
missing dir or MANIFEST aborts the build. Moved here 2026-08 from
`13_Faculty_Resources/Handoffs/` (an inbox-sounding path for a deploy dependency).
