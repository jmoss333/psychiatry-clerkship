# Optional Today purpose chooser

Base: fa8b2ed381361e5631566886f43252f851f37c08 (includes #920/#922/#924). Draft only; no merge/release authority.

## Reviewed existing destination map

| Learner choice | Existing destination/action | Existing mapping evidence |
| --- | --- | --- |
| Before rounds | oral.html, normal internal tool open | curriculum.libraryHints describes gathering what rounds need and rehearsing a presentation/update; appPathway.initial-evaluation already includes it |
| Interview | pg_interview.md, normal internal reader | curriculum Library pocket cards and initial-evaluation activity already include it |
| Family conversation | family_playbook.md, normal internal reader | Care family-conversation explanation already directs learners to this Playbook (#922) |
| Study | focus existing study planner | fdBlockCard/fdBlockPlan and current 5/10/20 minute controls; no new plan or assessment algorithm |

All three resource targets ship in both audiences and their governance manifests report reviewed. Normal reader/tool governance remains authoritative; no badge, sign-off, clinical content or protected preview is changed. Missing/rights/search-only targets are omitted. No AI interview action is introduced.

## Inspectable implementation

1. Add pure allowlisted purpose renderer beside existing Today renderers. Use the active index's existing resource identity/title; never accept an arbitrary destination. Study points to the one existing planner.
2. Add an optional closed disclosure after the existing Also today device-store cards. Existing primary priority/order, due-review/time planner, capture and week actions retain their behavior and position. Choosing a purpose only displays a shortcut with “Suggested because you chose…”; it does not infer competence, filter the plan or remove unfinished work. Regular Today clears it and returns focus to the disclosure.
3. Keep purpose and disclosure state in memory only, outside the persisted Front Door state. Choices persist through same-document navigation, reset on reload, and enter no URL, shared link, telemetry, storage or export. Omit chooser in faculty preview and the separate APP workspace. No patient text fields.
4. Route published resources through existing data-fd-open controls. Study focuses the existing planner without starting/replacing a block; changing a purpose does not change its budget. Restore keyboard focus after controlled rerenders. Use existing design tokens, 44px targets and wrapping controls.
5. Test both audiences and unknown/missing destinations; session-only/storage failures; default/active planner and due review preservation; repeated changes/disclosure, reader/tool/back-forward, keyboard/mobile/large text; no sensitive URL or private-store mutation. Independent whole-diff review, complete local gate, one batched draft push and exact-head CI. No main/release edits, manual publication or security changes.

No new pedagogical content is proposed: these are shortcuts to existing curated actions with learner choice, not a new task prescription.
