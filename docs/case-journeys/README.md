# Case Journeys release

> **r2 was reviewed and authorized by the requesting author on 2026-10-04 (PR #972).** Before that, `release-review.json` carried `authorization: PENDING`; `tests/case-journeys.test.mjs` carries a merge-day human gate (AC3/AC4/AC10) that is red on GitHub Actions — and locally with `CASE_JOURNEYS_RELEASE_GATE=1` — until the authorization sentence, `reviewDate`, `sources.json` review status, and the risperidone card attestation are in place; elsewhere it is skipped with those items named so the pre-push hook does not block the review PR. r1 is preserved verbatim under `history/r1-2026-09-27/`.

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
## r2 (2026-10-03): resident layer, sources, objectives, and seven wording hunks

**Source of truth and projection.** `reviewed-snapshot/*.json` are the faculty drafts (with `facultyNotes`). The learner files under `08_Cases_and_Simulation/case-journeys/` are generated, never hand-edited:

```
python3 13_Faculty_Resources/_automation/case_journeys/project_case_journeys.py --write   # regenerate
python3 13_Faculty_Resources/_automation/case_journeys/project_case_journeys.py --check   # CI: shipped == projection
python3 13_Faculty_Resources/_automation/case_journeys/project_case_journeys.py --hashes  # for release-review.json
```

**What the projection carries in r2** (`release-review.json → projectionChanges`): every chapter field except `facultyNotes.teachingPoint`; `advancedPrompt → residentExtension` (collapsed "Resident extension"); `pitfall → commonMisstep` (collapsed "Common misstep", all learners); `sourceIds` plus a top-level `sources` list (id, title, url) rendered as "Sources for this chapter"; `objectiveIds` (objective-to-chapter map); an optional `anchor` on tool links (`pharmacy.html#risperidone`); an optional `localNote` (schema only in r2 — no text ships until a verified Maine citation exists). Ids drop the `_draft` marker.

**Wording changes since r1** are enumerated in `release-review.json → wordingChangesSinceR1` (C1 firearms/means, C2 Eli-01 opener, C3 thiamine, C5 CIWA-Ar, C6 risperidone, C8 spoken register, C10 Marisol-04 governance sentence → disclaimer). Every other string is byte-identical to r1; `git diff history/r1-2026-09-27/reviewed-snapshot reviewed-snapshot` is the complete review surface.

**Acceptance tests** (`tests/case-journeys.test.mjs`, AC0–AC10): projection equality; sources cited and resolvable; audience label ↔ resident layer invariant; no draft ids; firearms in Leah-01/05; thiamine + CIWA-Ar in Leah-02 with no dose literal anywhere; risperidone named and linked; spoken register; readability regression guard (FK ≤ 17, to tighten to 12.5 with C9); objective coverage; and the human gate (AC3/AC4/AC10; strict on Actions or with `CASE_JOURNEYS_RELEASE_GATE=1`).

**Merge-day gates:** authorization and `reviewDate` recorded 2026-10-04; `sources.json` is `faculty-reviewed` with a `resolution` on every `scopeLimit`; the two risperidone drug-card links stay in the reviewed snapshot but the projection ships them only once `pharmacy.json` marks the card `reviewed` (re-run `--write` then); faculty-console ledger rows for `one-patient-six-weeks.html` and the three case files are a separate `attest/pending` commit by the faculty identity after merge (governance separation L2–L4). Rollback: revert the r2 commit; `history/r1-2026-09-27/` is untouched.

**Known uncertainty.** Whether the learner shell forwards `#risperidone` to the embedded pharmacy tool is not covered by a smoke test yet; the pharmacy page itself honours `location.hash` on load.
