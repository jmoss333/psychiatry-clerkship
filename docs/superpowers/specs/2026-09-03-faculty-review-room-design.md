# Faculty Review Room — Design Specification

**Date:** 2026-09-03

**Status:** Design selected by the user; written specification awaiting user review

**Scope:** `faculty-console/`, its authenticated read model, and focused unit,
contract, browser, accessibility, and visual-regression tests

**Relationship to existing designs:** Additive entrance and evidence-orientation layer.
The implemented unified queue, exact preview, revision receipts, batch rules, mandatory
reload, and **Review -> Resolve -> Confirm** workflow remain authoritative. This design
does not replace or weaken them.

## Plain-language summary

The Review Room gives faculty a calm, honest starting desk before they enter the full
attestation workspace. It says what work is actually present in the repository snapshot,
why an item appears in a lane, and what evidence is available. Faculty choose the lane;
the software does not decide clinical priority.

After an item is opened, a compact **proof margin** keeps three different facts separate:
what learner surface was inspected, what repository record was loaded, and whether the
faculty confirmation step is incomplete, available, or confirmed after reload. It is a
guide to the existing workflow, never a shortcut through it.

In ordinary language: this should feel like opening a well-prepared clinical casebook,
not landing in another analytics dashboard.

## Product decision

Build the Review Room as the first authenticated screen of the existing faculty console.
It is read-only. Its controls may refresh the repository snapshot, filter work, or hand an
exact item into the existing action workspace; they may not save, attest, reopen,
acknowledge, create a review receipt, alter a batch, or change a learner record.

The action workspace gains two presentation elements:

1. an on-screen **review packet** made only from fields already authorized for the browser;
   and
2. a text-backed **proof margin** derived from existing preview, revision, review, and
   confirmation state.

This is an explicit narrowing of the original concept's “evidence packet.” The MVP packet
does contain the exact selected learner preview, repository revision language, authored source
pointers, current warnings, and the existing checklist when those facts exist. It is not an
export, does not manufacture missing provenance, and does not claim a complete claim-to-span
evidence record. Approval of this specification approves that scope correction.

The server gains one narrow read-integrity improvement: the three repository files used by
the authenticated load are read from one captured Git commit, and that commit is returned
as the snapshot revision. No new write action, registry, evidence synthesis service, or
authentication mechanism is introduced.

## Current-state audit

### What is already strong

- One authenticated load already returns manifest-backed pages and tools, active questions,
  exact question revisions, structural assessments, reviewer attribution, and an advisory
  branch-sync state.
- One shared queue already covers pages, tools, and questions.
- The learner preview has typed Ready, Not found, Error, protocol-unavailable, and frame-
  failure outcomes rather than treating iframe load as proof.
- Questions already separate Live deploy, Saved Draft preview, and Edit views.
- Review receipts are bound to an exact saved question revision and clear when that
  revision no longer matches.
- Faculty attestation is separate from automated checks. Ready means structurally ready,
  not clinically correct.
- Successful actions are announced only after the repository reload confirms the expected
  status and revision.
- Branch lag, a missing rolling pull request, and unavailable branch-sync evidence are
  already presented as explicit states.
- Keyboard focus, navigation guards, a polite status region, responsive source order, and
  reduced-motion support already have focused coverage.

### Verified snapshot used for this design

These figures describe `origin/main` at commit `9caa47e` on 2026-09-03. They are audit
evidence, not hard-coded product copy and not a claim about the later implementation branch.

| Inventory | Verified state | Design implication |
|---|---:|---|
| Manifest-registered entries | 91: 69 pages, 22 tools | The Room must use the route manifest, not every historical ledger row. |
| Manifest-registered content marked reviewed | 91 of 91 | The content lane must have a useful, honest empty state. |
| Review-ledger entries | 126 | Ledger size must not be presented as learner-available inventory. |
| Pending ledger entries outside the manifest | 24 | They are not eligible for the manifest-content lane merely because they are pending. |
| Active questions | 189 | Retired questions stay excluded, matching the current API. |
| Draft / attested questions | 45 / 144 | Draft status identifies routine question-review work. |
| Structural state of current drafts | 45 Ready, 0 Warning, 0 Blocked | This is mechanical structure only, never faculty approval. |

The canonical-claims registry is also outside the current console read model. Adding it
would require a separate, snapshot-bound adapter and a distinct faculty-authoring workflow.
It is deliberately not smuggled into this MVP as if it were ordinary attestation work.

### Problems the Review Room should solve

- The console opens directly into a dense queue and automatically selects an item before
  the reviewer has chosen what kind of sitting they intend to do.
- Counts, filters, branch state, preview evidence, revisions, warnings, session receipts,
  and final confirmations are all present, but their different authority is learned by
  reading the interface rather than made visible as a coherent evidence story.
- A long filter strip is excellent for precise retrieval but a poor first answer to
  “What kinds of review work are actually here?”
- Page/tool risk, question structural gates, saved status, branch delivery, and faculty
  confirmation can look like comparable status signals even though they answer different
  questions.
- A complete evidence packet cannot honestly be claimed for every surface with the current
  payload. Questions have authored source-page and evidence fields; pages and tools do not
  expose claim-to-span mappings or per-item content hashes in the console.

## Corrections to the original concept

