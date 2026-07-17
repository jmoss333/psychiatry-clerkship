# Faculty Question-Bank Review Workbench Design

**Date:** 2026-07-16
**Status:** Approved for implementation
**Scope:** `faculty-console/` question-bank workflow only

## Outcome

Turn the existing Faculty Attestation Console from a list of status toggles into a
fast, safety-gated question review workbench. Faculty can inspect and edit every
meaningful v1 question field, save changes as a draft, see automated checks rerun,
and deliberately attest only the validated repository version.

The current mainline has 189 active questions: 143 attested and 46 draft. Content
page/tool review remains available but is not redesigned in this increment.

In plain language: the console becomes the place where faculty can read the whole
question, fix it, see what may be wrong, and sign off without editing JSON by hand.

## Decisions already made

- Question bank first; preserve the existing content review tab.
- Queue plus review drawer, optimized for experienced faculty.
- Hybrid guardrails: critical structural failures block attestation; softer quality
  concerns require individual confirmation.
- Smart batching: only clean green drafts may be selected and attested together.
- Full v1 question editing inside the console.
- Any edit follows `save draft -> rerun checks -> attest`; editing never silently
  preserves an earlier attestation.
- Automated checks support faculty judgment; they never claim to establish clinical
  truth or evidence accuracy.

## Product structure

### 1. Queue

The left pane is the work list. It includes:

- search across ID, stem, category, evidence, and page slugs;
- filters for category, draft/attested status, difficulty, and green/yellow/red
  review state;
- compact counts for total draft, ready, warning, and blocked items;
- an explicit checkbox only after a green draft has been opened and faculty chooses
  **Mark reviewed & next**;
- a selected-row state independent of batch selection;
- stable ordering by category then ID, with the selected item retained after a
  refresh whenever it still exists.

The question-bank tab is the default tab because it is the selected first priority.

### 2. Review drawer

The right pane shows one complete item and makes the following v1 fields editable:

- `type`, relational `subtype`, `category`, `competency`, `difficulty`, and `hy`;
- `pages` and `link.label` / `link.href`;
- `stem`;
- all four answer texts, the correct-answer selection, and every wrong answer's
  `trap.name` / `trap.note`;
- `why`, `pearl`, and `evidence`;
- `tier2.q`, tier-two options/correct answer, and `tier2.why` when the item type is
  `two-tier`.

Stable IDs, retirement fields, reserved `v2` data, and attestation status are not
free-text editable. Existing unknown/reserved fields are preserved by the server.
Adding, deleting, renumbering, or retiring questions is outside this increment.

The drawer also provides a learner-site deep link, Revert, Save draft, and Attest
actions. Switching questions or closing the tab with unsaved edits requires a clear
confirmation.

The batching principle is **batch the commit, not the clinical judgment**. Opening
and marking each green item reviewed is required before it becomes batch-selectable;
automated green status alone is not approval.

### 3. Safety panel

The safety panel stays visible beside or above the editor, depending on viewport.
It reports three states:

- **Green / ready:** the saved server version has no blockers or item-level warnings.
- **Yellow / review:** no blocker, but at least one advisory warning.
- **Red / blocked:** at least one invariant needed for a valid, usable item fails.

Every result has a short plain-language explanation and the field to inspect. The
panel must clearly state that passing automated checks does not prove clinical
accuracy or source support.

Before any attestation, faculty must confirm all three human-review statements:

1. I verified the clinical answer and rationale.
2. I verified the item against the named library page(s) and evidence anchor.
3. I verified that the vignette is an original fictional composite with no PHI.

The server enforces these confirmations; they are not decorative client controls.

## Hybrid check contract

The same dependency-free rules module runs in the browser for immediate feedback and
in the Netlify function as the authority before saving or attesting.

Because `question_bank.json` is copied directly to both learner sites, a red
structural edit remains local and cannot be saved. Yellow drafts can be saved; red
blocks both repository save and attestation. This avoids deploying a malformed
work-in-progress item to students.

### Blocking checks

Attestation is rejected when any of these are true:

- required text or required arrays are empty;
- item ID is missing, malformed, changed, duplicated, or refers to no active item;
- type, subtype, category, competency, or difficulty is outside the schema contract;
- pages or the required learning-path link are missing or malformed, or a selected
  page is absent from the shipped Markdown manifest;
- a supplied `?page=` deep link points to a page absent from the shipped manifest;
- there are not exactly four A-D options with exactly one correct answer;
- a wrong option lacks a complete named trap and corrective note;
- two normalized answer texts are identical;
- a two-tier item lacks a valid tier-two question, 3-4 unique keyed options,
  exactly one correct rationale, or explanation;
- a relational item lacks its required subtype;
- an item is retired;
- the repository revision supplied by the browser is stale.

