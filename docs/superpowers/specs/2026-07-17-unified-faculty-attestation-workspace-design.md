# Unified Faculty Attestation Workspace Design

**Date:** 2026-07-17

**Status:** Approved design; written specification awaiting user review

**Scope:** `faculty-console/`, the learner SPA preview protocol and question review
route, and focused tests

**Relationship to prior design:** Follow-on increment that preserves the implemented
question-safety contracts while superseding the prior console layout and batch UI

## Outcome

Replace the console's two different review experiences with one consistent faculty
workspace for pages, interactive tools, and questions. Selecting any item opens the
actual learner deployment inside the console, beside a shared
**Review -> Resolve -> Confirm** sign-off rail. Attestation is one item at a time.

In plain language: faculty should be able to see what a student sees and sign off in
the same window, without learning a different interface for pages and questions.

## Why this follow-up is needed

The current branch has a mature question workbench with revision checks, a full
editor, automated structural checks, and deliberate question attestation. Content
pages and tools still use a separate list of checkboxes with external **View** links.
The two paths therefore have different navigation, visual hierarchy, and review
habits.

The learner MS3 site currently permits cross-origin framing, and a live browser
check confirmed that a deployed page loads inside an iframe. The release must still
retain a separate-tab fallback because deployment headers can change later.

The existing learner question-bank tool can open as a tool but cannot yet deep-link
to one question. A small read-only `reviewItem` route is required so the embedded
deployment can show the exact selected question.

## Approved decisions

- One queue covers pages, tools, and questions; the current top-level split is
  removed.
- Every review uses the same queue, deployed preview, and three-step attestation
  rail.
- The deployed preview is the dominant surface, using about 70% of the desktop
  workspace.
- All UI attestations are individual. The console removes **Mark all shown**,
  batch-selection controls, and batch attestation from the primary interface.
- Questions provide three workspace views: **Live deploy**, **Draft preview**, and
  **Edit question**.
- Pages and tools use **Live deploy** and the same sign-off rail, without question
  editing controls.
- Every question requires faculty review of the exact saved Draft preview revision;
  Live deploy provides learner-view context but cannot substitute for that receipt.
- The learner SPA reports typed page/tool/question readiness only after the requested
  inner surface succeeds.
- Existing question revision, manifest, conflict, confirmation, warning, and
  mandatory-reload safeguards remain authoritative.
- Automated checks remain workflow aids. They do not establish clinical truth,
  evidence accuracy, originality, or absence of PHI.
- The first increment does not claim that a deployed question matches a saved
  revision unless that parity is actually verified.

## Superseded prior decisions

The 2026-07-16 question-workbench design remains the source of truth for governed
question fields, structural checks, server confirmations, revision conflicts, safe
merging, and repository audit history. This follow-up explicitly supersedes these
parts of that document:

- **Content review remains a separate tab** is replaced by one shared queue and
  workspace.
- **Left question queue plus review drawer** is replaced by the compact queue strip,
  dominant preview, and sign-off rail.
- **Smart batching in the faculty UI** is replaced by individual review and
  attestation for pages, tools, and questions.
- Browser tests, runbook steps, and acceptance criteria that require Mark reviewed &
  next, batch selection, or batch confirmation are replaced by the individual-flow
  requirements in this specification.

The server retains its batch-shaped input and batch validation for backward
compatibility, but the redesigned console does not expose batch controls.

## Faculty experience

### 1. Shared queue strip

The queue becomes a compact horizontal strip above the review workspace. It
contains:

- Previous and Next controls;
- a searchable current-item selector;
- a type filter for all items, pages, tools, or questions;
- a status filter for items needing review or already reviewed/attested;
- compact counts for the active filter;
- a filter disclosure for question-only category, difficulty, and gate filters.

The selector uses stable keys that cannot collide across item types:

```text
page:<slug>
tool:<slug>
question:<question-id>
```

Search covers page/tool titles and slugs plus question ID, stem, category, evidence,
and source-page slugs. Filtering never changes saved data. If the selected item is
removed by a filter, the console selects the first remaining item and announces the
change.

The shared status filter uses an explicit mapping:

- **Needs review:** a page/tool not marked `reviewed`, or a question whose status is
  `draft`;