The initial concept used the phrase “best next 20 minutes” and proposed grouping by risk,
age, status, and decision required. The audit makes four limits mandatory.

| Tempting interpretation | What the repository actually supports | Specification decision |
|---|---|---|
| “Best” means clinically highest priority | No approved priority policy or clinical-precedence field exists. | The Room presents non-ranked lanes and explains its mechanical inclusion rules. Faculty choose. |
| “20 minutes” predicts what can be completed | No item-duration or workload data exists. | Twenty minutes is an optional faculty-selected timebox, never an estimate or target. |
| Older means stale or overdue | Content `at` is a ledger-state date; questions have no review date. | Show “Ledger entry dated …” when recorded. Never derive overdue, freshness, or urgency. |
| Risk applies to all work | Only pages/tools have governed risk metadata; questions intentionally do not. | Question risk displays “Not recorded” when a cross-type comparison needs the field. Absence never means low risk. |

“Decision required” is limited to workflow routing:

- an unreviewed manifest-registered page/tool with valid risk metadata needs the existing
  content review path;
- an unreviewed page/tool without valid risk metadata needs risk classification outside the
  Room before its status can change;
- a draft Ready question needs review of its exact saved revision;
- a draft Warning question needs individual warning acknowledgement;
- a draft Blocked question needs structural resolution before attestation;
- a reviewed page/tool or attested question has no routine action;
- a branch-sync alarm needs repository delivery attention, not a clinical decision.

## Goals

1. Let faculty see the real categories of available review work before an item is selected.
2. Make every inclusion rule and unknown field understandable without technical knowledge.
3. Hand one exact item into the existing workspace without creating any review evidence.
4. Keep learner-view, repository-revision, and faculty-confirmation evidence visibly
   separate throughout the workspace.
5. Preserve every current attestation, revision, warning, preview, reload, and navigation
   safeguard.
6. Give the console a distinctive, restrained “casebook ledger” visual identity that works
   at desktop, mobile, 200% zoom, keyboard-only, reduced motion, and high text scaling.
7. Require one immutable repository snapshot per authenticated load so Room counts and
   dockets cannot silently combine different commits.

## Non-goals

- No clinical prioritization, risk scoring, urgency model, due dates, or “AI recommended”
  queue.
- No claim that a review can be completed in twenty minutes.
- No auto-selection at initial load, auto-review, auto-acknowledgement, auto-attestation,
  auto-reopen, or new auto-enrollment behavior.
- No change to the meaning or payload of any save or attestation action.
- No new risk classification and no repair of missing risk data in the browser.
- No canonical-claim authoring, evidence synthesis, claim-to-span service, or duplicate
  evidence database.
- No export, print, download, clipboard copy, email, or shareable packet in the MVP. The
  packet is an authenticated on-screen orientation surface only.
- No per-person identity claim. The existing shared faculty key and server-configured label
  retain their documented limitation.
- No learner progress write, learner-state read, deployment, status migration, or change to
  existing review records as part of implementation.
- No saved-versus-deployed content parity claim.
- No redesign of clinical curriculum pages or learner navigation.

## Vocabulary and authority

| Term | Exact meaning | Must not imply |
|---|---|---|
| Repository snapshot | The single captured Git commit from which the manifest, review ledger, and question bank were read. | Production deployment, learner visibility, or release approval. |
| Structural gate | Ready, Warning, or Blocked from the existing question rules. | Clinical correctness, evidence validity, originality, or absence of PHI. |
| Content risk | Existing ledger `risk.kind` and `risk.level`. | A generated priority score or urgency order. |
| Ledger date | The recorded `at` value for the current content status. | Review age, due date, evidence freshness, or cadence compliance. |
| Review packet | Authorized on-screen preview, record, source, warning, and checklist context for one item, with unavailable sections named. | A complete provenance record, export, or clinical summary. |
| Proof margin | A read-only explanation of existing evidence state. | An independent eligibility engine or approval record. |
| Twenty-minute focus | A faculty-chosen attention boundary for the current sitting. | An estimate of item complexity or an obligation to finish. |
| Confirmed | A repository action was reloaded and matched the requested state in this browser sitting. | Merged to `main`, deployed, learner-ready, or verified per-person identity. |

## Faculty experience

### 1. Unlock and load

The login remains the existing faculty-key screen. After a valid key, the interface says:

> Reading one repository snapshot. No review work has been selected yet.

The server captures the attestation branch head and reads the manifest, review ledger, and
question bank at that exact commit. Only after the complete payload validates does the
Review Room appear. The app does not select an item or create a learner iframe during this
step. This is a deliberate initial-load exception to current behavior: the first
authenticated load in a page session, whether after key entry or a retained session key,
bypasses `chooseSelection()`. Existing post-action confirmation reloads and their
auto-advance/hold behavior remain unchanged.

### 2. Orient in the Review Room

The masthead contains:

- **Faculty Review Room**;
- the server-configured reviewer label, described as configured attribution rather than
  verified identity;
- **Snapshot** with a shortened commit for sighted scanning and the full commit in accessible
  text/details;
- **Loaded in this tab at** using the browser's local time, for orientation only;
- **Refresh snapshot**; and
- **Lock console**.

