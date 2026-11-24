# Personality crisis map implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved design in the existing isolated worktree, with one independent review.

**Goal:** Add “What happened just before?” to both Personality Disorders pages, preserving the three requested section placements and account-specific resident response.

**Architecture:** One authored clinical Markdown source supplies both editions. Clinical prose and alternative answers remain in that source as inert templates; the existing reader mount points manage visit-only interaction state. Existing design tokens style the component and the shared build copies its artwork.

**Tech stack:** Markdown/HTML, native buttons and disclosures, vanilla JavaScript, CSS tokens, Playwright.

**Spec:** The user-approved `what-happened-just-before.html` mockup and companion notes in this chat's visualization directory, plus the explicit instruction to implement all three sections and return both previews.

## Global constraints

- Preserve existing surrounding teaching text, crisis block, and faculty-review machinery.
- Initial workup: observed event/response, initially unknown meaning/feeling, MS3 opening question and explicit patient-account reveal.
- Acute inpatient management: response choices unlocked only after hearing the patient account.
- What the student does: resident account selector, unsaved rehearsal, and initially closed worked response tied to the selected account.
- Changing accounts clears and closes the previous worked response. Guide search and print must not manufacture learner review or reveal an unrequested answer.
- No persisted answers, no new analytics, no claims of clinical attestation; a content edit naturally reopens review.
- Manual only: when external CI/deployment is all that remains, take one bounded snapshot, record continuation, and stop.

## Review focus

Cover both editions, repeated account switches, keyboard reveal, reset/reload, guide-find/print disclosure expansion, small screens and pending-review notices. Do not pin tests to current governance state; use the existing fixture.

## Task 1: Integrate and verify the approved exercise

**Files:**
- `03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md`: all clinical copy/templates and the three blocks.
- `03_Core_Topics/Personality/illustrations/personality-conversation.webp`: approved artwork.
- `13_Faculty_Resources/_automation/site_build/{spa_index.html,build_deploy.py}`: mount function in both reader paths and asset copy.
- `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`: scoped token-based styles.
- `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`: component contract.
- `tests/smoke/front-door.spec.js`: browser regression coverage.

**Interface:** `fdMountPersonalityCrisis(body)` discovers the three authored IDs, installs local handlers once per fresh reading, and consumes source templates. It does not change app progress or persistent state.

- [x] Write browser tests that fail on the missing exercise, then run the placement test to confirm the failure.
- [x] Add the authored blocks and artwork, mount function, responsive styles, and build copy.
- [x] Run both builds and focused browser checks for placement, unknown-to-reported map changes, both response choices, selected-account worked response, reset/reload, search and print.
- [x] Review responsive/dark rendering, reading comfort, artwork loading, and actual pending-review notice on both editions.
- [ ] Run independent review and the required pre-push gate; fix concrete findings with regression coverage.
- [ ] Commit, push a draft PR, and inspect one hosted status snapshot. If previews are ready, verify the exact revision and interactions on both before returning links; otherwise preserve an exact continuation.

**Expected:** All local checks pass; either both verified hosted previews are returned or pending external work is explicitly reported with continuation saved. No merge or production release is authorized by this request.
