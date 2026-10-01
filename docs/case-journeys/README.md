# Case Journeys release

The requesting author reviewed these three synthetic cases and authorized publication on September 27, 2026. The shared MS3 and resident learner layer is under `08_Cases_and_Simulation/case-journeys/`. Jordan continues to use the existing root `longitudinal_case.json`.

`reviewed-snapshot/` preserves the exact reviewed drafts, including faculty discussion notes. Its draft labels describe the historical snapshot. These files and `sources.json` do not ship to learner sites. `release-review.json` records original hashes and the publication authorization; it is not a faculty-console attestation.

The learner projection preserves every chapter field except `facultyNotes`, with release metadata updated explicitly. The historical draft prefix is removed from each disclaimer, and the audience label describes the shipped learner core; the clinical scope text is preserved. All model examples, reflection prompts, and resource links remain available. The old tool URL and Jordan week links remain valid. Chapter navigation is transient, unscored, and does not read, write, or delete prior checklist progress.

Clinical wording was not changed during integration. Source scope limitations remain in `sources.json`. Future clinical edits require a new review and an updated reviewed snapshot; do not silently alter the provenance record.

## Eli presentation pilot

Eli chapters 1–4 expose the existing Read resources, supervised Practice task, and Discuss handoff/reflection in the chapter body. Model examples use a separate disclosure, while the patient state, supervised task, and simulation safety boundary remain visible. Existing resources use the learner shell’s root query route in a new tab with `noopener noreferrer` (so the embedded tool bridge does not replace the parent reader), preserving the selected case/chapter in the original tab. Communication Practice remains a separate tool; no tool scenario is incorporated into Eli’s facts. The Eli case frame labels chapters 5–6 optional follow-through; their chapter bodies and the other three cases retain their previous presentation. All canonical JSON, source notes, review records, routing, and transient/unscored state contracts remain unchanged.

Implementation audit baseline: `f25c3298c458b9f1e434b5c4d7666c4f45d345a9`; the case sources and renderer matched research baseline `fa8b2ed381361e5631566886f43252f851f37c08`. Scope owner: Milo/Codex. Teach-back is separately unassigned and outside this change. Rollback: revert this presentation/test commit; no learner data migration or backend change.