The existing branch-sync notice stays immediately below the masthead. It is not collapsed
into a score. If the check is unavailable, the Room says currentness cannot be ruled in. If
it is alarmed, the exact existing explanation and rolling-PR link remain prominent.

### 3. Choose a review lane

The main desk is a ruled ledger, not a set of KPI cards. Its lanes are peers and are never
numbered or ranked.

| Lane | Candidate set | Factual summary | Primary handoff |
|---|---|---|---|
| Draft questions | Active questions whose saved status is `draft` | Total plus Ready, Warning, and Blocked structural counts; risk and age are not shown as known | **Choose a draft** |
| Manifest content needing review | Manifest-backed pages/tools whose normalized status is `unreviewed` | Page/tool totals plus valid risk-kind/level counts and a separate “Risk classification required” count | **Choose content** |
| Full review index | Every normalized item already available to the console | Needs-review and complete counts by item type | **Browse full index** |

Repository delivery is a separate evidence row, not a fourth review lane. It can say “No
branch warning reported,” “Branch state needs attention,” or “Branch state unavailable.”
It never says the branch is deployed or current everywhere.

Each non-empty lane includes an individually operable **Choose exact item** disclosure. It
contains a searchable semantic `<ul>` in the existing stable order. Every row shows identity,
type, saved status, and the factual reason it belongs to that lane, then offers **Open this
item in workspace**. Expanding, searching, or collapsing the list is client-only and does
not create a preview or review evidence.

An optional **Open first in current order** shortcut remains available for fast sittings.
Its copy names the ordering and explicitly says no clinical priority is implied. Exact-item
choice is always available; faculty are never forced to accept the mechanically first item.

Each lane states its inclusion rule in one sentence. An empty lane remains visible in a
quiet complete-looking state, but its copy is exact:

> No manifest-registered content currently needs review in this snapshot. This does not establish
> clinical correctness, freshness, or deployment status.

The content lane may offer **Browse reviewed content** as a secondary action when empty.

### 4. Optional twenty-minute focus

Before opening a lane, faculty may check **Use a twenty-minute focus for this sitting**.
This adds a session label and a quiet, minute-level elapsed/remaining cue to the existing
Review sitting strip. It is unchecked by default, stored only in memory, and has **End
focus** and **Continue without timer** controls.

The cue:

- never changes the candidate set or ordering;
- never auto-advances, submits, disables, or hides an action;
- updates its visible minute text at most once per minute;
- never announces every tick to assistive technology;
- at zero says “The timebox ended. Finish or stop when clinically appropriate” and does
  nothing else; and
- clears its scheduled interval on End focus, Continue without timer, expiry, Lock, or full
  page teardown.

**Refresh snapshot** and a mandatory post-action repository reload preserve the active
timebox as part of the same faculty sitting, but may not create a second interval. A failed
refresh also leaves it intact. A full browser reload clears it because it has no durable
storage.

### 5. Enter the action workspace

Choosing an exact item applies only transparent filters and hands that exact key to the
workspace. Using **Open first in current order** selects the first item in the stable queue
order. That transition says why the item is first, for example:

> First draft question in the current question-ID order. No clinical priority is implied.

The mappings are:

| Room action | Workspace filters |
|---|---|
| Choose/Open a draft | Type: Questions; Review status: Needs review; Gate: All |
| Choose/Open content | Type: Pages + tools; Review status: Needs review |
| Browse reviewed content | Type: Pages + tools; Review status: Complete |
| Browse full index | Type: All; Review status: All |

`Pages + tools` is a new filter value implemented by the shared pure filter model. It is a
union, not a new item type.

Handoff uses the existing `setSelectedReviewKey` and preview-token path. An exact item button
passes its exact normalized key; a first-in-order shortcut resolves that key before the
transition. Merely opening the workspace must not check a box, record a saved-revision
receipt, add an item to a batch, acknowledge a warning, change status, or send a POST.

Lane handoff is one atomic client transition: compute the lane filters and candidate set
first, replace all queue-filter fields together, then call `setSelectedReviewKey()` exactly
once for the resolved exact or first item. It must not simulate individual filter-control changes,
because those controls currently select and preview after every intermediate filter state.

### 6. Review the exact item

The workspace preserves its dominant learner surface and narrower sign-off rail. Above
them, the selected item becomes a **docket** with a review packet and proof margin. Learner
availability is established only by the existing typed preview outcome, never by manifest
registration or Room membership.

#### Question review packet

- question ID and saved status;
- exact saved question revision;
- repository snapshot revision;
- category and difficulty;
- existing source-page slugs;
- the existing authored evidence note, labeled **Authored evidence note** rather than
  verified evidence;
- current structural gate and exact warning/blocker codes and messages; and
- “Risk: Not recorded” and “Review date: Not recorded” only where cross-type context makes
  those unknowns useful.

#### Page/tool review packet

- title, slug, and item type;
- normalized review status;
- recorded risk kind and level, or **Risk: Not recorded**;
- pending reason when status is unreviewed;
- “Ledger entry dated …” and recorded attribution when present;
- manifest revision and repository snapshot revision; and
- an explicit note that neither value proves the deployed surface matches repository
  content.

An unreviewed page/tool whose risk is absent or invalid displays **Risk classification
required before status can change**. The workspace may inspect its learner surface, but the
Confirm rail must expose the existing server requirement as a blocker and must not present
the item as ordinarily attestable. The browser does not classify or repair the risk.

