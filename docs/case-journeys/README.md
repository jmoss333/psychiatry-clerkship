# Case Journeys release

The requesting author reviewed these three synthetic cases and authorized publication on September 27, 2026. The shared MS3 and resident learner layer is under `08_Cases_and_Simulation/case-journeys/`. Jordan continues to use the existing root `longitudinal_case.json`.

`reviewed-snapshot/` preserves the exact reviewed drafts, including faculty discussion notes. Its draft labels describe the historical snapshot. These files and `sources.json` do not ship to learner sites. `release-review.json` records original hashes and the publication authorization; it is not a faculty-console attestation.

The learner projection preserves every chapter field except `facultyNotes`, with release metadata updated explicitly. The historical draft prefix is removed from each disclaimer, and the audience label describes the shipped learner core; the clinical scope text is preserved. All model examples, reflection prompts, and resource links remain available. The old tool URL and Jordan week links remain valid. Chapter navigation is transient, unscored, and does not read, write, or delete prior checklist progress.

Clinical wording was not changed during integration. Source scope limitations remain in `sources.json`. Future clinical edits require a new review and an updated reviewed snapshot; do not silently alter the provenance record.

## Eli presentation pilot

Eli chapters 1–4 expose the existing Read resources, supervised Practice task, and Discuss handoff/reflection in the chapter body. Model examples use a separate disclosure, while the patient state, supervised task, and simulation safety boundary remain visible. Existing resources use the learner shell’s root query route in a new tab with `noopener noreferrer` (so the embedded tool bridge does not replace the parent reader), preserving the selected case/chapter in the original tab. Communication Practice remains a separate tool; no tool scenario is incorporated into Eli’s facts. The Eli case frame labels chapters 5–6 optional follow-through; their chapter bodies and the other three cases retain their previous presentation. All canonical JSON, source notes, review records, routing, and transient/unscored state contracts remain unchanged.

Implementation audit baseline: `f25c3298c458b9f1e434b5c4d7666c4f45d345a9`; the case sources and renderer matched research baseline `fa8b2ed381361e5631566886f43252f851f37c08`. Scope owner: Milo/Codex. Teach-back is separately unassigned and outside this change. Rollback: revert this presentation/test commit; no learner data migration or backend change.

## Connected task practice — pending faculty review

Case Journeys now offers interview, rounds, and progress-note rehearsal with the selected fictional patient and chapter. Learners explicitly choose a task and about 5 or 15 minutes, read the existing story, rehearse privately, optionally compare a structural outline, and take a Try / Notice / Ask card into supervised learning. An optional next-task action follows interview → rounds → note while retaining the selected chapter and duration. Changing patient or chapter, resetting, or reloading clears practice; nothing is entered, submitted, scored, or persisted.

The canonical teaching pack is `case-practice-data` inside `08_Cases_and_Simulation/one-patient-six-weeks.html`. The existing renderer consumes it, and `export_curriculum_review.py` transcribes all six routes and shared boundaries once for each audience. Missing, duplicate, or incomplete packs fail the review export; missing or invalid runtime practice leaves the original chapters readable. No new route, clinical dataset, backend, or storage namespace is introduced.

Only the current chapter's supplied story establishes facts for the exercise. Earlier findings remain dated history unless updated, later chapters are not current findings, and model examples illustrate language rather than add observations. Missing information is labeled as not supplied rather than presumed absent or reassuring. New practice prompts are visibly pending faculty review. Canonical case JSON, `sources.json`, `reviewed-snapshot/`, `release-review.json`, and the attestation ledger are unchanged; their historical approval does not approve the new prompts. Changed HTML and renderer bytes reopen effective review through the existing build governance.

The faculty packet is [CASE_JOURNEY_PRACTICE_REVIEW.md](../../13_Faculty_Resources/Handoffs/CASE_JOURNEY_PRACTICE_REVIEW.md). Rollback is to revert the connected-practice commits; no learner data migration is required.
