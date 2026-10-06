# WP-6 — Required-Path Coverage Remediation (resident site)

**Author:** drafted for Joshua Moss, MD · **Date:** 2026-09-04
**Closes:** external audit findings 3 (Path underuses the Library), 4 (psychotherapy not treated as a resident skill), 5 (QI and longitudinal transitions thin), 6 (search does not expose a coherent standards map).
**Measured against:** local working tree on branch `fix/fda-bot-block-severity` plus the `_build/ms3` and `_build/res` artifacts present 2026-09-04. `main` moves fast and many sessions work this repo at once — **re-measure with `git fetch origin` before acting on any number below.**

---

## 0. The one analytic move that matters

The four findings look like one problem ("the resident site is thin"). They are four different problems with four different costs. Sorting them this way is what makes the plan executable:

| Audit finding | What it actually is | New clinical content? | Faculty decision? | Cost |
|---|---|---|---|---|
| 3 · Path underuses the Library | Wiring in `curriculum.json` | No | Yes — what becomes *required* | Low |
| 4 · Psychotherapy not a resident skill | Sequencing **plus one missing instrument** | Small (one rubric) | Yes | Medium |
| 5 · QI / transitions thin | Net-new authorship | **Yes, substantial** | Yes | High |
| 6 · Search / standards map | **(a) a shipped defect** + (b) a missing vocabulary | No / small | Yes for (b) | Low / Medium |

Finding 6(a) is free and should ship this week. Finding 5 is the only one that cannot be solved by sequencing. Everything in between is cheap relative to how loudly the audit states it.

---

## 1. Evidence — measured, not asserted

### E1 · Required-Path coverage is 34%

| Site | Path items | Library refs | Coverage | Optional-only refs |
|---|---|---|---|---|
| resident | **31** (4 weeks) | **92** | **34%** | **61** |

Method: union of `libraryColumns[].refs` and `siteLibrary.resident.additions[].refs` from `curriculum.json`, against the union of `learningPaths.resident.weeks[].items[].ref`. Zero Path refs fall outside the Library, so the gap is entirely one-directional.

The 61 optional refs include every one of the domains the audit named: `t_anxiety.md`, `t_geri.md`, `t_perinatal.md`, `t_sleep.md`, `cultural_psychiatry.md`, `psychotherapy.md`, `brief_psychotherapy.md`, `therapy_on_the_unit.md`, `motivational_interviewing.md`, `one-patient-six-weeks.html`, `sp-interview.html`.

### E2 · Prose/Path drift — two instances, both exactly as the audit reports

- `14_Tracks/Resident/resident_curriculum.md` line 9 (Week 2) names *"mood, psychosis, anxiety/OCD, substance"*. Week 2's items are `diagnostic-reasoning.html`, `t_mood.md`, `t_psychosis.md`, `t_sud.md`, `psychopharm_primer.md`, `adv_psychopharm.md`, `med_monitoring.md`, `interaction-cards.html`. **No `t_anxiety.md`.**
- The same file, line 11 (Week 3), links `?page=motivational_interviewing.md`. Week 3's items contain no such ref.

This is the same defect class WP-4 already caught once (12 overlay-vs-prose drift findings). Nothing gates it, so it came back.

### E3 · 19 Library pages are invisible to resident search — this is a shipped defect

`common.py :: build_search_index()` skips any nav item carrying `hidden`. `resident_section.py` (≈ lines 216–240) hardcodes `"hidden":True` on 26 resident nav entries. Seven of those are correctly hidden (`week1..week6.md`, `rotation-curator.html` — all in `libraryExclude`). **The other 19 are Library-placed content that search cannot reach:**

`cases.md` · `cultural_psychiatry.md` · `ect_neuromodulation.md` · `ethics_legal.md` · `exp_tx.md` · `omm_resources.md` · `orientation.md` · `osce.md` · `reading_map.md` · `review.html` · `shelf-mode.html` · `shelf.md` · `t_adjustment.md` · `t_dissociative.md` · `t_impulse.md` · `t_neurocog.md` · `t_sexual.md` · `t_sleep.md` · `t_somatic.md`

The same measurement on MS3 returns **2**, both practice surfaces (`review.html`, `shelf-mode.html`). So this is a resident-specific hole, and it directly explains three of the audit's live-search misses: sleep, culture/structural formulation, and part of the child/adolescent miss.

