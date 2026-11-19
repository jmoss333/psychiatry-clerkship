# Cultural Formulation chart exercise implementation plan

## Goal

Add the approved fictional interview to both Cultural Formulation pages. Place the MS3 word-selection prompt under Religion, spirituality & community and the resident note-writing follow-up under What the student does.

## Design

Use the shared cultural_psychiatry_inpatient_teaching.md source. Keep all patient statements, feedback, example clauses, and follow-up questions in that authored source. The reader enhancement draws from those nodes. Reuse the approved two-chair illustration, existing warm palette, display face and native disclosures.

The interview uses a native disclosure so guide search can expose and focus an answer. Selecting the interpretation opens it. A visit-local set records answers the learner explicitly opens or reaches through guide search. Print expansion supplies no answers. Closing an answer retains what was read. A fresh mount or case reset clears the set and local draft. The worked note starts with the opening statement, adds only opened-answer clauses and lets the learner trace each to its patient quote.

## Task 1

- [x] Add browser regression coverage in tests/smoke/front-door.spec.js for placement, eight answer subsets, source tracing, keyboard activation, closing, printing, guide search, draft retention and reset.
- [x] Run the empty-answer case against the existing build and confirm it fails because the exercise is absent.
- [x] Add both sections and authored templates to 03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md.
- [x] Copy illustrations/cultural-chart.webp and register its copy in build_deploy.py.
- [x] Add fdMountCulturalChart(body) to spa_index.html and call it from both reader entry points.
- [x] Add scoped styles to frontdoor/frontdoor.css and register the component in CLASS-INVENTORY.md.
- [x] Build both sites, check panel snapshots (regeneration produced no changes) and run local validation plus the focused browser tests.
- [x] Independently review the diff and address concrete findings.
- [ ] Commit, push a draft PR and verify both hosted previews at the committed revision.

## Review focus

- Search may expose an answer through a nested disclosure.
- Print opens every disclosure but must not credit unseen answers.
- Splitting the exercise across two sections must retain one coherent visit state.
- Each phrase must trace to the matching original quote after note updates.
- Phone layout, keyboard focus and enlarged reading text must remain usable.

## Completion

Record actual checks, preview revision and any remaining CI state in the draft PR. Use one bounded external status snapshot if CI is the only pending work.

## Verification notes

The initial browser test failed on the absent exercise. Independent review identified an invisible guide-search match in inactive follow-up prompts. A regression reproduced it, and authored templates with one rendered prompt corrected it. Sixteen answer-subset checks passed across both sites. Additional browser checks exercised the faculty-preview reader, desktop and 320/390 px layouts, dark mode and 200% reading text.
