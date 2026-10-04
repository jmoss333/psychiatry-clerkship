# Prepare for tomorrow — MS3 design

**Status:** Written design approved in chat on October 2, 2026. Implementation plan and inline execution approved in chat. Initial delivery is a local preview with new teaching content pending faculty review.

**Audience:** MS3 students in the adult inpatient psychiatry clerkship.

## Purpose and agreed choices

Help a student prepare for a concrete responsibility tomorrow in a manageable amount of time. The student chooses the task and the available time. The same guide is accessible from Today and the Library.

The three initial tasks are interviewing a newly admitted patient, presenting a patient on rounds, and writing a progress note. Offer 5-minute and 15-minute preparation sessions for each. The sequence is focused reading, brief rehearsal, and a compact tomorrow card containing something to try, something to notice, and a question for supervision.

Success means a student can find the guide from either surface, understand the preparation sequence, practice the chosen task using synthetic material, and leave with a useful prompt for tomorrow. Completing a session records participation only; it makes no claim about competence or readiness for independent clinical work.

The approved written design includes both private rehearsal and an optional, explicitly revealed example for comparison.

## Approaches considered

1. **Guided preparation, recommended:** a shared workspace with task and time choices, focused reading, rehearsal, example comparison, and a tomorrow card. It gives the student a clear sequence while reusing canonical Library resources. It requires a small amount of new, faculty-reviewed teaching content.
2. **Resource checklist:** task-specific links and a suggested order, with little new content. This is quicker to deliver, but students still have to decide what to read and how to practice.
3. **Connected fictional case:** one fictional patient's encounter supplies the interview, presentation, and note exercises. This could make the relationship between the three tasks clearer, but requires more coordinated case authoring and review. Keep it as a later extension.

## Entry points and learner flow

Today gets a compact **Prepare for tomorrow** invitation below the current primary daily action. Opening preparation is a deliberate student choice. Its presence does not alter the primary-action priority rule.

The Library gets a permanent entry in its default Essentials view and full catalog. Both entries open one tool, provisionally `prepare-for-tomorrow.html`, through existing shell tool routing. The title and destination are shared so there is one preparation workspace to maintain.

The opening screen asks **What will you be doing tomorrow?** and shows the three task choices. A second group offers **About 5 minutes** and **About 15 minutes**. Neither choice is inferred from rotation week, prior performance, or clinical urgency. The student explicitly selects both before starting.

The preparation screen shows the selected task and duration, an estimated sequence, and controls to change either choice or return to the chooser. All three tasks are available at every rotation week, including when no rotation start date is configured.

### Session lengths

| Session | Orientation | Focused reading | Rehearsal and comparison | Tomorrow card |
| --- | --- | --- | --- | --- |
| About 5 minutes | 30 seconds | 2 minutes | 2 minutes | 30 seconds |
| About 15 minutes | 1 minute | 5 minutes | 7 minutes | 2 minutes |

These are preparation estimates, not a countdown, deadline, or forced transition. The short route is a smaller, independently useful exercise for the same task. It must not promise that a long resource can be read in two minutes: identify a faculty-selected passage or show a separately reviewed concise teaching section.

## Content for the three tasks

| Task | Five-minute route | Fifteen-minute route | Canonical resources |
| --- | --- | --- | --- |
| Interview a new patient | Focus on the interview opening and coverage map; privately rehearse an opening; reveal a short illustrative example. | Review a focused interview structure; rehearse a brief synthetic encounter; compare selected parts with faculty-reviewed examples. | `pg_interview.md`, `interview-circle.html` |
| Present on rounds | Review the presentation structure; rehearse a concise update from a synthetic snapshot; reveal an example. | Read the presentation guide; organize a synthetic case into a short presentation; rehearse and compare its structure with an example. | `doc_oral.md`, `oral.html` |
| Write a progress note | Review the note structure; mentally draft or write one section privately from a synthetic snapshot; reveal an example section. | Use a synthetic interval encounter to practice a complete student note; compare with an illustrative note and self-review prompts. | `doc_oral.md`, `mse.html` |

