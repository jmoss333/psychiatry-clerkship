# Hosted encounter, migration slice 1 — station, bookmarks, reflection, one-moment retry

Design for bringing the local prototype's student station, bookmarks, exact-quote
reflection and one-moment alternative into the protected hosted Dana encounter.
Slice 1 of the migration sequence in
`docs/superpowers/plans/2026-09-06-sp-hands-free-handoff.md`.

Status: design approved in conversation 2026-09-06. Not implemented.

## Why this is two pull requests

The slice divides along a security boundary, not a convenience one.

- **PR A — station, bookmarks, reflection.** Pure client. No change to the
  request/receipt protocol, no new server action, no additional paid calls.
- **PR B — one-moment retry.** Requires a new authenticated server action, a
  derived child session, a per-encounter cap and additional budget units.

Delivering them together would put roughly a thousand lines of ported client code
and a change to the encrypted-receipt protocol into one review, and the protocol
half is the part that most needs to be read on its own.

## The finding that shapes retry

The local retry spawns a child conversation seeded to just before the chosen turn
(`options.createRetry(turnId)` → `{client}`, `maxTurns:1`, `skipOpening:true`).
The obvious hosted port — have the client re-present the receipt it held after
turn N-1 — **is precisely what the anti-replay control exists to refuse**:

- the receipt *is* the state (`{v, sid, nonce, expires, turn, history, segments,
  completed}`), AES-256-GCM sealed with AAD binding it to
  `hosted-dana-v1:<caseBinding>:<DEPLOY_ID>:<origin>:<hash(passcode)>`;
- the budget ledger keys each turn on `turn:${state.sid}:${state.nonce}`;
- `issuedState` mints a fresh nonce per turn.

Re-presenting turn N-1's receipt with different text therefore returns
`preview_operation_mismatch`. That control is not to be weakened, so retry becomes
an explicit server action instead.

The compensating good news: `nextHistory` already records what was *heard* rather
than what was generated — it rewrites the previous patient entry to
`heard.join('')`, marks `omittedTail` when the tail never played, and sets
`playbackStatus`. "Only the information heard at that exact earlier moment" is
therefore obtained by **truncating the stored history server-side**. No new
bookkeeping, and the client cannot misreport what it heard.

## PR A — station, bookmarks, reflection

### Sources

| Local module | Ported as | Notes |
| --- | --- | --- |
| `sp-encounter-profiles.js` | `sp-preview/public/station-content.js` | Learner-facing content only |
| `sp-encounter-ui.js` | `sp-preview/public/station.js` | Rendering + `update(snapshot)` |
| `sp-interview.bookmarks.js` | folded into `station.js` | Derives from transcript; no persistence |
| `sp-encounter-rhythm.js` | **not ported** | See exclusions |

### Interface

`station.js` exposes one factory, deliberately mirroring the local contract so the
ported tests port with it:

```js
createStation(env, host, {caseId, onChange}) ->
  {update(snapshot), requestClose(), dispose(),
   getPresentation(), getReflections(), getBookmarks()}
```

`app.js` calls `station.update(snapshot)` from its existing `publish()`. The
station never calls `fetch`, never touches `controller.send`, and never reads or
writes browser storage. It is a projection of the snapshot plus local-only notes.

### Build allowlist

`build.mjs` pins the published set to exactly `index.html`, `app.js`,
`styles.css`, and `build.test.mjs` asserts it. Slice 1 extends that list to
include `station.js` and `station-content.js`. The allowlist stays explicit and
the test keeps pinning the exact set — this widens what ships, it does not stop
checking. The forbidden-string assertions (`OPENAI_API_KEY`,
`DANA_PREVIEW_STATE_KEY`, `hiddenAgenda`, `ordinaryFacts`, the pack filename)
continue to run against every published file, so the private grounding still
cannot leak into `dist`.

### What ships to the browser, and what does not

The station's learner-facing content — door note, task, objectives, priorities,
cues, closing prompts — ships in `station-content.js`. Dana's hidden agenda tone,
ordinary-fact inventory, information limits and gated reveals stay in the Function
and are already asserted absent from `dist`.

**Known limitation, stated rather than hidden:** chart-request cards ship
client-side, as they do in the local prototype. "Request available chart
information" is therefore a teaching affordance, not an information barrier — a
learner who opens devtools can read cards they did not request. Serving them
through the authenticated endpoint would be a protocol change and belongs in a
later slice, not PR A. The content is fictional teaching material; nothing
gated by the safety overlay is involved.

