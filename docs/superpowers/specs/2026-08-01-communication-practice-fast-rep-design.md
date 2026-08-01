# Communication Practice fast spoken rep — design

**Date:** 2026-08-01

**Author:** Joshua Moss, MD (with Codex)

**Canonical repository:** `jmoss333/psychiatry-clerkship`

**Primary audience:** MS3 learners, with the same shared tool available in the resident build

**Status:** approved design, pending written-spec review and implementation plan

## Purpose

Make **What Do You Say Next?** useful as a 60–90 second bedside practice rep while preserving its
existing cases, safety boundaries, progress, filters, coaching, and links.

In plain language: the tool already contains good teaching, but it presents too much of it at once.
The redesign keeps the depth and changes the timing. A learner first says one sentence, then compares
it with the authored choices, receives a short verdict, and leaves with one transfer task. Detailed
coaching remains available after the rep instead of competing with the first action.

## Current state and problem

`02_Clinical_Skills/Communication_Practice/communication-practice.html` currently renders a case
list and, in the same initial view, a progress summary, domain summary, filters, filter history,
random drill, case metadata, learner goal, prompt, spoken-drill instructions, stance, starter cue,
include/avoid lists, timer controls, and all response choices. After a choice it adds feedback, three
transfer bullets, three “try today” targets, a related-case action, topic links, and storage copy.

Every element is individually useful. Together they make the learner decide what kind of learning
to do before practicing. Across the ten current cases, the source-derived content shown before a
choice is roughly 119–223 words, excluding much of the navigation chrome. The feature history also
shows incremental accretion: filters, random drill, local history, domain progress, transfer debrief,
supervisor huddle, and try-today targets were added separately but never recomposed into one primary
flow.

The redesign addresses simultaneous cognitive load. It does not treat clinical detail itself as the
problem and does not remove safety or governance information.

## Decisions approved with the user

1. The primary use case is a **60–90 second spoken bedside rep**, not a 3–5 minute guided lesson.
2. The selected layout is a **compact split view**: a quiet case sidebar remains visible on desktop
   while the main panel presents one task at a time.
3. On mobile, the sidebar collapses into a single **Browse cases** control and the active rep fills
   the screen.
4. The interaction has four progressive states: **Orient → Say it → Compare → Feedback and
   transfer**.
5. The spoken generation phase is 20 seconds; choosing, feedback, and transfer bring the total cycle
   to approximately 60–90 seconds.
6. The learner sees one verdict and one next move by default. The stance, include/avoid guidance,
   supervisor prompt, try-today targets, related teaching, evidence, and storage details move behind
   **Deeper coaching**.
7. The tool does not listen, record, transcribe, or accept free text.
8. Existing clinical case wording is preserved in the interface implementation. Any later copy
   shortening is a separate, faculty-reviewable data change.

## Success criteria

The redesign succeeds when:

1. A learner can identify the active situation and start the spoken response within 10 seconds.
2. A complete rep can be finished in approximately 60–90 seconds without opening deeper coaching.
3. The initial practice panel contains fewer than 60 visible words, counting all main-panel text
   including metadata, review status, title, prompt, action label, and privacy microcopy, but
   excluding the page heading and sidebar case titles.
4. The default feedback-and-transfer panel contains fewer than 55 visible words, counting all
   expanded main-panel text but excluding the collapsed deeper-coaching content.
5. Each state exposes one primary task and no more than one standalone primary call-to-action. In
   Compare, the response-choice group is the primary task rather than a separate call-to-action.
6. Existing deep links, filters, random selection, local history, progress statuses, related-case
   selection, faculty-review labels, safety boundary, topic links, and history reset remain reachable.
7. The current `cw_comm_v1` storage shape remains readable and writable without migration.
8. No microphone, audio, transcript, free-text field, or additional learner data is introduced.
9. Desktop, mobile, keyboard, focus, error recovery, and reduced-motion behavior pass focused browser
   tests.
10. Both MS3 and resident build-and-QA gates pass.

## Approaches considered

### A. Focused single panel

Show only the active rep, with case browsing behind a secondary control at every viewport size. This
has the least cognitive load and was the initial recommendation. It was not selected because it
hides useful situational context and makes browsing feel separate from practice.

### B. Compact split view — selected

Keep a restrained case list visible beside a progressive main panel on desktop. Collapse the list on
mobile. This preserves context and discoverability while removing the current teaching stack from
the initial state. The user explored all three visual options and selected this layout.

### C. Quick / Coach lanes

Ask the learner to choose Quick Rep or Coach Me before beginning. This preserves the current coaching
surface explicitly, but it adds a decision before the desired bedside action and allows the two modes
to drift. It was not selected.

## Interaction design

### State 1: Orient

The main panel shows:

- one primary domain or setting label;
- case title;
- fictional scenario prompt;
- **Start 20-second response** as the sole primary action; and
- one short statement that nothing spoken is recorded.

The existing faculty-review status remains visible. Secondary skill tags, the learner-goal paragraph,
stance, starter cue, and include/avoid lists are not shown before the learner acts.