The examples illustrate an approach, rather than supplying an automatic grade or a uniquely correct response. Reflection can ask what the student included, what remains uncertain, and what they would discuss with a supervisor. The guide captures neither spoken rehearsal nor written responses.

Existing sources verified in the current checkout:

- `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md` — `pg_interview.md`.
- `02_Clinical_Skills/Interviewing/interview-circle.html` — `interview-circle.html`.
- `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md` — `doc_oral.md`.
- `02_Clinical_Skills/Oral_Presentations/oral-presentation-module.html` — `oral.html`.
- `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html` — `mse.html`.
- `14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/synthetic_practice_cases.md` — `cases.md`, a source of existing short synthetic vignettes.

The documentation guide contains a note template and a rounds example. The synthetic cases do not supply a complete paired interval encounter and model progress note. New rehearsal snapshots, selected excerpts, model responses, and tomorrow-card teaching language need faculty review as content in the new guide. The existence of a reviewed source does not attest a new summary or example derived from it.

## Tomorrow card

End each session with three short, task-specific prompts: **Try**, **Notice**, and **Ask your supervisor**. These are fixed, faculty-reviewed teaching prompts associated with the selected task. The card remains readable on a phone and through ordinary browser printing.

The closing action is **Finish preparation**, followed by a neutral completion message and a route back to Today or the task chooser. It does not mark a whole canonical reading complete, add a clinical readiness badge, or automatically finish a timed study block.

## Architecture and state

Use one single-file HTML tool in the MS3 Student Ready Pack with the build-injected Clinical Warm palette and content-height framing. Its source owns the task definitions, short and long sequences, synthetic exercises, example disclosures, and tomorrow-card text. Avoid a new backend, model service, package dependency, or generic workflow engine.

The Front Door owns only placement and navigation. Render the Today invitation from the resolved MS3 catalog presence of this tool, rather than from clock time or a hard-coded rotation week. The Library uses the same resolved item and ordinary governance badge. Shared shell modules continue to use audience-neutral display copy and existing ES5 patterns.

The tool maintains only task ID, duration, current step, and example-disclosure state for the current visit. It accepts a narrow set of navigation values for task and duration: one of three fixed task IDs and either 5 or 15. Invalid values return to the chooser with a helpful message. These fixed choices may appear in its history URL; exercise responses and completion never do.

Focused preparation content is available inside the workspace, so following an external reading is optional. A full-resource link uses the existing shell navigation bridge and the canonical slug. Before leaving, retain the task and duration in the outer shell's guide history entry so browser Back can reconstruct that preparation selection. Updating only iframe history is insufficient. Use a narrow preparation-selection bridge that accepts only the current preparation frame, the same origin, the three task IDs, and the two durations; update the outer route through the shell's history mechanism while preserving its existing Front Door snapshot. Reopening resets rehearsal/disclosure state. Navigation must pass only allowlisted preparation values and strip timed-block parameters from these optional resource links.

The guide adds no learner free text, microphone access, uploaded material, recording, response persistence, preparation-specific analytics event, or response submission. Existing centrally gated page-open analytics retain their owner-controlled settings and default off. Existing device learning records retain their current behavior; the preparation tool adds no durable completion record.

## MS3 registration and faculty review

Register the tool as an MS3-only extra using the existing `site_extras.MS3_EXTRA_TOOLS` mechanism. That list is currently derived from orientation-video assets, so separate the reusable HTML-tool list from the orientation-media package rather than classifying the guide as orientation media. `shipped_pages.py` already consumes the MS3-extra list. Regenerate the derived listing and verify actual MS3 output and resident absence.

Give the tool an MS3 navigation entry and place it through `curriculum.siteLibrary.ms3.additions` and `essentials.ms3`. The current curriculum totality check initially reads shared placement, so follow the existing audience-specific exclusion-and-overlay pattern. Add the appropriate tool registry entry, metadata marker, topic metadata, and pending ledger registration. Regenerate `metrics/allowlist.json` with `analytics_events.py --write` after adding the shipped slug; the freshness contract requires this even when analytics remain off and preparation adds no task or completion events. The faculty console supplies attestation; authoring the guide does not promote its review status.

