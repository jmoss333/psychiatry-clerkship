# Direct Status Attestation and Delivery Tracking

| Field | Value |
|---|---|
| Date | 2026-08-15 |
| Status | Approved direction; ready for external design review; no implementation authorized |
| Design owner | Joshua Moss, MD |
| Audience | Faculty-console maintainers, security reviewers, and deployment operators |
| Repository baseline | `origin/main` at `22ff662` |

## Executive decision

The faculty console will gain a narrowly authorized **direct-status lane**. A faculty
decision that changes only attestation status may commit directly to protected `main`.
A substantive question edit will continue to use `attest/pending`, its rolling pull
request, required checks, and merge.

The two routes are not interchangeable:

| Faculty action | Repository target | Delivery path |
|---|---|---|
| Attest or reopen one page/tool | `main` | direct status commit -> post-commit checks -> applicable learner site(s) |
| Attest one question or an explicitly selected question batch | `main`, only from an exact `main` review snapshot | direct status commit -> post-commit checks -> applicable learner site(s) |
| Save a substantive question edit | `attest/pending` | draft commit -> rolling PR -> checks -> merge -> applicable learner site(s) |

The server chooses the route from the action. The browser cannot supply a branch, file
path, commit message, committer, or credential. If the direct lane is unavailable, the
request fails explicitly; it never falls back to the draft branch.

## Plain-language summary

This is a small express lane for recording a faculty decision, not a shortcut for
changing educational content. Clicking **Attest** or **Reopen** records that decision on
the authoritative branch immediately. Editing a question still goes through the normal
review-and-merge process.

The console will then show where each action sits:

- direct decision: **Recorded on main -> Checks running -> Checks passed -> MS3 live + Resident live**
- question edit: **Draft saved -> PR open -> Checks passed -> Merged -> MS3 live + Resident live**

Those examples show a two-site item. A site that does not ship the selected item is shown as
**Not shipped** and does not block completion.

“Recorded” and “live for learners” are deliberately different states. A failed check or
deployment never erases a valid faculty record and never causes the console to submit the
same attestation again.

## Problem and current state

At the baseline revision, all console mutations use one `GIT_BRANCH` setting, which
defaults to `attest/pending`. Page/tool status changes, question edits, and question
attestations all create commits on that branch. The server then creates or reuses a
rolling pull request into `main`.

That protects substantive changes, but it imposes a redundant PR/merge step on a status
decision that has already been made by faculty. It also makes the session ledger describe
every action as if it followed the same delivery path.

As verified on 2026-08-15, `main` uses classic branch protection with:

- required pull requests;
- strict required checks named `build-test-validate` and
  `Smoke tests (nav crawl · faculty console · LFS · visual)`;
- administrator enforcement;
- force pushes and branch deletion disabled; and
- no repository rulesets or bypass actors.

Therefore direct status commits require an explicit control-plane change. They cannot be
enabled by application code alone.

## Goals

1. Remove PR and merge work from status-only faculty decisions.
2. Preserve exact-revision receipts, faculty confirmations, server-derived attribution,
   structural checks, and the durable Git audit trail.
3. Keep every substantive question edit behind the existing PR and required-check gates.
4. Make branch provenance visible before a faculty action is taken.
5. Show post-commit checks and exact learner-site delivery without claiming that a commit
   is already published.
6. Fail closed on stale state, credential failure, branch divergence, ambiguous write
   outcomes, or unauthorized field changes.
7. Keep the direct credential server-side, short-lived, and limited to this repository.

## Non-goals

- No automatic clinical judgment, auto-attestation, or relaxation of existing receipts,
  warnings, blockers, batch checks, or confirmations.
- No direct path for question stems, options, answers, rationales, evidence, metadata, or
  other curriculum fields.
- No automatic merge, automatic revert, force push, ref reset, or Netlify-only rollback.
- No claim of individual identity from the existing shared faculty key. Attribution
  remains a server-configured label until separate per-person authentication is designed.
- No replacement of Git history with the browser session ledger.
- No GitHub, GitHub App, ruleset, or Netlify configuration change as part of approving
  this document. Those are separate, operator-authorized rollout steps.
- No append-only clinical attestation event store in this version. The content-free request
  journal below exists only for idempotency/lease safety; a signed faculty-event ledger is a
  possible future audit enhancement.

## Core invariants

These are implementation requirements, not suggestions.

1. **Server-routed only.** The request names an action, never a branch or path.
2. **Direct means status-only.** Direct writes may touch only
   `13_Faculty_Resources/reviewed.json` or `question_bank.json`, under the field rules
   below.
3. **Exact reviewed evidence.** A direct decision is valid only for the exact item,
   manifest, applicable content-source blob, learner build, and deployed-question revision
   that faculty reviewed. A repository ledger receipt alone is insufficient.
4. **One coherent snapshot per surface.** Main and draft data may share one response only
   when each snapshot and every rendered item are explicitly labeled with provenance.
5. **No pending-question shortcut.** If `attest/pending` carries any unmerged question-bank
   change, all direct question attestations are disabled. A shared qbank coordination
   lease serializes draft saves with direct qbank attestations so this is not a
   check-then-write race. Merge or reconcile the draft, reload `main`, and earn fresh
   receipts first. Page/tool status actions may continue.
6. **No silent fallback.** Missing App credentials, missing bypass, or a protected-ref
   rejection returns `main_direct_write_unavailable`; it does not create a draft commit.
7. **Atomic main update.** Every direct commit is built from an exact `main` parent and
   advances `refs/heads/main` with `force: false`.
8. **No success before confirmation.** The browser records no success action until a
   repository reload confirms the requested status and exact revisions.
9. **Publishing is independent.** Check or deploy failure changes delivery status, not the
   recorded faculty decision.
10. **Lock clears session context, not unresolved-write safety.** The compact tracker is
    temporary browser state and Git commits are the durable record. A minimal
    non-sensitive unresolved-request capsule survives Lock until its outcome is proven.

## Architecture

### 1. Two explicit repository lanes

Replace the single implicit repository gateway with two named capabilities:

- **Main read/status gateway**
  - reads immutable snapshots from `main`;
  - uses the existing non-bypass repository credential for ordinary reads;
  - mints a dedicated GitHub App installation token only for an approved direct status
    POST or a qbank coordination-lease operation in `direct-status` mode;
  - writes only through the exact-head Git tree/commit/ref sequence; and
  - never creates or looks up a pull request.

- **Draft edit gateway**
  - reads and writes `attest/pending`;
  - uses the existing non-bypass draft credential;
  - fast-forwards an empty/stale branch from `main` when safe;
  - creates or reuses the rolling pull request after a successful draft save; and
  - cannot bypass the `main` ruleset.

`ATTESTATION_WRITE_MODE` controls activation:

- `rolling` is the default and preserves the current all-actions-through-PR behavior.
- `direct-status` activates the route table in this specification.
- A missing value behaves as `rolling`; an unrecognized non-empty value is a server
  configuration error rather than a silent mode change.
- Once `direct-status` is selected, a per-request failure never changes the route back to
  `rolling`. Rollback requires an explicit environment change by an operator.

Existing `GIT_BASE_BRANCH` remains `main`. Existing `GIT_BRANCH` remains the draft branch
for backward compatibility and defaults to `attest/pending`. The implementation should
refer to them internally as `mainRef` and `draftRef` so the old single-target assumption
does not survive in new code. In `direct-status` mode the server rejects equal refs, and
the production configuration must resolve `mainRef` to literal `main`.

Read behavior is mode-specific:

- In `rolling`, `GET` and post-write confirmation retain the current single-ref projection
  from `GIT_BRANCH`; all actions use the rolling PR. No App or coordination lease is
  required, so default mode remains behaviorally identical.
- In `direct-status`, `GET` uses the split, provenance-labeled snapshot below, and each
  confirmation reloads the ref selected by the server route.

### 2. Immutable snapshot model and provenance

In `direct-status`, `GET /api/attest` builds two named snapshots instead of reading
everything from the configured write branch.

The following field names and meanings are normative; implementations may add fields but
may not rename, merge, or omit these provenance values:

