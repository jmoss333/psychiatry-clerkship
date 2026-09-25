# Psychiatry Clerkship Library
**Single source of truth for the six-week adult inpatient psychiatry clerkship.**
Joshua Moss, MD | Psychiatrist · scaffolded 2026-06-26

This is a **navigation layer / card catalog**, not a second copy of your work. Each folder's README points to the
canonical asset wherever it actually lives (local repo, iCloud, Notion, Google Drive). Edit source once; the library
references it. Internal RSS/RSSM naming is retained here; a public mirror would strip it.

## Start here
- `00_START_HERE/COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md` — uploadable NotebookLM master resource for the full clerkship library.
- `docs/superpowers/plans/_AUDIT_AND_ROADMAP.md` — the full audit, gap analysis, curriculum, and roadmap (Phases 1–9).
- `_MASTER_INDEX.xlsx` — searchable index of catalogued assets (filter by status/priority/category).
- `99_Archive/root-planning-2026-07/_CODEX_AUDIT_INTEGRATION.md` — verdict + merge log for the parallel Codex audit (exhaustive 11,700-file census + MS3 student pack now folded in).
- `00_START_HERE/` — orientation, syllabus, "A Day on the Unit"; `_audit-census-codex/` holds the exhaustive census + parallel reports.

## Built so far (live content)
- **Interactive teaching tools** (6, single-file HTML, Clinical Warm): MSE builder (`02_Clinical_Skills/Mental_Status_Exam/`, now with a Language & Interview tab) · Decisional Capacity (`04_Acute_and_Safety/Decisional_Capacity/`) · Oral Presentation + timer (`02_Clinical_Skills/Oral_Presentations/`) · Violence Risk / FRST (`04_Acute_and_Safety/Violence_Risk/`) · Withdrawal scales CIWA-Ar/COWS (`03_Core_Topics/SUD_Withdrawal/`) · Reflection + PIF set (`02_Clinical_Skills/Reflection_PIF/`).
- **MS3 Student Pack** (15 markdown files: orientation, pocket guides, OSCE set, shelf guide, synthetic cases, weekly reading map, expansion modules) → `14_Tracks/MS3/Student_Ready_Pack/`.
- **Exhaustive census + duplicate log** (11,700 files / 2,785 dup groups) → `00_START_HERE/_audit-census-codex/`.

## How it's organized
| # | Folder | Holds |
|---|---|---|
| 00 | START_HERE | Orientation, syllabus, week-0 checklist, glossary |
| 01 | Six_Week_Curriculum | Week 1–6 modules (objectives, readings, skills, cases, reflection) |
| 02 | Clinical_Skills | Interviewing · MSE · Formulation · Documentation · Presentations · DDx · Reflection |
| 03 | Core_Topics | Mood · Psychosis · Anxiety · SUD/Withdrawal · Personality · Geriatric · Perinatal |
| 04 | Acute_and_Safety | Suicide/safety · Violence · Agitation/restraint · Capacity · Delirium · Catatonia |
| 05 | Psychopharmacology | Student Top-10 primer · Protocol library (taper, clozapine, order sets) |
| 06 | Family_and_Relational | RSS frame · family meeting playbook · EE · canonical FT deck |
| 07 | Evidence_and_Reading | Landmark library · 6-wk reading pathway · Journal Club · guidelines |
| 08 | Cases_and_Simulation | Composite cases · population case studies · decision labs |
| 09 | Exam_Prep | Shelf high-yield · OSCE stations |
| 10 | Patient_and_Family_Education | References into psychoed-library & post-discharge-kit |
| 11 | AI_and_Prompts | Student-safe prompt set · Teaching-Prep agent |
| 12 | Media | Videos (QR) · podcasts · audiobooks · NotebookLM audio |
| 13 | Faculty_Resources | Teaching scripts · eval/supervision templates · elective application |
| 14 | Tracks | MS3 · Sub-I/MS4 · Resident · CAP · SW · Nursing · Patients/Families overlays |
| 99 | Archive | Retired versions (FT deck dups, RSSM v10, manual v1, raw exports) |