### Advisory warnings

Warnings do not claim an item is wrong. They prompt individual faculty review when:

- the stem lacks a question-form lead-in;
- the evidence text does not name any selected page slug;
- a question deep link names a page other than one of the selected pages;
- the correct answer is conspicuously longer than the median distractor length;
- an option contains common cueing language such as `all of the above` or
  `none of the above`;
- the stem uses a negative lead-in (`except`, `not`, or `least`) that deserves a
  deliberate check.

Bank-wide answer-key and difficulty distribution appear as contextual warnings, not
as item blockers. Those patterns guide review order without falsely assigning an
individual question a clinical defect. The current 46-question draft cohort is keyed
46 A / 0 B / 0 C / 0 D, so the console must make that cueing risk unmistakable.

### Smart batching

- Only green items that are currently `draft`, have no unsaved edits, and were
  explicitly marked reviewed in the current session may enter batch selection.
- A yellow item can be attested only by itself after its current warning codes and
  the three human-review confirmations are acknowledged.
- Red items cannot be attested.
- A proposed batch of four or more green items is blocked when one answer key makes
  up more than half the selection or fewer than three answer keys are represented.
  The items remain individually reviewable; this is a batch-quality gate, not a
  claim that any one answer is wrong.
- The server recomputes every result against the current repository state; changing
  the browser payload cannot bypass a blocker.

## Edit, validation, and attestation flow

```text
Load repository revision
        |
Select and edit an item
        |
Local checks update immediately
        |
Save draft with expected revision
        |
Server merges editable fields, forces status=draft, reruns checks, commits
        |
Client reloads the new repository revision
        |
Faculty reviews checks + confirms clinical/evidence/originality statements
        |
Attest one yellow or one/many green drafts with expected revision
        |
Server reruns checks, rejects stale/unsafe requests, commits status=attested
```

An attested item that is edited becomes a draft in the same save commit. It cannot
be edited and attested in a single request.

## Data and API design

### Shared rules module

`faculty-console/qbank-rules.mjs` is a small pure module shared by browser, server,
and Node tests. It owns:

- editable-field merging while preserving stable/governed fields;
- item assessment and warning/blocker codes;
- batch eligibility;
- field-level change summaries.

### GET `/api/attest`

Keep the existing authenticated endpoint. Its question-bank payload expands from a
stem preview to:

- complete active question objects with opaque per-item revision fingerprints;
- the current question-bank GitHub blob SHA as `qbankRevision` for diagnostics;
- shipped Markdown slugs used for page checks;
- server-computed assessments and bank summary counts.

Retired questions remain excluded.

### POST actions

Keep legacy content review behavior and replace question status toggles with explicit
actions:

- `qbank.save-draft`: one existing item, its expected revision, and editable fields;
- `qbank.attest`: one yellow or one/many green item IDs, expected revision, warning
  acknowledgements where needed, and the three human confirmations.

The shared faculty key remains in the request header. New requests do not duplicate
the key in the JSON body.

The legacy `target: "qbank"` status-toggle action is rejected rather than retained;
otherwise a caller could bypass the new validation and human-confirmation contract.

The question bank is already roughly 600 KB. GitHub's Contents response may omit
inline content once a file crosses its small-file threshold, so repository reads
fall back to the Contents endpoint's raw media response when the object payload has
no decodable body.
An explicit maximum-size guard prevents unexpectedly large responses from reaching
the browser or function memory without a clear error.

### Concurrency

The existing automatic SHA-conflict retry is acceptable for simple content status
toggles, but not for blind full-question replacement. Each question action carries
the expected opaque revision of every targeted item. The server fetches the latest
bank, rejects a changed target with HTTP 409, merges into that latest bank, and uses
its current blob SHA for the write. If GitHub reports a write race, one retry is
allowed only after refetching and proving the targeted item revisions are still
unchanged. This permits unrelated faculty work to coexist while preventing
same-question last-writer-wins data loss.

The console explains any target conflict and offers a reload; it never overwrites a
newer version of that question.

## Change visibility and audit trail

While editing, the drawer lists changed fields compared with the repository version
loaded into the session. This is the first practical slice of an attestation flight
recorder: faculty can see the scope of the proposed edit before saving.

Durable history remains Git-native:

- draft commits identify the question and attester;
- attestation commits identify all approved IDs and attester;
- editing an approved item and forcing it back to draft is explicit in the commit;
- successful responses retain the GitHub commit link.

Per-user OAuth and a separate attestation ledger are deferred; the current shared-key
identity model is unchanged in this increment.

## Error handling and safety

- Unauthorized requests remain generic HTTP 401 responses.
- Authentication is checked from `x-faculty-key` before parsing a POST body; new
  requests never accept credentials from JSON.
