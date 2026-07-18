# Wave D — Hygiene, Docs & CI Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking. Do Wave D last; it is low-risk cleanup.

**Goal:** Remove repo clutter and stale docs, decide the fate of built-but-unwired artifacts, reconcile documentation with the shipped reality, and add the CI coverage that's currently missing (perf/a11y budget, orphan tests).

**Architecture:** Non-behavioral changes to docs, repo layout, `site_manifest.json`/nav, and CI YAML. No runtime behavior changes except WP-14 (if artifacts are wired in).

**Tech stack:** Markdown/JSON docs, GitHub Actions, Lighthouse CI / pa11y, Node/Python tests.

## Global Constraints
Inherited from the master plan. Definition of done for any change that could affect the build: `build_and_check.sh ms3` AND `... res` both exit 0.

---

### Task 1: WP-14 — Wire or archive `quick-wins/` artifacts

**Files:**
- Inspect: `quick-wins/differential-decision-trees.html`, `quick-wins/vignettes.html`, `quick-wins/dark-mode.css`
- Modify (if wiring): `13_Faculty_Resources/_automation/site_build/site_manifest.json` (`tools` array), `13_Faculty_Resources/_automation/site_build/build_deploy.py` (nav array, line 226-238)
- Or Move (if archiving): to `99_Archive/`

**Interfaces:**
- `site_manifest.json` `tools` entry format is a 3-tuple: `[ "source/path.html", "output.html", "Display Title" ]` (see lines 4-8).
- New tools ship to `/tools/<output.html>` and must ALSO be added to a nav `section` in `build_deploy.py`'s `nav` array, or the orphaned-source QA gate / nav-crawl will flag them.

- [ ] **Step 1: Assess each artifact**

```bash
head -40 quick-wins/differential-decision-trees.html quick-wins/vignettes.html
grep -c "87786a\|c25a3c\|createElement\|<script" quick-wins/*.html
```
Decide per file: is it learner-valuable and clinically appropriate (the decision trees + vignettes are the "visual learning" assets prior audits requested), or superseded?

- [ ] **Step 2a: If wiring — register in `site_manifest.json`**

Add to the `tools` array (matching the 3-tuple format at lines 4-8), e.g.:
```json
  [
   "quick-wins/differential-decision-trees.html",
   "differential-decision-trees.html",
   "Differential Decision Trees"
  ],
  [
   "quick-wins/vignettes.html",
   "vignettes.html",
   "Vignette Bank"
  ],
```

- [ ] **Step 2b: If wiring — add to nav in `build_deploy.py`**

In the `nav` array (line 226-238), add the tool(s) to the most fitting section — "Understand the Problem" for decision trees, "Practice and Exam Prep" for vignettes — using the existing `_tool("differential-decision-trees.html","Differential Decision Trees")` helper form.

- [ ] **Step 2c: If archiving instead**

```bash
git mv quick-wins/dark-mode.css 99_Archive/    # superseded by clinical-warm.css
# and/or the HTML artifacts if not wiring
```

- [ ] **Step 3: Build + verify**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
# if wired, confirm the new routes render:
python3 -m http.server 4200 --directory _build/ms3 &
cd tests/smoke && npx playwright test --project=nav-ms3 nav-crawl.spec.js
```
Expected: build green; if wired, nav-crawl returns 200 for the new tool routes (the crawl asserts every nav target ≥200 bytes).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: wire quick-wins decision-trees/vignettes into nav (or archive dark-mode.css)"
```

**Acceptance:** no unwired HTML at repo root; decisions recorded; build/nav-crawl green.
**Faculty review:** advisory (are the decision trees clinically vetted before shipping?). **Depends on:** WP-05/WP-11 patterns if wiring (so the artifacts get landmarks/tokens).

---

### Task 2: WP-15 — Repo hygiene

**Files:**
- Move: superseded root planning docs → `docs/archive/`
- Modify: `STATUS_LATEST.md`
- Remove/move: orphan `qbank_attestation_2026-07-05.json`
- Modify: `13_Faculty_Resources/_automation/build_index.py` (output path)

- [ ] **Step 1: Create the archive and move superseded docs**