### State 2: Say it

Starting the rep changes the main panel to:

- the authored case prompt, repeated once without truncation or paraphrase;
- “Give one first sentence aloud”;
- a 20-second countdown;
- **Finish now** as the sole standalone primary action; and
- **Need one starter cue?**, a secondary disclosure that reveals only `rapidDrill.starter`.

The browser does not access a microphone. The countdown is a pacing aid only. Nothing is captured or
evaluated. When time expires, the tool advances to Compare. Finishing early does the same.

The timer uses an absolute deadline (`endsAt`) and derives the displayed remainder from current time.
It does not assume that one interval callback equals one elapsed second. This prevents browser tab
throttling from extending the exercise. Timer resources are cleared on case change, reset, page
teardown, and every exit from the speaking state.

### State 3: Compare

The learner sees the authored choices only after generating a response. The instruction is:

> Which line is closest to your response?

Selecting a choice immediately records the existing case ID, choice ID, quality, and date, then
advances to Feedback and transfer. No correctness is inferred from the learner’s unrecorded spoken
response; the stored quality describes only the option selected for comparison.

The implementation does not shorten or rewrite current choices. A separate faculty-attested content
pass may later bring authored prompts to 30 words or fewer and choices to 35 words or fewer. Until
then, outliers remain visible rather than being altered mechanically.

### State 4: Feedback and transfer

The default panel contains:

1. the existing quality label plus the selected choice’s authored feedback;
2. one brief **Say it once more** transfer prompt; and
3. **Try the next related case** as the sole primary action.

The transfer prompt reuses the current debrief rule:

- after a best choice, repeat the line in the learner’s own words while preserving its stance;
- after another choice, revise the first sentence to validate first and ask one clear next question.

The current `relatedCase()` behavior remains the basis for the next action: prefer an unpracticed
case sharing a skill tag or linked page, then a previously practiced related case, then the next case.

### Deeper coaching

**Deeper coaching** is collapsed by default after feedback. It contains the existing teaching depth:

- stance;
- include and avoid guidance;
- supervisor-huddle prompt;
- try-today targets;
- related topic links and evidence references; and
- detailed local-storage explanation.

During the speaking state, **Need one starter cue?** exposes only the starter cue. It does not open
the entire coaching drawer or reveal the choices.

## Sidebar and responsive behavior

### Desktop

The sidebar contains, in order:

1. a compact “N of 10 practiced” summary;
2. horizontally scrollable domain filters;
3. case title plus one status (`Not practiced`, `Practiced`, `Practiced well`, `Review`, or `Retry`);
4. the active-case marker; and
5. **Surprise me** as a secondary action.

The current full skill-domain dashboard, per-filter history sentence, and reset control move into a
small **Practice details** disclosure below the list. They remain available but do not compete with
case selection. Selecting a different case cancels any active timer, discards uncommitted transient
state, and starts the new case at Orient. It does not create a progress record.

### Mobile

Below the repository’s existing small-screen breakpoint, the sidebar is replaced by:

- **Browse cases**;
- the compact practiced count; and
- the full-width active rep.

**Browse cases** opens a native modal dialog containing filters, the case list, Surprise me, and
Practice details. Escape and the explicit close action dismiss it. Closing returns focus to the
Browse cases button. Selecting a case closes the dialog, returns the main panel to Orient, and moves
focus to the new case heading.

## Architecture and isolation

The implementation remains inside the existing single-file HTML tool and uses the current JSON case
bank. No framework, backend, or dependency is added.

The renderer is divided into small responsibilities:

1. **Practice controller** — owns the current case, phase (`orient`, `speaking`, `compare`,
   `feedback`), selected choice, deadline, starter-cue disclosure, and coaching disclosure.
2. **Timer adapter** — starts, derives, announces, and cancels the absolute-deadline countdown. It is
   the only unit that owns interval resources.
3. **Case navigator** — applies the existing URL case/filter inputs, filters cases, selects random and
   related cases, and exposes compact progress labels.
4. **Sidebar renderer** — renders the desktop list and mobile-dialog contents from the same navigator
   data.
5. **Rep renderer** — renders exactly one of the four main-panel states.
6. **Progress adapter** — reads, validates, writes, and resets the existing `cw_comm_v1` records.

This is a targeted reorganization of the current renderer, not a general tool framework. The current
hardcoded `FILTERS`, `DOMAIN_ORDER`, and `CASE_FILTERS` maps remain in this scope. Moving them into
`communication_cases.json` is useful future work but is not required to simplify the interaction.

## Data and storage

No change is required to `communication_cases.json` or `communication_cases.schema.json` for this
interface release.

`cw_comm_v1` remains an object keyed by case ID:

```json
{
  "psychosis_validation_001": {
    "choiceId": "b",
    "quality": "best",
    "at": "2026-08-01"
  }
}
```

The redesign does not persist phase, timer state, starter-cue use, coaching expansion, spoken content,
try-today selection, filter selection, or mobile-dialog state. A malformed or non-object store falls
back to an empty history without deleting unrelated local storage.

