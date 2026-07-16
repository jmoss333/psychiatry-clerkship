# Fable Senior Audit — Psychiatry Clerkship Platform
**Date:** 2026-07-15 · **Auditor:** Fable 5 (senior product / clinical-content / UX / a11y / engineering)
**Targets:** live MS3 site `https://une-ms3-psychiatry.netlify.app/`; repo `jmoss333/psychiatry-clerkship` (default branch `main`); resident site `mmc-psychiatry-residents-sanford`; governance site `https://clerkship-faculty-attest.netlify.app/`; SP proxy `sp-interview-proxy.netlify.app`.
**Scope:** inspect, diagnose, prioritize, and package work. **No implementation, PR, merge, or deploy performed.**

> **Method note.** Findings below reflect the *current tree and live sites*, verified first-hand where a prior-audit document made a claim. Two historical P0 question-bank errors (`qb_sud_014` GABA-A inversion, `qb_otherdx_005` Hoover sign) and the "Topics Reviewed 100% (1/1)" home-metric bug (#104) were re-verified and are **already fixed** — they are excluded from the findings. GitHub issues #98–#108 each have a referencing commit but remain OPEN; treat them as "code likely present, board stale," verified per item.

---

## 1. One-page executive audit

**Verdict: this is a genuinely strong, thoughtfully-built teaching platform — well above the median clerkship site.** The live MS3 experience has honest progress metrics, keyboard-focusable quiz controls with confidence-calibration pedagogy, a working dark mode, a passcode-gated LLM standardized-patient room with exemplary accessibility (focus trap, `aria-live`, `role="log"`), strong PHI disclaimers, and clinically sound core content. The build pipeline is portable, guarded (orphan-source, LFS-stub, and qbank duplicate-id gates), and the surveillance automation is unusually mature for a solo-maintained project. Nothing here is an immediate patient-safety hazard: the site is a supervised teaching tool with a "fictional composites, no PHI" guardrail that holds.

**Where it needs work, in priority order:**

1. **Governance integrity (highest leverage, low effort).** The faculty attestation console commits **directly to `main`**, which has **no push-triggered CI** — the one write path that changes live clinical content skips the GitHub Actions test suite (Netlify's build gate still runs). Attestation attribution is a **self-declared, editable text field** behind a single shared password, so the ledger records who *claims* to have signed off, not who did. And the practice renderer serves **retired and 49 unattested draft items** to students with no `status`/`retired` filter. These undercut the very credibility mechanism the platform is built around.

2. **Accessibility (WCAG 2.1 AA gaps, medium effort).** Real, fixable defects: dynamic quiz/score feedback isn't announced to screen readers (no `aria-live` on `review.html`, `shelf-mode.html`, `screeners.html`, the qbank quiz); light-mode text tokens `--text-light (#87786a)` and the `--primary (#c25a3c)` accent fail AA for normal-size text across 23 and 43 files respectively (dark mode passes); no skip-to-content link on tool pages; missing `<main>` landmarks on 38/59 pages; mobile mode-chips at 45×25px undershoot the 44px touch target. The SP interview room and orientation video show the team knows how to do this well — the patterns just aren't propagated.

3. **Clinical-content harmonization & completeness (faculty-gated, low-medium effort).** Clozapine ANC monitoring is described inconsistently ("required" vs "recommended/not REMS-enforced"), and an *attested* item still teaches "enrollment in the clozapine monitoring program" (no such program post-REMS). **988 is missing** from the core suicide-risk page and MS3 pocket card. The **MAOI washout interval** — a high-yield shelf fact — is absent from served content. Freshness metadata covers only 13/71 topics.

4. **Technical debt & maintenance burden (medium effort, compounding).** Adding one content page requires editing the markdown **plus** a Python `nav[]` array inside `build_deploy.py` (duplicated in `resident_section.py`, no drift guard) **plus** `site_manifest.json` **plus** `topic_meta.json` — non-technical faculty must edit Python. Design tokens are hand-duplicated across ~49 pages; three divergent design systems coexist. Six JSON schemas exist but are loaded by zero scripts (no schema validation in CI).

**Recommended immediate focus:** the governance triad (CI-on-push gate, retired/draft render filter, attestation attribution) and the two highest-reach a11y fixes (contrast tokens + `aria-live`) — all small, reviewable, high-impact. Clinical harmonization runs in parallel as a faculty-review track. Defer the resident sims (Night Float, Family Meeting), EPA/PD modules, and any ClerkshipOS migration.

**Persona snapshot:**
- *First-day MS3:* excellent orientation, honest 0% start state; the "0 MATCHED / Today on the unit" empty state reads slightly like a bug.
- *Shelf/COMAT preparer:* strong qbank (192 items, confidence-rated, explanations + evidence on every item), but MAOI-washout gap and COMAT-vs-NBME label confusion.
- *Resident:* superset content exists and is good, but the advanced site is URL-open (no access gate).
- *Clerkship director:* attestation dashboard works, but attribution and the CI-bypass write path are governance risks.
- *Content-maintaining faculty:* high per-page editing burden (Python + 3 JSON touchpoints).
- *AT / mobile user:* usable and far better than most, but the `aria-live`, contrast, skip-link, landmark, and touch-target gaps are real barriers.

---

## 2. Evidence-backed findings table

Severity: 🔴 Critical (safety/blocks) · 🟠 Serious · 🟡 Moderate · 🟢 Minor. Confidence: H/M/L.
Disposition: **Fix** (approved), **Faculty** (needs clinical sign-off), **Defer**, **Verify-first**.

### 2A. Clinical / safety defects
| ID | Finding | Evidence (file:line) | Impact | Sev | Conf | Disposition |
|----|---------|----------------------|--------|-----|------|-------------|
| CL-1 | Clozapine ANC monitoring worded inconsistently ("required" vs "recommended/not REMS-enforced") | `05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md:13` vs `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:14`, `14_Tracks/Resident/adv_psychopharmacology.md:12` | Mixed message on a high-stakes drug; ties to open #102 | 🟡 | H | Faculty |
| CL-2 | *Attested* qbank item teaches "enrollment in the clozapine monitoring program" — no such program post-REMS | `question_bank.json` item `qb_pha_011` option B (status:attested) | Internally contradicts teaching pages' "REMS eliminated 2025" | 🟡 | H | Faculty |
| CL-3 | 988 absent from core suicide-risk teaching page & MS3 suicide pocket card | `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md`; `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md:106` (988 only on `03_Core_Topics/Perinatal/…:22` + patient handouts) | Crisis number missing where a student would look first | 🟡 | H | Faculty |
| CL-4 | MAOI washout interval (2 wk / 5 wk fluoxetine) absent from all served content | present only in non-served `00_START_HERE/notebooklm_upload_2026-07-01/07_EVIDENCE_LANDMARKS_ROUNDS.md:5516` | High-yield shelf fact the repo itself flags as "commonly tested" | 🟡 | H | Faculty |
| CL-5 | Sparse freshness metadata: 13/71 topics carry `facultyReview`; safety pages unreviewed (`t_psychosis`, `psychopharm_primer`, `t_perinatal`, `protocol_library`) | `topic_meta.json`; `13_Faculty_Resources/_automation/surveillance/STATUS.md` (37 pages "needing re-review") | Can't tell learner/director what's vetted | 🟡 | H | Faculty |
| CL-6 | Broken FDA citation links: open P0 `[fda-drug-safety]` (25 files) + open P1 `[clozapine-rems]` (29 files, issue #212) | `surveillance/STATUS.md:20`; issues #211/#212 | Dead citations on drug-safety claims | 🟡 | H | Fix (content) |
| CL-7 | Minor item-quality flags from prior qbank audit (negative lead-in `qb_eth_005`; "not pregnant" framing `qb_mood_011`) | `QBANK_AUDIT_2026-07.md:79,121` | Cueing / inference risk | 🟢 | M | Faculty/Verify |

### 2B. Functional bugs
| ID | Finding | Evidence | Impact | Sev | Conf | Disposition |
|----|---------|----------|--------|-----|------|-------------|
| FN-1 | Governance write path bypasses CI: console commits directly to `main`; CI triggers only on `pull_request`+`workflow_dispatch` | `faculty-console/netlify/functions/attest.mjs:73-88`; `.github/workflows/ci.yml:6-8` | Attestation/qbank edits ship without the Actions test suite | 🟠 | H | Fix |
| FN-2 | Practice renderer serves **retired** and **draft** items — filters only category+difficulty, never `status`/`retired` | `13_Faculty_Resources/_automation/site_build/question-bank-practice.html:266-270,294,314`; retired `qb_pha_012`,`qb_sud_015`,`qb_sud_016` still queued | Retired near-dupes shown as "Pending faculty review"; no retirement signal | 🟡 | H | Fix + Faculty |

### 2C. Accessibility defects (WCAG 2.1 AA)
| ID | Finding | WCAG | Evidence | Sev | Conf | Disp |
|----|---------|------|----------|-----|------|------|
| A11Y-1 | Dynamic score/answer feedback not announced (no `aria-live`) | 4.1.3 | `review.html:228`, `shelf-mode.html`, `screeners.html`, `diagnostic-reasoning.html`, qbank quiz iframe (aria-live=0, verified live) | 🟠 | H | Fix |
| A11Y-2 | Contrast: `--text-light #87786a` 3.85–4.26 (23 files); `--primary #c25a3c` 3.94–4.36 + white-on-primary buttons (43 files); **light mode only**, dark passes (6.41) | 1.4.3 | a11y color table; live measure body 12.96/accent 3.94 | 🟠 | H | Fix |
| A11Y-3 | No skip-to-content link on production tool pages (2/59 have one) | 2.4.1 | only `spa_index.html`, `alex-tour/index.html` | 🟠 | H | Fix |
| A11Y-4 | Missing `<main>` (38/59), `<nav>` (57/59), `<header>` (~49/59) landmarks | 1.3.1 | e.g. `screeners.html`, `bfcrs.html`, `decision-aids.html`, root `index.html` | 🟡 | H | Fix |
| A11Y-5 | Mobile touch targets below 44px (mode chips 45×25px) | 2.5.5 | live measure at 375px viewport | 🟡 | H | Fix |
| A11Y-6 | Toggle state missing: `aria-pressed` sparse; `aria-expanded` absent on 50 expand buttons; `aria-current` color-only | 4.1.2, 1.3.1 | `listening-guide-briefs.html:185,208,231…`; issue #107 | 🟡 | H | Fix |
| A11Y-7 | Audio landmark files: filenames as `<code>` text with no `<audio>`/download; `review.html` audio no transcript; 100 `.m4a` no caption/transcript manifest | 1.2.1 | `listening-guide-briefs.html:189…`; `review.html:220` | 🟡 | H | Fix + content |
| A11Y-8 | Demo videos `muted loop` no `controls`/`<track>` (6 pages); `orientation-video.html` is compliant exemplar | 1.2.2, 2.2.2 | `interview-circle.html:75`, `bfcrs.html:103`, +4 | 🟡 | M | Fix |
| A11Y-9 | ~24 files return zero headings (some React-injected — verify at runtime) | 1.3.1, 2.4.6 | `screeners.html`, `decision-aids.html`, `learning-path.html`, … | 🟡 | M | Verify+Fix |
| A11Y-10 | Focus indicator removed w/o replacement | 2.4.7 | `learning-path.html:86` `input{outline:none}` no `:focus` | 🟡 | H | Fix |
| A11Y-11 | Exam timer without confirmed off/extend control | 2.2.1 | `shelf-mode.html:240,446` | 🟡 | M | Verify+Fix |
| A11Y-12 | Feedback form: no `aria-invalid`/`aria-required`/`role=alert` | 3.3.1 | `feedback.html:68-101` | 🟢 | M | Fix |

*Verified good (no action):* zero `<img>` missing alt (no `<img>` — SVG/emoji only), no `user-scalable=no`, no positive `tabindex`, no autoplay media, quiz options are real `<button>`s, `prefers-reduced-motion` respected in 17 files incl. the quiz.

### 2D. Content-quality problems
| ID | Finding | Evidence | Sev | Conf | Disp |
|----|---------|----------|-----|------|------|
| CQ-1 | Doc drift: blueprint/schema describe 144-item weighted bank; live is 192 flat-16/category | `QUESTION_BANK_BLUEPRINT.md`; `question_bank.schema.json` `_note` | 🟡 | H | Fix (docs) |
| CQ-2 | COMAT vs NBME labeling inconsistent; advertised "50-item self-check" doesn't exist (only a 4-item) | `09_Exam_Prep/README.md:2` vs `14_Tracks/MS3/…/07_shelf_guide/shelf_review_guide.md:5`; issue #106 | 🟡 | H | Faculty+Fix |
| CQ-3 | ID-prefix inconsistency (`qb_chd`/`qb_cdev`, `qb_oth`/`qb_otherdx`) | `question_bank.json` | 🟢 | H | Fix |
| CQ-4 | 712 P2 "broken DOI" digest findings look like a resolver artifact | `surveillance/history/digest_2026-07.md` | 🟢 | M | Verify |

### 2E. Technical debt
| ID | Finding | Evidence | Sev | Conf | Disp |
|----|---------|----------|-----|------|------|
| TD-1 | Light-mode design tokens duplicated ~49×; `clinical-warm.css` centralizes only dark tokens | `spa_index.html:12-20`, `clinical-warm.css:7-9`; issue #100 | 🟡 | H | Fix |
| TD-2 | Three+ divergent design systems (root `index.html`, SPA shell, faculty console) | `index.html:9-18`, `spa_index.html`, `faculty-console/index.html` (system font) | 🟡 | H | Fix (later) |
| TD-3 | Nav defined twice inline in Python (MS3 + resident), no drift guard | `build_deploy.py:226-238`, `resident_section.py:150-167` | 🟡 | H | Fix |
| TD-4 | High faculty-maintenance burden: add-a-page touches markdown + Python nav + `site_manifest.json` + `topic_meta.json` | `build_deploy.py:226`; `site_manifest.json` | 🟡 | H | Fix (workflow) |
| TD-5 | No schema validation in CI: 6 `*.schema.json` loaded by zero scripts; `question_bank.json` has no contract validator (only dup-id) | grep `*.schema.json` → 0 refs; `check-static-site.mjs:282-318`; issue #101 | 🟡 | H | Fix |
| TD-6 | No security headers (CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy); `marked.parse()`→innerHTML | live headers (only HSTS); `build_deploy.py:380` `_headers`; issue #108-adjacent | 🟡 | H | Fix |
| TD-7 | CI path-lint covers only `*.py`; `.sh/.mjs/.js` unchecked (#98: runnable pipeline is actually clean — paths only in 30 docs) | `ci.yml:29-34` | 🟢 | H | Fix (small) |
| TD-8 | Root clutter: ~24 planning/audit docs at root, none served; superseded docs un-archived; `STATUS_LATEST.md` stale (2026-07-01) | root listing; reconciliation | 🟢 | H | Fix (hygiene) |
| TD-9 | Orphan data: `qbank_attestation_2026-07-05.json` referenced by nothing; `evidence_registry.json`/`tool_registry.json` shipped but fetched by no page | architecture map | 🟢 | H | Fix (hygiene) |
| TD-10 | Orphan tests: root `tests/*.test.mjs` + `tools/*/test_*.py` not wired into CI | tests audit | 🟡 | H | Fix |
| TD-11 | `.preview.html` prototype copies duplicate production siblings (copy-drift); `build_index.py` writes `_MASTER_INDEX.xlsx` to repo root | architecture map | 🟢 | M | Fix (hygiene) |

### 2F. UX friction
| ID | Finding | Evidence | Sev | Conf | Disp |
|----|---------|----------|-----|------|------|
| UX-1 | Interview Room defaults to Live mode requiring a passcode students may not have; no mock/demo fallback on load | live `?tool=sp-interview.html` | 🟡 | M | Verify (intent) |
| UX-2 | `quick-wins/` artifacts (`differential-decision-trees.html`, `vignettes.html`, `dark-mode.css`) built but never wired into build/nav | repo root `quick-wins/`; not in `site_manifest.json` | 🟡 | H | Fix (wire or delete) |
| UX-3 | "Today on the unit — 0 MATCHED" empty state reads like a bug to a day-1 MS3 | live home | 🟢 | M | Fix (copy) |

### 2G. Performance
| ID | Finding | Evidence | Sev | Conf | Disp |
|----|---------|----------|-----|------|------|
| PF-1 | `question_bank.json` 604KB fetched wholesale by practice tool (no pagination/lazy split) | `question-bank-practice.html:770` | 🟡 | M | Fix (later) |
| PF-2 | `topic_meta.json` 231KB fetched by SPA shell on load | `spa_index.html:466` | 🟢 | M | Consider |
| PF-3 | No Lighthouse/perf budget in CI — regressions invisible | tests audit | 🟡 | H | Fix (add gate) |

### 2H. Enhancement opportunities (approved-worthy)
| ID | Opportunity | Rationale / links |
|----|-------------|-------------------|
| EN-1 | Wire `quick-wins` decision trees + vignettes into nav | closes MS3-audit "visual learning" gap #12; artifacts already built |
| EN-2 | OSCE stations → interactive scored checklists w/ critical-fail | issue #103; currently prose-only (`OSCE_Stations/README.md`) |
| EN-3 | Reusable 988/crisis-resources component across safety pages | fixes CL-3 systematically |
| EN-4 | Media transcript/caption manifest | fixes A11Y-7; orphaned P1-8 |
| EN-5 | Per-faculty identity on attestation console | fixes governance attribution |
| EN-6 | Real spaced-retrieval schedule | issue #105 |

### 2I. Scope creep to defer
| ID | Item | Why defer |
|----|------|-----------|
| DF-1 | F2 Night Float Coach, F3 Family Meeting Simulator | large new sims; core hardening first |
| DF-2 | EPA/Milestones + PD-formulation modules | v2, spec-only per FINALIZATION_PLAN |
| DF-3 | ClerkshipOS migration | explicitly locked/deferred |
| DF-4 | Hash-routing / URL-addressable content | nice-to-have; no current analytics need |
| DF-5 | Admission/progress-note & safety-plan builders | net-new tooling; not gating |

---

## 3. Prioritized backlog

Priority score = (Impact + Risk) × (6 − Effort), each 1–5. Higher = do sooner. Grouped into waves.

| Rank | Pkg | Title | Imp | Risk | Eff | Score | Faculty? | Type |
|------|-----|-------|-----|------|-----|-------|----------|------|
| 1 | **WP-01** | CI on push to `main` + protect the governance write path | 5 | 5 | 1 | 50 | No | code |
| 2 | **WP-02** | Practice renderer: exclude `retired`, gate/segregate `draft` | 5 | 4 | 1 | 45 | Advisory | code |
| 3 | **WP-03** | Contrast tokens: darken `--text-light` & `--primary` to AA | 4 | 3 | 1 | 35 | No | code/design |
| 4 | **WP-04** | `aria-live` on all scored/dynamic surfaces | 4 | 3 | 2 | 28 | No | code |
| 5 | **WP-05** | Skip-link + `<main>`/`<nav>` landmarks (shared shell + tools) | 4 | 2 | 2 | 24 | No | code |
| 6 | **WP-06** | Clinical harmonization pack (clozapine wording, 988, MAOI, `qb_pha_011`) | 4 | 4 | 2 | 32 | **Yes** | content |
| 7 | **WP-07** | Attestation attribution → per-faculty identity | 4 | 4 | 3 | 24 | No | code |
| 8 | **WP-08** | Schema-validate `question_bank.json` + `topic_meta.json` in CI | 3 | 4 | 2 | 28 | No | code/ci |
| 9 | **WP-09** | Security headers via `_headers` (CSP, XFO, nosniff, referrer) | 3 | 3 | 2 | 24 | No | code |
| 10 | **WP-10** | Mobile touch targets ≥44px + toggle `aria-pressed`/`aria-expanded`/`aria-current` | 3 | 2 | 2 | 20 | No | code |
| 11 | **WP-11** | Extract "Clinical Warm" light tokens to one stylesheet (#100) | 3 | 2 | 3 | 15 | No | code |
| 12 | **WP-12** | Faculty-authoring workflow: single-source nav (kill Python-array duplication) | 4 | 2 | 3 | 18 | No | code |
| 13 | **WP-13** | Media transcript/caption manifest + real `<audio>` players | 3 | 2 | 3 | 15 | Advisory | code/content |
| 14 | **WP-14** | Wire or remove `quick-wins/` artifacts | 3 | 2 | 1 | 25 | Advisory | code |
| 15 | **WP-15** | Repo hygiene: archive superseded docs, remove orphans, fix stale STATUS | 2 | 2 | 1 | 20 | No | hygiene |
| 16 | **WP-16** | Content/exam-prep doc reconciliation (144→192, COMAT/NBME, 50-item claim) | 2 | 2 | 2 | 16 | Advisory | docs |
| 17 | **WP-17** | Lighthouse/perf budget + a11y lint in CI | 3 | 2 | 3 | 15 | No | ci |
| 18 | **WP-18** | Wire orphan tests into CI (root `tests/`, `tools/` exporters) | 2 | 2 | 2 | 16 | No | ci |

---

## 4. Dependency & sequencing plan

```
WAVE A — Governance & safety spine (do first; small, high-impact)
  WP-01 CI-on-push ──┬─► (unblocks safe direct-to-main edits for everything after)
  WP-02 render filter │   [independent of WP-01 but ship behind CI]
  WP-06 clinical pack │   [faculty track — starts immediately, merges when signed off]
                      └─► WP-08 schema validation (extends CI added context; after WP-01)

WAVE B — Accessibility (parallelizable; independent files mostly)
  WP-03 contrast ──► WP-11 token extraction (do WP-03 first as quick token edits,
                     then WP-11 refactors them into one stylesheet)
  WP-04 aria-live   (independent)
  WP-05 landmarks/skip-link ──► feeds shared shell used by WP-10
  WP-10 touch targets + toggle states  (after WP-05 touches the shell)

WAVE C — Hardening & maintainability
  WP-07 attestation identity   (independent; touches faculty-console only)
  WP-09 security headers       (independent; _headers only)
  WP-12 single-source nav ──► reduces risk for WP-15 hygiene
  WP-13 media a11y             (independent; can follow WP-05 patterns)

WAVE D — Hygiene, docs, CI polish (low risk, batch last)
  WP-14 quick-wins wire/remove
  WP-15 repo hygiene
  WP-16 doc reconciliation      (pairs with WP-06 faculty sign-off)
  WP-17 lighthouse/a11y lint    (after WP-03/04/05 land so it doesn't red-flag known items)
  WP-18 orphan tests into CI
```

**Safe-to-parallelize (no shared files):** WP-01, WP-02, WP-04, WP-07, WP-09, WP-14 can all run concurrently by different agents.
**Must be sequential:** WP-03 → WP-11 (tokens then extraction); WP-05 → WP-10 (shell landmarks then shell touch-targets); WP-01 → WP-17 (add gate before tightening it). **WP-06 clinical** runs on its own faculty timeline and merges independently.

---

## 5. Lower-model implementation prompts (self-contained work packages)

> Each package is copy-paste ready for a lower-cost coding/writing model. All assume repo root `/Users/jm/Psychiatry-Clerkship-Library` (or the active worktree). Constraint shared by ALL code packages: **do not change `cw_`/`rp_` localStorage key names, do not introduce external CDN dependencies (the static QA gate hard-fails on them), do not add dose literals to `rp_*`/`-trainer` tools, keep `<title>`+viewport+RC-META on every page, and run the build gate before claiming done.**

### WP-01 — CI on push to `main` + protect the governance write path
**Objective:** Ensure every change that reaches `main` (including faculty-console direct commits) runs the CI suite; and/or route console commits through a branch+check.
**Inspect:** `.github/workflows/ci.yml` (triggers at lines 6-8), `faculty-console/netlify/functions/attest.mjs:73-88` (`ghPut` commits to `BRANCH`), `13_Faculty_Resources/_automation/site_build/build_and_check.sh`.
**Must stay unchanged:** the PR-triggered behavior; the Netlify build command; the fine-grained-PAT trust model; the `safeEqual` key check.
**Prompt:**
```
Add a `push` trigger scoped to `main` to .github/workflows/ci.yml so the build-test-validate
and smoke-tests jobs also run on direct commits to main (the faculty attestation console commits
directly to main via the GitHub Contents API and currently bypasses Actions CI entirely).
Keep the existing `pull_request` and `workflow_dispatch` triggers. Do NOT change `permissions`
(smoke job needs none extra). Verify the `concurrency` group still cancels superseded runs
(group is github.ref — fine for both push and PR). Do not alter any test.
```
**Expected diff:** ~3 lines in `ci.yml` (`on:` block gains `push:\n  branches: [main]`).
**Tests:** none new; confirm YAML parses (`python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'))"`). Open a throwaway commit on a branch → PR still runs; (post-merge) a push to main triggers a run.
**Acceptance:** a commit pushed to `main` appears in the Actions runs list for "CI — build, test, validate".
**Regression risk:** low — adds coverage, changes no logic. Watch for duplicate runs on PR-merge (acceptable) or increased Actions minutes.
**Faculty review:** no. **Depends on:** none.

### WP-02 — Practice renderer: exclude retired, segregate draft
**Objective:** Stop serving `retired` items; make `draft` inclusion explicit and clearly non-clinical-signed.
**Inspect:** `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (`BANK=data` ~770; `buildQueue()` 266-270; draft chip 314; setup count ~294). Data: `question_bank.json` (`retired` boolean + `retiredReason`; `status` draft/attested). Schema: `question_bank.schema.json:84`.
**Must stay unchanged:** the confidence-rating UX, two-tier flow, `cw_qb_v1`/`cw_qb_focus` keys, the existing draft "Pending faculty review" chip styling.
**Prompt:**
```
In question-bank-practice.html, filter the practice queue so items with `retired === true`
are NEVER included (they are near-duplicates retired per question_bank.schema.json:84). Update
`buildQueue()` (~line 266) and the "N of M questions match" / total counts (~line 294) to compute
from the retired-excluded set. Keep draft items included but ensure the draft badge remains and
add a one-line filter note in the setup panel: "Retired items are excluded; unattested drafts are
included and marked." Do not change localStorage keys or the confidence/two-tier logic.
Confirm the three currently-retired ids (qb_pha_012, qb_sud_015, qb_sud_016) no longer appear.
```
**Expected diff:** ~10-15 lines in one HTML file.
**Tests:** extend `check-static-site.mjs` qbank block (or a new node assertion) to fail if any `retired:true` id is referenced by the renderer's served pool; manual: start practice, verify counts drop by 3 and retired ids never render.
**Acceptance:** retired items unreachable in practice; setup count excludes them; drafts still shown+marked.
**Regression risk:** low. Verify "All categories/All levels" total updates correctly.
**Faculty review:** advisory (confirm drafts-served policy). **Depends on:** none.

### WP-03 — Contrast tokens to AA
**Objective:** Make light-mode text meet WCAG 1.4.3 (≥4.5:1 normal).
**Inspect:** inline `:root` blocks defining `--text-light` (`#87786a`, 23 files) and `--primary` (`#c25a3c`, 43 files); passing variants already exist (`--primary-dark:#a84830`, `#6b5d4f`/`#665a4f`).
**Must stay unchanged:** dark-mode tokens (already pass); the terracotta brand *feel* (choose the minimal darkening that reaches 4.5:1); button hover states.
**Prompt:**
```
Raise light-mode text contrast to WCAG AA (>=4.5:1 on #f6f3ee and #ffffff):
1. Replace `--text-light: #87786a` with `#6b5d4f` (already used by bfcrs/shelf; 5.74:1) everywhere
   it is defined in an inline :root of a SERVED page (the NN_* content/tool pages, spa_index.html,
   quick-wins/*). Leave dark-mode :root blocks untouched.
2. For text/links rendered in `--primary #c25a3c` at normal size, and for the "Start practice"-style
   white-on-primary buttons, switch the text/link usages to `--primary-dark #a84830` (>=4.5:1),
   OR bump the token itself to `#a84830` if the brand tolerates it. Large display headings (>=24px)
   may keep #c25a3c (passes large-text 3:1). Do NOT touch dark mode.
Provide the computed ratio for each changed pair in the PR description.
```
**Expected diff:** token value edits across ~40 files (mechanical); or fewer if extracted first — but do this BEFORE WP-11.
**Tests:** add a node script `tests/contrast-check.mjs` that parses served pages' `:root` and asserts `--text-light` and normal-size `--primary` usages compute ≥4.5:1 (WCAG luminance formula). Wire into `check-static-site.mjs` or CI.
**Acceptance:** every served page's body/muted/normal-accent text ≥4.5:1 in light mode; dark unchanged.
**Regression risk:** visual — spot-check screenshots light+dark. **Faculty:** no. **Depends on:** none; **blocks** WP-11.

### WP-04 — `aria-live` on scored/dynamic surfaces
**Objective:** Announce answer/score feedback to screen readers (WCAG 4.1.3).
**Inspect:** `07_Evidence_and_Reading/Landmark_Trials/review.html:228` (SRS reveal), `.../shelf-mode.html`, `02_Clinical_Skills/.../screeners.html` (PHQ-9/GAD-7 total), `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html`, `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`. **Exemplar to copy:** `_prototypes/sp-interview/sp-interview.html:197,212` (visually-hidden `aria-live="polite"` region + `say()` util).
**Must stay unchanged:** existing feedback text/logic; only add announcement.
**Prompt:**
```
For each scored/dynamic surface (review.html, shelf-mode.html, screeners.html,
diagnostic-reasoning.html, question-bank-practice.html), add a single visually-hidden
`aria-live="polite"` region and announce the outcome when feedback appears (e.g.
"Correct. " + explanation summary, or "Score: 14 of 27, moderate"). Copy the pattern from
sp-interview.html (visually-hidden region ~line 212 + say() util ~line 197). Use role="status"
for non-urgent updates. Do not change scoring logic, visible text, or localStorage keys.
Keep the region present in the DOM at load (do not create/destroy it) so updates are announced.
```
**Expected diff:** ~6-10 lines per file (one region + one announce call each).
**Tests:** add to `tests/smoke/` a Playwright assertion that answering a question updates an `[aria-live]` region's text (extend the existing nav-crawl or a new spec). Manual: VoiceOver/NVDA hears the result.
**Acceptance:** each surface has exactly one persistent polite live region that receives the outcome text.
**Regression risk:** low; ensure no double-announce. **Faculty:** no. **Depends on:** none.

### WP-05 — Skip-link + landmarks
**Objective:** Add "Skip to content" and `<main>`/`<nav>` landmarks (WCAG 2.4.1, 1.3.1).
**Inspect:** shared shell `13_Faculty_Resources/_automation/site_build/spa_index.html` (already has skip-link+nav — confirm target id), and the build's tool-page polish pass `build_deploy.py:361-408` (injects favicon/`<main>` on tools). Tool pages missing `<main>`: `screeners.html`, `bfcrs.html`, `columbia-cssrs-screener.html`, `decision-aids.html`, etc.
**Must stay unchanged:** existing layout/visual; the polish-pass injection mechanism.
**Prompt:**
```
1. Ensure every served tool page wraps its primary content in a <main id="main"> landmark. Prefer
   extending the existing build-time polish pass in build_deploy.py (~line 361-408) so it injects
   <main> when absent, rather than editing 20 files by hand — mirror how it already injects favicon.
2. Add a "Skip to content" link (href="#main", visually-hidden until focused) as the first focusable
   element of the shell and of standalone pages (root index.html). Reuse the spa_index.html pattern.
3. Add role="navigation" or a <nav> around the sidebar nav if not already a landmark.
Do not alter visible layout. Verify with a headless check that document.querySelector('main') exists
on each built tool page.
```
**Expected diff:** ~15-25 lines in `build_deploy.py` polish pass + a shell edit; no per-file HTML churn.
**Tests:** extend `check-static-site.mjs` to require a `<main>`/`role=main` and a skip-link on each built HTML; smoke test tab-order (first Tab focuses skip link).
**Acceptance:** built pages each expose `main` + skip-link; existing smoke tests still green.
**Regression risk:** medium (build-pass edit touches all tools) — run full `build_and_check.sh ms3 && ... res`. **Faculty:** no. **Depends on:** none; **feeds** WP-10.

### WP-06 — Clinical harmonization pack (FACULTY)
**Objective:** Reconcile clozapine wording, add 988 + MAOI washout, fix the attested clozapine-enrollment item — as a **content-only** change set, separate from code.
**Inspect (for the faculty author):** `05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md:13`; `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:14,32`; `14_Tracks/Resident/adv_psychopharmacology.md:12`; `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md:15`; `question_bank.json` item `qb_pha_011`; `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md`; `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md`; `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md`.
**Must stay unchanged:** the "no new numbers unless the page states them" standard; fictional-composite guardrail; the surveillance source registry (update citations separately).
**Prompt (writing model, faculty-reviewed before merge):**
```
CONTENT TASK — clinical wording, faculty sign-off REQUIRED before merge.
1. Clozapine: adopt ONE consistent phrasing for ANC monitoring across all pages. Recommended:
   "ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025;
    monitoring continues per PI, not REMS-enforced)." Replace the lone "required hematologic
    monitoring" phrasing in protocol_library_inpatient.md:13 to match.
2. question_bank.json item qb_pha_011 option B: remove "enrollment in the clozapine monitoring
   program" (no such enrollment post-REMS). Reword to "baseline ANC and ongoing ANC monitoring per
   the prescribing information." Keep it the single correct answer; update `why`/`pearl` to match.
   Because this item is status:"attested", it must be re-attested after the edit.
3. Suicide safety: add the 988 Suicide & Crisis Lifeline (and 911 for imminent danger) to the core
   suicide teaching page's crisis-resources step and to the MS3 suicide pocket card step 5.
4. Add the MAOI washout rule to the psychopharm primer and/or monitoring page: "≥2 weeks after
   stopping most SSRIs (≥5 weeks after fluoxetine) before starting an MAOI, and ≥2 weeks after an
   MAOI before a serotonergic agent." Cite the page's own evidence convention.
Deliver as a content diff only; do not touch any code, build script, or localStorage.
```
**Expected deliverable:** markdown/JSON content diff across ~6 files + a re-attestation of `qb_pha_011`.
**Tests:** `python3 13_Faculty_Resources/_automation/validate_topic_meta.py`; `check-static-site.mjs` (qbank ids intact); grep confirms single clozapine phrasing and 988 present on target pages.
**Acceptance:** clozapine phrasing uniform; `qb_pha_011` corrected+re-attested; 988 on core suicide page+pocket card; MAOI washout present.
**Regression risk:** low (content). **Faculty review:** **REQUIRED.** **Depends on:** none (runs on faculty timeline).

### WP-07 — Attestation attribution → per-faculty identity
**Objective:** Make the attestation ledger record an authenticated identity, not a self-declared editable string.
**Inspect:** `faculty-console/netlify/functions/attest.mjs:25 (ATTESTER_EMAIL),54-57 (authed),78,133,144`; `faculty-console/index.html:75,149,237` (client `attester` text input). Env: `FACULTY_ATTEST_PASSWORD`.
**Must stay unchanged:** the server-only token; `safeEqual`; commit-on-save; `reviewed.json` schema shape (`{status,at,by}`).
**Prompt:**
```
Replace the single shared password + client-editable `attester` string with per-faculty keys:
- Introduce a server env map FACULTY_KEYS as JSON {"<key>":"<Full Name, Credential>"} (documented
  in faculty-console/README.md). `authed()` looks up the presented key; on success the server sets
  `by` from the mapped name — IGNORE any client-supplied attester field.
- Remove the editable attester <input> from index.html (or make it read-only, populated from a
  /whoami response the server derives from the key). Never trust body.attester.
- Keep backward compat: if only FACULTY_ATTEST_PASSWORD is set, fall back to current behavior with
  a console warning so nothing breaks before keys are provisioned.
Add a unit test (node --test) for authed()+name-resolution with a fixture key map.
```
**Expected diff:** ~40 lines in `attest.mjs`, ~15 in `index.html`, +1 test file, README note.
**Tests:** `node --test faculty-console/**/*.test.mjs` (new); manual: two keys produce two different `by` values; unknown key → 401.
**Acceptance:** `by` is server-derived from the key; client cannot spoof attester.
**Regression risk:** medium (auth path) — keep the fallback. **Faculty:** no (but coordinate key provisioning). **Depends on:** none.

### WP-08 — Schema-validate qbank + topic_meta in CI
**Objective:** Enforce the existing JSON schemas (currently loaded by nothing).
**Inspect:** `question_bank.schema.json`, `topic_meta.schema.json`; `ci.yml`; `13_Faculty_Resources/_automation/validate_topic_meta.py` (imperative). Issue #101.
**Must stay unchanged:** the imperative validators (keep as complementary); no new runtime deps in the site.
**Prompt:**
```
Add a CI-only schema validation step (dev dependency, not shipped to the site):
- Add a small node script tests/validate-schemas.mjs using a vendored ajv (dev-only, under
  tests/) that validates question_bank.json against question_bank.schema.json and topic_meta.json
  against topic_meta.schema.json, plus communication_cases/evidence_registry/family_systems/
  tool_registry against their schemas. Exit non-zero on any violation with a readable path.
- Wire it into .github/workflows/ci.yml in the build-test-validate job (after the existing python
  validators). Do NOT add ajv to the shipped site or any tool page.
- If the current data violates a schema, report the violations (do not silently loosen the schema).
```
**Expected diff:** +1 script, +~5 lines `ci.yml`, dev `package.json` under `tests/`.
**Tests:** the script IS the test; add a negative fixture (a deliberately-broken copy) proving it fails.
**Acceptance:** CI red on schema violation; green on current data (or a report of real violations to fix first).
**Regression risk:** low; may surface pre-existing data drift (that's the point). **Faculty:** no. **Depends on:** WP-01 (so it also guards direct pushes).

### WP-09 — Security headers
**Objective:** Emit baseline security headers (defense-in-depth; `marked.parse()`→innerHTML on author-controlled content).
**Inspect:** `build_deploy.py:380` (`_headers` writer). Live headers currently: only HSTS.
**Must stay unchanged:** cache rules already in `_headers`; the iframe tool-loading (CSP must allow same-origin frames + the sp-proxy connect).
**Prompt:**
```
Extend the _headers written by build_deploy.py (~line 380) to add, under a "/*" block:
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(self)   # mic=self for SP voice
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self';
    style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
    connect-src 'self' https://sp-interview-proxy.netlify.app;
    frame-src 'self'; frame-ancestors 'self'
Keep existing Cache-Control blocks. Note: 'unsafe-inline' is required today because tokens/JS are
inline; tightening it is a follow-up after WP-11. Verify tools still load in iframes and the SP
room can still reach its proxy (connect-src) after deploy.
```
**Expected diff:** ~10 lines in the `_headers` string in `build_deploy.py`.
**Tests:** post-build, grep `_build/ms3/_headers` for the directives; after deploy, re-check response headers; smoke-test that an iframe tool + SP fetch still work (don't break `connect-src`).
**Acceptance:** all five headers present; site + SP proxy still function.
**Regression risk:** **medium — CSP can break loading.** Test the SP room, iframe tools, and audio before merge. **Faculty:** no. **Depends on:** none (but keep `'unsafe-inline'` until WP-11).

### WP-10 — Touch targets + toggle states
**Objective:** ≥44px targets on mobile; expose toggle/expander/current states.
**Inspect:** mode chips (`.mc-mode`/`.wd-mode`, 45×25px measured), `listening-guide-briefs.html` 50 expand buttons (no `aria-expanded`), dark-mode/segment toggles (no `aria-pressed`), color-only `aria-current`.
**Must stay unchanged:** visual density on desktop (grow targets via padding/min-height at mobile breakpoints); existing chip logic.
**Prompt:**
```
1. Ensure interactive chips/buttons meet 44x44 CSS px on touch: add min-height:44px (and adequate
   horizontal padding) to .mc-mode/.wd-mode and similar chips within the mobile media query; keep
   desktop appearance. 2. Add aria-expanded (toggled true/false) to all disclosure buttons in
   listening-guide-briefs.html (the 50 expand-btn) and other accordions. 3. Add aria-pressed to
   dark-mode and segmented toggle buttons reflecting on/off state. 4. Add aria-current="page"/"true"
   to the active nav/week item wherever "current" is currently signaled by color class only
   (e.g. one-patient-six-weeks .weekbtn.current). Do not change visuals beyond target sizing.
```
**Expected diff:** CSS + a handful of JS state-sync lines per file.
**Tests:** smoke assertion that toggling a chip flips `aria-pressed`; measure chip ≥44px at 375px. Manual AT check.
**Acceptance:** targets ≥44px on mobile; toggles/expanders/current-item expose state.
**Regression risk:** low-moderate (CSS). **Faculty:** no. **Depends on:** WP-05 (shell edits land first).

### WP-11 — Extract "Clinical Warm" light tokens (#100)
**Objective:** Single source of truth for light-mode tokens (dark already centralized).
**Inspect:** `clinical-warm.css` (12 lines, dark only), ~49 inline `:root` blocks, `build_deploy.py:383-408` (injects `clinical-warm.css` link + theme init).
**Must stay unchanged:** rendered colors (post-WP-03 values); dark tokens; per-page overrides that intentionally differ.
**Prompt:**
```
Move the shared light-mode :root tokens (the Clinical Warm palette: --bg,--surface,--text,
--text-mid,--text-light,--primary,--primary-dark,--accent,--warning,--danger,--good,--bad, fonts,
radii) into clinical-warm.css alongside the dark tokens, and have the build inject the <link> on
ALL served pages (extend the existing injection at build_deploy.py:383-408 which today only adds it
to tool pages lacking a dark theme). Remove the now-duplicated light :root from served pages, but
KEEP any page-specific override tokens. Values must match the post-WP-03 AA-compliant palette.
Verify byte-for-byte visual parity via the existing visual-regression smoke baseline.
```
**Expected diff:** large mechanical removal across ~49 files + `clinical-warm.css` growth + build-pass edit.
**Tests:** `tests/smoke/visual-regression.spec.js` (20% threshold) must stay green; contrast check (WP-03) still passes.
**Acceptance:** one stylesheet owns light tokens; no visual diff.
**Regression risk:** **high (touches every page)** — do after WP-03, run full visual smoke. **Faculty:** no. **Depends on:** WP-03.

### WP-12 — Single-source nav (kill Python-array duplication)
**Objective:** Define nav once as data (JSON), consumed by both site builds — so faculty edit data, not Python.
**Inspect:** `build_deploy.py:226-238` (MS3 nav array), `resident_section.py:150-167` (resident nav array), `site_manifest.json`.
**Must stay unchanged:** generated `nav.json` runtime shape (`{t,f,k,sec,...}`); the MS3-vs-resident overlay behavior.
**Prompt:**
```
Introduce a tracked source file nav_source.json (or extend site_manifest.json) that declares the
nav tree once, with per-entry flags for site scope (ms3 | resident | both) and hidden state. Have
build_deploy.py build the MS3 nav from it and resident_section.py build the resident nav from it
(applying resident overlays), replacing the two hand-maintained inline Python arrays. Emit the same
nav.json shape as today. Add a build-time check that every md/tool in site_manifest.json appears in
nav_source (and vice-versa) to guard drift. Keep output identical for the current content set
(diff nav.json before/after — must match).
```
**Expected diff:** new source file + refactor of two build scripts; nav.json output unchanged.
**Tests:** assert generated `nav.json` for both sites is byte-identical to pre-refactor (capture baseline first); existing nav-crawl smoke stays green.
**Acceptance:** nav defined once; both sites' nav.json unchanged; drift guard active.
**Regression risk:** medium — validate nav.json parity. **Faculty:** no (but this is the payoff for TD-4). **Depends on:** none; **eases** WP-15.

### WP-13 — Media transcript/caption manifest + real players
**Objective:** Make the ~100 landmark/brief audio files accessible (WCAG 1.2.1) and give videos captions.
**Inspect:** `07_Evidence_and_Reading/Landmark_Trials/listening-guide-briefs.html` (filenames as `<code>`, no `<audio>`), `review.html:220` (audio, no transcript), the 6 muted-loop demo videos; exemplar `12_Media/.../orientation-video.html` (VTT + transcript + chapters).
**Must stay unchanged:** LFS handling of media; the compliant orientation-video pattern.
**Prompt:**
```
1. In listening-guide-briefs.html, render each audio brief with a real <audio controls preload=
   "none"> plus a visible download link and the existing written "Brief" as the text alternative
   (label each with aria-label). 2. For review.html's audio overview and the 6 muted-loop demo
   videos (interview-circle.html, bfcrs.html, decision-aids.html, decisional-capacity-module.html,
   violence-risk-one-pager.html, withdrawal-ciwa-cows-card.html), add controls and a <track
   kind="captions"> (or a visible transcript/summary where a VTT isn't yet authored) following the
   orientation-video.html pattern. 3. Add a media_manifest.json cataloguing each media file ->
   {transcript|caption status, text alternative}. Do not autoplay. Faculty/authoring may supply
   VTT text; leave clearly-marked TODO only in the manifest, never in learner-visible copy.
```
**Expected diff:** HTML edits across ~8 files + a manifest.
**Tests:** `check-static-site.mjs` extended to require each `<video>` to have `controls` or a text alternative; smoke check audio elements render.
**Acceptance:** audio playable in-page with text alternative; videos have captions/controls; manifest exists.
**Regression risk:** low-medium. **Faculty:** advisory (caption text). **Depends on:** can follow WP-05 patterns.

### WP-14 — Wire or remove `quick-wins/`
**Objective:** Decide the fate of built-but-unwired artifacts.
**Inspect:** `quick-wins/differential-decision-trees.html`, `quick-wins/vignettes.html`, `quick-wins/dark-mode.css`; `site_manifest.json` (absent).
**Prompt:**
```
For each quick-wins/ artifact, either (a) register it in site_manifest.json + nav so it ships and
appears in nav (differential-decision-trees and vignettes are the visual-learning/vignette assets
prior audits requested), applying the shared shell/tokens and a11y baseline; or (b) if superseded,
move it to 99_Archive/ with a one-line note. dark-mode.css is superseded by clinical-warm.css —
archive it. Do not leave them unwired at repo root.
```
**Expected diff:** manifest+nav additions or file moves.
**Tests:** if wired, nav-crawl smoke must return 200 for the new routes; build gate green.
**Acceptance:** no unwired HTML at repo root; decisions recorded.
**Regression risk:** low. **Faculty:** advisory (are the decision trees clinically vetted?). **Depends on:** WP-05/WP-11 patterns if wiring.

### WP-15 — Repo hygiene
**Prompt:**
```
Non-behavioral hygiene, one PR: (1) Move superseded root planning/audit docs (CLERKSHIP_PLATFORM_
AUDIT_BACKLOG_2026-07-02.md, MMC-Resident-Platform_*_2026-07-02.md, _AUDIT_AND_ROADMAP.md,
_DEDUPE_REPORT.md, _QA_REPORT.md, _SESSION_HANDOFF_*, _REMEDIATION_LOG_*, FIXES_APPLIED.md, etc.)
into docs/archive/ with a short INDEX.md; keep FINALIZATION_PLAN.md + CLERKSHIPOS_BACKLOG_2026-07.md
as the authoritative overlays (add a one-line "superseded-by" header to the moved ones).
(2) Refresh STATUS_LATEST.md (currently dated 2026-07-01 and prescribes the retired manual netlify
deploy flow) to describe build-on-push. (3) Remove orphan data files that nothing references
(qbank_attestation_2026-07-05.json) after confirming zero refs, or move to docs/archive/.
(4) Stop build_index.py writing _MASTER_INDEX.xlsx to repo root — direct it to docs/ or gitignore.
Touch NO served content, NO build logic, NO tests.
```
**Tests:** `build_and_check.sh ms3 && ... res` still green (proves nothing served moved).
**Acceptance:** root decluttered; authoritative docs clear; build unaffected. **Faculty:** no. **Depends on:** WP-12 helpful but not required.

### WP-16 — Content/exam-prep doc reconciliation
**Prompt:**
```
CONTENT/DOCS: (1) Update QUESTION_BANK_BLUEPRINT.md and question_bank.schema.json `_note` to reflect
the shipped bank (192 items, flat 16/category, 143 attested/49 draft) instead of the stale 144-item
weighted description. (2) Reconcile COMAT-vs-NBME labeling: 09_Exam_Prep/README.md says "NBME... 50-
item self-check" but the authoritative shelf_review_guide.md states the exam is the NBOME COMAT and
no 50-item self-check exists (only a 4-item). Either relabel to COMAT + remove/deliver the 50-item
claim, or clearly mark it planned. (3) Normalize qbank id prefixes (qb_chd/qb_cdev, qb_oth/qb_
otherdx) to one per category if low-risk. Docs/content only.
```
**Tests:** grep confirms consistent counts/labels; qbank ids still unique (`check-static-site.mjs`).
**Acceptance:** docs match reality; labeling consistent. **Faculty:** advisory (COMAT/NBME). **Depends on:** pairs with WP-06 sign-off.

### WP-17 — Lighthouse/perf budget + a11y lint in CI
**Prompt:**
```
Add a CI job (after WP-01/03/04/05 land) that runs Lighthouse CI (or pa11y-ci + a Lighthouse perf
run) against the built _build/ms3 served locally, with a budget: performance>=0.8 mobile,
accessibility>=0.95, and pa11y (axe) zero serious/critical on a sample of routes (home, a topic
page, the qbank tool, review.html). Fail the job on regression. Use pinned versions; dev-only.
Seed baselines from the current state AFTER the a11y packages merge so it doesn't red-flag known,
in-flight items.
```
**Tests:** the job is the test; include one intentionally-bad fixture route to prove it fails.
**Acceptance:** perf+a11y regressions turn CI red. **Faculty:** no. **Depends on:** WP-01, and ideally WP-03/04/05.

### WP-18 — Wire orphan tests into CI
**Prompt:**
```
Wire the currently-orphaned tests into CI: add a root (or tests/) package.json script that runs
tests/family-companion-evergreen.test.mjs and tests/alex-tour-static.test.mjs via `node --test`,
and add the three tools/*/test_*.py exporter tests as a CI step (python). Add these to
.github/workflows/ci.yml build-test-validate job. Fix any that currently fail (report, don't delete).
```
**Tests:** the tests themselves; CI runs them.
**Acceptance:** no test file is invoked by "manual only"; CI runs all. **Faculty:** no. **Depends on:** WP-01.

---

## 6. Test & verification plan

**Baseline (reproduce current CI locally — from `ci.yml`):**
```bash
git grep -nE "/(Users|sessions)/[a-z]" -- "*.py"     # must be empty
python3 13_Faculty_Resources/_automation/site_build/test_media_guard.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
npm --prefix sp-proxy ci && npm --prefix sp-proxy test
bash _prototypes/sp-interview/tests/run-all.sh
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
# smoke:
python3 -m http.server 4200 --directory _build/ms3 & python3 -m http.server 4201 --directory _build/res &
cd tests/smoke && npm ci && npx playwright install chromium --with-deps
npx playwright test --project=nav-ms3 --project=nav-res
SP_INTERVIEW_BASE_URL=http://localhost:4200/tools/ npx playwright test --project=interview-room
npx playwright test --project=visual
```

**Per-package verification (add to CI where noted):**
| Pkg | New/מchanged test | Gate |
|-----|-------------------|------|
| WP-01 | YAML parse + observe a push run | Actions |
| WP-02 | `check-static-site.mjs`: no `retired:true` id in served pool | build gate |
| WP-03 | `tests/contrast-check.mjs` (AA on served `:root`) | CI |
| WP-04 | Playwright: answering updates an `[aria-live]` region | smoke |
| WP-05 | `check-static-site.mjs`: `<main>`+skip-link per page; first-Tab focus | build gate |
| WP-06 | grep clozapine phrasing uniform + 988 present; `validate_topic_meta.py` | content |
| WP-07 | `node --test` authed()+name map; unknown key → 401 | CI (sp/faculty) |
| WP-08 | schema validation script + negative fixture | CI |
| WP-09 | grep `_headers` directives; post-deploy header check + SP/iframe smoke | manual+build |
| WP-10 | chip ≥44px @375px; toggle flips `aria-pressed` | smoke |
| WP-11 | visual-regression baseline unchanged (20% threshold) | smoke |
| WP-12 | nav.json byte-parity vs baseline | build gate |
| WP-13 | `<video>` has controls/alt; audio renders | build gate |
| WP-17 | Lighthouse a11y≥0.95, perf≥0.8; pa11y zero serious | CI |

**Manual AT pass (once, after Wave B):** VoiceOver (Safari) + NVDA (Firefox) on: home, one topic page, qbank practice (answer + confidence), `review.html` SRS, `screeners.html`, the SP room. Keyboard-only: full task flow, focus visible throughout, Escape closes SP modals, no focus traps.

---

## 7. Faculty-attestation queue

Items that **require clinical sign-off** before merge/publish (route through the faculty console or a content PR reviewed by Dr. Moss):

| Queue | Item | Source | Action for faculty |
|-------|------|--------|--------------------|
| Q1 | Clozapine ANC wording (unify "required" vs "recommended/PI") | CL-1, WP-06 | Approve the single canonical phrasing |
| Q2 | `qb_pha_011` clozapine-enrollment correction (attested item) | CL-2, WP-06 | Approve reword **and re-attest** the item |
| Q3 | 988 addition to core suicide page + pocket card | CL-3, WP-06 | Approve crisis-resource copy |
| Q4 | MAOI washout interval addition | CL-4, WP-06 | Approve the washout statement |
| Q5 | 49 draft qbank items (48 added post-2026-07-05) | CL-5 | Attest, revise, or retire each |
| Q6 | Retired-item render policy (WP-02) | FN-2 | Confirm drafts-served-but-marked policy |
| Q7 | Freshness metadata for 58 unreviewed topics (safety pages first: `t_psychosis`, `psychopharm_primer`, `t_perinatal`, `protocol_library`) | CL-5 | Review + stamp `facultyReview` |
| Q8 | COMAT vs NBME labeling + "50-item self-check" claim | CQ-2, WP-16 | Confirm exam framing |
| Q9 | `quick-wins` decision trees clinical validity (if wired) | WP-14 | Approve or archive |
| Q10 | Minor qbank items: `qb_eth_005` negative lead-in, `qb_mood_011` framing | CL-7 | Optional revision |

**Note:** Q2 and Q5 interact with WP-02 — an attested item edited becomes draft until re-attested; the console's re-attest step (WP-07-aware) should capture who signs off.

---

## 8. PR grouping strategy

Small, reviewable, single-concern PRs. Suggested grouping (one PR each unless noted):

- **PR-A "ci: gate direct pushes to main"** — WP-01. *(merge first; unblocks safe iteration)*
- **PR-B "fix(qbank): exclude retired, mark drafts in practice"** — WP-02.
- **PR-C "a11y: AA contrast tokens (light mode)"** — WP-03.
- **PR-D "a11y: live regions for scored surfaces"** — WP-04.
- **PR-E "a11y: skip-link + landmarks via build pass"** — WP-05.
- **PR-F "content: clinical harmonization (clozapine/988/MAOI)"** — WP-06. *(content-only; faculty-reviewed; separate from all code PRs)*
- **PR-G "faculty-console: per-faculty attestation identity"** — WP-07.
- **PR-H "ci: schema-validate qbank + topic_meta"** — WP-08.
- **PR-I "sec: baseline security headers"** — WP-09. *(test SP/iframe before merge)*
- **PR-J "a11y: touch targets + toggle states"** — WP-10. *(after PR-E)*
- **PR-K "refactor(design): extract light tokens to clinical-warm.css"** — WP-11. *(after PR-C; big diff, visual-gated)*
- **PR-L "build: single-source nav"** — WP-12. *(nav.json parity-gated)*
- **PR-M "a11y: media players + transcript manifest"** — WP-13.
- **PR-N "chore: wire/remove quick-wins"** — WP-14.
- **PR-O "chore: repo hygiene + archive superseded docs"** — WP-15.
- **PR-P "docs: reconcile blueprint/exam-prep labels"** — WP-16. *(pairs with PR-F)*
- **PR-Q "ci: lighthouse + a11y budget"** — WP-17. *(after B-wave a11y merges)*
- **PR-R "ci: wire orphan tests"** — WP-18.

**Principles:** never mix a clinical-content change with a code change (PR-F/PR-P stay content-only). Keep the two big-diff PRs (PR-K tokens, PR-L nav) isolated and visual/parity-gated. Merge order respects §4 dependencies: A → (B,C,D,E,F,G,H,I in parallel) → (J after E, K after C, L standalone) → (N,O,P,Q,R cleanup).

---

## 9. Deployment & rollback checklist

**Pre-merge (every PR):**
- [ ] Local CI reproduced green (§6 baseline) incl. `build_and_check.sh ms3` **and** `res`.
- [ ] `check-static-site.mjs` passes (no CDN dep, no dose-literal in `rp_*`, `cw_/rp_` keys only, titles/viewport/RC-META intact, no LFS stubs).
- [ ] Package-specific test added and green (§6 table).
- [ ] For content PRs: `validate_topic_meta.py` + `validate_attestation_consistency.py` green; faculty sign-off recorded.
- [ ] Visual-regression smoke green (mandatory for PR-C, PR-E, PR-K).

**Deploy (Netlify build-on-push, both sites):**
- [ ] Confirm the Netlify build ran `build_and_check.sh <site>` and the QA gate passed (deploy fails closed if not).
- [ ] For PR-I (CSP): after deploy, verify (a) topic pages render, (b) iframe tools load, (c) SP room reaches `sp-interview-proxy.netlify.app` (check `connect-src`), (d) audio/video play. If any break → immediate rollback.
- [ ] For media/LFS changes: confirm `.m4a`/`.mp4` are real bytes on the live URL (not LFS stubs) — run the `lfs` smoke project against the deploy preview.
- [ ] Spot-check live: home metrics, one topic page, qbank practice (answer flow), dark mode toggle.

**Rollback triggers & procedure:**
- Triggers: QA gate failed but deploy somehow published; CSP broke tool/SP/audio loading; contrast/token change caused an unreadable surface; nav.json parity broke a route (nav-crawl 404).
- Procedure: **Netlify → Deploys → select last-known-good → "Publish deploy"** (instant rollback, no rebuild). Then revert the offending commit on `main` (`git revert <sha>`), push, let CI+build re-run. For a bad **attestation-console commit**, revert the specific `reviewed.json`/`question_bank.json` change via `git revert` (the console has no undo).
- Because the console commits to `main`, keep a **known-good tag** before any governance-tooling change (`git tag pre-WP07 && git push --tags`) for fast recovery.

**Post-deploy watch:** surveillance crons (Mon 06:00/07:00 UTC link+citation, monthly guideline) will re-scan; check `surveillance/STATUS.md` after the next run for new P0/P1s introduced by content edits.

---

## 10. Final Fable code-and-product review prompt

> Use this to drive a senior Fable review of the implemented work before final merge to `main`.

```
You are a senior product + clinical-content + accessibility + platform engineer reviewing a batch
of PRs against the psychiatry clerkship platform (jmoss333/psychiatry-clerkship, static SPA → two
Netlify sites, faculty attestation console, SP LLM proxy). Review the diff of branch <X> vs main.

Hold the work to these bars and report PASS/FAIL per item with file:line evidence:

GOVERNANCE & SAFETY
- Does any change alter what CLINICAL content students see? If so, is there faculty attestation
  recorded, and is the change content-only (no code mixed in)?
- Do faculty-console/attestation changes preserve: server-only token, safeEqual, commit-on-save,
  and now server-derived (not client-spoofable) attester identity?
- Does the practice renderer still exclude retired items and mark drafts? No un-attested item may
  render without its "pending faculty review" signal.
- Do direct pushes to main now run CI (build-test-validate + smoke)?

ACCESSIBILITY (WCAG 2.1 AA)
- Contrast: every served page's normal-size text ≥4.5:1 in BOTH light and dark. Compute ratios for
  changed tokens; dark mode must not regress.
- Live regions: each scored/dynamic surface has exactly one persistent aria-live region announcing
  outcomes. Skip-link + <main> present on each built page. Touch targets ≥44px on mobile. Toggles
  expose aria-pressed/expanded; current nav item uses aria-current, not color alone.
- No new outline:none without a focus replacement; no user-scalable=no; no autoplay; media has
  controls + a text alternative.

CORRECTNESS & REGRESSION
- Build gate (check-static-site.mjs) invariants intact: no external CDN, cw_/rp_ keys only, no dose
  literals in rp_* tools, titles/viewport/RC-META present, no LFS stubs, no duplicate qbank ids.
- If nav or tokens were refactored: nav.json is byte-identical to baseline / visual-regression is
  within threshold. If CSP was added: iframe tools, SP proxy connect-src, and audio/video still work.
- Schema validation (qbank/topic_meta) passes; no schema was loosened to hide real data drift.

PRODUCT QUALITY
- Is each PR single-concern and small? Any clinical+code mixing? Any scope creep from the deferred
  list (Night Float, Family sim, EPA/PD, ClerkshipOS, hash-routing, note builders)?
- Does the change reduce faculty-maintenance burden or add to it (e.g., new hand-maintained
  duplication)? Flag any new source-of-truth duplication.

For each FAIL, give the minimal fix. Rank findings by (learner/clinical impact × likelihood).
Do not approve any content change lacking faculty attestation. Conclude with a merge/hold decision
per PR and an overall go/no-go for the batch.
```

---

### Appendix — what's already fixed (do not re-file)
Verified resolved in the current tree/live site: the two P0 qbank factual errors (`qb_sud_014` GABA-A now "downregulates"; `qb_otherdx_005` Hoover sign now correct); the "Topics Reviewed 100% (1/1)" home metric (#104, now honest "0 of 66"); dark mode; the vignette shelf qbank (192 items); the SP Interview Room + One-Patient-Six-Weeks sims; adaptive study plan; QA harness as Netlify build gate; orphan-source/LFS/qbank-dup build guards; the 10 dropped pages restored; hardcoded paths absent from all runnable scripts (#98 is docs-only); issue-body injection hardening in surveillance (#108). GitHub issues #99–#107 each have a referencing commit — verify per item before assuming open.
