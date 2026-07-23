# Streamlined Faculty Attestation Console Design

**Date:** 2026-07-21

**Status:** Approved for autonomous implementation

**Scope:** `faculty-console/`, focused faculty-console tests, and the faculty review runbook

**Relationship to prior design:** This is a focused usability increment on the implemented
2026-07-17 unified faculty attestation workspace. It preserves the existing review,
security, revision, and repository-confirmation contracts while replacing the sign-off rail
and successful-item hold with a faster, clearer workflow.

## Outcome

Make every attestation requirement visible, make the next action unmistakable, and move
faculty directly to the next eligible item after a confirmed save.

In plain language: the console should never present a disabled button without explaining
what remains. Faculty see the full checklist, select each required assertion, choose
**Attest & continue**, and proceed automatically only after the repository confirms the
attestation.

## User-approved decisions

- Optimize clarity, speed, and simplicity together.
- Use a compact checklist rather than a progressive single-action card or a hidden wizard.
- Keep every current faculty assertion separate and explicit.
- Keep the primary action visible and actionable at every stage.
- Before eligibility, activating the primary action focuses the first unmet requirement.
- When eligible, the primary action becomes **Attest & continue**.
- Automatically advance after, and only after, the repository reload confirms the saved
  attestation.
- Do not weaken preview proof, exact-revision review, warning acknowledgements, clinical
  confirmations, no-PHI confirmation, immutable request snapshots, or conflict handling.

## Problem diagnosis

The current implementation correctly fails closed, but the visible workflow and the pure
eligibility model do not share a user-facing requirement representation. The final button
can be disabled while the missing requirement is elsewhere in the rail. In the observed
live failure, preview readiness and two content checks were complete, but **I reviewed the
complete item** remained unchecked. The interface displayed only a disabled attestation
button and generic explanatory text.

This is not a server or authentication defect. It is a translation defect between the
underlying safety gates and the interface.

## Faculty experience

### Shared queue and workspace

The existing one-queue workspace remains. Desktop continues to devote approximately 70%
of the workspace to the learner surface and 30% to faculty sign-off.

```text
Queue, filters, counts, and reviewer label
+--------------------------------------+-----------------------+
| Learner preview                      | Review checklist      |
| approximately 70%                    | approximately 30%     |
|                                      |                       |
|                                      | Attest & continue     |
+--------------------------------------+-----------------------+
```

The queue strip retains search, type/status filters, question-only filters, Previous, and
Next. Reviewer identity remains self-asserted under the shared faculty key and is shown
compactly in the header and confirmation group.

### Compact checklist

The existing decorative Review -> Resolve -> Confirm sections become one semantic
checklist. Every current assertion stays visible and appears in a stable order under three
plain-language groups:

1. **Learner review**
2. **Content validation** or **Question resolution**
3. **Faculty confirmation**

Each checklist row contains:

- a persistent label;
- a checked, incomplete, blocked, or unavailable state;
- short direction when the requirement cannot yet be completed;
- a stable focus target;
- its existing control when faculty action is required.

Completed rows remain visible but visually quiet. The first incomplete actionable row is
emphasized. A slim review margin connects the rows and marks the current unmet requirement.
This is the interface's single visual signature; it encodes progress rather than acting as
decoration.

The rail header displays a textual progress count such as **2 of 3 required checks
complete**. Question counts adapt to current warnings, preview fallbacks, and confirmations.

### Requirement ordering

For a Ready page or tool:

1. preview reached Ready;
2. complete item reviewed;
3. accuracy and MS3 appropriateness confirmed;
4. relevant links, media, or interactions tested.

For a page or tool with a terminal preview failure:

1. failure state and its recovery action;
2. clean full page opened;
3. separate-tab review confirmed;
4. accuracy and MS3 appropriateness confirmed;
5. relevant links, media, or interactions tested.

For a question, the checklist preserves the existing state-dependent order:

1. no unsaved edits and a current attestable Draft;
2. live learner review, or the allowed post-Retry unavailable acknowledgement;
3. exact current saved-revision review from Draft preview;
4. structural gate resolution;
5. every current warning acknowledgement;
6. clinical answer/rationale confirmation;
7. named evidence confirmation;
8. original fictional vignette and no-PHI confirmation.

Blocked or system-owned requirements are visible but are not rendered as misleading
faculty checkboxes. Their row directs faculty to Retry, Draft preview, Edit question,
Reload, or another concrete recovery action.