The packet does not surface internal ledger notes, content hashes, claims hashes, evidence
hashes, or evidence-through fields. It does not scrape or summarize the curriculum review
transcripts. **No linked provenance available** is a valid, visible outcome.

### 7. Read the proof margin

The proof margin is three adjacent ledger cells on desktop and one horizontal, wrapping
three-cell strip on mobile. Every cell has a label, text state, and explanatory detail;
color is secondary.

| Cell | Examples of honest display states | Source of truth |
|---|---|---|
| Learner surface | Not opened; Loading; Ready to inspect; Reviewed this attempt; Not found; Learner error; Protocol unavailable; Frame failure | Existing preview state and existing explicit review controls |
| Repository record | Question revision loaded; Exact-revision receipt recorded; Repository snapshot loaded; Manifest route loaded; Parity not verified | Existing revisions, receipt map, and new snapshot revision |
| Faculty confirmation | Review incomplete; Resolve checks incomplete; Ready for deliberate confirmation; Confirming; Confirmed after reload; Previously reviewed/attested | Existing eligibility result, pending state, confirmed reload result, and saved status |

The proof margin is a named `<section>` containing an `<ol>` of exactly three labelled items
in the same DOM and visual order as the table above. It is a projection. It may not
calculate eligibility independently, and no control or live region lives inside it. Material
changes announce through the existing polite status region only. For an already completed
item, **Previously reviewed** or **Previously attested** must remain distinct from
**Confirmed in this sitting**.

Evergreen means a named workflow condition is satisfied or an evidence step is recorded; it
never means clinically safe. Ochre means review attention or uncertainty. Brick is reserved
for an actual blocked/error state.

### 8. Return, refresh, and lock

**Back to Review Room** follows the existing unsaved-edit navigation guard. On a clean
return it cancels the current preview attempt and clears item-specific acknowledgements and
confirmations, while preserving valid question receipts, batch choices, and the current
session action ledger under their existing rules.

**Refresh snapshot** uses a new Room-refresh path rather than the current destructive
full-load path. It retains the prior validated snapshot and session state until a complete
replacement validates. After validation, it applies this explicit comparison rule:

- a changed manifest revision clears all question receipts and batch state;
- a changed question-bank revision prunes only receipts whose question disappeared, is no
  longer Draft, or no longer has the exact receipted item revision; and
- an unrelated snapshot-head change alone preserves still-valid receipts.

After every successful replacement, batch membership is re-derived from the new question
records and assessments before the Room displays its session counts. A preserved receipt
does not preserve batch membership when the item's new gate or cohort state makes that
membership ineligible.

Question receipts remain directly bound to the exact saved question revision. The broader
manifest and question-bank comparisons are conservative Room-refresh invalidation signals;
they do not redefine receipt identity. This preservation path is new implementation work,
not current console behavior. Room-derived counts always recompute from the replacement.

**Lock console** retains its current behavior: clear the key and all in-memory Room and
workspace state, then return focus to the login screen.

## Read model and snapshot contract

### Required server behavior

For GET only:

1. capture `repository.head()` once;
2. read `reviewed.json`, `site_manifest.json`, and `question_bank.json` with
   `ref: snapshotRevision`;
3. validate and normalize exactly as today;
4. return the captured `snapshotRevision` with the existing file revisions and payload;
5. obtain branch-sync evidence separately and keep it explicitly advisory.

This prevents one Room render from combining files read before and after a branch update.
The snapshot commit is provenance for the read model; it is not deployment provenance.

The browser validates `snapshotRevision` with the same supported 40/64-hex Git object-ID
shape as the existing manifest and question-bank revisions. A missing or malformed snapshot
fails the complete load. There is no partial recommendation.

### Fields and allowed inferences

| Field | Permitted use | Prohibited inference |
|---|---|---|
| `snapshotRevision` | Bind one Room render and its dockets to a Git commit | Deployed, merged, or learner-visible |
| `manifestRevision` | Identify the route registry used by this load | Exact page content revision or deployed parity |
| `qbankRevision` | Detect question-bank file change | Exact item identity without the item revision |
| question `revision` | Bind a saved question and its receipt | Deployed question parity |
| content `status` | Reviewed/unreviewed workflow lane | Clinically correct or current |
| content `risk` | Display recorded kind/level and factual grouping | Generated risk, urgency, or priority |
| content `at` | Display ledger-state date | Staleness, due date, or evidence age |
| content `reason` | Explain a pending ledger record | Faculty decision or remediation plan |
| question `assessment` | Structural grouping and exact issue display | Clinical correctness or attestation readiness by itself |
| question `pages` / `evidence` | Display authored source pointers and note | Verified claim-to-source support |
| `branchSync` | Warn about delivery conditions observed after load | Proof the snapshot is merged or deployed |

The API continues to omit internal review-ledger notes and hashes. Responses retain
`Cache-Control: no-store`, exact-origin handling, and authenticated access.

## Client architecture

### Pure Review Room model

Add `faculty-console/review-room-model.mjs` as a DOM-, fetch-, storage-, and clock-free
module. It owns only:

- validation of the snapshot envelope used by the Room;
- candidate-set derivation for the three lanes;
- factual counts and unknown values;
- the non-attestable, risk-classification-required content route;
- the `Pages + tools` union predicate;
- deterministic explanatory copy such as “included because status is Draft”; and
- proof-margin display projection from already-computed workspace state.

It must not import or reproduce server mutation rules. It consumes normalized review items
and the existing `deriveAttestationEligibility()` result where that result is needed for
display. The existing client eligibility model gains one literal mirror of the server's
already-enforced content rule, `content.risk_required`; the Room model consumes that result
rather than becoming a second gate.

### App state

Add session-only state equivalent to:

```text
screen: room | workspace
roomLane: draft-questions | pending-content | reviewed-content | full-index | null
focusTimebox: inactive | { startedAt, endsAt }
snapshotLoadedAt: local display time only
```

No Room state goes into `localStorage`, a URL, the learner iframe, request bodies, logs, or
repository files. The existing faculty key remains in `sessionStorage` exactly as today.

### Stable ordering

The Room does not create a new priority order. Lane candidates preserve the existing stable
ordering: item type, title, then identity. The question lane therefore uses current question
identity order. Any visible “first” explanation names that ordering. Missing risk, dates,
or evidence never affect ordering.

### Network boundary

- Unlock and Refresh snapshot may call authenticated GET.
- Room filtering, lane highlighting, exact-item disclosure/search, docket expansion, timebox
  controls, and return navigation are client-only and make zero network requests.
- Exact-item handoff starts only the existing learner-preview network path; it does not call
  the faculty API.
- No Room interaction may call POST.
- POST remains reachable only through the existing deliberate actions rendered in the
  action workspace.

This is a product read-only boundary, not a new authorization role. Anyone holding the
shared faculty key retains the existing console authority; this design does not mislabel
the shared key as a read-only credential.

## Visual design: Casebook Ledger

### Character

The interface should resemble a prepared review desk: warm paper, dark ink, ruled sections,
precise marginal notes, and restrained evidence marks. Avoid a card-per-metric dashboard,
progress rings, gradients, floating action buttons, urgency flames, celebration, and green
completion theater.

Use borders, spacing, typography, and a narrow proof rule as the primary hierarchy. Corners
remain subtle. IDs, revisions, and commit receipts retain monospace typography.

### Base tokens

| Token | Value | Use |
|---|---:|---|
| `--rr-canvas` | `#F1F2ED` | quiet desk background |
| `--rr-paper` | `#FFFEF9` | review surfaces |
| `--rr-ink` | `#19322C` | primary text and headings |
| `--rr-evergreen` | `#315E4D` | recorded/ready evidence and primary action |
| `--rr-ochre` | `#895900` | review-required, uncertainty, and focus |
| `--rr-brick` | `#933B33` | blocked and error states |

Against `--rr-paper`, the audited contrast ratios are 13.56:1, 7.33:1, 5.95:1, and
7.14:1 respectively for ink, evergreen, ochre, and brick. Derived soft backgrounds and
rules must retain at least 4.5:1 for normal text and 3:1 for focus/non-text boundaries.

Body/UI type remains:

```css
"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif
```

The existing monospace stack remains for identifiers and revisions. No font, icon, or
component dependency is added. Status uses words plus restrained geometric marks, never
color alone.

### Desktop wireframe

```text
+--------------------------------------------------------------------------+
| FACULTY REVIEW ROOM                         Snapshot 9caa47e…   [Lock]    |
| Reviewer: configured attribution       Loaded in this tab at 9:42 AM     |
+--------------------------------------------------------------------------+
| BRANCH STATE — exact warning, unknown state, or no warning reported      |
+--------------------------------------+-----------------------------------+
| REVIEW LEDGER — choose a peer lane   | CHOOSE EXACT ITEM                 |
|                                      |                                   |
| Draft questions          45          | Factual rule and gate breakdown   |
| Ready 45 · Warning 0 · Blocked 0     | Unknowns named, not filled in     |
|                   [Choose a draft]   | Search this lane…                 |
|                                      | qb_example_001  Draft · Ready     |
|                                      |              [Open in workspace]  |
| ------------------------------------ |                                   |
| Manifest content          0          | No item selected and no preview   |
| No current review work               | [Refresh snapshot]                |
|                  [Browse reviewed]   |                                   |
| ------------------------------------ |                                   |
| Full review index        280          |                                   |
|                         [Browse all]  |                                   |
+--------------------------------------+-----------------------------------+
| CURRENT SITTING — receipts · batch selection · confirmed actions         |
+--------------------------------------------------------------------------+
```

The figures are illustrative; the rendered values always come from the loaded snapshot.

### Workspace wireframe

```text
+--------------------------------------------------------------------------+
| [Back to Review Room]  SELECTED ITEM DOCKET                              |
| Question ID / page title · status · precise snapshot/revision language   |
| Source pointers / risk / warnings / unknowns as appropriate              |
+--------------------------------------------------------------------------+
| PROOF MARGIN: Learner surface | Repository record | Faculty confirmation |
+------------------------------------------------+-------------------------+
| Live deploy | Saved Draft | Edit               | REVIEW                  |
| typed status + exact fallback                  | RESOLVE                 |
|                                                | CONFIRM                 |
| dominant learner surface / draft / editor      | existing action rail    |
+------------------------------------------------+-------------------------+
```