```bash
mkdir -p docs/archive
git mv CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md _AUDIT_AND_ROADMAP.md _DEDUPE_REPORT.md _QA_REPORT.md _SESSION_HANDOFF_2026-06-26.md _REMEDIATION_LOG_2026-06-27.md FIXES_APPLIED.md Design-Plan-Alignment-and-Video_2026-07-02.md _CODEX_AUDIT_INTEGRATION.md _DESIGN_HANDOFF_PROMPT.md _PLATFORM_ARCHITECTURE_ClerkshipOS.md docs/archive/
```
Keep at root (authoritative overlays): `FINALIZATION_PLAN.md`, `CLERKSHIPOS_BACKLOG_2026-07.md`, `README.md`, `AGENTS.md`, `QUESTION_BANK_STANDARD.md`, and the new `FABLE_PLATFORM_AUDIT_2026-07-15.md`.

- [ ] **Step 2: Add an archive index**

Create `docs/archive/INDEX.md`:
```markdown
# Archived planning docs
Superseded by FINALIZATION_PLAN.md + CLERKSHIPOS_BACKLOG_2026-07.md (see repo root).
Retained for provenance only — not authoritative.
```

- [ ] **Step 3: Refresh `STATUS_LATEST.md`**

Replace the stale 2026-07-01 content (which prescribes the retired manual `netlify deploy --prod` flow) with the current build-on-push reality: "Deploy is automatic on push to `main` (Netlify build command runs `build_and_check.sh <site>`). CI runs on PR + push to main."

- [ ] **Step 4: Remove the orphan attestation snapshot**

```bash
grep -rl "qbank_attestation_2026-07-05" --include="*.py" --include="*.mjs" --include="*.js" --include="*.html" . || echo "no code refs — safe to move"
git mv qbank_attestation_2026-07-05.json docs/archive/
```

- [ ] **Step 5: Redirect `build_index.py` output out of repo root**

In `build_index.py:131`, change the `_MASTER_INDEX.xlsx` output path to `docs/_MASTER_INDEX.xlsx` (or add `_MASTER_INDEX.xlsx` to `.gitignore` if it should not be tracked). It is a generated utility artifact, not part of the deploy.

