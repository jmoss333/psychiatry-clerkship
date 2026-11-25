# Delirium shift comparison implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Add the approved “What changed this shift?” case to both Delirium readings, with the MS3 case under How it presents on the unit and resident follow-up under Recognize and screen.

**Architecture:** One shared authored Markdown source contains all clinical wording, three observation panels, feedback templates, and native disclosures. A small mount function switches observations and feedback for the current visit; both reader entry points invoke it. Reuse Front Door tokens and ship the approved illustration through the existing build copy path.

**Tech Stack:** Markdown with HTML, vanilla browser JavaScript, Front Door CSS, Python static builder, Playwright.

**Spec:** User-approved “What changed this shift?” mockup in this chat, approved for implementation on 2026-11-17. Three times (08:00, 11:00, 15:00); two opening-line choices; a closed comparison revealed only after a choice; separate resident rehearsal and worked response.

## Global constraints

- MS3 case under How it presents on the unit; resident follow-up under Recognize and screen, on both editions.
- Comparison stays closed until its summary is activated. Selecting an answer shows feedback and the closed summary, never opens the comparison.
- Keep clinical copy in authored source. Preserve prior page prose and faculty attestation records; content drift renders pending review.
- Fictional case; no new diagnostic score, reproduced instrument, dose, PHI, or persistent learner response storage.
- No deployment to production. Provide immutable previews of the verified commit.

## Review focus

- Phone width and enlarged reading text: no cropped controls or comparison cells.
- Keyboard switching and disclosure activation: clear focus and pressed states.
- Printing: native disclosure expansion never chooses an answer or leaves a closed reveal open afterward.
- Settings changes: current observation, selection, and draft survive an in-page appearance change.
- Fresh visit and reset: answers and free text clear; faculty-preview and learner-reader paths both work.

### Task 1: Implement and verify the integrated case

**Files:** Delirium curriculum Markdown and illustrations; site_build/build_deploy.py, spa_index.html, frontdoor/frontdoor.css; CLASS-INVENTORY.md; tests/smoke/front-door.spec.js.

**Interfaces:** `fdMountDeliriumShift(body)` enhances `#delirium-shift` and `#delirium-shift-followup`. Data attributes use `data-shift-*`. Clinical text comes from source templates, never JS literals. Time keys are morning/midday/afternoon; choices quiet/attention.

- [ ] Add browser tests for section placement, switching, both choices, closed comparison, resident reveal, reset, print restoration, and Settings/fresh-visit state.
- [ ] Verify an absent-case failure before implementation; use the existing built site only for this expected failure, never as completion evidence.
- [ ] Add authored content, approved illustration, scoped styles, and runtime wiring in both reader paths. Update CSS inventory.
- [ ] Build both editions. Run focused browser tests on both editions, static QA and the normal pre-push gate. Expected: all relevant checks pass; no new warnings/errors.
- [ ] Independently review the full feature, resolve substantive findings, and record validation.
- [ ] Commit, push a draft PR, deploy immutable previews, verify the served revision and real interactions on both previews, and send links.

## Execution notes

- User authorized implementation and previews; proceed with routine decisions without another approval round.
- Use one helper at a time for tests or independent review. No model escalation or unattended monitoring.
- If hosted CI is the only pending dependency, take one bounded snapshot, save continuation, and stop.