```json
{
  "sources": {
    "main": {
      "headRevision": "<git commit>",
      "reviewedRevision": "<reviewed.json blob>",
      "manifestRevision": "<site_manifest.json blob>",
      "qbankRevision": "<question_bank.json blob>"
    },
    "draft": {
      "branch": "attest/pending",
      "headRevision": "<git commit or null>",
      "qbankRevision": "<blob or null>",
      "aheadBy": 0,
      "behindBy": 0,
      "state": "current"
    }
  },
  "capabilities": {
    "contentStatus": { "route": "main", "available": true },
    "qbankDraft": { "route": "draft", "available": true },
    "qbankStatus": { "route": "main", "available": true, "blockedReason": null }
  }
}
```

Each page/tool item additionally carries `sourceRevision` (the selected manifest source's
Git blob ID), `contentRecordRevision`, a server-derived `reviewSite` label, and that learner
site's observed `learnerBuildRevision`. Version 1 fixes `reviewSite` to the existing MS3
`STUDENT_SITE_URL`; adding a resident review surface is a later product decision. The
server obtains source blob IDs and the review-site identity from trusted configuration and
the exact main Git tree; it does not trust a client path, site label, or origin.
An item absent from the configured MS3 review surface cannot earn a direct content receipt
in version 1; the UI must say why rather than substituting an unreviewed resident rendering.

The review receipt uses the revision reported by the learner frame that was actually
opened, not merely the revision observed during the earlier console GET. In faculty-preview
mode, the outer learner shell fetches its own cache-revalidated `/tool-governance.json`,
requires the non-empty tool inventory to agree on one full source revision, and adds that
`buildRevision` to the otherwise strict `faculty-preview-status` message. For a question,
the nested question tool reports readiness, identity, and its canonically derived
`deployedQuestionRevision` to the outer same-origin shell; it cannot supply a build
revision. The outer shell attaches its independently resolved build revision before
relaying status to the console. Missing, malformed, mixed, cross-origin, or late messages
cannot earn a receipt.

The build marker and reviewed payload must also come from the same network-only preview
session. Merely suppressing new service-worker registration is insufficient because an
older active worker can still return cached Markdown, tool HTML, or qbank JSON while the
uncached build marker reports a newer revision. Before loading a review surface, the shell
therefore requires either no active service-worker controller or an acknowledgement of a
versioned `faculty-preview-network-only-v1` protocol. A supporting worker identifies the
outer or nested client by its valid faculty-preview URL/token and routes every request from
that client to the network with no Cache Storage read, write, or offline fallback. The shell
also uses `cache: no-store` for the marker and explicit content fetches.

An old/unacknowledged controller, network fallback, marker/payload fetched before the
network-only acknowledgement, or a worker change during the sitting produces
`preview_cache_control_unverified`, invalidates the receipt, and offers an update/reload
instruction. It never falls back to a cached preview. Tests must cover the one-time upgrade
from the service worker present at the baseline revision.

In particular:

- page/tool status always comes from `main`;
- a qbank editing surface may come from the draft snapshot when that branch is ahead;
- each question carries `source: main|draft` and its source head/blob/manifest revisions;
  a direct-eligible review receipt separately records server-derived `reviewSite`, accepted
  `learnerBuildRevision`, and matching `deployedQuestionRevision`;
- the UI shows **Main draft · eligible for attestation** or
  **Pending edit · merge before attestation**;
- a draft-sourced question cannot earn a reusable attestation receipt; and
- after a draft PR merges, the console reloads `main` and all relevant question receipts,
  confirmations, and batch choices must be earned again.

The server computes an opaque SHA-256 `contentRecordRevision` from the complete canonical
`reviewed.json` record, including fields that are intentionally not returned to the
browser. This lets the browser prove which record it reviewed without exposing internal
hashes or notes.

### 3. Branch-state rules

The draft branch comparison is interpreted as follows:

| Draft state | Behavior |
|---|---|
| branch absent | Treat as no pending edit; create from current `main` on first draft save. |
| heads equal | Draft saves and main-based question attestations are available. |
| ahead only | Draft edits may continue; all direct question attestations are blocked. |
| behind only | No pending edit exists. Direct qbank status uses current `main` and remains eligible. On the next draft save, build the saved commit directly on current `main` and advance the old draft ref to that descendant in one non-forced update. |
| ahead and behind | Qbank writes fail `draft_branch_out_of_date`; page/tool direct status remains available. |

A page/tool direct commit can make an already-ahead draft branch also fall behind. The
console must show that the draft PR needs reconciliation. It may not silently merge,
rebase, or copy main into a branch that already contains work.

Before enabling `direct-status`, the existing rolling branch must be merged or otherwise
drained so activation starts from equal heads and no old content attestation remains
stranded on the draft branch.

### 4. Request journal and qbank coordination lease

GitHub cannot atomically compare and update `main` and `attest/pending` in one operation.
An eligibility check alone would allow this race: qbank attestation sees no pending edit,
then a draft save advances the draft ref before the main ref update. A second race exists
when the browser loses the response while a serverless invocation may still be running: a
read-only history check cannot safely declare absence and permit a new request.

In `direct-status` mode, the dedicated content-free `attest/coordination` branch therefore
has two narrow jobs:

- an append-only technical request journal for every console mutation; and
- a single qbank lease shared by `qbank.save-draft` and `qbank.attest`.

The direct App owns fixed-path coordination writes for both target routes; the draft
credential never receives main bypass. The journal is not a second clinical ledger and
contains no question text, reopen text, hidden review fields, or faculty key. For a
lowercase normalized request UUID it uses server-selected paths only:
`requests/<uuid>/claim.json`, `attempt-0.json`, optional `attempt-1.json`, and
`outcome.json`, plus the single `qbank-lease.json`.

The initial claim binds schema version, request ID, action digest, action kind, route,
target ref, target IDs, client-expected parent, server claim time, and a server-computed
`quiescenceNotBefore`. That deadline is exactly 120 seconds after claim time. Production
enablement must prove the platform's hard invocation timeout is no more than 60 seconds, so
the window is at least twice the maximum lifetime; otherwise `direct-status` fails
configuration. A resolution tombstone and a late mutation claim race through the same
non-forced coordination-ref compare-and-swap, so exactly one can win.

The mutation protocol is:

1. append the request claim with a non-forced coordination-ref update; an existing same-ID
   claim must have the same digest, while a closed request cannot be restarted;
2. for a qbank action, require `qbank-lease.json` to be `released`, then append an
   `acquired` state binding request ID, digest, route, target ref, client-expected parent,
   server time, and the claim commit; sibling acquisitions race and exactly one wins;
3. reread the target snapshots and perform every eligibility, health, and policy check;
4. create the candidate target commit object without advancing the target ref, then append
   the attempt record binding attempt number, actual target parent, candidate commit SHA,
   prepared time, and all non-sensitive precondition revisions; a qbank attempt also updates
   the held lease to name that candidate;
5. immediately before the target update, prove the request remains open at that exact
   prepared journal state, the target still has the recorded actual parent, and any qbank
   lease still names this request/candidate;
6. perform at most one non-forced target-ref update for that prepared attempt; and
7. append `committed` or a conclusive `rejected` outcome and release the qbank lease after
   the target result is known.

A safe retry creates only `attempt-1.json`; it never overwrites the first candidate record.
There is no clock-based lease stealing. If an invocation stops, qbank writes fail closed
with `qbank_coordination_held`, while page/tool actions continue. The resolution protocol
below may release the lease only after it records a verified commit or atomically closes the
request absent after the 120-second quiescence deadline. Any inconclusive ancestry, journal,
or GitHub read leaves both request and lease unresolved for operator review. A target write
that succeeded but whose outcome/release append failed remains a successful faculty action
plus a coordination warning; it is never reported as an unsuccessful attestation.

This lease serializes console qbank mutations only. Direct page/tool writes use the request
journal but do not acquire the qbank lease and may advance `main` concurrently; the qbank
operation's main CAS will then retry or conflict normally.