Progress is written only when an authored choice is selected. Starting or finishing a timer is not
completion evidence.

## Privacy and clinical boundaries

- The tool provides no microphone permission request, recording API, speech recognition, transcript,
  textarea, or free-text field.
- Spoken practice happens in the room and is not available to the browser.
- Persistent data remains limited to anonymous case/choice/quality/date records.
- The fictional-practice and no-PHI boundary remains visible before the first action.
- Faculty-review status remains visible on each case.
- No authored clinical prompt, choice, feedback, or safety statement is changed in this interface
  implementation.

If a later copy pass shortens an authored clinical line, it must be a distinct data diff with faculty
review. Interface word-budget work must never silently paraphrase high-risk content.

## Failure and recovery behavior

### Case data cannot load

Replace the loading state with a concise error panel containing **Retry** and **Return to the
library**. Do not show an empty sidebar or imply that there are no cases when the request failed.

### Invalid deep link

If `?case=` does not identify a current case, select the first case allowed by the active filter and
show a non-blocking “That practice case is no longer available” notice. If `?filter=` is invalid,
fall back to All. A valid requested case may still update the active filter so the case remains
visible, matching current behavior.

### Corrupt local history

Treat malformed JSON, arrays, primitives, or malformed records as empty or unpracticed. The tool
must still load and must not alter any other `cw_*` key.

### Timer interruption

Changing cases, choosing Surprise me, resetting history, unloading the page, or leaving the speaking
state cancels the active interval. Returning from a background tab recomputes time from the deadline;
it never resumes from a stale displayed number.

### No matching cases

Show “No cases match this filter” with **Show all cases**. Do not leave the main panel displaying a
case that the sidebar says is absent.

## Accessibility

- All actions use native buttons; case selection uses `aria-current` for the active case.
- Phase changes move focus to the new phase heading without moving focus on every timer tick.
- The countdown has a textual value. Its polite live region announces start, five seconds remaining,
  and completion—not every second.
- Feedback is programmatically associated with the selected choice and announced once.
- Deeper coaching uses a native disclosure pattern with a descriptive accessible name.
- The mobile case picker uses a modal dialog with an accessible name, Escape behavior, initial focus,
  and focus return.
- Progress and choice quality use text in addition to color.
- The flow is complete by keyboard and does not require hover, drag, audio, animation, or a pointer.
- Reduced-motion preferences remove nonessential transitions.

## Testing and verification

Add a focused Playwright smoke spec for the built tool. It must cover:

1. direct `?case=` and `?filter=` routing;
2. invalid case and filter recovery;
3. the four-state flow, including early finish and natural timer completion;
4. starter-cue disclosure without choices or full coaching appearing early;
5. selection, one-sentence feedback, transfer prompt, deeper coaching, and related-case progression;
6. the exact `cw_comm_v1` record written for a selection and compatibility with a pre-existing record;
7. malformed local history recovery;
8. desktop sidebar filtering, Surprise me, status labels, Practice details, and history reset;
9. mobile Browse cases dialog, case selection, Escape, and focus return;
10. keyboard-only completion and meaningful focus after every phase change;
11. timer cleanup on case change and page teardown;
12. no microphone request, free-text field, console error, or unhandled page error;
13. one visible primary task in each phase, no more than one standalone primary call-to-action, and
    the response-choice group serving as the Compare task;
14. the initial-panel and default-feedback word budgets; and
15. reviewed/draft badges and the fictional-practice boundary remaining visible.

Verification also includes the existing registry/topic validators, root static-regression suite, and
the two site builds in their required sequence:

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Run the targeted Playwright spec from `tests/smoke` using that suite’s own installed dependencies.
Visual baselines, if the implementation changes a covered screenshot, must be refreshed through the
Ubuntu/Chromium workflow rather than generated on macOS.

## Expected file scope

The implementation plan should normally touch:

- `02_Clinical_Skills/Communication_Practice/communication-practice.html`;
- one focused Playwright spec under `tests/smoke/`; and
- a root static contract test only if needed to protect a build-time invariant that browser coverage
  cannot express cleanly.

It should not require changes to the case JSON, schema, build pipeline, navigation, storage namespace,
shared SRS engine, Question Bank, Family Systems Practice, or Interview Room.

## Non-goals

- Multi-turn branching conversations.
- Microphone capture, speech recognition, voice scoring, or transcript storage.
- Grading the learner’s unrecorded spoken response.
- Spaced-repetition integration or adaptive dashboard changes.
- New clinical cases or resident-specific case content.
- Moving hardcoded filter maps into JSON.
- Rewriting authored prompts, choices, feedback, or safety statements.
- Building a reusable interaction framework for other tools in this release.

## Natural next steps after this release

1. Apply the same answer-first, depth-on-demand feedback pattern to Question Bank explanations.
2. Run a separately attested copy pass on communication-choice outliers that exceed the future
   35-word choice target.
3. Consider a privacy-safe **Three-Minute Ward Rep** that interleaves communication, reasoning,
   family, and rounds practice around an evolving fictional patient. That is an innovative portfolio
   feature, not part of this focused retrofit.