- **Complete:** a page/tool marked `reviewed`, or a question whose status is
  `attested`.

Question ready/warning/blocked gates remain a separate question-only filter and are
never treated as content-page clinical ratings.

Changing items while a question has unsaved edits retains the existing navigation
guard. No page or tool interaction creates local editable content.

### 2. Common workspace

The desktop workspace is two columns:

```text
+---------------------------------------------+--------------------+
| Deployed or draft review surface            | Faculty sign-off   |
| approximately 70%                           | approximately 30%  |
+---------------------------------------------+--------------------+
```

The item header always shows:

- title or question ID;
- item type;
- saved status;
- revision when one exists;
- the current view name;
- an optional **Open full page** fallback.

On narrow screens, the queue remains first, the preview stacks second, and the
attestation rail follows. The preview is never reduced to an unreadable sliver.

### 3. Live page and tool previews

The console builds learner URLs only from the authenticated server state's configured
student base URL:

```text
Page: <student>/?page=<encoded slug>&reviewKey=<encoded stable key>&reviewToken=<opaque load token>
Tool: <student>/?tool=<encoded slug>&reviewKey=<encoded stable key>&reviewToken=<opaque load token>
```

The MVP previews that single configured deployment, whose current default is the MS3
site. Adding a faculty toggle between MS3 and resident deployments is outside this
increment.

The preview iframe uses an accessible title, `referrerpolicy="no-referrer"`, and a
sandbox sufficient for the existing learner SPA and tools:

```text
allow-scripts allow-same-origin allow-forms
```

It does not receive top-navigation permission, faculty credentials, repository
tokens, or attestation data. The parent console does not inspect or modify the
cross-origin learner DOM.

Popup and download permissions remain intentionally absent. Links or tools that must
open a new tab, initiate a download, or leave the SPA are tested through the
console's **Open full page** action rather than by weakening the embedded sandbox.

### 4. Unified preview-readiness protocol

An outer iframe `load` event proves only that the learner SPA shell loaded. It does
not prove that the requested Markdown fetch or nested tool succeeded. The learner SPA
therefore owns one typed status protocol for all preview types.

Each preview URL carries the selected stable `reviewKey` and a fresh 128-bit
`reviewToken` generated with `crypto.getRandomValues`. The token correlates one load;
it is not an authentication or authorization secret.

The outer learner SPA sends its parent a sanitized message shaped as:

```text
{
  type: "faculty-preview-status",
  reviewKey,
  reviewToken,
  status: "ready" | "not_found" | "error",
  surface: "page" | "tool" | "question"
}
```

Readiness is emitted only after the requested inner surface reaches its own success
boundary:

- a page reports `ready` after its Markdown fetch succeeds and the requested content
  is rendered; a missing/failed fetch reports `not_found` or `error`;
- a generic tool reports `ready` after the SPA selects the exact manifest tool and
  its nested iframe loads; an unknown tool or nested-frame error reports a failure;
- a question reports `ready` only after the nested question tool finds and renders
  the exact `reviewItem`.

For questions, `question-bank-practice.html` sends its result to its immediate learner
SPA parent. The SPA accepts that inner message only from the current same-origin tool
iframe with the expected key, token, and question ID, then relays the sanitized outer
message to the faculty console. The faculty console accepts an outer message only
when:

- `event.origin` equals the configured student origin;
- `event.source` equals the current outer learner iframe;
- the key and token equal the current selection;
- the surface type and selected item agree.

Changing items invalidates the prior token. Late, wrong-route, malformed, or spoofed
messages cannot unlock the sign-off rail.

### 5. Exact deployed-question review

The console opens the learner SPA with this route:

```text
<student>/?tool=question-bank-practice.html&reviewItem=<encoded question ID>&reviewKey=<encoded stable key>&reviewToken=<opaque load token>
```

The existing SPA already forwards extra tool query parameters to its tool iframe.
`question-bank-practice.html` adds a review-only initialization path:

1. Fetch the deployed `question_bank.json` as it does today.
2. Find the exact active item matching `reviewItem`.
3. If found, render that item using the deployed question-card styles.
4. Permit faculty to exercise the confidence/answer/feedback interaction without
   calling learner SRS or response-persistence functions.
5. Do not create a session queue, advance to another item, or write learner progress.
6. If missing, show **This question is not present on the current deployment**;
   never substitute a random or nearby question.