The lease cannot atomically coordinate an out-of-band human or automation push to
`attest/pending`. Direct qbank enablement therefore has an explicit operational prerequisite:
the console is the only qbank writer to that branch, and every future writer must adopt this
same lease. The handler still rereads the draft head immediately before a direct qbank
target update, but that check is not presented as protection from an uncooperative writer.
If this single-writer boundary cannot be enforced, page/tool direct status may enable but
direct qbank attestation must remain disabled.

### 5. Action routing and write rules

#### Page/tool attest or reopen

The browser submits exactly one slug plus:

- a UUID request ID;
- expected main head;
- expected `reviewed.json` blob revision;
- expected manifest revision;
- expected selected source blob revision;
- expected opaque content-record revision;
- the learner build revision reported for the surface faculty reviewed;
- desired status; and
- for reopen only, the existing required reason of at most 240 characters.

The server rereads all facts at one exact main commit. It derives the source path from the
manifest, verifies that the slug still ships, and requires the selected source blob plus
the complete ledger record to match the receipt.

The learner build is acceptable when it equals the expected main commit. A lagging learner
build is render-equivalent only if it is an ancestor of main and every intervening commit
is a validated console **content-status-only** commit for other slugs, with the selected
manifest entry and source blob unchanged. Any qbank status change, curriculum/source
change, build-pipeline change, unverified commit, non-ancestor revision, or status change
for the selected slug requires waiting for the learner site to reach the reviewed main
snapshot. The preview/readiness protocol must return the build revision used for the
faculty checks; a generic healthy-page response is not evidence.

The result may change only:

- `status`;
- `at`;
- `by`; and
- `reason` (added for reopen, removed for attest).

Every other record and every other field in the selected record—including risk, notes,
content/claims/evidence hashes, and evidence-through metadata—must remain semantically
equal. Canonical comparison recursively sorts object keys, preserves array order, rejects
non-JSON values/accessors, and compares the resulting UTF-8 JSON bytes. The server
performs this semantic before/after diff before it
creates the Git blob. A direct content request containing zero or multiple slugs is
rejected.

#### Save question draft

`qbank.save-draft` keeps the current editable-field allowlist and structural checks. It
writes only to `attest/pending`, continues to force the saved item to `draft`, and creates
or reuses the rolling pull request after a successful commit.

The save uses the exact draft head, qbank blob, manifest blob, and item revision. If the
branch is ahead and behind `main`, the save fails without mutation. The console retains
the local draft and gives the operator a link to reconcile the rolling PR. The shared
qbank lease is held from the final branch-state read through the draft ref update.

#### Attest question(s)

`qbank.attest` may use the direct lane only when:

- the displayed qbank snapshot came from `main`;
- the draft branch has no unmerged qbank change: absent, equal, or behind-only is eligible;
  ahead-only or ahead-and-behind is not;
- every selected item is still `draft` on `main`;
- every item revision and reviewed revision exactly matches the loaded main item;
- every selected item has a network-only learner receipt naming the server-derived review
  site, learner build revision, and deployed question revision, and that deployed question
  revision exactly matches the selected main item;
- the main manifest revision matches;
- every existing blocker, warning, acknowledgement, confirmation, and batch guard passes;
  and
- the operation holds the shared qbank coordination lease.

Each selected question's learner build must equal the reviewed main snapshot or satisfy the
same strict lag proof as content: every intervening commit is a validated content-status-only
commit for another slug, while the qbank, manifest, question revision, and build pipeline
remain unchanged. A saved/local Draft preview may still support editing, but it cannot by
itself authorize a direct qbank attestation. In live review mode the nested question tool
derives `deployedQuestionRevision` from the complete loaded item with the same canonical
algorithm as the server; the outer shell validates and relays it with its independently
derived `buildRevision`.

The direct route retains the existing explicit-selection and request-size limits; it adds
no new batch-size product rule. Warning-bearing questions remain individual-only.

The semantic diff may change only `status: draft -> attested` for the explicitly selected
IDs. It may not reorder items, normalize formatting, change an unselected item, or alter
any curriculum field. The result is one atomic main commit for the selected set.

### 6. Exact-head update and safe retry

Direct writes generalize the existing qbank Git-data sequence:

1. capture the expected `main` head;
2. read the target file and manifest at that exact commit;
3. validate item/record receipts and the action-specific field allowlist;
4. create a new blob;
5. create a tree from the captured parent tree with exactly one file replacement;
6. create a commit with the captured parent;
7. advance `refs/heads/main` using `force: false`; and
8. validate the returned ref and commit IDs.

If another commit advances `main` first, the server may retry once only when it can prove
that all action-relevant facts remain unchanged:

- content: the full manifest revision, selected source blob, selected record revision,
  learner-build equivalence, and desired status preconditions are unchanged;
- qbank: the full manifest revision is unchanged and `prepareAttestation` reruns against
  the complete current active bank, including every blocker, warning, acknowledgement,
  confirmation, and batch assessment; every selected deployed-question revision still
  equals its main item revision; every learner-build receipt remains strictly equivalent;
  and
- the draft-branch eligibility rule still passes.

The retry rebuilds from the new head and preserves unrelated changes. If any relevant
fact changed, return HTTP 409 and require a reload. A whole-file blob change alone does
not authorize or forbid retry; the semantic facts above decide.

### 7. Idempotency and uncertain outcomes

Network failure after GitHub accepts a ref update is not the same as a rejected write.
Blindly retrying could create a duplicate attestation or reopen commit.

Every mutation therefore carries a browser-generated UUID v4 `requestId`. The server
canonicalizes the immutable action snapshot and computes an `actionDigest`. Commit
messages include non-sensitive trailers:

```text
Faculty-Request-ID: <uuid>
Faculty-Action: <content.attest|content.reopen|qbank.attest|qbank.save-draft>
Faculty-Action-Digest: <sha256>
```

No clinical text, reopen reason, faculty key, email, or credential enters these trailers.

The coordination claim is the primary idempotency record. Before preparing a target commit,
the server resolves the fixed request path:

- same request ID and same digest in an open state -> resume or resolve only the recorded
  attempt; never start a parallel attempt;
- same request ID and a different digest/route/targets -> `idempotency_conflict`;
- a verified committed outcome -> return its existing receipt (`replayed: true`); and
- a closed-absent outcome -> do not reuse the request ID.

The canonical action digest binds action kind, server-selected route, target IDs, desired
result, the client-reviewed expected head, file/manifest/item/source revisions,
`reviewSite`, learner-build and deployed-question revisions where applicable,
confirmations, warning acknowledgements, and the SHA-256 of any reopen reason. It never
places reason text itself in a trailer. The actual parent selected by a safe retry and each
candidate commit SHA live in immutable attempt records, not in the digest, so the digest
remains stable while unrelated main changes are safely incorporated.

The server also walks first-parent target history from current head toward each recorded
actual parent for at most 256 commits and directly compares every recorded candidate SHA.
This corroborates the journal and detects duplicate/rogue trailers; it is not, by itself,
proof that an in-flight invocation will not write later. A replay candidate is accepted
only after its parent, tree diff, action kind, route, target IDs, allowed result,
precondition revisions, journal attempt, and digest are revalidated. A cap, non-ancestor
boundary, duplicate matching trailers, missing attempt, or API failure is unknown.

On `attestation_outcome_unknown`, the UI freezes the captured action, displays
**Outcome being verified**, and offers **Verify outcome**. It never labels the action
failed and never creates a fresh request ID automatically. No tracker entry is marked
successful until the request ID resolves to a commit and a repository reload confirms
the intended state.

Before any mutation starts, the browser writes a minimal recovery capsule to
`cw_attestation_unresolved_v1`: request ID, action digest, route, target IDs, expected
parent, and timestamp only. It contains no faculty key, reopen text, question text, hidden
ledger data, or credential. Lock and tab close clear the visible tracker but not this
capsule. On the next unlock the console must resolve it before allowing another mutation.
The capsule clears only when the commit is verified or absence is proven; after proven
absence, faculty must deliberately recreate and re-review the action rather than replaying
lost clinical/reopen text. The client timestamp is display-only and never establishes
quiescence; server journal time controls every deadline.