> **Correction to the audit, stated plainly.** The audit reports `sleep` returning "useful exact resources." On the resident index I measured, `t_sleep.md` is not in the index at all and `sleep` returns `rounds_questions.md`, `t_mood.md`, `doc_oral.md`. Either that query was run against the MS3 site or against a different build. Reconcile before quoting the audit externally.

### E4 · The ranking model favours catalogue pages over topic pages

The index stores **raw term frequency with no length normalisation** (`build_search_index`: title ×4, section ×2, headings ×2, body ×1). Long list pages mention every topic once and therefore accumulate score across many terms. Measured on `_build/res`:

| Query | Top result | Where the right page ranks |
|---|---|---|
| `psychotherapy` | `podcast_library.md` | `psychotherapy.md` **not in top 5** |
| `cbt` | `rounds_questions.md` | `psychotherapy.md` 5th |
| `psychodynamic` | `rounds_questions.md` | `psychotherapy.md` not in top 5 |
| `child adolescent` | `canon_200.md` | `t_neurodev.md` 5th |
| `outpatient psychiatry` | `canon_200.md` | — |
| `community psychiatry` | `canon_200.md` | — |

`check_search_quality.py` already carries the primitive for this — the `notFirst` key, used exactly once (`ama` must not return `book_library.md`). The pattern was recognised and never generalised.

### E5 · `ABPN` returns nothing because the token does not exist

`abpn` has **no postings and no `df` entry** anywhere in the resident corpus, and no synonym group maps to it. `quality improvement` matches the generic English words `quality` (df 14, top hit `therapy_reading_room.md`) and `improvement` (df 8) — it is not finding QI content, because there is none. `neurology` has df 2, both incidental.

### E6 · One Patient, Six Weeks cannot be required yet

`longitudinal_case.json` ships on both sites and is Library-placed under Interactive tools, but is on neither required Path. Two blockers, in this order:

1. **It carries no `facultyReview` key**, consistent with the standing note that its weekly content is absent from the curriculum-review transcripts and is therefore **unreviewed**. Making unreviewed content *required* is a worse governance problem than the coverage gap it would close.
2. It has **6 weeks**; the resident path contract is `resident-four-week`. Requiring a 6-week arc inside a 4-week block needs an explicit mapping decision.

### E7 · QI content does not exist anywhere in the shipped corpus

A grep across shipped content for *quality improvement · PDSA · root cause · RCA · sentinel event · morbidity and mortality · disclosure of error · patient safety event* returns nothing in either site's content tree. **Finding 5 is the only one of the four that sequencing cannot fix.**

---

## 2. The levers — where each change lands and what enforces it

| Lever | File | What already gates it |
|---|---|---|
| Required-Path membership | `curriculum.json → learningPaths.resident` | `validate_curriculum.py`: weeks exactly 1..4, ref must be shipped on that site, `kind` must match how the build ships it, no duplicate ref within a week |
| Library placement | `curriculum.json → libraryColumns` / `siteLibrary` | `validate_curriculum.py` library totality — every shipped slug is placed or explicitly excluded (hard failure) |
| Search index membership | `common.py :: build_search_index` + `resident_section.py` nav | **nothing — this is E3** |
| Search ranking | `check_search_quality.py` `CASES` / `REQUIRED_SYNONYMS` | build gate, per site |
| Topic crosswalks | `topic_meta.json`; `validate_topic_meta.py` `SHELF_VOCAB` / `EPA_VOCAB` | schema + the mandatory `topic-meta-author` skill |
| Standing decisions | `decisions.json` + `bin/check_decision_drift.py` | report-only today |
| Rotation prose | `14_Tracks/Resident/*.md` | **nothing — this is E2** |

**Two constraints that shape the whole plan:**

- `PATH_CONTRACT` pins the **week count (4) and the id**, not the item count. Items can be added to the resident Path without touching the validator — but each added ref must already ship on resident with the correct `kind`. Every ref proposed below has been checked against `site_manifest.json` and satisfies this.
- `FOCUS_CATEGORIES` and `SHELF_VOCAB` are the **same twelve codes** (`anxiety, childdev, ethics, mood, neurocog, otherdx, personality, pharm, psychosis, relational, safety, substance`). There is no psychotherapy code and no QI code. **A resident standards map cannot be built by overloading `shelfBlueprint`** — it needs its own registry.

---

## 3. Work packages