The proof margin contains no controls and never replaces the rail.

### Mobile wireframe

```text
Faculty Review Room
Reviewer · snapshot · Lock
Branch state

Review ledger
Draft questions
gate counts and inclusion rule
[Choose exact draft]
qb_example_001 · Draft · Ready
[Open this item in workspace]

Manifest content
honest empty or risk summary
[Choose content]

Current sitting
```

Inside the workspace, source order remains: queue/context, selected-item docket, proof
margin, learner surface, then Review -> Resolve -> Confirm rail. No sticky mobile attest
button is introduced.

## Accessibility contract

- Keep the existing skip link and one page-level `h1` per screen.
- Use semantic sections and an unordered lane list; visual placement must not imply lane
  priority.
- Lane actions, exact-item disclosures and search, Refresh, Back, focus controls, filters,
  dockets, and workspace actions are fully keyboard operable with visible focus.
- Moving from Room to workspace focuses the selected-item heading after the new preview is
  initiated. Returning focuses the lane action that opened the workspace. Refresh focuses
  the snapshot summary after a successful replacement.
- Do not announce timer ticks. Announce only start, end, cancellation, snapshot replacement,
  lane handoff, and material errors through the existing polite status region.
- Status labels always include text. Ready/Warning/Blocked and all preview failures remain
  distinguishable without color, symbols, or position.
- The learner iframe retains its descriptive item-specific title, strict sandbox, and
  `referrerpolicy="no-referrer"`.
- At 200% zoom and 320 CSS px, the page reflows to one column without horizontal scrolling,
  clipped proof cells, or hidden rail actions.
- New interactive targets are at least 44 by 44 CSS px on touch layouts.
- `prefers-reduced-motion` removes any non-essential transition. The design needs no
  entrance or progress animation.
- Automated semantic and contrast checks are necessary but do not count as a verified
  VoiceOver or NVDA pass. Manual assistive-technology evidence is reported separately.

## Privacy and security contract

- The Room stays behind the existing faculty key and remains `noindex`, `no-store`, and
  non-embeddable.
- The GitHub token never leaves the function. No secret enters a URL, learner iframe,
  message event, or log.
- Snapshot revision, filter state, reviewer label, warnings, receipts, confirmations, and
  commit data never enter learner preview query parameters or messages. The preview keeps
  only its existing review key, short-lived token, and surface type.
- No page/question body or review packet is written to analytics or console logs.
- The Room does not expose ledger-internal notes or hashes withheld by the current API.
- No PHI is introduced or accepted. Existing question confirmation about fictional,
  original, no-PHI content stays in the action workspace.
- Opening a Room lane is not audit evidence. Only existing exact receipts and repository
  commits remain evidence-bearing events.
- The shared key does not prove which person acted. Reviewer copy continues to state this
  limitation rather than presenting the server label as authenticated identity.

## Honest state and error copy

| Condition | Required behavior and copy |
|---|---|
| Initial load | “Reading one repository snapshot. No review work has been selected yet.” No lane counts or preview until validation succeeds. |
| Incomplete/malformed snapshot | Replace the Room with the existing focusable load error and Retry. Offer no recommendation or partial counts. |
| Branch evidence unavailable | “Branch-sync status is unavailable for this load — staleness cannot be ruled out.” |
| Empty lane | State exactly that no item meets the lane rule in this snapshot; add that this does not establish correctness/currentness. |
| Risk missing | “Risk: Not recorded.” Do not count it as low. |
| Unreviewed content risk missing/invalid | “Risk classification required before status can change.” Inspection is available; attestation remains blocked. |
| Ledger date missing | “Ledger date: Not recorded.” Do not infer recent or overdue. |
| Question age/risk | Omit when irrelevant; when compared across types, show “Not recorded.” |
| Evidence link absent | “No linked provenance available.” Do not synthesize one. |
| Snapshot refresh fails in Room | Preserve the prior snapshot visibly, label it “Refresh failed — still showing snapshot …,” and provide Retry. |
| Preview failure | Preserve the existing five typed outcomes and their exact retry/separate-tab rules. |
| Snapshot changes | Recompute Room lanes and docket facts. Preserve or revoke receipts only under existing exact-revision rules. |
| Timebox ends | “The timebox ended. Finish or stop when clinically appropriate.” Do not navigate or submit. |

## Delivery shape

The design is one product, but the implementation plan should divide it into two reviewable
increments so safety behavior and visual work do not obscure one another:

1. **Honest entrance:** immutable GET snapshot, pure Room model, non-ranked lanes, exact-item
   choice, atomic workspace handoff, risk-classification hard stop, and read-only/accessibility
   contract tests.
2. **Evidence orientation:** on-screen review packet, semantic proof margin, Casebook Ledger
   styling, optional timebox, deterministic visual fixtures, and the full responsive/manual
   accessibility pass.

Increment 1 is useful on its own, but the feature described by this specification is not
complete until Increment 2 also passes. Neither increment changes a curriculum status during
implementation or authorizes a deployment.

## File and responsibility boundaries