### Primary action

One persistent primary action appears at the bottom of the rail.

When requirements remain, its accessible and visible name is specific:

- **Review 1 remaining requirement**; or
- **Resolve 2 remaining requirements**.

Activating it does not submit. It focuses the first unmet actionable requirement, scrolls
that row into view when necessary, and briefly applies a non-motion-dependent highlight.
If the first blocker requires another route, the control focuses the corresponding Retry,
Draft preview, Edit question, Reload, or Open full page action.

When every requirement is complete, the name becomes **Attest & continue**. The submit
handler still recomputes eligibility immediately before freezing the request. The visible
checklist never grants authority independently of the existing attestation guard.

While the request is pending, the action reads **Saving and confirming...**, the current
workspace remains inert, and navigation cannot change the frozen item or reviewer label.

### Confirmed auto-advance

A successful POST alone never advances the queue. The console first reloads repository
state and verifies the requested status and, for questions, exact revision. Only then it:

1. announces and displays a compact success receipt;
2. retains a safe HTTPS commit link in the receipt;
3. chooses the next eligible item in the current visible filtered order;
4. resets item-specific review acknowledgements;
5. loads the next item's preview and focuses its workspace heading.

The success receipt remains available in a small recent-action region after advance so the
commit is not lost when the item changes.

The next item is the first later item in current filtered order that still needs review. If
none exists after the current position, selection wraps once to the first remaining eligible
item. If none remain, the console shows **Review queue complete** with the last commit
receipt and controls to change filters or view completed items.

Manual Previous and Next controls remain available when no write is pending.

## Pure review model

The pure review module becomes the single source of truth for visible requirements and
attestation eligibility.

It will expose a derived review checklist with this conceptual shape:

```js
{
  requirements: [{
    id,
    group,
    label,
    complete,
    status,
    blockerCode,
    focusId,
  }],
  completedCount,
  totalCount,
  firstUnmet,
  eligible,
  blockers,
}
```

`status` is one of `complete`, `actionable`, `blocked`, or `unavailable`. Requirement IDs,
blocker codes, and focus targets are stable constants. Truthy non-booleans never satisfy a
human confirmation.

The existing `deriveAttestationEligibility()` remains compatible for callers and tests but
delegates to the shared checklist derivation. That prevents the visible checklist and the
actual guard from drifting apart.

The model performs no DOM access, network access, state mutation, or prose rendering.

## Interface boundaries

### `faculty-console/review-model.mjs`

- own requirement ordering and completion derivation;
- preserve all current fail-closed eligibility behavior;
- return stable blocker and focus metadata;
- retain existing queue, preview-route, and message-validation behavior.

### `faculty-console/app.mjs`

- translate live application state into checklist context;
- render grouped requirements and progress;
- route the primary action to the first unmet focus target;
- submit only when the recomputed checklist is eligible;
- store the most recent confirmed receipt;
- auto-select the next eligible item after confirmed success;
- preserve the active iframe during checklist-only updates.

### `faculty-console/index.html`

- replace step-card styling with the compact checklist and review margin;
- make the primary action sticky without obscuring content;
- preserve Clinical Warm tokens and accessible contrast;
- support reduced motion, visible keyboard focus, and narrow layouts.

### Server and learner surfaces

No endpoint, authentication, repository schema, learner preview protocol, iframe sandbox,
or Netlify environment change is required.

## Failure handling

- **Preview loading:** show the loading requirement and focusable status; do not expose a
  human review checkbox prematurely.
- **Preview failure:** retain existing Retry and separate-tab or question-unavailable paths.
- **401:** retain exact item review state and frozen retry action; return to faculty-key entry.
- **409 or manifest drift:** remain on the item and use the existing reload/keep-local conflict
  handling. Never auto-advance.
- **POST failure:** preserve checks, show the stable server message, and focus the error.
- **Unconfirmed refresh:** state that the repository has not confirmed the attestation, keep
  the item selected, show no success receipt, and never auto-advance.
- **Unsafe commit URL:** fail before announcing success or advancing.
- **No next eligible item:** show the queue-complete state rather than selecting a reviewed
  item as if it needed review.
- **Changed filters during pending request:** impossible because the workspace is inert.

## Accessibility and responsive behavior

- Checklist groups use semantic headings or fieldset/legend relationships appropriate to
  their controls.
