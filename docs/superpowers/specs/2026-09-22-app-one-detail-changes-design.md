# APP “One detail changes” — design specification

**Status:** Approved in chat on 2026-09-22; written specification awaiting review

**Audience:** APP / PA / NP visitors on the resident site

**Content boundary:** Nonclinical workflow rehearsal only

## Purpose

The current APP pathway helps a learner choose a starting bridge and open canonical resources, but it does not let the learner rehearse what to do when information changes. Add one short, private interaction that practices noticing change, naming uncertainty, and preparing a question for supervision.

This is not an assessment. It does not teach diagnosis, treatment, medication use, local policy, readiness, or entrustment. It does not tell the learner whether a classification is correct.

## Scope

### In scope

- Add a reusable **One detail changes** interaction to each of the three existing APP workplace-task cards.
- Use one nonclinical synthetic workflow pack per task.
- Let the learner reveal one changed detail, classify fixed statements, and select one fixed question to bring to supervision.
- Keep all interaction state in memory for the current page visit.
- Use the existing Front Door renderer, action dispatcher, resident curriculum projection, design tokens, accessibility patterns, and verification conventions.

### Out of scope

- New clinical scenarios, clinical explanations, local policy, doses, diagnostic or treatment recommendations.
- Correct answers, answer keys, scores, thresholds, pass/fail language, readiness claims, or supervisor attestation.
- Free text, uploads, microphones, model or AI calls, analytics, network submission, dashboards, or durable learner records.
- Changes to `reviewed.json`, faculty attestations, or attestation hashes.
- A new page, tool route, navigation item, or shipped-page producer.
- A direct `?audience=app` entry link. That remains a separate follow-up because it changes first-run routing rather than this rehearsal.

## Learner experience

Each APP workplace-task card keeps its existing three-part structure: prepare independently, rehearse with a canonical resource, and arrange observation. The rehearsal stage gains a button labeled **Practice one change**.

Selecting that button opens one full-width practice surface below the three task cards. Only one pack is open at a time.

The interaction has four states:

1. **Snapshot** — Show two or three fixed facts from a neutral workplace situation and a **Reveal one change** button.
2. **Change** — Reveal exactly one changed or newly uncertain detail. A visual seam separates “Before” from “Now.”
3. **Classify** — For each fixed statement, choose **Still known**, **Changed**, or **Need to clarify**. These are `aria-pressed` button groups, not drag-and-drop controls, so the interaction works with keyboard, touch, screen readers, and zoom.
4. **Prepare** — After every statement has a selection, choose one fixed supervision question. The completion view mirrors the learner’s choices and shows the selected question. It does not evaluate them.

The learner can restart the pack or close it. Reloading the page clears it. Opening a canonical resource and returning during the same page visit may retain the in-memory state, but no response is written to browser storage.

## Nonclinical practice packs

`curriculum.json` will contain exactly three packs under `appPathway.practicePacks`, and each existing activity will name one pack with `practiceId`.

The packs use these neutral settings:

| APP activity | Practice setting | Changed-detail theme |
|---|---|---|
| Initial evaluation and presentation | Training-room briefing | A source note becomes unconfirmed before a scheduled update |
| Medication plan and follow-through | Workshop equipment checkout | Ownership is clear, but the expected arrival time changes |
| Collateral and safe transition | Community-event welcome table | Accessibility signs have not arrived when the setup is handed off |

Each pack contains only:

- `id`
- `title`
- `snapshot` — two or three strings
- `change` — one string
- `statements` — exactly three `{id, text}` records
- `supervisorQuestions` — exactly three `{id, text}` records

There is deliberately no expected category, feedback map, evidence claim, policy dependency, or result field. The software can mirror what the learner chose but cannot grade it.

## Architecture and data flow

### Curriculum contract

Extend the strict curriculum schema so:

- `appPathway` requires `practicePacks`.
- Every APP activity requires a `practiceId`.
- Pack, statement, and question identifiers are non-empty and unique in their relevant scope.
- Every activity’s `practiceId` resolves to one pack.
- The resident projection retains the packs with the rest of `appPathway`; the MS3 projection continues to remove the entire APP pathway.

The curriculum validator will reject missing references, duplicates, extra properties, and practice-pack strings matching these case-insensitive clinical/evaluation stems: `clinical`, `patient`, `diagnos`, `medicat`, `dose`, `treatment`, `capacity`, `suicide`, `agitation`, `symptom`, `disease`, `disorder`, `score`, `pass`, `fail`, `correct`, `answer`, `competent`, `entrust`, or `ready`. This content scan applies only to the new pack fields; it does not reinterpret the existing clinical activity names or canonical resource links.

### Pure practice engine

Promote `frontdoor/fd_app_practice.js` from development-only infrastructure into the built Front Door script. Refactor its contract around non-evaluative classification:

- `fdAppPracticeValidate(pack)` validates the strict pack shape and rejects forbidden evaluation, patient-identifier, dose, free-text, and proprietary-item fields recursively.
- `fdAppPracticeStart(pack)` returns a fresh in-memory session at the snapshot state.
- `fdAppPracticeReveal(session)` reveals the changed detail.
- `fdAppPracticeClassify(session, statementId, categoryId)` replaces that statement’s in-memory category with one of `still-known`, `changed`, or `clarify`.
- `fdAppPracticeChooseQuestion(session, questionId)` selects one of the pack’s fixed questions only after all three statements have a category.
- `fdAppPracticeReset(session)` returns a fresh snapshot session for the same pack.
- `fdAppPracticeRender(session)` returns escaped markup only.

The engine remains ES5 and has no direct access to the DOM, storage, clock, network, analytics, or model services.

### APP renderer and controller

`frontdoor/fd_app.js` resolves each activity’s `practiceId`, renders **Practice one change**, and renders the active practice surface after the task grid.

`frontdoor/fd_wire.js` handles explicit `data-fd-app-practice-*` actions for open, reveal, classify, question, reset, and close. The transient session lives only in controller state. `frontdoor/fd_state.js` must not serialize or restore any practice-session field.

The renderer receives only the resident-projected packs. If a pack is missing or invalid, the affected task shows a scoped message: **Practice unavailable. Your preparation resources are still available.** The rest of the APP workspace remains usable.

## Visual design

The memorable element is the **change seam**, not another rounded card.

```text
┌──────────────────────────────────────────────────────────────┐
│ One detail changes                          Close             │
│                                                              │
│  BEFORE                 │ changed │  NOW                     │
│  fixed snapshot         │  seam   │  newly uncertain detail  │
│                         │         │                          │
│  Statement 1  [Still known] [Changed] [Need to clarify]      │
│  Statement 2  [Still known] [Changed] [Need to clarify]      │
│  Statement 3  [Still known] [Changed] [Need to clarify]      │
│                                                              │
│  Question to bring: [fixed choice] [fixed choice] [...]       │
└──────────────────────────────────────────────────────────────┘
```

- Use existing Front Door typefaces and tokens; introduce no font or hard-coded palette.
- Keep the surrounding surface quiet. The seam uses the existing terracotta/olive change colors, while selection and focus use the established teal tokens.
- On wide screens, “Before” and “Now” sit side by side. At phone widths they stack, with the seam becoming a horizontal divider.
- One user-triggered motion draws the seam when the change is revealed. `prefers-reduced-motion: reduce` removes that animation without removing information.
- Touch targets are at least 44 px; focus is always visible; line length remains under 80 characters.
- Completion is expressed through text and structure, never color alone.

## Privacy and governance invariants

- No practice response is written to `localStorage`, `sessionStorage`, IndexedDB, cookies, URLs, or service-worker messages.
- No practice response is passed to `cwAnalytics`, `fetch`, `sendBeacon`, `XMLHttpRequest`, WebSocket, postMessage, an AI service, or a supervisor view.
- No free-text field exists, so the interaction cannot collect PHI.
- No source content is forked for PA versus PMHNP. Both bridges use the same three APP activity packs.
- The surface states: **Private rehearsal. No score, no saved response, and nothing is sent.**
- The feature does not claim that supervised observation occurred and does not change the existing instruction to arrange observation through the institution’s approved process.

## Testing and verification

Implementation follows red-green-refactor. Tests must fail for the missing behavior before production code is changed.

### Focused tests

- Curriculum schema and validator tests cover pack shape, unique IDs, resolved `practiceId` values, prohibited fields, and prohibited clinical/evaluation vocabulary.
- Pure engine tests cover validation, immutable transitions, reveal ordering, three-category classification, completion gating, question selection, reset, escaping, and the absence of storage/network/analytics/model access.
- APP renderer tests cover the three practice entry buttons, the full-width active panel, non-evaluative completion copy, and the scoped invalid-pack fallback.
- Wire tests cover open/reveal/classify/question/reset/close actions and confirm practice state is not among persisted Front Door fields.
- Build projection tests confirm APP practice data and UI are usable in the resident build and absent from the MS3 learner experience.
- Action-contract tests include every new delegated action.

### Browser checks

- Resident desktop: complete one pack using keyboard only and verify the selected question appears without scoring language.
- Resident phone width: verify no horizontal overflow and 44 px controls.
- Reduced motion: verify the revealed change remains understandable without animation.
- Privacy: confirm no practice selections enter `cw_frontdoor_v1` and no request payload contains pack, category, statement, or question identifiers.
- MS3: confirm there is no APP role, practice entry, practice data, or rendered practice surface.

### Repository gates

- Run affected Node tests during each TDD cycle.
- Run schema and curriculum validators.
- Build and check `ms3`, then build and check `res` sequentially because their generated output overlaps.
- Run the affected Playwright projects for both audiences.
- Run `bash bin/verify.sh` before requesting review.

## Success criteria

The change is complete when an APP visitor can open any existing workplace task, reveal one nonclinical change, classify all three statements, and leave with one selected supervision question; the experience works on desktop and phone with keyboard and reduced motion; no response persists or leaves the browser; the MS3 experience remains unchanged; and all focused, audience, build, and full verification gates pass.