## Multi-track model
Content never forks. `14_Tracks/<audience>/` holds only a short ordered list of links into the shared body.
MS3 is the default build; later tracks are overlays.

## Licensing and third-party material

Two licences cover what the author owns. The line between them is drawn by the kind of material, not by folder: does it teach, or does it build?

| What | Licence | File |
|---|---|---|
| **Curriculum content.** Teaching material (text, cases, questions and rationales, feedback, scripts) wherever it appears. It lives mainly in the numbered trees `00_START_HERE/` to `14_Tracks/` and `99_Archive/`, the curriculum registries (`topic_meta.json`, `question_bank.json`, `curriculum.json`, the case files and the rest), the learner-facing text in `_prototypes/`, and the built learner pages. Copies stay content: the review transcripts, test snapshots such as `tests/__panels__/`, benchmark corpora, case-pack text in tests, and pages quoted in documentation. | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [`LICENSE-content`](LICENSE-content) |
| **Code.** Source files (`.py`, `.js`, `.mjs`, `.jsx`, `.sh` and the like), every `*.schema.json`, build, test and CI configuration, the program logic of the HTML tools, and the developer documentation, wherever they live (inside the numbered trees too). That includes the build pipeline and validators, `bin/`, `tools/`, `tests/`, the faculty console and the Interview Room proxy, except copies of curriculum content in any of them. | MIT | [`LICENSE`](LICENSE) |

`LICENSE-content` gives the exact boundary, how to handle files that mix code and teaching text, and the attribution line to use. In short, CC BY-NC-SA 4.0 means you may share and adapt the content for non-commercial use if you credit the source, say what you changed, and release your adaptation under the same licence.

### Not covered by either licence

The author can only license what the author owns. None of the following is licensed by `LICENSE` or `LICENSE-content`:

- **Third-party assessment instruments.** The library teaches how to give an instrument and links to the custodian's official form. It does not reproduce copyrighted instruments; that rule is decision `instrument-scope-option-a` in `decisions.json`. [`instrument_rights.json`](instrument_rights.json) records each instrument's status and official source: C-SSRS, COWS and CIWA-Ar are retired, BFCRS and the Stanley-Brown Safety Plan are restricted, and PHQ-9 and GAD-7 are provisional. Where instrument wording does appear, it still belongs to its custodian. The PHQ-9 and GAD-7 text in `screeners.html` is reproduced under Pfizer's permission. That permission covers reproducing, translating, displaying and distributing the screeners, but not modifying them, so do not adapt that wording under the share-alike terms. The permission record is [`docs/permissions/phqscreeners-2026-09-10.md`](docs/permissions/phqscreeners-2026-09-10.md).
- **Cited papers and quotations.** Papers are cited and linked, not copied. Short verbatim quotations belong to their authors and publishers. These include the `sourceSpan` excerpts in `evidence_annotations.json` and the cached abstracts in `13_Faculty_Resources/_automation/span_audit/`.
- **AI-generated media.** The 100 audio files were generated with Google NotebookLM; the author did not record them. They are the 50 landmark-paper audio overviews in `07_Evidence_and_Reading/Landmark_Trials/audio/` and the 50 brief summaries in `12_Media/audio_oe/`, which were made from a source list assembled with OpenEvidence. The orientation video overview in `_prototypes/orientation-video/` is also a NotebookLM generation, and so are its captions and transcript. Some generated titles are promotional and are not faculty-attested, and `media_manifest.json` records their accessibility status. Until each file has a recorded rights and provenance field (WP-16 step 2), treat **every** audio and video file in the repository as outside both licences. That includes the silent motion clips in `_prototypes/video-library/`, which were rendered from the design prototypes in `13_Faculty_Resources/Handoffs/Clerkship_video_handoff/`.
- **Vendored libraries and fonts.** Third-party code copied into the repository keeps its own licence:
  - React and ReactDOM 18.2.0 (`_prototypes/*/vendor/`) are MIT-licensed, © Facebook, Inc. and its affiliates.
  - marked 9.1.6 (`13_Faculty_Resources/_automation/site_build/marked.min.js`) is MIT-licensed, © Christopher Jeffrey.
  - qrcode-generator 1.4.4 (`13_Faculty_Resources/_automation/site_build/vendor/`, with its licence file) is MIT-licensed, © Kazuhiko Arase. "QR Code" is a registered trademark of DENSO WAVE.

  npm dependencies are installed at build time, not committed, and carry their own licences. No font files are bundled, and the learner sites use system font stacks. Some design references (the `.dc.html` files under `13_Faculty_Resources/Handoffs/` and `docs/superpowers/specs/`) load Source Serif 4, Source Sans 3 and Inter from Google Fonts; those fonts use the SIL Open Font License 1.1.