Review initialization bypasses the adaptive `cw_qb_focus` handoff and leaves
`cw_qb_v1`, `cw_srs_v1`, and `cw_qb_focus` unchanged. The unrelated `cw_theme`
preference retains its existing behavior.

No faculty secret or question edit is sent to the learner deployment.

### 6. Question workspace views

Questions expose three mutually exclusive center views while the sign-off rail stays
in place:

- **Live deploy** shows the current public learner build and is labeled as such.
- **Draft preview** safely renders the exact current editor/repository item as text.
  It is labeled **Not deployed** and never masquerades as the learner site.
- **Edit question** shows the existing full editor, field-linked structural checks,
  changed-field summary, and save/revert controls.

Dirty edits continue to disable attestation. Saving forces draft status, performs
the current server checks, commits, and reloads the saved revision before faculty can
attest. The live deploy may lag that repository save; the interface states this
plainly and does not display a parity claim.

Every question attestation requires faculty to open and confirm the exact
**Draft preview** after the latest repository reload. That confirmation records the
current opaque item revision as `reviewedRevision`. A Live deploy review is required
student-view context when available, but it never substitutes for reviewing the saved
revision that the server will attest. Any edit, save, reload with a different
revision, conflict, or item change clears the reviewed-revision receipt.

If the saved question is not yet on the learner deployment, faculty must additionally
confirm **The live question is unavailable; I reviewed the saved revision that will
be deployed**. This preserves the repository-first attestation workflow without
presenting stale deployment content as current.

## Shared attestation rail

The right rail has three real workflow stages, not decorative status cards.

### Step 1: Review

- The selected live preview must reach a typed ready or explicit unavailable state.
- A deployed question must send the matching ready message before it can be marked
  reviewed as live learner context.
- Faculty checks **I reviewed the complete item**.
- Every question also requires **I reviewed this exact saved revision** from Draft
  preview; the receipt is bound to the current item revision.
- If framing fails, a page or tool may be reviewed through **Open full page** after
  faculty checks **I reviewed this item in the separate tab**.
- A question with an unavailable Live deploy follows the explicit saved-revision and
  live-unavailable confirmations described above rather than pretending that an
  external link solved the mismatch.

Preview-load, separate-tab, and saved-draft acknowledgements are interface
eligibility gates. They clear whenever the item or repository state changes. They do
not replace the server-enforced question confirmations or claim to prove deployment
parity.

### Step 2: Resolve

For a page or tool, the rail asks faculty to confirm accuracy/learner level and to
test relevant links, media, or interactions. These are deliberate UI prerequisites;
the existing content-review Git commit remains the durable record.

For a question, the rail shows the existing green/yellow/red assessment:

- red blockers prevent saving and attestation as they do now;
- yellow warnings require the current individual acknowledgements;
- green means structural checks passed, not that the content is clinically correct.

The **Edit question** view is the direct route to address a question issue.

### Step 3: Confirm

The rail shows the current reviewer label and the final action:

- **Attest this page**;
- **Attest this tool**; or
- **Attest this question**.

Question attestation retains the three server-enforced confirmations for clinical
answer/rationale, named source/evidence, and original fictional/no-PHI content. Every
question entry, including a warning item, must also carry
`reviewedRevision === revision`; the server rejects a missing or stale review receipt.
Content review uses the existing `target: "content"` endpoint but sends exactly one
slug change from this UI. The existing question action retains array-shaped server
input for compatibility, but the redesigned UI submits one question entry.

After success, the console stays on the completed item, announces the saved result,
shows the commit link, and focuses a **Next item** action. It does not move without
faculty input.

Reviewed content and attested questions remain visible through the status filter.
To preserve existing functionality, a reviewed page or tool exposes **Reopen review**
under a secondary **More actions** menu. It requires confirmation and submits only
that slug with a false reviewed state; it is not placed in the primary sign-off rail.
Editing an attested question continues to return it to draft only after a successful
save.

## Visual system

The visual direction is a calm clinical chart-review surface rather than an analytics
dashboard.

### Color tokens

- Canvas: `#EEF2EF`
- Surface: `#FFFFFF`
- Primary ink: `#17211B`
- Muted ink: `#5A665E`
- Clinical green: `#3F5C45`
- Warning and blocked states: existing `#805000` and `#8B2F2A`