| Path | Intended change | Must not change |
|---|---|---|
| `faculty-console/netlify/functions/attest.mjs` | Capture one head for GET, read the three source files at that ref, return `snapshotRevision` | POST actions, authentication, write validation, status transitions, omitted ledger internals |
| `faculty-console/review-room-model.mjs` | Pure lane, unknown-state, filter-union, explanation, classification-route, and proof-margin projections | DOM, network, storage, clock, mutation, independent eligibility |
| `faculty-console/review-model.mjs` | Accept/test the `Pages + tools` union and mirror the server's valid-risk prerequisite as `content.risk_required` | Existing type identities, preview protocol, revision identity, or other eligibility rules |
| `faculty-console/app.mjs` | Room/workspace screen state, exact-item list, atomic handoff, back/refresh/timebox wiring, review packet, proof margin | Request payloads, attestation meaning, auto-review, preview security |
| `faculty-console/index.html` | Casebook tokens, ruled layouts, responsive proof margin, touch sizing | CSP/framing headers, skip link, reduced-motion support |
| `faculty-console/README.md` | Explain Room versus action workspace, snapshot meaning, unknown fields, and timebox limitation | Existing runbook and security cautions |
| `tests/faculty-review-room-model.test.mjs` | Pure data-contract and deterministic-projection coverage | Browser-only assertions |
| Existing faculty contract/handler/smoke suites | Snapshot atomicity, read-only boundary, handoff, guard, preview, accessibility, and regression coverage | Looser alternatives to current gates |

## Test strategy

### Server and read-contract tests

- GET captures one branch head and requests all three repository files at that exact ref.
- A branch move between file reads cannot mix revisions in one payload.
- The payload returns the captured valid snapshot revision and unchanged authorized fields.
- Missing or malformed snapshot revisions fail closed.
- No newly withheld ledger field reaches the browser.
- POST behavior and all current conflict/reload tests remain unchanged.

### Pure model tests

- Draft lane includes active Draft questions only and reports exact gate counts.
- Content lane includes only manifest-normalized unreviewed pages/tools, not pending ledger
  entries outside the manifest.
- Missing/invalid content risk produces a classification-required subgroup and
  `content.risk_required`; it is not counted as low or ordinarily attestable.
- Full index count equals the normalized console item set.
- `Pages + tools` is exactly the union of those two types.
- Missing question risk/date and malformed content risk become explicit unknowns and never
  affect order.
- Same snapshot and inputs produce byte-equivalent lane/proof projections.
- Existing type/title/identity tie-breaks remain deterministic.
- Proof states map from existing preview, receipt, saved-status, eligibility, pending, and
  confirmed-reload facts without creating a second gate.

### Browser contract tests

- Successful key entry and initial load with a retained session key each land in the Room
  with no selected item, no iframe, one GET, and no POST.
- The successful initial-load path renders `screen: room` instead of calling
  `chooseSelection()`; `selectedKey`, `selectedId`, and `preview` remain null until a faculty
  lane handoff.
- Every Room-only interaction remains POST-free.
- Lane highlighting, exact-item disclosure/search, Back, docket expansion, and timebox
  controls make zero network requests. Only Unlock and explicit Refresh may GET
  `/api/attest`; exact-item handoff may start the existing learner iframe request only.
- Choosing any listed item applies the documented filters, selects that exact key, creates
  only the existing tokenized preview request, and creates no evidence-bearing state.
- The first-in-order shortcut resolves the stable key and performs one atomic filter/selection
  transition with exactly one preview attempt; no intermediate filter state selects or
  previews another item.
- Back respects unsaved edits, then restores focus and preserves only the session state the
  current contracts already permit.
- Refresh replaces the Room only after a complete response; a failure keeps the old snapshot
  with an explicit warning.
- Room refresh retains receipts when the manifest and exact receipted question revisions
  are unchanged, prunes an affected receipt when that question changes or leaves Draft, and
  clears all receipt/batch state when the manifest changes. Existing ordinary-load and
  post-action reload behavior remains covered separately and is not silently redefined.
- Every successful Room refresh re-derives batch eligibility before displaying counts and
  removes newly ineligible membership without erasing an otherwise valid receipt.
- Question and content review packets use precise labels and never claim complete provenance
  or parity.
- Proof-margin cells have textual states and mirror, but never override, existing eligibility.
- Proof-state fixtures cover Ready preview without a receipt, exact receipt recorded, Not
  found, protocol unavailable, Warning and Blocked question gates, previously reviewed/
  attested, action pending, and confirmed-after-reload in this sitting.
- Fake-clock coverage proves the timebox changes visible text at most once per minute;
  announces only start, end, and cancellation; leaves no active interval after End, expiry,
  Lock, or full page teardown; creates no duplicate interval after a Room refresh; and causes
  no navigation, GET, or POST at zero.
- Lock clears the key, timebox, Room state, receipts, batch state, and action ledger.

### Accessibility and visual tests

- Keyboard-only journey: unlock -> choose lane -> inspect docket -> enter workspace -> Back ->
  Refresh -> Lock.
- Focus restoration, modal inertness, queue `aria-current`, live-region scoping, iframe title,
  and existing shortcut guards remain green.
- Automated contrast covers normal text, status text, rules, controls, and focus outlines.
- At 200% zoom / 320 CSS px and at 390 x 844, no horizontal overflow, clipping, overlapping
  proof cells, or off-screen primary action occurs.