### WP-6a — Close the search hole *(ship first · 1 PR · no content · no decision)*

**Problem:** E3. Nineteen Library-placed resident pages are excluded from the search index.

**Change.** Two options:

- **Option A (recommended).** Pass the site's resolved Library ref set into `build_search_index` and skip only pages that are `hidden` **and not Library-placed**. Search membership then follows from Library placement, which is already a hard-gated fact.
- **Option B.** Remove `"hidden":True` from the 19 nav entries in `resident_section.py`. Rejected: that also restores them to the visible nav, which is a real behavioural change and will move the nav-inventory canary specs.

**Acceptance criteria (machine-verifiable):**

1. New gate `bin/check_search_reachability.py`: for each site, every ref in that site's resolved Library ∪ Path resolves to a doc in `search-index.json`. **Exits non-zero on any gap** — not print-and-exit-0, which is the failure mode `verify_spans.py` and `check_qbank_coherence.py` already have.
2. Resident library-placed-but-unindexed: **19 → 0**. MS3: **2 → 0** — but decide first whether `review.html` and `shelf-mode.html` are Library content or belong in `libraryExclude`. Do not index them just to make a number go green.
3. `check_search_quality.py` passes on both sites with three new `CASES`: `sleep` → `t_sleep.md` in top 3; `culture` → `cultural_psychiatry.md` in top 3; `ect` → `ect_neuromodulation.md` in top 3.
4. Nav-inventory canary specs unchanged — proof that the visible nav did not move.

**Risk.** Indexing 19 more documents shifts `idf` for every term and can move existing cases. Run `check_search_quality.py` on **both** sites before and after and treat any moved case as a finding, not noise.

**Human gate:** none. This is a defect fix.

---

### WP-6b — Fix the ranking model *(1 PR · no content)*

**Problem:** E4. Raw `tf`, no length normalisation, so catalogue pages beat topic pages.

**Change.** Store each document's token length at index time and score `tf / sqrt(len)`. Principled, small, and does not require hand-classifying pages as "catalogue". **The scorer exists in two places** — the SPA and `check_search_quality.py`'s reimplementation — which is the same drift shape `common.py` already fixed for the tokenizer and synonym table. Hoist to one definition rather than editing both.

**Acceptance criteria:**

1. New `CASES`: `psychotherapy` → `psychotherapy.md` top 3, `notFirst: {podcast_library.md, canon_200.md}`; `cbt` and `psychodynamic` → `psychotherapy.md` or `therapy_on_the_unit.md` top 3, `notFirst: {rounds_questions.md}`; `child adolescent` → `t_neurodev.md` top 3, `notFirst: {canon_200.md, book_library.md}`.
2. **Every existing case still passes on both sites.** This is the regression proof and the reason 6b ships before any other search work.
3. A test pinning that the SPA scorer and the checker scorer rank a fixture query set identically — otherwise the gate stops measuring what learners actually experience.

**Uncertainty: moderate.** I inferred the SPA-side scorer from the checker's reimplementation and have **not read `spa_index.html`'s search code**. Read it before committing to the one-line claim.

---

### WP-6c — Close the prose/Path drift *(1 PR · no content)*

**Problem:** E2.

