# Review Lanes and Evidence Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Daily Review into clerkship and landmark lanes and connect one clinical card to a source-backed article companion.

**Architecture:** Filter existing card IDs at the presentation and queue layers while retaining the shared schedule. Generate one tiny companion feed from an explicit pair and the canonical reviewed appraisal; hash its sources as teaching dependencies. Route Today and timed blocks to All due.

**Tech Stack:** Static HTML, ES5-compatible browser JavaScript, Python 3 build, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-review-lanes-evidence-companion-design.md`

## Global Constraints

- Preserve every existing `cw_srs_v1.cards[id]` key, grade algorithm, and global new-card cap.
- AR/SP article IDs stay positional and byte-identical to the current quiz deck questions.
- New clinical presentation stays pending faculty review; do not edit `reviewed.json`.
- Keep content text-only in the DOM, source-backed, and hidden before reveal.
- Today keeps one primary action; timed blocks must serve every bucket they count.

## Review Focus

- Landmark-only due history must still open a serving queue from Today and timed blocks.
- A failed article fetch must show unknown landmark counts, not zero.
- A missing or drifted companion source must fail the build, not ship stale text.
- An unrevealed clinical prompt must not leak the paper title or result through the DOM.
- A direct Review visit and a block route must select different lanes without persisting that selection.

---

### Task 1: Lanes and shared scheduling

**Files:** `07_Evidence_and_Reading/Landmark_Trials/review.html`, `tests/review-recall.test.mjs`, new `tests/review-lanes.test.mjs`.

**Interfaces:** `reviewLane(card)` classifies an existing card as `clerkship` or `landmark`; `reviewLaneAllows(card,lane,cardState,now)` applies the selected lane. `lane=all` and `block=1` select due-only All due.

- [ ] Add tests using actual quiz IDs, Concept IDs, seeded cards, due/new states, and URL lane selection; run the focused Node tests and confirm failure.
- [ ] Add transient lane state, one shared lane predicate in `metrics()` and `start()`, separate lane counts and buttons, and explicit unavailable feed notices.
- [ ] Run the focused tests and confirm pass; verify no new localStorage key and unchanged card IDs.

### Task 2: Today and timed-block parity

**Files:** `13_Faculty_Resources/_automation/site_build/spa_index.html`, `frontdoor/fd_due.js`, `frontdoor/fd_block.js`, `tests/srs-home-counters.test.mjs`, `tests/fd-block.test.mjs`, `tests/fd-due-bank-parity.test.mjs`, `tests/fd-wire.test.mjs`.

**Interfaces:** `dueBreakdown()` adds `landmark`; `fdDueCount()` and `fdBlockDueTotal()` include it once; Today opens `?tool=review.html&lane=all`; block route adds `lane=all`.

- [ ] Add landmark-only and mixed-history tests for counts and routes; run the focused tests and confirm failure.
- [ ] Split the shell bucket, render named shares, route Today to All due, and include landmark in block totals.
- [ ] Run the focused tests and confirm pass; inspect exact URL handling in `fd_wire.js`.

### Task 3: Source-backed companion feed and visual

**Files:** new `site_build/review_companions.py`, new `site_build/review_companion_pairs.json`, both build scripts, `teaching_dependencies.py`, `review.html`, `tests/review-recall.test.mjs`, `tests/review-lanes.test.mjs`, new `site_build/test_review_companions.py`.

**Interfaces:** `feed_bytes(root, site)` returns deterministic bytes for `tools/review_companions.json`, using exact reviewed `evidence_registry.json` appraisal fields and a pair allowlist. `review.html` fetches this feed and reveals one linked visual panel only after the paired card answer.

- [ ] Add a Python drift/invalid-pair test and a DOM secrecy/navigation test; run them and confirm failure.
- [ ] Implement deterministic projection, both build copies, dependency verification, feed loading, and accessible visual panel.
- [ ] Run the focused tests and confirm pass; check that no clinical field is inferred from quizzes or secondary briefs.

### Task 3a: Primary-text and offline provenance

**Files:** `evidence_annotations.json`, `span_audit/abstract_cache.json`, `site_build/frontdoor/fd_offline.js`, `site_build/sw_template.js`, `tests/fd-offline.test.mjs`, `tests/service-worker.test.mjs`, `tests/smoke/offline.spec.js`.

**Interfaces:** The CATIE bridge claim has a verbatim source span from the primary abstract; the controlled Review offline pack checks all three teaching feeds.

- [ ] Add failing source annotation and offline missing-feed tests and verify they detect absent coverage.
- [ ] Add only primary-text-licensed claim fields, retire the CATIE orphan entry, and expand the offline URL set to Concepts, quizzes, and companions.
- [ ] Run source-span, evidence annotation, offline unit, and offline browser checks; confirm no new uncached audit row.

### Task 4: Full verification and reviewable PR

**Files:** the spec and plan above plus all changed source and test files.

- [ ] Run both build-and-check commands, targeted Node tests, the local verify gate, and focused Playwright checks for both site builds.
- [ ] Inspect diff, generated artifacts, due-count parity, color/focus behavior, and teaching dependency drift; fix concrete failures.
- [ ] Commit and push the branch, open a draft PR with clinical review pending, attach it to this task, and report exact CI/preview state.
