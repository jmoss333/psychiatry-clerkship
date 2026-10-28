# G-B: owner-approved workflow; gate closed 2026-10-13

Approved by the owner in the review chat on 2026-10-13. These decisions supersede the corresponding open questions in PR #1034 and the core implementation plan. The owner subsequently approved each phone and desktop interaction walkthrough and explicitly approved closing G-B on 2026-10-13. Activation remains unapproved.

- Keep the hard cap of 12 listings and the reminder beginning at nine: “Eight or fewer is easier to read. You can still add up to 12.”
- Clear requires a confirmation naming the number of selected listings. “Keep packet”, Escape and backdrop dismissal preserve all state. Confirming removes saved choices and all review/callback confirmations, restores defaults and returns focus to directory search. Empty/default packets cannot be cleared. No Undo.
- Cards say “Add to packet” or “Remove from packet” according to the action. Selected cards retain the “In packet” indicator. One-listing removal is immediate. Accessible names contain the visible action; focus stays on the card action.
- Four deliberately selected, transient review confirmations: “I checked each listing’s contact details and access instructions with the service or on its website.”; “I checked that these options fit the patient’s needs, where they will live, and their practical ability to use the services.”; “I checked that no patient-identifying information was entered into this tool.”; “My supervising clinician reviewed this packet and approved it for this patient.” These are trainee confirmations, not a recorded supervisor signature. Empty packets cannot be confirmed. Content/order changes and leaving Care clear confirmations; saved packets never restore them. An operation that changes nothing preserves them.
- Withhold the free-text rationale until a separately approved design. Unexpected restored `why` data is discarded and never output. No future rationale design or purpose-label feature is authorized here.
- Bulk controls are “Add from this page” and “Add from all results”. Show available spaces and how many new eligible matches fit. Add in result order, preserve existing selections, deduplicate and respect the same eligibility rules as individual Add. Report added, already selected, full and unavailable/ineligible separately. A transient expandable list names omitted listings and reasons; it is not persisted or printed. No clinical ranking is implied. At capacity bulk actions are disabled but removal stays available.
- Keep category grouping and reordering within each category. Explain the rule. Touch and keyboard controls do not require dragging. A move announces position and retains focus on the moved listing. Display order matches packet order within a category.

Acceptance uses synthetic listings and enables the flag only in intercepted test HTML. The shipped source remains `FD_CARE_PACKET_ENABLED=false`; real profiles remain empty. The optional Undo, packet shortcut, check-help hints and purpose labels remain deferred. Existing unit approval, expiry, callback and print rules from Revision 4 remain in force.

## G-B closure record — 2026-10-13

**G-B CLOSED — owner approved the reviewed workflow.** Joshua Moss approved each interaction in the guided chat walkthrough, phone first and then desktop, and explicitly approved closure and recording this outcome in the review documents and PR descriptions.

| Interaction | Phone | Desktop |
|---|---|---|
| Add one listing | Approved | Approved |
| Remove one listing | Approved | Approved |
| Bulk add, capacity preview and omission details | Approved | Approved |
| Reorder within service-type groups | Approved | Approved |
| Counted Clear packet confirmation and reset | Approved | Approved |
| Four review confirmations and reset behavior | Approved | Approved |

The walkthrough covered the integrated implementation at `eedcb532c9fe6a330e58322fd7fe990751f90389` (#1036), including core revision `326ec9df9304284ed060f249d2fb829beed0bc34` (#1034). Approval is tied to that behavior; these closure edits change documentation only.

Acceptance evidence, separate from the owner's approval:

- Core revision: 43 packet unit tests and 52 browser checks across both learner sites passed.
- Integrated revision: 198/198 packet browser checks, 148 focused unit tests, both build/QA gates and the normal pre-push gate passed. The full root suite reported 4,108 passed, seven skipped and zero failures.
- GitHub build-test-validate, smoke and CodeQL checks passed at both exact reviewed heads; verified before closure on 2026-10-13. Those results describe the reviewed heads, not later commits.
- Browser acceptance used synthetic listings at 320px, 390px and desktop widths, enabling the feature only in intercepted test HTML. Guided chat approval and automated browser checks do not establish hands-on testing on the owner's physical devices or native screen-reader acceptance.

**Still open:** G-C (ward printer, nurse and peer-specialist review, screen reader and other browsers) and G-D (activation). Closing G-B does not approve a merge, real profile, patient use, authority-service configuration or activation. The source flag remains `false`, real profiles remain empty, and “Making home safer” stays off. Future ideas raised during the walkthrough remain deferred, including Undo, a packet shortcut, move/count highlights, omission-list selection and reset explanations.