`POST /api/attest-resolve` is the authenticated request-resolution operation. It uses the
same exact-origin/faculty-key controls, `Cache-Control: no-store`, a 16 KiB body limit, and
the existing 60-requests-per-minute IP/domain limit. It accepts the capsule fields—never a
required commit SHA—and returns exactly one state:

```json
{
  "state": "committed | absent | unknown",
  "requestId": "<uuid>",
  "commitSha": "<full object id or null>",
  "commit": "<safe https URL or null>",
  "canResume": false,
  "retryAfterSeconds": 0,
  "checkedAt": "<ISO-8601>"
}
```

The endpoint never changes `main`, `attest/pending`, clinical content, or faculty status.
It may append only a fixed-path outcome/tombstone and a matching qbank-lease release on the
coordination branch. Resolution is normative:

1. validate capsule metadata against any claim/attempt; a mismatch is
   `idempotency_conflict`;
2. if any recorded candidate is valid and reachable from its target ref, atomically record
   `committed`, release its qbank lease if needed, and return the commit receipt;
3. if no claim exists, race an immutable closed-absent tombstone against a late initial
   claim with one non-forced coordination update; the winner is reread, and only a winning
   tombstone permits `absent`;
4. a conclusive pre-target `rejected` journal outcome permits `absent` immediately;
5. an open claim with no prepared candidate before `quiescenceNotBefore` returns `unknown`
   with the remaining wait; at or after the deadline, the resolver may win a closed-absent
   tombstone only if no attempt exists, then release the matching lease;
6. for a prepared candidate, target ref equal to its recorded actual parent returns
   `unknown` with `canResume: true`—it never returns absent while that exact non-forced
   update could still land;
7. if the target is a verified descendant of a recorded actual parent but excludes that
   candidate, its old non-forced update can no longer succeed; before the quiescence deadline
   resolution remains unknown because the invocation may still prepare the one allowed
   retry, and only after the deadline with no later candidate may the resolver append
   closed-absent and release the lease; and
8. a cap, missing candidate object, duplicate trailer, unrelated/rewritten target,
   coordination mismatch, or failed GitHub read remains `unknown` and fail-closed for new
   mutations until an operator can establish the same proof.

Thus reaching an expected parent in history never proves absence on its own. A late
invocation must recheck the still-open prepared journal state immediately before its target
CAS, so it cannot write after a pre-candidate tombstone wins. `Verify outcome` polls this
operation.

When resolution returns `unknown` plus `canResume: true`, the UI offers a separate explicit
**Finish original action** control. `POST /api/attest-resume` accepts the same capsule only;
it does not accept a new action body, target path/ref, or commit SHA. The server revalidates
the complete journal/digest/candidate, current action policy, qbank branch/lease exclusion,
and mutation-side main health. It may update a target only when the target still equals the
candidate's recorded actual parent, and it reissues that exact candidate SHA with
`force: false`. A concurrent original update is harmless because both requests name the
same commit; if the candidate is already reachable, resume returns the existing receipt.
Any moved parent, changed policy, or ambiguous read performs no update and returns to
resolution. Only a `committed` result proceeds to repository confirmation and the delivery
tracker; `absent` clears the capsule but requires a newly reviewed action.

## Credential and repository-protection design

### Dedicated direct-status GitHub App

The direct lane uses a GitHub App that is:

- installed only on `jmoss333/psychiatry-clerkship`;
- granted repository **Contents: read/write** and implicit metadata access only;
- granted no Administration, Actions, Checks, Workflows, Pull requests, Issues, Secrets,
  organization, or account permission;
- authenticated server-side with App ID, installation ID, and private key secrets; and
- used to mint a short-lived installation token for this repository and `contents:write`
  for each direct target action or fixed-path request-journal/coordination operation.

