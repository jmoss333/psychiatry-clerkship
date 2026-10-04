# Case Journeys connected practice — faculty review packet

Date: October 3, 2026. Status: **new teaching prompts pending faculty review and re-attestation**. This is a local integration, not a publication or clinical approval receipt.

Students can use one selected fictional patient and chapter for interviewing, rounds, and note writing. They choose a task and about 5 or 15 minutes, read the existing story, rehearse privately, optionally compare an outline, and receive a Try / Notice / Ask card. Optional continuation follows interview → rounds → note while retaining the same chapter and duration.

Implementation through `7b37630a3951330db87aa545b07537e3ff33f881`; later documentation commits do not change teaching. The canonical prompt pack is `case-practice-data` inside `08_Cases_and_Simulation/one-patient-six-weeks.html`, and the renderer is `case-journeys/case-journeys.js`.

## Patient and chapter binding

All six routes use the selected current chapter. They neither assign clinical days to tasks nor import observations from model examples or later chapters. Changing patient or chapter, resetting, or reloading clears practice. The tool collects no spoken or written responses, saves no practice state, and awards no score or readiness status.

| Fictional patient | Supplied chapter labels |
| --- | --- |
| Jordan | Week 1; Week 2; Week 3; Week 4; Week 5; Week 6 |
| Eli | Arrival · day 0; Inpatient · day 2; Inpatient · day 5; Transition · day 10; Outpatient · week 6; Outpatient · month 3 |
| Leah | Emergency assessment · day 0; Medical reassessment · same day; After medical stabilization · day 4; Treatment planning · day 7; Transition · day 10; Outpatient · week 8 |
| Marisol | Medical ward · night 1; After urgent treatment · day 2; Medical ward · day 3; Medical ward · day 4; Discharge planning · day 7; Follow-up · week 4 |

Canonical patient JSON, source notes, historical reviewed snapshots, release authorization, and the faculty ledger remain byte-identical to the pre-integration base `8585eea`. The existing chapter teaching and model examples stay intact. Historical approval of those cases does not approve the new practice prompts.

## Shared learner teaching — verbatim

New practice prompts · Pending faculty review. Use the selected chapter's supplied story as your fact source. Model examples illustrate language and do not add established findings. Follow this chapter's supervised task and any urgent escalation before routine practice. Rehearse privately away from this page; nothing is recorded or submitted.

Read the current story, supervised task, and simulation boundary above. Keep this chapter's time point. Earlier concerns are dated history unless the current story updates them; later chapters are not additional findings for this exercise.

This is an outline to fill from the supplied story, not a completed patient assessment or a uniquely correct answer. Keep missing information explicit and discuss decisions with the supervising team.

You have rehearsed one responsibility with this fictional patient. Finishing records no progress or score and makes no claim about readiness for independent care.

## Six task and duration routes — verbatim

Interview structure is adapted from the existing Interviewing guide (`pg_interview.md`); rounds and note structure from Documentation and oral presentations (`doc_oral.md`). The following wording and cards are newly authored and need review.

### Interview this patient

Structure source: `pg_interview.md`

#### About 5 minutes

**Private rehearsal:** Privately rehearse an opening: explain your role and purpose, ask permission, and invite the person's priority from this chapter. Add one follow-up and name what you still need to clarify.

**Optional outline:** I am a learner working with your team. I would like to understand what matters most to you today. Is it okay to begin? [Follow one concern supplied in this chapter, then identify unanswered questions.]

- **Try:** Explain your role, purpose, and permission before your first question.
- **Notice:** Which supplied concern deserves a follow-up rather than an assumed answer.
- **Ask your supervisor:** Which part of this conversation should I clarify first?

#### About 15 minutes

**Private rehearsal:** Privately rehearse an opening, focused follow-ups, and a closing summary. Use the chapter's story and supervised task to choose priorities. Say what was supplied, what remains unknown, and what you will bring to your supervisor.