- [ ] **Step 6: Build + commit**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git add -A && git commit -m "chore: archive superseded planning docs, refresh STATUS_LATEST, de-clutter root"
```
Expected: both builds green (nothing served was moved — proves the moved docs weren't in `site_manifest.json`).

**Acceptance:** root decluttered; authoritative overlays clear; `STATUS_LATEST.md` current; build unaffected. **Depends on:** none.

---

### Task 3: WP-16 — Reconcile blueprint/schema/exam-prep docs

**Files:**
- Modify: `QUESTION_BANK_BLUEPRINT.md`, `question_bank.schema.json` (`_note`), `09_Exam_Prep/README.md`
- Optional: normalize qbank id prefixes in `question_bank.json`

- [ ] **Step 1: Update the blueprint to match the shipped bank**

In `QUESTION_BANK_BLUEPRINT.md`, replace the 144-item curriculum-weighted description with the shipped reality: 192 items, flat 16/category across 12 categories, 143 attested / 49 draft / 3 retired. Update `question_bank.schema.json`'s `_note` similarly if it states a count.

- [ ] **Step 2: Reconcile COMAT vs NBME labeling**

In `09_Exam_Prep/README.md:2`, the "NBME psychiatry high-yield map + 50-item self-check" line conflicts with the authoritative `14_Tracks/MS3/.../07_shelf_guide/shelf_review_guide.md:5` ("Your exam is the COMAT / NBOME"). Relabel to COMAT (or "COMAT/shelf"), and either deliver the advertised 50-item self-check or mark it clearly as planned (it does not currently exist — only a 4-item self-check in `exam_blueprint_gaps.md`). This is a content decision — flag for faculty.

- [ ] **Step 3: (optional) Normalize id prefixes**

`childdev` uses both `qb_chd_*` and `qb_cdev_*`; `otherdx` uses `qb_oth_*` and `qb_otherdx_*`. If low-risk, pick one prefix per category and rename (ensure ids stay unique — `check-static-site.mjs` hard-fails on dup ids). Skip if any external artifact (attestation snapshot, Anki export) references the old ids.

- [ ] **Step 4: Verify + commit (docs/content PR, separate from code)**

```bash
python3 -c "import json; json.load(open('question_bank.json')); print('json OK')"
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
git add QUESTION_BANK_BLUEPRINT.md question_bank.schema.json 09_Exam_Prep/README.md question_bank.json
git commit -m "docs: reconcile blueprint/schema/exam-prep with shipped 192-item bank; COMAT labeling"
```

**Acceptance:** docs state 192/flat-16; COMAT/NBME labeling consistent; no dangling "50-item" claim; ids unique. **Faculty:** advisory (COMAT framing). **Depends on:** pairs with WP-06; **precedes** WP-08 (so the schema matches data before CI enforces it).

---

### Task 4: WP-18 — Wire orphan tests into CI

**Files:**
- Create: `tests/package.json` (test runner script)
- Modify: `.github/workflows/ci.yml` (add steps)

**Context:** `tests/family-companion-evergreen.test.mjs`, `tests/alex-tour-static.test.mjs`, and `tools/*/test_export_*.py` exist but nothing in CI invokes them (tests audit confirmed no `package.json` runs the root `.mjs` tests).

- [ ] **Step 1: Add a runner for the root node tests**

Create `tests/package.json`:
```json
{
  "name": "clerkship-root-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test *.test.mjs"
  }
}
```

- [ ] **Step 2: Run locally to confirm they pass (fix or report if not)**

```bash
cd tests && node --test *.test.mjs
```
Expected: PASS. If a test fails, report the failure (do not delete the test).

- [ ] **Step 3: Add CI steps**

In `.github/workflows/ci.yml`, inside `build-test-validate` (after the existing python validators), add:
```yaml
      - name: Test — root static tests
        run: node --test tests/*.test.mjs

      - name: Test — tools exporters
        run: |
          python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
          python3 tools/faculty_polish_export/test_export_top10_faculty_polish.py
          python3 tools/pdf_library_export/test_export_website_pdf_library.py
```

- [ ] **Step 4: Commit**

```bash
git add tests/package.json .github/workflows/ci.yml
git commit -m "ci: wire orphaned root + exporter tests into the build-test-validate job"
```

**Acceptance:** every test file is invoked by CI; no "manual-only" tests remain. **Depends on:** WP-01 (so pushes also run them).

---

### Task 5: WP-17 — Lighthouse + a11y budget in CI

**Files:**
- Create: `tests/lighthouse/lighthouserc.json`, `tests/a11y/pa11yci.json`
- Modify: `.github/workflows/ci.yml` (new job, after `build-test-validate`)

**Context:** No perf/a11y gate exists. Seed baselines AFTER Wave B a11y fixes merge, so it doesn't red-flag known in-flight items. Pin tool versions.

- [ ] **Step 1: Add a pa11y config**

Create `tests/a11y/pa11yci.json`:
```json
{
  "defaults": { "standard": "WCAG2AA", "timeout": 30000, "level": "error" },
  "urls": [
    "http://localhost:4200/",
    "http://localhost:4200/?page=t_psychosis.md",
    "http://localhost:4200/tools/question-bank-practice.html",
    "http://localhost:4200/tools/review.html"
  ]
}
```

- [ ] **Step 2: Add a Lighthouse budget**

Create `tests/lighthouse/lighthouserc.json`:
```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4200/", "http://localhost:4200/?page=t_psychosis.md"],
      "settings": { "preset": "desktop" }
    },
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:performance": ["warn", { "minScore": 0.8 }]
      }
    }
  }
}
```

- [ ] **Step 3: Add the CI job**

In `ci.yml`, add a job `quality-budget` (`needs: build-test-validate`) that builds ms3, serves it on :4200, then runs pinned `@lhci/cli@0.14.x autorun --config=tests/lighthouse/lighthouserc.json` and `pa11y-ci@3.x --config tests/a11y/pa11yci.json`. Use `npx --yes` with pinned versions; dev-only, not shipped.

- [ ] **Step 4: Seed + verify**

Run locally against a current build; capture the actual scores. If below threshold on a known-in-flight item, either lower the threshold to the current floor with a TODO to raise it after the fix, or gate this task behind Wave B completion (preferred).

- [ ] **Step 5: Commit**

```bash
git add tests/lighthouse tests/a11y .github/workflows/ci.yml
git commit -m "ci: add Lighthouse perf + pa11y accessibility budget (a11y>=0.95)"
```

**Acceptance:** a11y/perf regressions turn CI red; thresholds reflect the post-Wave-B baseline. **Depends on:** WP-01, and ideally Wave B (WP-03/04/05/10).

## Self-Review
- WP-14 → Task 1 ✓; WP-15 → Task 2 ✓; WP-16 → Task 3 ✓; WP-18 → Task 4 ✓; WP-17 → Task 5 ✓.
- No placeholders: manifest tuple format, exact `git mv` list, exact config JSON, exact CI YAML snippets given. Version pins noted (lhci 0.14.x, pa11y-ci 3.x). ✓
- Ordering: WP-16 precedes WP-08 (schema/data alignment); WP-17 after Wave B. ✓