Color communicates saved status or required action only. Status always includes text
and an icon; color is never the sole signal.

### Type and hierarchy

- Avenir Next with the existing fallbacks for headings and control labels;
- the current system stack for long-form reading and controls;
- monospace only for revisions, stable IDs, and URLs.

The deployed preview is visually dominant. The queue and sign-off rail use restrained
rules and spacing rather than nested cards and repeated badges. The signature element
is a narrow vertical faculty sign-off rail connecting the three actual review stages.

Motion is limited to workspace-view changes, progress updates, and focus movement.
All nonessential motion is disabled when reduced motion is requested.

## Architecture and file boundaries

This remains a dependency-free, no-build, native-module console.

### `faculty-console/review-model.mjs` (new)

A small pure module owns:

- normalization of page, tool, and question records into shared queue items;
- stable review keys;
- shared filtering and ordering;
- safe preview URL construction;
- preview-mode labels and eligibility helpers.

It has no DOM, storage, fetch, authentication, or clinical validation logic and can
be tested directly with `node:test`.

### `faculty-console/app.mjs`

The existing application remains the state and workflow coordinator. Its rendering
is reorganized into clearly named functions for:

- shared queue strip;
- item header and view switcher;
- deployed/draft preview;
- shared attestation rail;
- existing question editor and assessments.

Authentication, fetch handling, navigation guards, conflict handling, question
actions, and content commits remain here. This design does not add a framework or
perform an unrelated wholesale rewrite of the file.

### `faculty-console/qbank-rules.mjs`

No responsibility change. It remains the shared browser/server authority for
question structure, warnings, merge behavior, and changed-field addressing.

### Learner site files

`13_Faculty_Resources/_automation/site_build/spa_index.html` owns the typed outer
preview-status protocol after its real page/tool success boundaries. Its existing
propagation of extra tool parameters remains the question-route mechanism.

`13_Faculty_Resources/_automation/site_build/question-bank-practice.html` gains the
read-only `reviewItem` behavior and sends its exact-item result to the current SPA
tool host for validation and relay. No learner content or question status is changed.

### Server actions

No new authenticated endpoint is required. The console continues to use:

- `GET /api/attest` for the current repository-backed state and configured student
  URL;
- the existing content request, with one slug per redesigned UI submission;
- `qbank.save-draft` and `qbank.attest` with exact item and manifest revisions.

`qbank.attest` strengthens the existing review-receipt rule by requiring
`reviewedRevision === revision` for every question, including warning items.

Removing batch controls from the UI does not require weakening or deleting the
server's existing batch validation in this increment.

## State and data flow

```text
Authenticated GET state
        |
Normalize pages + tools + questions into one queue
        |
Select exactly one item
        |
Build a safe learner URL and start a tokenized preview load
        |
Receive the typed outer-SPA ready/error state
        |
Review live context plus the exact saved question revision when applicable
        |
Resolve type-specific checks
        |
Confirm and submit one repository mutation
        |
Mandatory reload verifies the saved repository state
```

Every item change creates a new preview-load token. Load events and typed preview
messages for older tokens are ignored so a slow previous frame cannot unlock the
current item's attestation rail.

## Failure handling

### Loading and timeout

- Show **Loading deployed preview...** immediately.
- Keep Step 1 and the final action disabled during load.
- If the outer iframe loads but no typed message arrives within ten seconds, classify
  the deployment as **Preview protocol unavailable**. This covers a briefly
  out-of-order deployment where the older SPA lacks the new protocol.
- If the iframe itself does not load or errors before the deadline, classify it as
  **Network or embedded-preview failure**. Browsers do not reliably distinguish a
  network error from a newly blocked frame, so the UI does not claim which occurred.
- Retry creates a new load token and a fresh iframe rather than reusing uncertain
  state.

### Explicit preview states and eligibility

