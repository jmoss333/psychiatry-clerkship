# Practice goals and coaching implementation plan

> **For agentic workers:** Use independently testable content, controller and view tasks. Preserve the original encounter protocol and faculty authority.

**Goal:** Let learners choose one communication goal and request an intentional coaching pause in each of the five full encounters.

**Architecture:** Two static browser modules provide authored goals and the coaching view. The existing controller owns the microphone pause and prevents all patient submissions while coaching is open. Goal choices, revealed hints and written reflection remain in page memory and never enter actor requests.

**Tech stack:** Existing classic JavaScript, HTML/CSS, Node test runner and Playwright. No new dependencies or paid calls.

**Spec:** User-approved goals and optional coaching in this conversation, refined below.

## Design and constraints

- Five full cases: Dana, Marcus, Ray, Morgan, Morgan and Maya. Existing Practice a Moment tasks remain unchanged.
- Three authored communication goals per case. Student/resident options change coaching depth only; the clinician's role and authority in the case remain unchanged.
- Each goal offers a reflective question first, a hint on request, then two acceptable example wordings on request. Examples are never sent or copied into the composer automatically.
- Learners can request coaching between patient replies. It stops recognition and its quiet timer, preserves finalized draft words and separately displays any unfinished recognition. Preparing/playing a response must finish or be explicitly interrupted before coaching; no new cancellation semantics.
- Closing coaching leaves the microphone paused. Only an explicit Resume microphone action reopens capture. All controller entry points reject sending while coaching is open; stale recognition callbacks cannot revive capture or submit text.
- A compact goal reminder remains in the encounter; closing reflection returns to that goal and stays private. No scoring, help-seeking count, diagnosis reveal or inference from speaking speed.
- New teaching wording is visibly identified as pending faculty review. Existing case attestations are not reused as approval for new coaching.
- No server changes, provider calls, persisted learner data, transcript export, clinical fact changes or production learner-site publication.

## Tasks

- [x] Establish isolated worktree from the live family branch plus current main and pass the existing hosted baseline.
- [x] Author `sp-preview/public/practice-content.js`: `PracticeContent.getCase(caseId)` returns `{id,title,goals}`; each goal has `id`, `title`, `student` and `resident` entries with `question`, `hint`, two `examples`, `reflection`. Return independent copies; invalid case ids return null and the view restricts depth to student/resident. Add content coverage and boundary tests plus a concise primary-source rationale in docs.
- [x] Add controller `openCoaching()` / `closeCoaching()` and snapshot `coachingOpen`, `coachingUnfinished`. Reject invalid/gate/moment/ended/busy/restart states. Guard capture callbacks, ready/send/resume/retry and reset on Start/Clear/End/dispose. Add meaningful lifecycle tests using the existing client harness, including stale callbacks, quiet timers, draft retention and zero extra requests.
- [x] Add `sp-preview/public/practice-coach.js` with `PracticeCoach.mount(env,{entry,room,content,onOpen,onClose})`, returning `preview(caseId,isFull)`, `begin()`, `update(snapshot)`, `clear()`, `dispose()`. Select goal/depth at entry, remind during encounter, reveal help progressively, restore focus on close, and keep end reflection private.
- [x] Wire the view through `app.js` and explicit HTML hosts. Add responsive styles, scripts and both new modules to the public build allowlist and its leakage tests.
- [x] Verify actual browser journeys: goal selection/reset; all five cases/depths; microphone paused with pending words; no Space/send/resume leakage; hint/example reveals; explicit return/resume; Clear/End; Moment isolation; no storage/network for coaching; desktop/mobile focus and layout.
- [x] Independently review content and runtime. Run the full hosted suite, hosted browser suite and required local gate.

## Acceptance

Coaching changes what the learner considers, not what the patient knows. No coaching text, goal, level or reflection is present in a request body. A paused learner can think indefinitely, return to their own draft, and resume only when ready. The feature is useful without AI grading or hidden learner profiling.

## Release record

Package the implementation as a reviewable commit and draft PR. Record the exact commit, protected deployment, served-asset verification, unchanged usage ledger and remaining faculty-review status in the task receipt. A protected engineering/faculty preview is not learner-site publication or clinical attestation.

## Local verification result

- Hosted unit/contract suite: 474 passed.
- Browser suite: 62 passed, including all five goal selectors, both depths, pause/resume boundaries and 320 px entry layout. Recognition/provider behavior was simulated; existing native audio checks were muted.
- Full `bash bin/verify.sh`: passed, including both site builds and static QA. The existing span audit still reports 11 flagged rows; a green gate is not a claim that these unrelated evidence flags or faculty decisions are resolved.
- Independent content and controller reviews found no actionable issues within their stated scope. Physical microphone testing and faculty approval of the new coaching wording remain unperformed.