- Progress is always expressed in text; color and the review margin are supplemental.
- The guidance action focuses a real interactive control or a focusable explanatory status.
- The focused requirement is associated with its explanation and is announced through the
  existing live region without duplicating the full checklist.
- Auto-advance is announced before focus moves to the next workspace heading.
- A confirmed save never steals focus before the receipt is announced.
- At narrow widths the preview stacks above the checklist; the sticky action remains within
  the rail and does not cover checklist rows.
- Reduced-motion mode removes scroll animation and transient movement while retaining focus
  and non-color highlighting.

## Security and governance constraints

- The faculty key remains in `sessionStorage` and request headers only.
- Reviewer identity, confirmations, credentials, and edit state never enter learner URLs,
  iframe messages, or learner storage.
- Every attestation remains one item and one immutable request snapshot.
- Automated checks and preview readiness never claim clinical correctness, evidence support,
  originality, or absence of PHI.
- Exact revision, manifest, branch-head, and repository-confirmation gates remain fail closed.
- No existing attestation status changes during implementation or testing outside synthetic
  fixtures.

## Verification strategy

### Pure model tests

- Ready page/tool requirements and ordering;
- separate-tab fallback requirements;
- question Ready, Warning, Blocked, dirty, stale-revision, and unavailable paths;
- literal-boolean confirmation enforcement;
- first unmet requirement and focus target;
- compatibility between checklist eligibility and existing eligibility output.

### Interface contract tests

- compact grouped checklist and textual progress;
- persistent guidance action before eligibility;
- guidance focuses the exact first unmet control;
- **Attest & continue** appears only when eligible;
- click-time eligibility recheck prevents stale submission;
- confirmed page, tool, Ready-question, and Warning-question attestations auto-advance;
- stale GET, POST error, 401, 409, unsafe commit URL, and no-next-item behavior;
- recent receipt persistence after advance;
- iframe browsing context survives checklist updates;
- selection changes clear item-specific checks.

### Browser tests

- real keyboard traversal through the compact rail;
- live preview Ready and failure routes;
- visible focus after guidance action;
- confirmed save receipt followed by deterministic next selection;
- no advance on unconfirmed or failed writes;
- queue-complete state;
- desktop and narrow-layout assertions;
- no horizontal overflow and no sticky-action overlap.

### Repository gates

Run focused Node tests first, then the root static tests, MS3 and resident builds, and the
faculty-console Playwright project using Node 22 when the default Node 25 runtime stalls.
Report focused success separately from unrelated baseline or CI noise. Do not regenerate
visual baselines on macOS.

## Out of scope

- Batch attestation or mark-all controls.
- Combining separate faculty assertions into one checkbox.
- Per-person OAuth, SSO, or cryptographically verified reviewer identity.
- Server schema, API route, GitHub token, or Netlify environment changes.
- Editing page or tool curriculum inside the console.
- Changing the question editor's governed fields.
- Claiming deployed/saved question parity.
- A broad analytics dashboard or redesign of learner sites.

## Acceptance criteria

1. Every current attestation prerequisite appears in one compact visible checklist.
2. Checklist eligibility and submit eligibility come from one pure derived model.
3. The primary action is never a silent disabled control.
4. Before eligibility, the action focuses the first unmet requirement and does not submit.
5. After eligibility, the action reads **Attest & continue** and submits exactly one item.
6. Separate content and question faculty assertions remain explicit.
7. All existing preview, revision, warning, confirmation, conflict, authentication, and
   repository-confirmation safeguards remain fail closed.
8. Auto-advance occurs only after confirmed repository state and selects the next eligible
   item under current filters.
9. Failed or unconfirmed actions never advance and preserve recoverable review state.
10. The last confirmed receipt remains available after advance.
11. Queue completion is explicit when no eligible items remain.
12. Focus, announcements, responsive layout, reduced motion, and keyboard behavior meet the
    requirements above.
13. Focused tests, root static tests, MS3 build, resident build, and faculty-console browser
    tests pass, with unrelated failures reported separately.

## Concrete next step and innovative follow-up

The next best implementation step is to add the pure checklist derivation and failing model
tests before changing the interface. That locks the safety contract before visual changes.

An innovative later increment could add a read-only **Review replay** drawer that reconstructs
the last confirmed item's requirement states and commit receipt after auto-advance. It would
improve audit confidence without adding bulk approval, hidden automation, or a second data
store.