### Bookmarks and reflection

Bookmarks are encounter-local, derived from the snapshot transcript, capped at the
ten turn ids, and hold the exact quote as heard: `playback()` uses the full
patient text only when `playbackStatus === 'played'`, and otherwise the
`heardText` prefix. That rule ports unchanged — a bookmark must never quote a
sentence the learner did not hear. Reflection notes are keyed by bookmark id and
live in memory only; nothing is persisted, exported or sent anywhere.

### Testing

Ported from `conversation-encounter-ui.test.mjs`, `conversation-bookmarks.test.mjs`
and `conversation-encounter-context.test.mjs`, rewritten against the hosted
snapshot shape, added to `sp-preview/tests/`. New assertions specific to hosting:

- the station makes no `fetch` call and writes no browser storage across a full
  ten-turn encounter;
- a bookmark taken on an interrupted reply quotes only the heard prefix, never the
  generated tail;
- `dist` still contains exactly the allowlisted files and none of the forbidden
  strings.

## PR B — one-moment retry

### Server

A third action beside `start` and `turn`:

```
{action:'retry', state, turnId, text, previousPlayback, previousCompletedSegments}
```

`state` is the **current** receipt — unconsumed at the end of an encounter — so no
consumed nonce is ever re-presented. The handler:

1. opens `state`, requires `turnId` an integer in `1..state.turn`;
2. refuses when `state.retried` is already set (one alternative per encounter);
3. derives the child: `history` truncated to `turnId*2 - 1` entries — everything
   through the patient reply *preceding* the learner's turn-`turnId` question,
   with the heard-only rewriting already recorded there. The codec's own invariant
   confirms the arithmetic: it requires `history.length === turn*2 + 1`, and with
   `turn = turnId - 1` that is `2*turnId - 1`, so a correct truncation is exactly
   the length the decoder will accept and an off-by-one fails closed rather than
   sending the actor a turn it should not see;
4. mints a **fresh `sid`** so the child's ledger entries cannot collide with the
   parent's, keeps the parent `expires`, and sets `turn = turnId - 1`;
5. runs the existing turn path unchanged;
6. issues a receipt carrying `retried: true` so the cap survives a page reload.

`operationId` becomes `retry:${state.sid}:${state.nonce}:${turnId}`, keeping the
ledger's duplicate and mismatch behaviour intact. Budget cost is 3 units, the same
as a turn: a full encounter with one retry reserves 34 of the 72-per-half-hour
ceiling.

### Client

The retry panel appears only when the encounter has ended, offering the completed
question-and-reply moments in the local module's order (played moments first). It
shows the original question and the reply **as heard** beside the alternative, and
never re-sends after a provider failure — the existing `restartRequired` path
already covers that and is reused rather than duplicated.

### Testing

Ported from `conversation-retry.test.mjs`, plus hosted-specific server tests:

- a `retry` at `turnId` sends the actor exactly the truncated history and nothing
  from later turns;
- an interrupted reply inside the truncated range is presented as the heard prefix
  with `omittedTail`, not the full generated text;
- a second `retry` on a receipt carrying `retried:true` is refused;
- re-presenting a consumed turn receipt still fails as `preview_operation_mismatch`
  — the control this design exists to preserve;
- `turnId` outside `1..turn`, or a `state` whose turn count disagrees with its
  history length, is refused before any provider work.

## Exclusions, and why

- **Acknowledgment carry (`sp-encounter-rhythm.js`).** It changes *when* a spoken
  turn auto-submits by holding back "mm-hm"-type results. That sits directly on
  the lifecycle stabilised on 2026-09-06 and risks reintroducing the "why didn't
  it send?" failure the repair removed. It deserves its own change with its own
  evidence, not a ride-along.
- **Serving chart cards from the server.** A protocol change; see the limitation
  above.
- **Morgan, Marcus, Ray, the family meeting, information replay.** Slices 2–4.
- **Any change to clinical content, attestation status or the safety overlay.**
  Out of scope by standing instruction.

## Success criteria

1. A hosted encounter shows the door note and task before the first question, and
   the closing and attending-presentation surfaces after the tenth.
2. A learner can bookmark a moment, attach a reflection, and see the quote exactly
   as heard.
3. PR A adds no `fetch` call, no browser storage and no paid request.
4. PR B spends exactly 3 additional budget units for one alternative, refuses a
   second, and demonstrably sends the actor only the truncated history.
5. `bin/verify.sh` and CI stay green; `dist` still ships only allowlisted files
   with none of the forbidden strings.