- **Trademarks and institution names.** Some names appear in the content as local context, not as endorsements. They include Tufts University School of Medicine, the University of New England, Maine Medical Center and MaineHealth, Sanford and the BHU2 unit, and products and services such as NotebookLM, OpenEvidence and Netlify. Neither licence grants any right to use these names.

To run this library at another clerkship, see [`docs/ADOPTING.md`](docs/ADOPTING.md).

## Development

For a reproducible local environment, reopen the repository in its [VS Code Dev Container](.devcontainer/devcontainer.json).
Container creation automatically installs locked dependencies and runs only the fast runtime contract.
The full gate is deliberately manual: run the VS Code task **Verify Dev Container** via
**Tasks: Run Task**, or run this receipt-enabled command inside the container:

```bash
bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json
```

A completed attempt writes `output/devcontainer/verification-receipt.json`. The status bar stays
visible: green means the receipt passed for the current clean tracked commit; red means the current commit's latest attempt failed;
gray means no current proof exists (missing, malformed, running/interrupted, stale, a different commit,
or tracked edits). A gray item can be clicked to run the task; the receipt is local and ignored by Git.
The image-supplied `CLERKSHIP_DEVCONTAINER=1` check prevents accidental host invocation; it is a
forgeable environment guard, not authentication or proof that a deliberate caller used the container.
If the receipt directory is wholly unwritable, the task fails but the last atomically completed receipt
may remain readable until permissions or repository freshness change.
Without deploy URLs, the local LFS browser projects remain skipped: deploy-only LFS browser coverage
is not proved, and the receipt says so even when the local task passes.

Open a full clone with materialized LFS media (`git lfs pull`), not a linked worktree whose Git
directory is outside the container. This is a local Docker workflow and does not deploy anything.
The container declares no repository-managed credential or Docker-socket mount; VS Code may still
forward the host SSH agent or Git credential helper, and setup reports either state. Local proof
does not establish deployment, provider behavior, microphone/headphone behavior, VoiceOver, faculty
approval, clinical correctness, or Ubuntu visual-baseline parity. Never regenerate visual baselines
from the container; use the existing workflow_dispatch job.

## Operations and maintenance

The [scheduled maintenance operations runbook](13_Faculty_Resources/_automation/maintenance/README.md)
is the operator source of truth for UTC schedules, 90-day evidence, production canaries,
faculty-review queues, rotation readiness, pause/resume steps, and privacy boundaries.
[Curriculum surveillance](13_Faculty_Resources/_automation/surveillance/README.md) documents the
rolling report inbox and its human review lifecycle. Scheduled GitHub workflows become active only
from the default branch; branch-local cron files are not live schedules.

**Status tags:** ✅ Exists · 🔧 Revise · ➕ Expand · ✳️ Create · 🔀 Merge · 🗄️ Archive
