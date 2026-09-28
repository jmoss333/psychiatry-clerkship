# Daily Review quick sessions and schedule restore implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give learners 5-card, 10-card, or full Daily Review sessions and a validated way to move their review schedule between browsers.

**Architecture:** Keep the existing due-first queue and shared `cw_srs_v1` grader. Add an optional initial queue limit and receipt count in `review.html`. Each site build embeds the complete current question-bank ID and retired-status inventory, plus exact digests for all other review card-source files, in its copy of `review.html`. The page verifies those source bytes before treating them as ready. A pure restore preparer validates exported JSON against the inventory and the loaded review cards, then a separate user action replaces only the SRS key. A selection token prevents a slower file read from replacing a newer preview.

**Tech Stack:** Static HTML, browser JavaScript/React, Node `node:test`, Python site build.

**Spec:** `docs/superpowers/specs/2026-09-27-daily-review-quick-and-restore.md`

## Global Constraints

- Preserve `cw_srs_v1` as the one shared SRS schedule for Review, QB, and seeded practice cards.
- Keep Clerkship Review, Landmark Evidence, and All due as existing lanes; keep Anki separate.
- Do not display an exact due count while a required card source is incomplete.
- Restore writes only `cw_srs_v1` after validation and explicit confirmation; keep all other browser keys untouched.
- Keep the MS3 and resident site builds, content governance, and no-PHI requirements intact.

## Review Focus

- A missed Quick card returns in that session and the progress denominator expands; the initial cap does not suppress its retry.
- A short session ending with fewer than five available cards reports the actual persisted due count.
- An incomplete source reports incomplete due counts and disables restore preparation.
- A missing or malformed build-injected question-bank inventory disables restore preparation; no network response can silently shrink the retained schedule.
- A self-consistent but shortened article or practice response fails its site-build digest before restore can classify missing IDs as retired.
- A stale backup with removed card IDs skips those IDs visibly, while valid `QB#` schedules survive.
- Invalid JSON, storage failure, or user cancellation leaves the previous `cw_srs_v1` byte-identical.
- If file A loads more slowly than file B, the ready preview and Replace action use B.

---

### Task 1: Short review choices and truthful receipt

**Files:**
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html`
- Modify: `tests/review-lanes.test.mjs`
- Modify: `tests/review-recall.test.mjs`

**Interfaces:**
- Consumes: existing `metrics(which)`, `start(ahead)`, `grade(g)`, `cwReceipt()` and `applyGrade()`.
- Produces: `startQuick(limit)` and a per-session `quickLimit`/lane marker; receipt's remaining-due value comes from `metrics(sessionLane).due`.

- [ ] Add a failing queue test that runs the actual `start()` source with 12 due cards and asserts Quick 5 selects the first five, Quick 10 the first ten, and Review all all twelve; assert each uses the original store and lane filter.
- [ ] Run `node --test tests/review-lanes.test.mjs` and verify the new test fails for the missing quick limit.
- [ ] Add a failing render/grade test for `Again this session`, expanded `N / total` after an Again retry, and a completed quick receipt with the saved remaining-due count, including incomplete-source wording.
- [ ] Run `node --test tests/review-recall.test.mjs` and verify the new behavior fails.
- [ ] Implement `startQuick(limit)` using the existing due-first queue, clear quick/block limits even on an empty queue, carry the quick marker through every `grade()` state, derive the receipt count after `saveS()`, and render the three controls.
- [ ] Run both focused suites and `node --test tests/block-wiring.test.mjs tests/srs-home-counters.test.mjs`; confirm the original timed-block path is unchanged.
- [ ] Check `git diff --check`; commit only this task's files.

### Task 2: Validated schedule backup and restore

**Files:**
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_concept_build.py`
- Create: `tests/review-restore.test.mjs`
- Test: browser export/import journey using the Playwright CLI.

**Interfaces:**
- Consumes: the existing `clerkship-study-v2` export shape (`payload.srs`), `freshStore()`, loaded review `cards`, build-injected current `question_bank.json` ID/retired inventory, and `reviewReopenRevisedCards()`.
- Produces: `reviewPrepareRestore(payload, reviewCards, qbItems, now)` returning `{store,reviewCount,qbCount,skippedCount}`, plus `clerkship-review-backup-v1` download and a two-step browser restore.

- [ ] Add failing pure tests for current and old export envelopes, every card field's finite/bounded validation, prototype keys, unknown/retired IDs skipped, valid `QB#` preservation, and optional old statistics defaulting. The tests must assert that a malformed card rejects the whole file.
- [ ] Run `node --test tests/review-restore.test.mjs` and verify the new tests fail for the absent preparer.
- [ ] Implement the pure preparer in `review.html`. Construct a new allowlisted store; never pass an untrusted object directly to `localStorage`.
- [ ] Add failing UI/wiring tests for no write on file selection, no write on cancellation/error, one `cw_srs_v1` write after the Replace action, a visible skipped-card count, and source-incomplete refusal.
- [ ] Run `node --test tests/review-restore.test.mjs` and verify these tests fail for missing UI behavior.
- [ ] Add a failing build test for embedding every current question-bank ID and retired flag, replacing an inherited inventory on the resident build, and rejecting duplicate IDs.
- [ ] Add build injection to both site builders. Read the embedded JSON inventory during restore preparation and refuse a missing or malformed inventory; do not fetch `question_bank.json` at runtime. Embed exact built-byte SHA-256 digests for the article, topic, family, communication, and audience-specific reasoning feeds; reject responses that do not match this build.
- [ ] Add download, file selection/preview, explicit Replace, confirmation, storage error, and screen-reader status. Use a selection token so only the most recently chosen file can set the preview or error; show its name.
- [ ] Run the focused restore, queue, recall, QB, build-injection, and compatibility suites. Run a browser export/import journey with separate contexts.
- [ ] Check `git diff --check`; commit only this task's files.

### Task 3: Release verification and independent review

**Files:**
- Review: `docs/superpowers/specs/2026-09-27-daily-review-quick-and-restore.md`
- Review: this plan and the Task 1–2 diff.

- [ ] Build MS3 and resident sites with `build_and_check.sh` and run `bash bin/verify.sh` on the final head.
- [ ] Run `python3 tools/coordination/collision_report.py --path 07_Evidence_and_Reading/Landmark_Trials/review.html --path tests/review-lanes.test.mjs --path tests/review-recall.test.mjs --path tests/review-restore.test.mjs --format json --check`; record overlapping work without overwriting another checkout.
- [ ] Ask an independent reviewer to inspect restore safety, count honesty, test coverage, and source/attestation effects; fix material findings and rerun the impacted gate.
- [ ] Commit the spec and plan, push a `codex/` branch, open a reviewable PR, and attach it to this chat. State local, CI, preview, and faculty status separately.