| Surface and state | Faculty path | Attestation eligibility |
|---|---|---|
| Page/tool `ready` | Review embedded item and complete its checks | Eligible |
| Page/tool `not_found`, `error`, protocol unavailable, or network/frame failure | Use **Open full page**, then confirm separate-tab review | Eligible only after the external review confirmation; blocked if the full page is also unavailable |
| Question `ready` | Review Live deploy and the exact current Draft preview | Eligible only when both reviews are complete and `reviewedRevision` matches |
| Question `not_found` | Review exact Draft preview and acknowledge that the saved revision is not deployed | Eligible with the matching reviewed-revision receipt and live-unavailable acknowledgement |
| Question `error`, protocol unavailable, or network/frame failure | Retry; if still unavailable, review exact Draft preview and acknowledge that Live deploy could not be verified | Eligible with the matching reviewed-revision receipt and live-unavailable acknowledgement |
| Wrong route, stale token, malformed, or spoofed message | Ignore it and remain loading until retry/timeout | Not eligible |

The UI does not hide failures behind an empty frame. A release check must confirm the
current production response headers before claiming embedded preview support.

Live deploy and Draft preview labels remain visible throughout question review. MVP
does not claim byte-for-byte parity between them.

### Repository and edit failures

Existing behavior remains fail-closed:

- dirty edits disable attestation;
- stale item or manifest revisions return a conflict without writing;
- a failed save keeps the editor contents;
- a successful save or attestation requires a confirming reload;
- changing repository state clears prior session confirmations and eligibility;
- request failures never mark an item reviewed locally.

## Security and privacy

- The faculty key remains only in `sessionStorage` and the `x-faculty-key` request
  header.
- The GitHub token remains server-side.
- **Open full page** uses a new tab with `noopener` and `noreferrer`.
- Preview URLs contain only the public learner route, stable item identifier, and
  non-authorizing correlation token.
- The learner iframe receives no faculty key, reviewer label, edits, acknowledgements,
  or commit metadata.
- Preview-status messages are non-sensitive and accepted only from the exact student
  origin and current outer frame with the current review key and correlation token.
- The iframe cannot navigate the parent window.
- Repository strings continue to render as text rather than executable HTML.
- The console's `frame-ancestors 'none'` and `X-Frame-Options: DENY` continue to
  prevent other sites from embedding the faculty console; those response headers do
  not prevent the console from embedding the learner site.

## Accessibility and responsive behavior

- Queue controls, view controls, checks, and actions use native interactive elements.
- The active item and active view expose selected/current state programmatically.
- The iframe has a specific title such as
  **Learner preview: Mental status examination**.
- Preview status is announced through the existing focused/polite status pattern;
  the entire application is not made live.
- Errors receive focus and state the corrective action.
- Keyboard users can move Previous/Next, switch views, complete the rail, edit a
  question, and save without a pointer.
- Status uses words and icons in addition to color.
- Desktop and mobile layouts have no horizontal clipping; mobile stacks preview
  before the sign-off rail.
- Existing unsaved-change and modal focus management remains intact.

## Verification plan

### Unit and contract tests

Add or extend `node:test` coverage for:

- normalization and stable keys for all three item types;
- shared search, type/status filters, and deterministic ordering;
- safe page, tool, and question preview URLs;
- rejection of unsafe protocols, malformed bases, and unknown item types;
- one-item content and question submissions from the UI contract;
- dirty-edit, exact reviewed-revision, and preview-state attestation eligibility;
- server rejection when any ready or warning question lacks
  `reviewedRevision === revision`;
- outer-SPA page-fetch success/failure and generic nested-tool readiness;
- exact-question inner-message validation and sanitized outer relay;
- rejection of wrong-route, wrong-origin, wrong-source, stale-token, malformed, and
  spoofed preview messages;
- absence of faculty credentials and reviewer data from preview URLs/messages;
- retention of all existing question revision, warning, confirmation, and conflict
  tests.

Add a focused static test for question review mode:

- exact item selection;
- clear missing-item behavior;
- no random fallback;
- no changes to `cw_qb_v1`, `cw_srs_v1`, or `cw_qb_focus`; theme preference retains
  its existing behavior;
- no automatic next-question transition;
- readiness event contains only the expected public fields and reaches the SPA host
  for validated relay.

### Browser tests

Extend `tests/smoke/faculty-console.spec.js` to cover:

- one shared queue with page, tool, and question selections;
- the same item header and three-step rail for each type;
- embedded page and tool URLs;
- the typed page, tool, and exact-question readiness protocol;
- Live deploy, Draft preview, and Edit question view switching;
- removal of Mark-all and batch-selection controls;
- page-fetch failure, nested-tool failure, wrong route, stale/spoofed message,
  protocol-unavailable deployment, timeout, retry, separate-tab fallback, and
  missing-question states;
- external-link and download checks routing through **Open full page** rather than
  expanding iframe permissions;
- successful one-at-a-time content and question attestation;
- exact saved-revision review required for both ready and warning questions;
- unsaved-edit navigation protection and stale-revision recovery;
- desktop and mobile keyboard/focus behavior.

The smoke test continues to use synthetic repository data and controlled local learner
fixtures. It must not require production credentials or mutate canonical curriculum
data.

### Repository gates

Run:

```bash
node --test tests/faculty-qbank-rules.test.mjs \
  tests/faculty-console-actions.test.mjs \
  tests/faculty-console-contract.test.mjs \
  tests/faculty-console-handler.test.mjs

bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res

cd tests/smoke
npx playwright test --project=faculty-console
```

Also verify the production learner site's response headers and an actual page/question
iframe manually before release. Report focused success separately from unrelated
baseline failures or Git LFS pointer problems. Do not regenerate macOS visual
baselines.

## Rollout

This is one repository increment with two coordinated surfaces: the faculty console
and the learner SPA preview protocol, including the exact-question review route. No
data migration or status change is required.

The learner deployment may briefly update before or after the faculty console. The
console therefore treats a missing typed message as a visible protocol-unavailable
state rather than assuming the route exists. Once both sites deploy, typed page,
tool, and exact-question previews become available automatically.

README/runbook updates must explain:

- the unified queue and individual review flow;
- Live deploy versus Draft preview;
- the separate-tab fallback;
- the fact that reviewer labels remain self-asserted under the shared key;
- the fact that automated checks and previews do not prove clinical correctness.

## Out of scope

- Editing page or tool curriculum content inside the faculty console.
- Automatically approving clinical content or treating structural checks as evidence.
- Adding, deleting, renumbering, or retiring questions.
- Per-person OAuth/SSO, assignments, two-reviewer approval, or a separate audit
  database.
- Changing existing content or question attestation statuses during implementation.
- Proving deployed/saved question revision parity in the MVP.
- A broad analytics dashboard or unrelated console refactor.
- Removing server batch support solely because the new UI is individual.
- Adding a faculty switcher between MS3 and resident deployment previews.

## Acceptance criteria

The increment is complete when:

1. Pages, tools, and questions appear in one searchable/filterable queue.
2. Selecting any item opens the shared header, embedded review surface, and
   Review -> Resolve -> Confirm rail.
3. Page and tool previews use their real learner deployment routes inside the
   console and report readiness only after the requested inner surface loads, with an
   honest separate-tab fallback.
4. A question route opens the exact deployed question, never substitutes another,
   relays its state through the validated outer SPA protocol, and does not write
   learner progress.
5. Every question attestation requires faculty review of the exact current Draft
   preview and a matching `reviewedRevision`, whether the item is ready or warning.
6. Live deploy, Draft preview, and Edit question are clearly distinguished.
7. Every UI attestation concerns exactly one item; Mark-all, batch-selection, and
   batch-attestation controls are absent from the redesigned interface.
8. Existing question structural gates, confirmations, revision conflicts, unsaved
   edit protection, and mandatory reloads still fail closed.
9. No faculty credential, reviewer data, or unsaved edit crosses into the learner
   iframe, route, or preview-status message.
10. Loading, protocol-unavailable, page-fetch failure, nested-tool failure, network or
    framing failure, missing question, retry, and deployment-lag states provide clear
    next actions without false readiness claims.
11. Popups and downloads remain outside the iframe sandbox and are reviewed through
    **Open full page**.
12. Focused unit, contract, browser, MS3 build, and resident build checks pass, with
    unrelated baseline failures reported separately.

## Concrete next step and innovative follow-up

The next best implementation step is the pure shared review model and its tests,
followed by the common queue/workspace shell, then the learner `reviewItem` route and
browser verification.

A future version-aware preview can canonicalize the deployed question, compare its
fingerprint with the saved repository revision, and display **Live matches saved**
only when the two are identical. That extension remains separate so the MVP never
overclaims deployment parity.