**Change.** Add `t_anxiety.md` to resident Week 2 (and `anxiety` to that week's `focusCategories`); add `motivational_interviewing.md` to Week 3. Both are shipped on resident as `read` kind — verified against `site_manifest.json`, so `validate_curriculum.py` will accept them as-is.

**Acceptance criteria:**

1. `validate_curriculum.py` passes; resident Path total **31 → 33**. *Dry-run verified 2026-09-04: applying exactly this change to a scratch copy returns `curriculum.json OK — ms3 6 weeks/40 items; resident 4 weeks/33 items`.*
2. **The durable fix:** a new validator rule — every `?page=<slug>` link inside a Path week's own prose page resolves to an item in that week, or appears in an explicit exemption table with a written reason. Without this, the drift returns; with it, this whole finding class becomes mechanical.

**Human gate — D1.** Confirm that anxiety/OCD and motivational interviewing genuinely belong in required Weeks 2 and 3, rather than the prose being wrong. Either direction closes the finding; only faculty can say which.

---

### WP-6d — Make psychotherapy a required resident sequence *(audit finding 4)*

The audit asks for a four-beat loop. Three beats already have surfaces; one does not — and that one is the whole finding.

| Beat | Existing asset | Status |
|---|---|---|
| 1 · Formulate why this approach fits | `psychotherapy.md`, `case_formulation.md`, `therapy_on_the_unit.md` | exists, optional |
| 2 · Demonstrate one bounded intervention | `rp-brief-psych.html`, `brief_psychotherapy.md`, `communication-practice.html`, `sp-interview.html` | exists, optional |
| 3 · **Observation-based feedback** | **nothing** — the attestation machinery is faculty→**content** (topic sign-off), never faculty→**learner** | **the real gap** |
| 4 · Try it again | any of the above, re-run | free once 1–3 exist |

**Change.**

- Add a psychotherapy block to the resident Path (Week 3 or 4): `psychotherapy.md`, `therapy_on_the_unit.md`, `brief_psychotherapy.md` (reads) and `rp-brief-psych.html` (tool) — which already ships as **"Five Good Minutes — Brief Psych Coach"**, i.e. the bounded-intervention surface beat 2 needs already exists and is merely optional.
- Build **one bounded observation card**: a single printable page for one 15–20 minute supportive or MI intervention. Supervisor column and self-assessment column, anchored to named ACGME Milestone subcompetencies, structured on Ask–Tell–Ask (the language `supervision_teaching.md` already teaches), ending in one written "what I will do differently next time" commitment — which is what makes beat 4 a real repetition rather than a suggestion.
- **Deliberately do not build a per-learner record.** The repo has no learner store, and adding one drags in FERPA, retention, and the PHI-hook family for a feature the loop does not need. The card is a paper/PDF artifact the resident carries to supervision. This is a scoping decision, recorded as one — not an oversight.

**Acceptance criteria:**

1. The four refs are on the Path; `validate_curriculum.py` passes.
2. New `CASES`: `supportive therapy` → `psychotherapy.md` or `therapy_on_the_unit.md` top 3.
3. The observation card ships as a registered page with a `facultyReview` entry attested by Josh, and cites each Milestone subcompetency it anchors to with a **verbatim `sourceSpan`** in the same change (CLAUDE.md gate).
4. `topic_meta` entries for the four refs carry the psychotherapy crosswalk code from WP-6f — authored through the `topic-meta-author` skill, never hand-edited.

**Human gates — D2** (which Milestone subcompetencies the card anchors to) and **D3** (that observation stays on paper, with no learner record in this repo). D3 is a governance act; record it in `decisions.json`.

**Uncertainty: moderate-high on effort.** Beat 3 is a newly authored instrument, and the Milestones anchoring needs the actual PDF read for verbatim spans. I have not read it.

---

### WP-6e — One Patient, Six Weeks + the Interview Room onto the resident Path

**Blocked, in this order** (E6):

1. **Review the case.** Six weeks of unreviewed longitudinal content must pass the same clinical-accuracy bar the rest of the corpus passed, with findings applied to source and `facultyReview` recorded. This is a review project, not a wiring change.
2. **Decide the 6→4 mapping.** Either a resident projection recorded in `curriculum.json`, or an explicit "do arcs 1–4, you will not finish it" framing on the page.
3. Then wire `one-patient-six-weeks.html` and `sp-interview.html` into the Path.

**Additional consideration.** Putting `sp-interview.html` on the *required* Path moves the SP proxy onto the critical path for every resident. Check the **$20 cap per `SP_ROTATION_ID`** against expected resident volume per block before requiring it, and note that issue **#410 is still open** — PR 2 (the D16 view layer) is unbuilt, so the Interview Room would become required on a surface with an open wave.

**Human gates — D4** (the 6→4 mapping) and **D5** (whether the Interview Room becomes required given the per-block spend cap and the open #410 wave).

**Uncertainty: high**, concentrated in step 1.

---

### WP-6f — Build the standards map *(audit finding 6b)*

**Problem:** E5. A resident cannot ask "what am I missing for boards" and get an answer. `shelfBlueprint` is a twelve-code shelf vocabulary; `epa` is EPA1–13. Neither is an ABPN or Milestones map.

**Change, in three layers plus a cheap search half:**

1. **Registry.** A new root registry `standards.json` (+ schema), in the established `instrument_rights.json` / `decisions.json` shape: `{id, framework, code, title, sourceUrl, sourceSpan}` per ABPN content-outline area and per Milestone subcompetency the program claims to teach. **Register it in both `validate_registry_schemas.py`'s pairs tuple and `test_validate_registry_schemas.py`'s `PAIRS`** — these are separate lists, and registering only the test's makes two tests fail with a confusing `0 == 0`.
2. **Crosswalk.** A `standards: [...]` array on `topic_meta.json` entries, validated against the registry, authored via the `topic-meta-author` skill. Do **not** overload `shelfBlueprint`.
3. **Surface.** A "Standards map" page rendering, per standard: the pages that claim it — and, the part that answers the resident's actual question, **the standards claimed by nothing.** A coverage table that can show zero is what makes it honest.
4. **Synonyms** (cheap, ship with layer 1): `abpn` → boards certification exam; `quality improvement` → qi pdsa safety; `neurology` → neuro exam consult; `child adolescent` → pediatric neurodevelopmental; `community psychiatry` → outpatient levels of care disposition.

**Acceptance criteria:**

1. `validate_registry_schemas.py` and its test both know about `standards.json`; both pass.
2. Every `standards` code in `topic_meta.json` resolves to a registry id; an unknown code fails.
3. **Every registry entry carries a `sourceUrl` and a verbatim `sourceSpan`** from the ACGME/ABPN document — the same evidence rule the rest of the repo enforces. Without this the map asserts a crosswalk nobody checked, which is worse than no map.
4. New `CASES`: `abpn` → the standards-map page top 3; `neurology` → `medical_workup.md` or `cl_reference.md` top 3; `quality improvement` → the QI page from WP-6g top 3 *(written now, held out of CI until 6g merges — a deliberately red-then-green gate)*.
5. `bin/check_standards_coverage.py` reports, per site: standards claimed by ≥1 page · claimed by a page **on the required Path** · claimed by nothing. **Exits non-zero when a standard the program claims to teach has no page.**

**Human gate — D6.** Which framework the program commits to mapping (ABPN content outline, ACGME Milestones, or both) **and — critically — which standards the program explicitly does *not* claim to teach on a four-week inpatient block.** Without that second list the coverage report is all red forever and gets ignored, which is how gates die. Record in `decisions.json`.

**Uncertainty: moderate, with a rights question.** Whether the ABPN content outline can be reproduced as codes and titles is exactly the kind of question `instrument_rights.json` exists to answer. Treat the outline as an instrument: check the licence before reproducing its structure verbatim, and if in doubt register codes + our own titles + a link, not their text. **Do not resolve this by agent judgment.**

---

### WP-6g — QI, safety-event analysis and transitions *(audit finding 5 — the real project)*

The only finding requiring new clinical authorship. Six activities, sequenced by dependency and by what the repo already carries:

| Activity | Vehicle | New content | Note |
|---|---|---|---|
| Analysis of a safety event | new page + **synthetic** case | High | Must be synthetic. A real unit event puts the PHI hooks and the no-PHI decision directly in play. |
| Restraint / fall / suicide-process measurement | new page; extends `agitation.md`, `protocol_library.md` | High | Where measurement literacy lives — rate per 1000 patient-days, run charts, special-cause vs common-cause |
| A small improvement cycle | new page (PDSA on a resident-sized problem) | Medium | Anchor to an ACGME PBLI subcompetency |
| **Disclosure practice** | **reuse `communication-practice.html`** — 12 cases today, **none on disclosure** | **Low** | Best value-per-effort in the entire plan: engine, case schema and validator all already exist |
| Longitudinal recovery after discharge | extend One Patient, Six Weeks | Medium | Dependent on WP-6e |
| Community-resource navigation across levels of care | new page; `10_Patient_and_Family_Education` already holds Maine aftercare directories | Medium | Cross-project asset — the ReConnect aftercare directory is the obvious source |

**Split into three sub-packages:** **6g-1** disclosure cases (cheap, closes one of six immediately) · **6g-2** the QI/safety-event/measurement trio · **6g-3** transitions and community navigation (after 6e).

**Acceptance criteria (each sub-package):**

1. Every clinical assertion carries its evidence span (C1–C6, `validate_evidence_annotations.py`); every sentence asserting what a paper found ships its verbatim `sourceSpan` in the same change.
2. Pages registered in `site_manifest.json` **and** placed in `curriculum.json` (library totality is a hard gate).
3. `topic_meta` entries authored via `topic-meta-author`, carrying `standards` codes from WP-6f.
4. `facultyReview` recorded — **attested by Josh, never asserted by an agent.**
5. Disclosure cases pass the communication-case validator; `communicationCases` cross-references resolve.
6. No page teaches on real event data. Synthetic only.

**Human gate:** the entire package. Scope is a governance decision, not an agent decision.

**Uncertainty: high.** This is the item most likely to be underestimated. Treat 6g as a program, not a work package.

---

### WP-6h — Make coverage a number that cannot silently regress

The audit's headline finding drifted because nothing measured it. Close the class.

**Change.** `bin/check_path_coverage.py`, reporting per site: Path items · Library refs · coverage % · and the explicit list of Library refs that are **deliberately** optional, each with a written reason — the same shape as `libraryExclude`.

**Acceptance criteria:**

1. Every Library ref is either on the Path or carries a written reason for being optional. Unexplained refs **fail**.
2. Baseline recorded: **resident 31/92 (34%) as of 2026-09-04**.
3. The report distinguishes *optional on purpose* from *forgotten* — that distinction is the entire value.

Cheapest durable fix in the plan. Ship it early, before items start moving, so the baseline is honest.

---

## 4. Sequencing — by constraint, not preference

| Wave | Packages | Why here |
|---|---|---|
| **0 — ship now** | 6a, 6b, 6h | No faculty decision, no new content. 6a is a shipped defect. 6b must land **before** any other search acceptance criterion is written, or those criteria measure the wrong ranking. 6h freezes an honest baseline before items move. |
| **1 — one decision each** | 6c *(D1)*, 6f layer 1 + synonyms *(D6)* | Small changes blocked only on a faculty call |
| **2 — medium, dependent** | 6d *(D2, D3)*, 6f layers 2–3 | 6d needs 6f's crosswalk code; 6f layer 3 needs 6b's ranking to be findable |
| **3 — heavy, gated on review** | 6e *(D4, D5)*, then 6g-1 → 6g-2 → 6g-3 | 6e is blocked on a real review project; 6g is blocked on authorship. 6g-1 first because it is cheap and closes one of six activities on day one. |

---

## 5. Decision register — what only faculty can decide

| ID | Question | Blocks | Default if unanswered |
|---|---|---|---|
| **D1** | Do anxiety/OCD (W2) and motivational interviewing (W3) belong on the required Path, or is the prose wrong? | 6c | Add both to the Path; the prose is the older statement of intent |
| **D2** | Which ACGME Milestone subcompetencies does the psychotherapy observation card anchor to? | 6d | None — cannot be defaulted |
| **D3** | Confirm psychotherapy observation stays on paper, with **no** per-learner record in this repo | 6d | Paper only (the conservative reading) |
| **D4** | How does a 6-week longitudinal case map onto a 4-week resident block? | 6e | None — cannot be defaulted |
| **D5** | Does the Interview Room become **required**, given the $20 per-block cap and open issue #410? | 6e | Stays optional |
| **D6** | Which standards framework, and **which standards does the program explicitly not claim to teach on inpatient?** | 6f | None — cannot be defaulted; a coverage report with no exclusion list is all-red and will be ignored |

---

## 6. What this plan deliberately does not do

- **Does not add pages to close the coverage gap.** The audit says this explicitly and it is right: 61 unplaced refs is a sequencing number, not a content number.
- **Does not build a per-learner record** for psychotherapy observation.
- **Does not overload `shelfBlueprint`** with resident standards.
- **Does not wire unreviewed content onto a required Path** (One Patient, Six Weeks).
- **Does not extend `check_decision_drift.py`** to judge whether an enforcement is *correct* — its own design note forbids exactly that, and a gate that cries wolf gets disabled.

---

## 7. Hygiene for whoever executes this

- `git fetch origin && git status -sb` **before measuring anything.** Every number here is from a local tree on `fix/fda-bot-block-severity` plus `_build/` artifacts; main moves fast and several sessions work this repo at once.
- Run `bin/verify.sh` **on the Mac**, not the Cowork VM — the VM lacks `jsonschema` and reports ~7 false reds. Background it to a log and poll; it takes 90s+.
- Delete `13_Faculty_Resources/_automation/generated/evidence_drill_review.json` after any verify run — it is not gitignored.
- `cp CLAUDE.md AGENTS.md` after any edit to either; CI diffs them.
- Small PRs, one per work package. Never `--no-verify`.
- Any `topic_meta.json` edit — even one field — goes through the `topic-meta-author` skill.