- Responses use `Cache-Control: no-store`, same-origin CORS by default, and an
  optional exact `ALLOWED_ORIGIN` override.
- POST bodies are capped at 128 KB and bank reads at 4 MB; larger payloads fail
  before parsing or browser delivery.
- The function applies a 60-request-per-minute per-IP/domain Netlify rate limit.
- Malformed input and failed checks return HTTP 400/422 with field-level codes.
- Stale revisions return HTTP 409 without retrying or writing.
- GitHub/network failures return a retryable error while preserving unsaved browser
  edits.
- The interface never inserts question text with `innerHTML`; repository strings are
  rendered as text to prevent stored markup execution.
- Save and Attest buttons disable during requests and cannot double-submit.
- A server-side failure never clears the local editor or batch selection.
- Direct-to-main commits remain subject to CI on `push` to `main`; this workflow
  trigger is added because the current mainline CI only runs on pull requests and
  manual dispatch.
- GitHub requests declare the current `2026-03-10` REST API version, and the faculty
  Netlify build moves from obsolete Node 18 to Node 24. Reviewer names remain
  self-asserted labels under the shared faculty key, not verified identities.

## Accessibility and responsive behavior

- Queue entries use real buttons and checkboxes with visible focus states.
- Tabs use tab semantics, the active queue item exposes `aria-current`, and grouped
  answer controls use `fieldset` / `legend`.
- Status is communicated by words/icons as well as color.
- Every field has a persistent label and error association.
- Save/attest results use one dedicated polite status region rather than making the
  whole application live; destructive or stale-state messages use an alert and
  receive focus.
- Keyboard users can move through the queue and edit the entire form without a
  pointer. `Ctrl/Cmd+S` saves the current draft but does not attest; global
  single-letter shortcuts are avoided.
- At narrow widths the queue stacks above the drawer; the safety panel precedes final
  actions so blockers are not hidden below the approval button.
- Text-bearing primary buttons use the existing dark green rather than the current
  mid-green, whose white-text contrast is below WCAG AA for normal text.

## Testing and verification

### Automated tests

Add root `node:test` coverage for:

- every blocker and warning rule;
- stable-field preservation and forced draft status after edits;
- green/yellow/red batch eligibility;
- batch-level answer-key balance, including the current all-A draft cohort;
- warning acknowledgement and human-confirmation enforcement;
- stale-revision rejection and no-write behavior;
- safe retry after an unrelated-item race and rejection after a same-item race;
- rejection of the legacy qbank status-toggle path;
- GitHub object-to-raw Contents fallback and maximum-size guard;
- header-only authentication, same-origin CORS, no-store responses, request limits,
  and rate-limit configuration;
- edit-then-attest separation;
- preservation of retired and reserved fields;
- HTML/module contracts for the queue, full editor, change summary, safety panel,
  reviewed-in-session batch gate, unsaved-change guard, and accessible status text.

The tests use synthetic questions only and do not alter `question_bank.json`.

### Repository verification

- Run all root Node tests and both faculty metadata validators.
- Run the question-bank rules across all 189 active repository items and report the
  current green/yellow/red distribution without changing statuses.
- Build and run static QA for both MS3 and resident sites.
- Exercise the console with a local mock API in Chromium: filter/select, edit, see an
  attested item become draft, resolve a blocker, save, attest green items in a batch,
  confirm a yellow item individually, and verify stale-state recovery.
- Do not regenerate macOS visual baselines.

## Out of scope

- Redesigning content page/tool attestation.
- Adding, deleting, renumbering, or retiring questions.
- AI-generated clinical edits or automated clinical approval.
- OAuth, named accounts, multi-reviewer approval, assignments, or scheduled expiry.
- A broad analytics dashboard beyond the queue counts and bank-level review context.
- Deploying, merging, or changing existing question statuses as part of building the
  workbench.

## Acceptance criteria

The increment is complete when:

1. Faculty can filter the queue and fully edit every supported v1 field without
   touching JSON.
2. Saving any edit commits the item as draft and returns a new revision and fresh
   assessment.
3. Critical invalid items cannot be attested by UI or direct API request.
4. Yellow items require individual warning acknowledgement; only green drafts can be
   batch-attested after each was opened and explicitly marked reviewed.
5. Every attestation requires the three human clinical/evidence/originality
   confirmations.
6. Stale edits cannot overwrite newer repository state.
7. Existing content review continues to work.
8. All focused tests, repo validators, and both site build gates pass, with any
   unrelated baseline failure reported separately.

## Concrete next step and future idea

Implement the shared rules and server transitions first, then build the queue/editor
against that contract. The next best follow-up is the QA Command Center using the
same assessment results.

The future innovative extension is a version-aware attestation flight recorder that
compares the current item with its last attested Git revision and routes faculty only
to clinically meaningful changed fields.