- Desktop 1440 x 1000 and mobile 390 x 844 Review Room/workspace snapshots are generated on
  Ubuntu/Chromium through the repository's baseline-refresh workflow, never accepted from a
  macOS rendering.
- Visual fixtures fix browser time, locale, time zone, snapshot revision, and payload, keep
  the timebox inactive (or freeze it deliberately), and wait for the validated-ready Room
  state before capture.
- A manual screen-reader pass is documented separately before release; it is not inferred
  from DOM assertions.

## Acceptance criteria

The implementation is complete only when all of the following are true:

1. A valid initial authenticated load lands on the Review Room, bypasses `chooseSelection()`,
   and leaves item and preview state empty until a faculty lane handoff.
2. One immutable repository snapshot backs all Room lane counts and dockets.
3. Draft questions, manifest-registered unreviewed content, and the full index use the exact
   candidate rules in this specification and are visibly non-ranked.
4. Every known value names its source meaning; every unavailable risk, date, or provenance
   field remains unknown rather than being imputed.
5. No Room interaction sends POST or creates a receipt, acknowledgement, batch choice,
   attestation, reopen request, learner-state change, or repository change.
6. Every lane offers exact-item choice. Handoff opens that exact item through the existing
   preview protocol; the optional first-in-order path states its stable mechanical ordering.
7. The workspace review packet contains only authorized fields, includes explicit unavailable
   sections, and never claims complete provenance or saved/deployed parity.
8. The proof margin separates learner-surface, repository-record, and faculty-confirmation
   evidence, uses text rather than color alone, contains no controls, and never becomes an
   eligibility source.
9. The optional twenty-minute focus is clearly a faculty-selected timebox and has no effect
   on ordering, workflow gates, navigation, or submission.
10. Missing/invalid content risk is a visible classification-required hard stop that mirrors
    the server and cannot be repaired in the Room.
11. Existing Review -> Resolve -> Confirm, exact-revision receipts, warnings, batch guards,
    conflict handling, confirmation language, mandatory reload, and commit-ledger behavior
    remain unchanged.
12. Loading, stale/unknown branch evidence, empty lanes, refresh failure, malformed state,
    missing metadata, and all preview failures remain honest and actionable.
13. The Room and workspace meet the keyboard, focus, reflow, contrast, touch-target,
    reduced-motion, and visual-baseline requirements above.
14. Focused server/model/contract/browser tests and both existing site build gates pass, with
    unrelated baseline or environment failures reported separately.
15. Implementation changes no existing content/question status and performs no deployment.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A lane looks like clinical prioritization | Peer layout, no ranking numbers, exact inclusion copy, existing stable order, faculty choice. |
| Green looks like “clinically safe” | Evergreen is paired with named evidence text; structural and clinical limitations stay visible. |
| Snapshot SHA looks like deployment proof | Label it repository snapshot; keep branch/deploy and parity limitations adjacent. |
| Proof margin becomes a second gate | Pure projection only, no controls, existing eligibility remains sole client gate and server remains authoritative. |
| Twenty-minute cue pressures rushed approval | Opt-in, no throughput target, no auto-action, gentle end copy, easy continuation without timer. |
| Evidence note is mistaken for verified evidence | Label it authored evidence note and expose missing provenance honestly. |
| Initial Room slows expert reviewers | One action opens the exact existing queues; full index remains available; no forced tour. |
| Returning to Room loses work | Use existing navigation guard; preserve only already-valid session receipts/selections under current rules. |
| Visual refresh destabilizes a safety workflow | Keep semantic/source order and behavior intact; add visual baselines and focused interaction tests. |

## Alternatives considered

### Ranked “best next” playlist

Rejected for the MVP. The repository has no approved priority weights, review estimates,
cadence, or question risk/age fields. A ranking would turn missing governance data into an
opaque product opinion.

### Separate Review Room service or database

Rejected. It would duplicate authentication, item identity, repository state, and evidence
logic. An entrance inside the existing console can be truly POST-free as a UI flow while
reusing the current authenticated snapshot and exact handoff.

### Complete evidence packets from generated curriculum-review transcripts

Deferred. The MVP's authenticated on-screen review packet remains in scope. The generated
reports are valuable, but they are built from audience-specific sites
and are not currently bound to the authenticated console snapshot. Linking them as exact
evidence would require an audience- and build-revision adapter plus explicit unavailable/
stale states.

### Cosmetic reskin of the current workspace only

Rejected. It would improve polish but would not solve the initial cognitive problem: the
console currently selects work before faculty choose the kind of review sitting.

### Generic dashboard with counts and progress rings

Rejected. It flattens distinct governance facts into apparent performance metrics and makes
completion look more authoritative than it is.

## Concrete next option and innovative follow-up

After the user approves this specification, the next best option is to write a bounded
implementation plan that starts with the immutable GET snapshot and pure Review Room model,
then layers the read-only screen, exact handoff, proof margin, and visual/accessibility tests
without changing mutation semantics.

A later, separately governed innovation could add a **snapshot comparison desk**: faculty
choose two repository snapshots and see which review-lane memberships, risk records, source
pointers, or structural gates changed. It would make drift visible without scoring clinical
quality, inferring urgency, or changing any review record.