GitHub installation tokens expire after one hour and can be restricted to named
repositories and a subset of the App's installed permissions. The implementation must
not assume a fixed token length or log a token. See GitHub's documentation on
[installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
and [App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

GitHub does not constrain Contents write permission to selected paths, and an `always`
bypass applies to the whole matching ruleset. A stolen App credential could therefore
write elsewhere, force-update `main`, or delete a protected ref even though the intended
server code never requests those operations. Compensating controls are:

- installation on one repository only;
- server-only key and token minting;
- hard-coded action-to-path routing;
- semantic field-level diffs;
- exact-head non-force updates;
- request/digest audit trailers;
- no client-provided path, ref, message, or committer; and
- a token-bound direct writer that exposes only `writeReviewedStatus()` and
  `writeQbankStatus()`, plus a separate coordination writer exposing only
  `claimRequest()`, `prepareAttempt()`, `recordOutcome()`, `closeAbsent()`,
  `acquireQbankLease()`, and `releaseQbankLease()` on the fixed coordination ref/paths;
  neither accepts a caller-supplied generic path/ref; plus
- representative traversal, alternate-ref, force/delete, extra-field, unrelated-record,
  and malformed-JSON negative tests.

This residual protected-ref and repository-wide Contents risk must be accepted explicitly
during the operational rollout. It cannot be removed by application code.

### Dedicated read-only delivery observer

Delivery lookup uses a second GitHub App, installed only on this repository and granted
only Metadata read, Contents read, Checks read, and Pull requests read. It is not a
ruleset bypass actor and has no write permission. Its installation token is minted
server-side and is never interchangeable with either the draft writer or direct-status
App. Public learner-site probes need no Netlify credential.

The observer also enforces a server-wide mutation preflight; this is not derived from the
session tracker. Immediately before every direct-main candidate is prepared, and again on a
safe retry, the mutation handler reads the current `main` head and walks at most 256
first-parent commits to the nearest ancestor whose latest exact required checks both passed.
For each newer commit it selects the latest check-run ID for each exact name and App ID
`15368`:

- any terminal non-success or required check still missing after its two-minute startup
  grace blocks with `main_delivery_unhealthy`;
- only queued/in-progress/missing-within-grace commits may remain above the passing anchor;
- a successful rerun on the same SHA or a later fully passing main revision containing the
  failed commit clears the gate; and
- observer auth/API failure, malformed check data, or failure to reach a passing anchor
  within 256 commits blocks with `main_delivery_state_unavailable`.

This is a fresh server check on every direct request, including after Lock or in a new
browser session. A check may fail after the preflight returns; that commit is retained and
the tracker raises attention, while the next direct request is blocked. Draft saves remain
available because they do not advance `main`. Neither observer failure nor an unhealthy
main may fall back to the draft route.

### Ruleset migration

The existing classic branch protection has no narrow bypass. Production enablement
therefore requires replacing it—not layering another rule on top—with an active branch
ruleset targeting `main` that reproduces the current controls for everyone else:

- pull request required;
- strict required checks with the exact two current check names;
- force pushes blocked; and
- deletion blocked.

The coordination journal also needs its own active ruleset targeting exactly
`attest/coordination`: creation occurs once during setup, then updates are restricted,
deletion and force pushes are blocked, and the direct-status App is the sole bypass actor.
Ordinary collaborators, admins, the observer, and the draft credential must be unable to
alter or delete request/lease evidence. It has no PR or required-check rule because its
commits are content-free coordination records and target writes remain separately checked.

The direct-status App is the only bypass actor on either ruleset and uses `Integration` +
`always`. Do not use
`pull_request`, which does not allow the desired direct update, or `exempt`, which omits
the bypass audit entry. GitHub documents App bypass actors and these modes in the
[repository rules API](https://docs.github.com/en/rest/repos/rules) and
[ruleset guide](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

The exact current required-check configuration is preserved, including strict freshness,
both check names, and GitHub Actions integration ID `15368`. The private personal account
must also have a GitHub plan that supports rulesets on private repositories. Phase 1 must
prove the exact `Integration` + `always` capability through the account's UI/API; this is
a hard go/no-go prerequisite, not an assumption. If unavailable, remain in rolling mode.
Never disable classic protection or use an owner PAT as a substitute.

The existing draft credential remains unable to bypass `main`. It handles draft-branch
contents, rolling PR maintenance, and ordinary repository reads. It must never be
substituted for the direct App or observer token.

### Identity statement

The shared faculty key authenticates access to the console, not an individual human.
`ATTESTER_NAME` remains the server-derived label stored in `reviewed.json` and commit
messages; any client-supplied identity is ignored. The GitHub actor proves that the
restricted service performed the write, not which person used the shared key.

The UI and documentation must not describe this as per-person identity. Per-faculty SSO
or signed human assertions require a separate design.

## API response and error contract

Successful mutation responses add normalized provenance:

```json
{
  "ok": true,
  "action": "content.attest",
  "route": "direct-status",
  "repositoryRef": "main",
  "requestId": "<uuid>",
  "commitSha": "<full object id>",
  "commit": "<safe https URL>",
  "pullRequest": null
}
```

Draft responses use `route: "draft-review"`, `repositoryRef: "attest/pending"`, and a
validated rolling PR URL/number. A direct response containing a PR is invalid. A draft
response that lacks a PR after the commit remains a confirmed draft commit plus a
non-fatal PR-maintenance warning, matching the current behavior.

Stable failure codes:

| Code | HTTP | Meaning and UI behavior |
|---|---:|---|
| `main_direct_write_unavailable` | 503 | App credentials, App installation, bypass, or protected ref is unavailable. Nothing committed; no fallback. |
| `content.conflict` | 409 | Main head, manifest, selected source/build evidence, or complete selected record changed. Reload and review again. |
| `qbank.conflict` | 409 | A selected main item, manifest, deployed-question revision, or learner-build proof changed. Reload and review again. |
| `pending_draft_requires_merge` | 409 | Unmerged qbank work exists. Merge/reconcile, reload main, and earn fresh receipts. |
| `draft_branch_out_of_date` | 409 | Draft branch is both ahead and behind main. Reconcile the rolling PR before another qbank write. |
| `qbank_coordination_held` | 409 | Another qbank mutation or unresolved outcome holds the coordination lease. Verify/recover that request before another qbank write. |
| `direct_diff_forbidden` | 422 | Proposed direct output changed a disallowed path, item, or field. Nothing committed. |
| `idempotency_conflict` | 409 | One request ID was reused for different action content. Generate a new action only after explicit review. |
| `attestation_outcome_unknown` | 503 | GitHub may have accepted the commit. Verify the original request ID; do not resubmit blindly. |
| `main_delivery_unhealthy` | 503 | A direct main commit has a failed required check and is not yet contained in a later passing main revision. Existing records remain valid; pause new direct writes pending operator review. |
| `main_delivery_state_unavailable` | 503 | The server cannot establish the required-check health anchor from the read-only observer. Block direct writes; do not fall back. |

Known CI failure pauses further direct status writes so the system does not stack new
bypass commits on a red main branch. The mutation-side observer preflight enforces that
pause across Lock, tabs, devices, and fresh sessions. It clears only after a successful
rerun or later passing main revision contains the failed action, or an operator deliberately
returns the system to rolling mode. A learner-site deployment delay alone does not block a
new faculty record; it raises delivery attention instead. Failure to establish repository
check health does block direct writes because the server cannot safely distinguish those
cases.

## Compact delivery tracker

The current session ledger becomes a compact, per-action delivery tracker. It keeps the
existing guarantees: auto-advance does not remove confirmed actions, Lock clears the
session, and no action appears until the confirming reload succeeds.

### Direct-status state machine

1. **Recorded on main** — exact commit and request ID confirmed.
2. **Checks running** — one or both required checks are queued, in progress, or not yet
   observed within a two-minute startup grace period.
3. **Checks passed** or **Checks failed** — both exact required check names succeeded, or
   at least one reached a non-success terminal conclusion.
4. **Learner delivery pending** — checks passed but one or more applicable public sites do
   not yet prove inclusion of the commit.
5. **Learner delivery complete** — each applicable site proves that its served source
   revision is the action commit or a descendant that still contains the requested
   status/edit. The tracker names **MS3 live** and/or **Resident live** and labels an
   inapplicable surface **Not shipped** rather than pretending it was reviewed or deployed.
6. **Delivery attention** — checks failed, a marker is invalid, or the 30-minute delivery
   observation window expires.

The two-minute check-start grace begins at the direct commit's GitHub committer timestamp;
for a rolling PR it begins anew at the current head commit's timestamp. A required check
still absent after that grace is **Delivery attention**, not indefinitely **Checks running**.
The 30-minute learner-delivery window begins at the main event that can trigger deployment:
the direct commit timestamp or the PR's verified `merged_at` time.

### Draft-edit state machine

1. **Draft saved** — exact draft commit confirmed.
2. **PR open** — rolling PR URL and number confirmed.
3. **Checks running**, **Checks passed**, or **Checks failed** — exact PR head checks.
4. **Merged** — GitHub reports the PR merged and supplies the merge commit.
5. **Learner delivery pending**.
6. **Learner delivery complete** or **Delivery attention**, using the same per-site
   applicability labels as the direct path.

Status-only actions never render PR or merge stages. Draft edits never render
**Recorded on main** until GitHub confirms the merge.

### Evidence sources

An authenticated, read-only delivery function resolves status; browser code never
receives a GitHub or Netlify credential.

Site applicability is reconstructed from the manifest at the action commit, not supplied
by the browser. A non-applicable site is terminal **Not shipped** and does not block overall
completion. The `reviewSite` receipt proves only the learner surface faculty actually
opened; the delivery tracker independently observes every applicable publication target.

- **Commit and PR:** GitHub repository and pull-request APIs.
- **Checks:** check runs for the exact commit SHA, exact check name, and trusted GitHub
  Actions App ID `15368`. The read-only observer has Checks read access; the bypass App
  does not. GitHub's
  [check-runs API](https://docs.github.com/en/rest/checks/runs) supports an exact commit
  ref.
- **Learner source revision:** both shipped sites already emit cache-revalidated
  `/tool-governance.json`. It has no top-level revision and contains tools only, so the
  resolver requires a non-empty tool inventory and requires every
  `items[*].source.revision` to be the same full Git SHA. That consensus is the site's
  build revision. A future top-level release marker may replace this join but is not
  required for version 1.
- **Requested effect:** ancestry alone is insufficient because a later compensating
  commit may reverse the action before an intermediate deploy is ever observed. For a
  page/tool action the resolver also checks the selected slug's status in
  `/governance.json` on each site where that slug ships. For a qbank action it checks the
  selected IDs and expected post-action revisions in `/question_bank.json`. A site on a
  descendant revision counts as current only while the requested effect still matches.
  If the descendant supersedes it, the tracker says **Superseded before observed live**
  instead of claiming delivery.

Public artifact fetches use the configured exact HTTPS origin, no ambient credentials,
`cache: no-store`, and a commit-keyed query string. They allow at most one same-origin
redirect, time out after 10 seconds, cap governance documents at 2 MiB and
`question_bank.json` at 4 MiB, reject duplicate/unknown required fields, and never echo a
remote body into an error or log.

The existing production canary remains a general health backstop. Its `sourceSha` is the
workflow revision and is explicitly not proof that Netlify currently serves that commit,
so it cannot satisfy the per-action delivery state.

GitHub checks and Netlify builds run independently and may finish in either order. The
tracker stores check state and each site's state separately even though it presents them
as one compact progression; a site may say **current** while checks are still running,
but the overall action does not say **delivery complete** until required checks pass and
all applicable site effects are current.

The current CI workflow cancels earlier main-push runs. That would make rapid status
commits manufacture `cancelled` failures, so implementation must update
`.github/workflows/ci.yml`: PR runs may still cancel superseded PR runs, but every push to
`main` must retain its own run. A genuine cancelled/timed-out/action-required/stale latest
attempt is failure. For duplicate/rerun check records, group by exact name plus App ID and
use the highest GitHub check-run ID as the latest attempt; a pending latest attempt remains
pending even when an older attempt passed.

### Delivery resolver contract

`POST /api/attest-delivery` uses the same faculty-key and exact-origin controls as the
mutation endpoint, `Cache-Control: no-store`, a 32 KiB request limit, and the existing
60-requests-per-minute IP/domain limit. One request accepts 1–20 entries:

```json
{
  "actions": [
    {
      "commitSha": "<full object id>",
      "requestId": "<uuid>",
      "route": "direct-status",
      "pullRequestNumber": null
    }
  ]
}
```

The server treats these as lookup keys, not trusted claims. It validates the commit's
trailers and semantic diff to reconstruct targets and expected effects. Each response
entry contains the validated commit URL/SHA, normalized PR state or `null`, normalized
check state and links, separate `ms3`/`resident` source/effect states, `overall`, and an
ISO-8601 `checkedAt`. Unknown fields, unsafe URLs, duplicate request IDs, mismatched
commit/request pairs, more than 20 entries, or a PR outside the configured repository are
rejected.

Twenty is a transport batch size, not a session-ledger product limit. If more than 20
actions are visible, the client sends stable, non-overlapping chunks and merges responses
by validated request ID without dropping or reordering tracker entries.

For a draft-route action, the resolver also requires the PR to belong to the configured
repository, target `main`, and have the exact action commit as an ancestor of its current
head according to the repository comparison API. While open, check state belongs to that
current PR head, so a newer rolling-branch commit cannot leave the tracker displaying stale
green checks. After
merge, GitHub's merged state and merge commit are required, and that merge commit (or a
current descendant) must still contain the reconstructed action effect. A closed-unmerged
PR, unrelated/replaced head, or merged result that omitted/superseded the effect becomes an
explicit terminal attention state rather than **Merged** or **Live**.

The console checks delivery immediately after confirmation, every 20 seconds while a
non-terminal tracker is visible and the tab is active, when the tab regains focus, and on
manual refresh. It stops background polling when all entries are terminal or the tab is
hidden. Delivery lookup failure preserves the last verified state and adds
**Status temporarily unavailable**; it never downgrades a confirmed commit.

### Honest language

- Before main confirmation: **Saving and confirming...**
- Main confirmed, checks unknown: **Recorded in the repository; checks are starting.**
- Checks failed: **Recorded in the repository; publishing needs attention.**
- One site current: name the current site and the pending site.
- All applicable sites current: **Available on every learner site where this item ships.**

Do not use “published,” “live,” “released,” or “deployed” from commit existence, a healthy
site response, a PR merge, or the daily canary alone.

## Failure, compensation, and rollback

- App minting failure, ruleset rejection, invalid GitHub response, observer-health failure,
  or forbidden diff: no target status/content commit is claimed; the technical request
  journal may retain a rejected or unresolved attempt, and the UI names the blocking
  capability.
- Successful write followed by failed confirming GET: no success tracker entry; preserve
  the request ID and verify the outcome before any retry.
- CI failure after the commit: retain the faculty decision, show delivery attention, and
  pause new direct writes. Do not revert automatically.
- Learner delivery failure after checks pass: retain the decision and show which site is
  pending or invalid. Do not treat the attestation itself as failed.
- Mistaken attestation: faculty use the explicit reopen flow with a bounded, non-PHI
  reason, creating a compensating commit. History is not rewritten.
- Emergency stop: set `ATTESTATION_WRITE_MODE=rolling`, suspend/uninstall the App or remove
  its bypass, and leave ordinary `main` protection in force. This is an explicit operator
  action, never an automatic fallback.
- Before a planned App suspension, stop new direct requests and resolve every open journal
  claim. For an immediate emergency suspension, preserve the coordination branch, wait past
  the 120-second quiescence boundary, and treat every open request as unknown until an
  operator completes the same candidate/ancestry proof; never delete the evidence to clear
  a lease.
- Emergency Netlify rollback may reduce learner exposure but must be followed by a
  repository reconciliation; the tracker must continue to show the source mismatch.
- Version 1 creates no email, issue, or chat notification. GitHub's existing check
  notifications plus the console's blocking attention state are the alert channels; the
  named repository operator owns resolution before direct writes resume.

## Privacy and audit requirements

- No PHI in question content, reopen reasons, commit messages, request IDs, delivery
  artifacts, logs, or tests.
- Never log the faculty key, App private key, App JWT, installation token, draft token, or
  request body.
- Structured logs may contain action kind, opaque request ID, selected non-patient item
  IDs/slugs, route, commit SHA, normalized error code, and timings.
- Git history is the durable record: commit SHA, semantic diff, server label, request ID,
  and action digest.
- The coordination branch is a durable technical idempotency record only. It contains the
  claim/attempt/outcome fields enumerated above, never clinical text or a second authoritative
  faculty status.
- Browser tracker state is session-only and clears on Lock. The non-sensitive unresolved
  request capsule is the sole exception and clears only after resolution. The commit link
  remains the durable handoff outside that session.
- Key rotation uses overlapping App keys: create and deploy the replacement, verify a
  staging mint, then revoke the old key. Emergency revocation suspends the App first.

## Component and file design

Keep pure policy separate from GitHub transport. The implementation plan may refine file
names, but responsibilities must remain isolated.

| Component | Responsibility |
|---|---|
| `faculty-console/netlify/functions/attest.mjs` | Authenticate, parse action, ask the server router for a lane, orchestrate mutation, return normalized provenance. |
| new `faculty-console/netlify/functions/lib/github-app-auth.mjs` | Validate App configuration and mint one-repository installation tokens without logging secrets. |
| new `faculty-console/netlify/functions/lib/repository-reader.mjs` | Explicit-ref reads, ancestry/compare, bounded request-ID lookup, rolling-PR reads, and no bypass token. |
| new `faculty-console/netlify/functions/lib/direct-status-writer.mjs` | Own the bypass token and expose only fixed-path `writeReviewedStatus()` / `writeQbankStatus()` exact-head methods. No generic caller-selected path/ref API. |
| new `faculty-console/netlify/functions/lib/coordination-writer.mjs` | Own fixed-path request-journal/tombstone and qbank-lease updates on `attest/coordination`; accept no caller-selected path/ref. |
| new `faculty-console/netlify/functions/lib/qbank-coordination.mjs` | Apply the pure qbank lease state machine through the fixed coordination writer. |
| new `faculty-console/netlify/functions/lib/direct-status-policy.mjs` | Route matrix, canonical action digest, content-record revision, allowed semantic diffs, retry facts. Pure and heavily unit-tested. |
| existing `faculty-console/netlify/functions/qbank-actions.mjs` | Preserve pure draft/attestation validation and existing faculty gates. |
| new `faculty-console/netlify/functions/attestation-resolve.mjs` | Authenticate capsule-only resolution, validate journal/candidates, and return committed/absent/unknown without mutating target content or status. |
| new `faculty-console/netlify/functions/attestation-resume.mjs` | On explicit faculty request, revalidate and finish only the journal's exact prepared candidate; accept no new action body or caller-selected target. |
| new `faculty-console/netlify/functions/attestation-delivery.mjs` | Authenticated read-only resolver for commit, PR, exact checks, and both public source markers. |
| `faculty-console/app.mjs` | Send immutable snapshot/request IDs, render provenance badges, confirm the correct source, and maintain the compact delivery tracker. |
| `faculty-console/review-model.mjs` | Strictly validate preview origin/window/identity/token plus `buildRevision` and deployed-question revision, and bind the receipt to that exact learner surface. |
| `faculty-console/index.html` | Minimal badge/tracker styles only; no layout redesign. |
| `faculty-console/README.md` | Two-lane operating model, configuration, identity limitation, errors, rollout, and incident runbook. |
| `13_Faculty_Resources/_automation/site_build/spa_index.html` | In faculty-preview mode, resolve the shell's own full build revision from `tool-governance.json` and include it in the outer readiness message; attach it to validated same-origin question-tool readiness. |
| `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` | Preserve the strict nested question identity/readiness protocol, derive the loaded item's canonical deployed-question revision, and never supply or override the outer shell's build revision. |
| `13_Faculty_Resources/_automation/site_build/sw_template.js` and `sw_register.js` | Add the acknowledged network-only faculty-preview protocol, including safe upgrade/reload behavior for a pre-protocol controller and no cache/offline fallback for preview clients. |
| site build/governance tests | Pin the existing `tool-governance.json` full-revision and cache-revalidation contract used for exact delivery proof. |
| `.github/workflows/ci.yml` | Preserve every main-push run while retaining cancellation for superseded PR runs. |

No qbank schema change is required. No clinical content or attestation status changes are
part of implementation tests.

## Configuration contract

Server-side variables:

| Variable | Purpose |
|---|---|
| `ATTESTATION_WRITE_MODE` | `rolling` (default) or `direct-status`. |
| `FACULTY_ATTEST_PASSWORD` | Existing shared console access secret; unchanged identity limitation. |
| `GITHUB_REPO` | Fixed owner/repository target; production remains `jmoss333/psychiatry-clerkship`. |
| `GIT_BASE_BRANCH` | Authoritative ref, default `main`. |
| `GIT_BRANCH` | Draft ref, default `attest/pending`. |
| `GIT_ATTESTATION_COORDINATION_BRANCH` | Content-free request-journal and qbank-lease ref, fixed to `attest/coordination` in production. |
| `GITHUB_TOKEN` | Existing non-bypass draft/PR/read credential; retain name during migration. |
| `GITHUB_APP_ID` | Dedicated direct-status App identifier. |
| `GITHUB_APP_INSTALLATION_ID` | Installation limited to this repository. |
| `GITHUB_APP_PRIVATE_KEY` | Server-only App private key. |
| `GITHUB_OBSERVER_APP_ID` | Read-only delivery-observer App identifier. |
| `GITHUB_OBSERVER_APP_INSTALLATION_ID` | Observer installation limited to this repository. |
| `GITHUB_OBSERVER_APP_PRIVATE_KEY` | Server-only observer private key. |
| `ATTESTER_NAME` / `ATTESTER_EMAIL` | Existing server-derived display and commit attribution. |
| `ALLOWED_ORIGIN` | Existing exact console-origin CORS policy. |
| `STUDENT_SITE_URL` | MS3 learner-site base URL. |
| `RESIDENT_SITE_URL` | Resident learner-site base URL. |

Secrets belong in the Netlify environment UI. They must not appear in `netlify.toml`,
source, generated output, logs, tests, or documentation examples.

## Rollout and migration

### Phase 0: code dark

1. Implement behind default `ATTESTATION_WRITE_MODE=rolling`.
2. Run all local and hosted tests through a normal PR.
3. Confirm rolling mode remains behaviorally identical and needs no App variables.

### Phase 1: staging control-plane proof

1. Create a separate nonproduction private repository.
2. Prove the account plan exposes private-repository rulesets, then install identically
   permissioned direct and observer Apps only there.
3. Apply the proposed main and coordination rulesets and confirm:
   - an ordinary token cannot push directly;
   - an ordinary token cannot update/delete `attest/coordination`;
   - a normal PR still requires the two modeled checks;
   - the fixed-path service endpoint performs only the expected Git-data ref update; and
   - forbidden path/field tests fail before any ref update.
4. Exercise ambiguous timeout/idempotency recovery.
5. Exercise qbank save-versus-attest interleavings and stuck-lease recovery.
6. Prove the deployed function's hard timeout is at most 60 seconds, then exercise the
   120-second claim/tombstone race with a deliberately delayed invocation.

### Phase 2: production preparation

1. Merge or drain `attest/pending`; prove equal heads and no open qbank edit.
2. Export the current classic branch-protection settings for recovery.
3. Create/install the dedicated direct and observer Apps, initialize the released
   coordination ref, and add secrets, leaving mode `rolling`.
4. Protect the exact coordination ref with its restrictive ruleset and verify that only the
   direct App can append through the fixed writer.
5. Create the equivalent active `main` ruleset with the direct App as the sole `always`
   bypass actor; preserve strict freshness, both check names, and integration ID `15368`.
6. Remove the legacy rule only after the replacement is verified, because both rules
   would otherwise apply and the legacy rule would still block the App.
7. Verify an ordinary direct push remains blocked and a normal test PR still follows the
   same required checks.

Changing GitHub or Netlify settings requires a separately authorized operator action and
a named rollback owner.

### Phase 3: page/tool canary

1. Select one faculty-approved low-risk page/tool action; do not invent an attestation for
   the sake of testing.
2. Enable `direct-status` during a monitored window.
3. Confirm the exact main commit, both required checks, and the source revision on both
   learner sites.
4. Observe for at least one complete build/deploy cycle before further direct actions.
5. On failure, return mode to `rolling` and suspend the direct App first. If the ruleset
   itself must be removed, restore and verify classic protection before deleting or
   disabling the ruleset. Preserve the canary commit for diagnosis.

### Phase 4: qbank status enablement

Enable direct qbank attestation only after tests prove the global pending-qbank block,
coordination lease, fresh-main network-only learner/deployed-question receipt, semantic diff, and
merge/reload/reset flow, and the operator confirms that no out-of-band qbank writer can
bypass the lease.
Question editing remains on the rolling PR permanently unless a later approved design
changes that boundary.

## Testing strategy

### Pure policy tests

- route every supported and malformed action; prove the client cannot select a ref/path;
- content-record revision includes hidden fields without exposing them;
- page/tool receipt binds the manifest-derived source blob and reviewed learner build;
  lag equivalence accepts only verified content-status commits for other slugs;
- every qbank receipt binds review site, network-only learner build, and the exact deployed
  question revision end to end through eligibility, retry, digest, replay, and confirmation;
- direct content diff accepts only the four owned metadata fields for one slug;
- direct qbank diff accepts only selected `draft -> attested` statuses;
- reject item reorder, formatting-only whole-file rewrite, extra fields, deletions,
  multiple content slugs, alternate refs, traversal paths, and force/delete operations;
- retry only when the action-relevant facts are unchanged;
- canonical action digests are stable and exclude secrets/clinical text from trailers;
- request-ID claim/replay, digest mismatch, closed-absent reuse, duplicate trailer,
  candidate/parent mismatch, 256-commit cap, and unknown-history cases;
- claim-versus-tombstone races, pre/post-120-second resolution, zero/one/two candidates,
  conclusive rejection, late invocation recheck, and no-commit-SHA recovery;
- two qbank operations racing for the coordination ref allow exactly one target write;
  lease records bind digest/route/target/parent/candidate, and stuck/post-success
  release-failure paths remain fail-closed and recoverable.

### Handler and repository-gateway tests

- direct content and direct qbank targets use the App token and exact `main` parent;
- request/tombstone/lease writes use only the fixed coordination writer and ref/path set;
- draft save uses the direct App only for journal/lease and the non-bypass draft token only
  for its `attest/pending` candidate/ref update;
- direct paths never call compare/pulls housekeeping for success;
- draft save creates/reuses the rolling PR after commit;
- ahead-only, behind-only, missing, equal, and ahead-plus-behind branch cases;
- protected-main/App-auth failure produces `main_direct_write_unavailable` with no
  fallback commit;
- ref races, malformed GitHub responses, 403/409/422 classification, timeout after ref
  acceptance, and one safe retry;
- `/api/attest-resolve` accepts capsule fields without a commit SHA, returns only
  committed/absent/unknown, and never updates a target ref;
- `/api/attest-resume` is reachable only after explicit **Finish original action**, accepts
  no action body/target, reruns every gate, and can update only the exact prepared candidate
  from its exact recorded parent; an original/resume race creates one identical commit;
- mutation-side health preflight blocks terminal failure, missing-after-grace, observer
  failure, malformed data, no passing anchor, Lock, and fresh-session attempts; pending
  checks may continue, and a same-SHA rerun or later containing pass resumes direct writes;
- attribution remains server-derived and client identity remains ignored;
- post-write confirmation never reads the wrong ref;
- rolling mode preserves the current single-ref GET/confirmation contract with no App or
  lease configuration; and
- direct-status mode uses the split snapshot and route-specific confirmation.

Preview-protocol tests additionally prove that the outer learner shell derives one full
build revision from a non-empty, internally consistent tool-governance artifact; only the
outer shell may attach it to question readiness; the nested deployed-question revision must
equal the selected main item; and missing, mixed, malformed, stale-window, wrong-token,
wrong-identity, and cross-origin messages cannot satisfy the receipt.
With no service-worker controller the preview uses explicit network/no-store fetches. With a
supporting controller, every outer and nested preview-client request is network-only. A
baseline-era, unacknowledged, changing, or offline-fallback controller blocks readiness and
the tested upgrade/reload path cannot accidentally emit a receipt first.

Primary existing suites:

- `tests/faculty-console-handler.test.mjs`
- `tests/faculty-console-branch-sync.test.mjs`
- `tests/faculty-console-actions.test.mjs`

### Delivery resolver tests

- exact required-check names, queued/running/success/failure/cancelled/missing states;
- duplicate/rerun selection uses exact name, App ID `15368`, and highest check-run ID;
- rapid main pushes retain separate CI runs instead of cancelling earlier action checks;
- PR open, PR head checks, merged commit, and closed-without-merge;
- valid same-SHA learner marker, valid descendant marker with matching effect,
  descendant with a superseded effect, behind/unrelated marker, inconsistent tool
  revisions, malformed/oversized JSON, timeout, and one-site-only state;
- daily canary success never substitutes for source-revision proof;
- delivery failure never mutates or reclassifies the faculty record.

### Client contract tests

- correct snapshot envelope and request ID for each action;
- the receipt records the `buildRevision` from the accepted learner-frame message rather
  than the earlier GET observation, and invalid/missing build revisions fail closed;
- direct and draft provenance badges;
- pending qbank edit disables receipts/attestation and explains merge -> reload -> review;
- confirmed direct action shows no PR/merge stage;
- draft edit shows PR/check/merge stages;
- no success entry before repository confirmation;
- unknown outcome offers capsule-based verification, not a fresh submission; committed,
  safely tombstoned absent, resumable exact candidate, and non-resumable unknown responses
  drive distinct UI states;
- auto-advance retains the tracker; Lock clears it while preserving only an unresolved
  recovery capsule, and next unlock resolves that capsule before another write;
- failed checks use “recorded; publishing needs attention” language;
- safe links only and no credential/hidden-ledger exposure.

Primary suites:

- `tests/faculty-console-contract.test.mjs`
- `tests/smoke/faculty-console.spec.js`

### Rendered and repository verification

- Playwright desktop and 390 x 844 mobile paths for direct content, direct qbank, pending
  edit block, draft tracker, unknown outcome, keyboard/focus, and horizontal overflow;
- root `node --test tests/*.test.mjs`;
- schema and attestation-consistency validators;
- sequential `build_and_check.sh ms3` then `build_and_check.sh res`;
- faculty-console Playwright with the required local servers; and
- the normal hosted required checks on the implementation PR.

Fixtures must be synthetic and must not change real clinical content or attestation
status. Production control-plane behavior is proven first in the staging repository, not
by an experimental push to production `main`.

## Acceptance criteria

The design is complete only when all statements below are demonstrably true.

1. A page/tool attest or reopen binds the manifest-derived source blob and reviewed learner
   build, changes only its permitted metadata, and lands directly on `main` without
   creating, updating, warning about, or linking a PR.
2. A content record, selected source, manifest, or non-equivalent learner build changed
   since review returns 409; judgment is never applied to a different surface
   automatically.
3. A question edit lands only on `attest/pending`, remains `draft`, and obtains the rolling
   PR delivery path.
4. The coordination lease makes qbank draft-save and direct-attest interleavings serial;
   any unmerged qbank edit blocks every direct qbank attestation while page/tool direct
   status remains available.
5. After qbank merge, the UI loads the exact main revision and requires fresh network-only
   learner-build/deployed-question receipts and confirmations before direct attestation.
6. A direct qbank commit changes only selected status fields and honors all existing
   faculty, explicit-selection, request-size, and batch gates.
7. Direct capability failure produces an explicit error and zero draft fallback writes.
8. Concurrent main writes cannot overwrite or silently absorb changed review facts.
9. An ambiguous network result cannot create a duplicate action; capsule-only resolution
   finds a valid candidate or wins a coordination tombstone after proven quiescence before
   success, absence, or any newly reviewed request, and explicit resume can finish only the
   exact prepared candidate from its exact parent.
10. The tracker distinguishes repository record, checks, PR/merge where applicable, and
    MS3/resident publication.
11. “Live” requires source ancestry plus the still-current requested effect on each named
    learner site; general site health and ancestry alone are insufficient.
12. Check/deploy failure leaves the faculty record intact and creates an attention state,
    not an automatic revert.
13. The bypass App is installed only on this repository, has Contents read/write only,
    and is the sole bypass actor for the main and coordination rulesets; the separate
    observer App is read-only and has no bypass.
14. Ordinary users, admins, and the draft token retain the current PR/check requirements
    for `main` and cannot alter/delete coordination evidence.
15. Lock clears temporary tracker data but preserves unresolved non-sensitive request
    safety; target Git history plus the technical coordination journal retain durable
    request/candidate/outcome evidence.
16. Every main-push CI run is preserved, so rapid attestations do not cancel one another's
    required checks.
17. The private-account ruleset/App-bypass capability is proven in staging; if it is
    unavailable, production remains in rolling mode without weaker protection.
18. All targeted, root, build, smoke, and hosted checks pass with no clinical content or
    real status mutation in fixtures.
19. Mutation-side observer preflight blocks direct writes after known failure and when
    health is unprovable across fresh sessions, then resumes only on a verified rerun/later
    containing pass or explicit operator rollback to rolling mode.
20. The 120-second request-resolution boundary is at least twice the proven production
    function timeout; if that relationship cannot be guaranteed, direct mode cannot enable.

## Superseded assumptions

This design supersedes documentation that assumes every console write uses one
`GIT_BRANCH`, every confirmed action needs a rolling PR, or direct mode means setting
`GIT_BRANCH === GIT_BASE_BRANCH` with the same credential. It also supersedes any prior
proposal to auto-merge status commits.

The existing receipt, warning, confirmation, batch, session-reset, and repository-confirmed
success contracts remain controlling unless this document explicitly changes them.

## Independent review brief

The independent reviewer should inspect the current repository rather than reviewing this
document in isolation. Return a table for each major section using:

- `CONFIRMED` — design matches current code/platform behavior and is implementable;
- `PARTIAL` — direction is sound but a named requirement is incomplete or inaccurate;
- `NOT REPRODUCED` — the stated current condition is not present;
- `OUTDATED` — repository or GitHub behavior has changed; or
- `BLOCKED` — an institutional or operator decision is required.

The review must specifically challenge:

1. whether GitHub rulesets for this user-owned private repository support the proposed App
   bypass without weakening ordinary PR/check protection;
2. whether the direct semantic diff and exact-head retry rules cover every race;
3. whether the request journal, candidate records, 120-second quiescence proof, and
   claim-versus-tombstone CAS make committed/absent/unknown resolution safe without a
   browser-known commit SHA;
4. whether the append-only qbank coordination lease binds enough durable attempt evidence,
   closes every draft-save/direct-attest interleaving, and has safe stuck-lease recovery;
5. whether source/build receipts and the service-worker network-only protocol prove the
   exact page/tool and deployed question faculty actually reviewed;
6. whether the `tool-governance.json` revision consensus plus current-effect projections
   reliably prove every applicable learner site, including descendant and superseding
   commits;
7. whether check-run/PR tracking and the mutation-side unhealthy-main gate use the exact
   commits, App ID, attempts, passing anchor, and permissions claimed across fresh sessions;
8. whether any browser, recovery capsule, coordination-journal, or log path can expose
   credentials, hidden ledger fields, clinical text, or PHI;
9. whether rollback and ruleset migration have a safe, reversible operator sequence; and
10. whether the fixed-path writer boundaries keep bypass authority structurally narrow
    without an unrelated refactor.

The reviewer should not implement or change GitHub/Netlify settings. For every finding,
name the exact file/function or official platform rule, classify it as mechanical versus
faculty/operator-gated, and propose the smallest safe correction.

## Future option, not part of this implementation

An append-only, signed attestation-event ledger could later materialize current status in
`reviewed.json` and `question_bank.json`. That would make compensation, historical
delivery, and per-person signatures easier to reconstruct. It is intentionally deferred:
the direct-status lane can meet the present goal with Git commits, request IDs, exact source
markers, and the content-free technical coordination journal without adding a second
clinical status or attestation-event persistence system.