**Optional outline:** Opening: [role, purpose, permission, and the person's priority]. Follow-up: [questions grounded in this chapter]. Summary: [supplied account, unanswered domains, and the next supervision question].

- **Try:** Close with a summary that separates the supplied account from unanswered questions.
- **Notice:** Whether a model question or later chapter has slipped into your account as a fact.
- **Ask your supervisor:** Can we review my summary and the assessment I still need to complete?

### Present on rounds

Structure source: `doc_oral.md`

#### About 5 minutes

**Private rehearsal:** Privately deliver a brief update from this chapter. Give the current context, one supplied change, the source of that information, and one question for supervision. Do not turn missing assessment into a reassuring finding.

**Optional outline:** Context: [this chapter's setting and time]. Update: [supplied change and its source]. Still unknown: [information the story does not establish]. Question: [what you need from the supervising team].

- **Try:** Lead with this chapter's current context and the change that matters.
- **Notice:** Which sentence needs its information source stated aloud.
- **Ask your supervisor:** What is the most useful missing fact for me to bring to this discussion?

#### About 15 minutes

**Private rehearsal:** Organize a concise update using the same chapter facts you would use in a note. Separate the person's report, other reports, observations, interpretation, and uncertainty. Rehearse a shorter second version that retains the missing information and supervision question.

**Optional outline:** Current context → supplied events with sources → patient report → supplied observations → working interpretation and uncertainty → current safety information or gaps → supervision question. Each part must come from this chapter or be labeled as not supplied in this chapter.

- **Try:** Make a shorter second presentation without removing uncertainty.
- **Notice:** Whether your interpretation is being presented as a supplied observation.
- **Ask your supervisor:** Which part of my reasoning or missing assessment should we review together?

### Write a progress note

Structure source: `doc_oral.md`

#### About 5 minutes

**Private rehearsal:** Privately draft two short sections: current context or interval events, and the person's report. Use the same chapter information as your rounds update. Keep the source of each fact visible and list what still needs clarification.

**Optional outline:** Context or interval events: [supplied information, time point, and source]. Patient report: [only supplied words or concerns]. To clarify: [information not established in this chapter].

- **Try:** Separate supplied events from the person's own report in your draft.
- **Notice:** Which statement came from an illustrative example rather than the current story.
- **Ask your supervisor:** Can you check that these sections preserve the supplied facts and their sources?

#### About 15 minutes

**Private rehearsal:** Privately draft a student progress note from this chapter: context, interval events, patient report, supplied observations or MSE, formulation with uncertainty, current safety information or gaps, and the team's established decisions or supervision questions. Use the same facts as rounds; invent no diagnosis, finding, treatment, or disposition decision. Follow local documentation policy.

**Optional outline:** Context: [setting and time point]. Events and patient report: [supplied facts with sources]. Observations or MSE: [only what is supplied; name gaps]. Formulation: [working interpretation and uncertainty]. Safety: [current supplied assessment or what remains missing]. Plan: [established team decisions and questions to review, kept distinct].

- **Try:** Check each asserted finding in your practice draft against this chapter before reviewing it with your supervisor.
- **Notice:** Whether an earlier finding has been copied forward without a current update.
- **Ask your supervisor:** Which part of my draft needs clarification before it can represent today's assessment?

## Faculty decision

Review the new prompts, outlines, and cards for MS3 suitability and supervised resident use across all four case timelines. Confirm that supplied facts, unknown information, patient choice, urgent escalation, and established team decisions remain distinct. In particular, omission from a vignette must not imply a finding was absent or an assessment was not done. A fictional draft cannot verify documentation for a real patient.

The build marks Case Journeys pending because the HTML and renderer changed after its October 1 attestation. Both audience governance records have been checked. Re-attestation belongs in the existing faculty console after review of the final bytes; no agent-authored signature or ledger promotion has been added.

## Local verification

- Full local gate: `bash bin/verify.sh` — ALL CHECKS PASSED, including both site builds and QA gates (`7b37630`).
- Focused Case Journeys and practice contracts: 15 passed. All 24 chapters × six routes exercised in the pure flow contracts.
- Browser suite: `longitudinal-case.spec.js` on `nav-ms3` and `nav-res` — 28 passed. Includes all task/time choices, continuity, resets, invalid-start focus, missing-pack fallback, keyboard use, embedded 320/390-pixel light/dark layout, 200% text, and print-card appearance.
- Both complete audience CLI review exports were generated into temporary output. Their case transcripts contain all four cases / 24 chapters and all 34 new teaching passages exactly once; missing, duplicate, incomplete, and invalid-version practice packs fail explicitly.
- Independent content audit: corrected missing-information and real-note wording; no additional material source or timeline concern.
- Independent code review: corrected folio backdrop stacking, rejected-Start focus, and boolean-version validation; final phone wrapping, print styling, and readable attribution delta reviewed with no new concern.
- PHI heuristic matches inspected: the two matches are existing CSS `#713327` color values. New teaching is synthetic and contains no patient identifiers.

These checks establish local software behavior and review coverage. They do not establish faculty approval, production deployment, native VoiceOver behavior, or physical-device performance.

## Local preview

- MS3: `http://127.0.0.1:4200/?tool=one-patient-six-weeks.html&case=leah&chapter=3`
- Resident: `http://127.0.0.1:4201/?tool=one-patient-six-weeks.html&case=leah&chapter=3`

From the selected chapter, choose a responsibility and duration, then use Start practice. Read the supplied story, continue to private rehearsal, compare an outline only if useful, and inspect the tomorrow card. Try continuing to rounds and the note without changing the chapter, then change chapters to check the reset.

Concrete next option: faculty review of these six routes before learner publication.

Potential later idea: a faculty-reviewed fact-source comparison that highlights which supplied chapter sentences support an interview summary, rounds update, and practice note. It should continue using fictional content without collecting real patient material.
