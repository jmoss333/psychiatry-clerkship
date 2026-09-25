# Hosted Interview Room, Slice 2 — Multi-Case Transport (Marcus and Ray)

**Date:** 2026-09-07
**Status:** approved for planning
**Predecessors:** slice 1A (station, bookmarks, reflection) and 1B (one-moment retry), both merged to `main` in #547.

## Goal

Carry more than one standardized patient on the hosted transport, and land the two
faculty-reviewed cases — Marcus and Ray — on it. Case identity stays immutable
within an encounter.

## Scope decision

The handoff sequences slice 2 as "Morgan first, then Marcus and Ray". This spec
inverts that, on the author's decision of 2026-09-07.

| Case | Location | `facultyReview` | Gates | This slice |
| --- | --- | --- | --- | --- |
| Marcus (`sp_mania_redirect_001`) | pack | `reviewed` | 4 | **yes** |
| Ray (`sp_psychosis_paranoid_001`) | pack | `reviewed` | 3 | **yes** |
| Morgan (`sp_alcohol_ambivalence_001`) | `sp-interview.local-cases.js` | `draft-pending-attestation` | none | **deferred** |

Morgan is the only case not faculty-reviewed and the only one outside the pack.
The multi-case machinery is identical whichever cases ride on it, so the two
reviewed cases move now and Morgan follows as its own small change once its
status is settled. Deferring Morgan is a governance choice, not a technical one:
nothing in this design depends on which case is added.

## What already holds, and must keep holding

The property the handoff asks for — reject case changes mid-encounter — is already
true by construction and must not be weakened.

`lib/handler.mjs` builds its state codec with

```
binding: `hosted-dana-v1:${caseBinding}:${env.DEPLOY_ID}:${origin}:${hash(secret)}`
```

where `caseBinding = hash(JSON.stringify(dana))`. That string is the AEAD
associated data. A receipt sealed under one case's binding cannot be opened under
another's: the GCM tag fails and the request dies as `preview_state_invalid`,
before any reservation. Slice 2 preserves this with N cases rather than inventing
a new mechanism.

Three invariants from slice 1 also carry over untouched, and the plan must not
trade any of them for multi-case support:

- **One continuation per receipt, of any kind.** A retry consumes the same
  `turn:${sid}:${nonce}` ledger slot a turn does.
- **Heard-only history.** `nextHistory` records the heard prefix and `omittedTail`,
  never the generated tail.
- **One alternative per encounter**, sealed as `retried:true`.

## Design

### 1. Case registry

`lib/case.mjs` currently exports a single `dana` and a single `caseBinding`. It
becomes a registry keyed by case id, each entry carrying the resolved case
definition and its own binding hash.

Only Dana passes through `localDana.applyCase()` — the direct-suicide-question
overlay is Dana-specific and must not be applied to any other case.

The existing startup drift check runs **per case**. A grounding-hash drift in any
registered case therefore fails at module load, before the first paid request,
exactly as it does today for Dana alone.

### 2. Codec selection

The handler builds a codec per case, with the version string becoming
`hosted-sp-v2:${caseId}:${caseBinding}:${DEPLOY_ID}:${origin}:${hash(secret)}`.
The version bump is deliberate: every receipt outstanding at deploy time becomes
unopenable, which is correct, harmless (30-minute expiry, engineering preview) and
preferable to two schemes coexisting.

The client sends `caseId` on every request:

- `start` — chooses the case.
- `turn` and `retry` — selects the codec. A wrong value fails to open.

### 3. Case identity inside the sealed state

`caseId` is also stored in the sealed state, and the handler asserts
`state.caseId === body.caseId`, failing `preview_state_invalid` on mismatch.

This is deliberate redundancy. The binding already separates cases, but that
separation is emergent from a template string — a future edit that dropped
`caseBinding` from the binding would silently allow a Marcus receipt to open as
Ray, and no test would notice. The in-state field makes the invariant explicit,
directly testable, and hard to remove by accident.

`codec.open` gains a `caseId` validation clause alongside the existing ones. An
unknown or malformed `caseId` in a request is `preview_input_invalid` (400) before
any reservation.

### 4. Speech

`lib/openai-provider.mjs` already accepts a `caseId` and resolves a per-case
speech profile, but defaults it to Dana. The default is **removed**: an omitted
`caseId` becomes a loud failure rather than a reply silently spoken in the wrong
patient's voice. Marin and Cedar are assigned by the existing profile table, not
by anything this slice adds.

### 5. Client

`public/station-content.js` gains Marcus and Ray, copied from
`sp-encounter-profiles.js` with learner-facing keys only. The participant
`portrayal` array is actor direction and is **not** copied, and slice 1's test that
portrayal never reaches rendered output extends to cover all three cases.

The access panel gains a case picker. Once an encounter starts the case is fixed
and the picker is disabled; changing case means Clear and start again, which the
binding enforces regardless of what the UI does.

### 6. Unchanged

Budget ceilings stay at 72 per rolling half hour and 120 per deployment. The
per-deployment figure is a deployment budget and is rightly shared across cases.
No new browser storage, no recorded-audio path — the hosted preview synthesizes
speech per encounter and never reads `output/speech/`.

## Testing

The load-bearing test: **a receipt sealed for Marcus must not open under Ray.**

Alongside it:

- `state.caseId` disagreeing with the request's `caseId` is refused before any
  reservation.
- An unknown `caseId` returns 400 and reserves nothing.
- Each case's actor receives its own grounding, and the per-case startup drift
  check fails closed when a grounding hash moves.
- Each case speaks in its own voice; an omitted `caseId` throws rather than
  defaulting.
- `portrayal` reaches rendered output for no case.
- Every existing Dana test passes unchanged. If a Dana test needs editing to
  accommodate multi-case support, that is a signal the change is wider than
  intended — stop and re-examine rather than editing the test.

## Risks

- **Version bump invalidates outstanding receipts.** Accepted: 30-minute expiry,
  engineering preview, and the alternative is two binding schemes at once.
- **Three cases share one deployment budget.** A learner working through all three
  can exhaust 120 units faster than the single-case assumption implied. This slice
  does not change the ceiling; it notes that the ceiling now covers more ground.
- **Marcus and Ray have gated content of their own** (4 and 3 gates). This slice
  adds no gate logic and no probes for them; their gates run on the same engine
  Dana's do. Red-team coverage for their gates is out of scope here and is tracked
  separately.

## Not in scope

Morgan. Recorded audio publication. Cross-case comparison or progress UI. Any
change to gate logic, clinical content, attestation status, or the pack.