The current tool-governance validator pins the MS3 inventory at 23. Any validator or schema contract change needed to admit the new inventory belongs in a separate governance change from the new clinical teaching content. The implementation plan must preserve that separation.

Ordinary hyperlinks are not teaching-content hash dependencies in this checkout. The guide's own source and topic metadata cover its embedded teaching content; linked resources retain their independent governance. Do not describe the guide's badge as attesting every later revision of a linked page. Preserve existing pending notices and tool restrictions when a linked resource is opened. If interview rehearsal includes risk assessment, include the canonical crisis-block marker and the repository's existing build injection.

## Existing daily-study flow

Today already offers a 5-, 10-, or 20-minute study block based on due reviews and weekly resources. The new guide's 5- and 15-minute choices describe preparation for a chosen clinical task. Keep those two purposes explicit in the entry copy.

Preparation must leave the primary-action priority, saved block, question capsule, and completion receipts intact. It must not start or end an existing block, overwrite its next step, carry `block=1` into preparation resources, or satisfy a block step by finishing an unrelated task. Returning to Today lets students resume their previous learning session through the existing controls.

## Accessibility and failure behavior

Use labeled native button groups for task and time selection with announced selection state. Reveal examples with a native disclosure or equivalent keyboard-accessible control. Give each step a clear heading, visible focus, logical tab order, and a short text indicator of progress. Respect reduced motion, text zoom, phone layout, and the existing tool-frame sizing behavior.

A missing or unavailable linked resource is named honestly. Keep the remainder of the selected preparation sequence usable, and direct the student to the Library or supervisor where appropriate. Never silently replace a missing task resource with unrelated weekly material. Invalid task/time input returns to the chooser. A malformed definition prevents that affected route from starting and reports preparation as unavailable.

## Acceptance and validation

- Both entry points open the same MS3 tool, including the default Essentials Library view.
- All six task/time combinations have complete, appropriately scoped content and an exit back to the chooser or Today.
- A student can change task/time, reveal an example, and finish without supplying personal or patient information.
- Browser Back after an optional canonical resource restores the selected task/time; invalid parameters cannot choose an arbitrary route.
- Preparation-selection messages from a different origin or frame, invalid task/time values, and unexpected message fields cannot change shell history; valid updates preserve the existing Front Door snapshot.
- Finishing preparation does not mark unrelated readings complete, alter a saved study block, or imply clinical competence.
- Controlled reviewed, pending, and unavailable fixtures verify governance behavior; tests do not depend on live faculty queue counts.
- MS3 output contains the registered tool and both entry points; resident output contains neither this MS3 route nor its entry points.
- Phone and desktop browser walkthroughs cover keyboard operation, focus, example disclosure, Back navigation, and a preexisting interrupted study block.
- Run the appropriate focused contracts, both site build/QA gates sequentially, the full local gate, and relevant smoke paths before claiming implementation is validated. These checks do not establish faculty approval or deployed-site behavior.

## Coordination and next step

This design is grounded in local source revision `cfc08d3`. Current local effective governance was checked for the cited teaching resources; deployment was not examined.

The collision sentinel reported complete local/Claude evidence and degraded GitHub evidence. A supplemental read-only GitHub connector audit listed all seven open PRs and inspected each changed-file list; none overlaps this new design path. PR #938 changes Today layout and PR #942 changes shared Front Door colors and the class inventory. Refresh their state and coordinate the future Today/CSS integration before editing shared product files.

Prepare an implementation plan that separates mechanical integration, new faculty-reviewed examples, and any governance contract adjustments. Review the completed plan and select an execution method before implementation. The first implementation deliverable should be a local reviewable preview. Faculty attestation, merge, and deployment remain separate decisions.
