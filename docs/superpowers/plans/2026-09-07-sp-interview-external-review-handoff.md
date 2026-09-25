# The Interview Room — External Review Handoff

**Prepared:** 2026-09-07 · **For:** an external reviewer (ChatGPT) with no prior context
**Repository:** `jmoss333/psychiatry-clerkship` (public) · **Author of the work under review:** Claude Opus 5

## What you are being asked to do

Review, adversarially, a body of work on a hosted standardized-patient interview
system used in psychiatry medical education. Assume the author is capable and
motivated to look correct. Your value is in what the author missed, over-claimed,
or reasoned past — not in confirming what is already documented.

The work touches a **safety-relevant clinical teaching surface**: a simulated
patient who discloses suicidal ideation when a learner asks directly, with gated
follow-ups. Some of it is already live to students. Weight your attention
accordingly.

## Read these first, in this order

1. `sp-preview/README.md` — what the hosted preview is and its boundaries
2. `sp-preview/ACCEPTANCE.md` — what has been verified, and explicitly what has not
3. `docs/superpowers/specs/2026-09-06-hosted-station-slice-1-design.md`
4. `docs/superpowers/specs/2026-09-07-hosted-multi-case-slice-2-design.md`
5. `sp-preview/lib/handler.mjs`, `lib/state.mjs`, `lib/case.mjs` — the server
6. `sp-preview/public/app.js` — the browser client, including the capture lifecycle
7. `bin/redteam-offline.mjs` — the deterministic gate probes

## What landed, and where

All merged to `main` unless noted.

| PR | What | Merge commit |
| --- | --- | --- |
| #547 | Hands-free recognition repair + hosted Dana preview + slices 1A/1B | `5660d9f` |
| #557 | Slice 1A: student station, bookmarks, exact-quote reflection | `eccd7ef` |
| #558 | Slice 1B: one-moment retry | `8a7431b` |
| #561 | Gate-cascade precedence fix (authored by another session) | `afe5975` |
| #566 | `si_behavior` red-team probe | open, green |
| #570 | Slice 2: multi-case transport, Marcus and Ray | open, draft, green |

## The five claims most worth attacking

Each of these is load-bearing. If any is wrong, something real breaks.

### 1. "A receipt sealed for one case cannot open under another"

The state codec's AEAD binding is
`hosted-sp-v2:${caseId}:${caseBinding}:${DEPLOY_ID}:${origin}:${hash(secret)}`
where `caseBinding` hashes the case definition. `caseId` is also stored inside the
sealed state and cross-checked against the request.

**Attack it:** is the binding actually associated data on every path, or only some?
Does `retryState` preserve `caseId` correctly through history truncation? Can a
client induce a codec for case A to be built while a case-B receipt is opened?

### 2. "A retry never lets the actor see anything from the retried turn onward"

`retryState` truncates the sealed history to `turnId*2 - 1` entries. The claim is
that the parent's history already stores what was *heard* — `nextHistory` rewrites
each patient entry to its completed segments and marks `omittedTail` — so
truncation is sufficient and no separate filtering is needed.

**Attack it:** is that true for every playback status, including a reply that was
interrupted at zero segments, or cancelled, or whose receipt never arrived? Is the
`turnId*2 - 1` arithmetic right at both ends of the range?

### 3. "One continuation per receipt, of any kind"

A retry consumes the same `turn:${sid}:${nonce}` ledger slot a turn does. This was
**a bug found by a live paid run**: the retry originally used its own operation-id
namespace, leaving the pre-retry receipt live, so a turn from it branched without
the `retried` flag and a second alternative could be asked. See `38c8584`.

**Attack it:** are there other actions or paths that continue an encounter without
consuming that slot? Does the budget ledger's duplicate detection actually key on
what the author thinks it does?

### 4. "Spoken turns are now genuinely hands-free"

Three lifecycle defects were fixed in `sp-preview/public/app.js`: voice activity
that never becomes words no longer suppresses submission forever; an unfinished
interim recovers the microphone instead of stopping it; the restart throttle
distinguishes an ordinary silence cycle from a storm.

**Attack it:** the evidence is entirely **synthetic recognition**. No physical
microphone has ever been tested. Read `createCapture` against the real Web Speech
API contract and say what a real browser does that the fixture does not. Pay
attention to `onspeechstart` without `onspeechend`, `onend` ordering after
`onerror`, and whether the bounded VAD grace can be defeated.

### 5. "The station is a projection with no network or storage"

`station.js` and `station-content.js` are asserted to contain no `fetch(`,
`localStorage`, `sessionStorage`, `indexedDB` or `XMLHttpRequest`, enforced in
`sp-preview/tests/build.test.mjs`.

**Attack it:** is a substring check on built files a real boundary, or is it
defeated by any indirection? Does the station hold any other capability it should
not?

## Known weaknesses, stated so you can go past them

Do not spend time rediscovering these. Spend it on what they imply.

- **No physical microphone has ever been tested.** Every proof replaces
  `SpeechRecognition`. Two of the three fixed lifecycle defects live precisely in
  real-microphone conditions.
- **No live hosted run has exercised Marcus or Ray** (#570). Only Dana.
- **Marcus and Ray have 4 and 3 gates and zero deterministic probes.** Dana's
  gates have probes; theirs do not, and they run on the same engine.
- **The WP-5m red-team run of 2026-09-06 is recorded as NOT a pass** on a pack that
  is live to students. Three named defects: gate-cascade precedence (fixed, #561),
  `si_behavior` never probed (fixed, #566), and Tier 2's passcode path reading a
  secret placeholder (**unfixed, uninvestigated**).
- **Chart-request cards ship client-side.** "Request available chart information"
  is a teaching affordance, not an information barrier.
- **Morgan is deliberately excluded** from the hosted preview: it is
  `draft-pending-attestation` and outside the pack.
- **The preview carries content marked `draft-pending-attestation`** (the WP-5m
  Dana chain), by an explicit decision of the author's human partner.

## Judgement calls to second-guess

These were decisions, not deductions. Reasonable reviewers could differ.

1. **Deferring Morgan and doing Marcus/Ray first**, inverting the written handoff,
   because Morgan is the only unattested case. Was governance the right axis?
2. **Bumping the binding version** `hosted-dana-v1` → `hosted-sp-v2`, invalidating
   every outstanding receipt, rather than supporting both schemes.
3. **Storing `caseId` inside the sealed state** as redundancy when the binding
   already separates cases. Is this defence in depth, or two sources of truth?
4. **Removing the Dana default from `speak`/`speakStream`**, making an omitted case
   a hard failure. Correct, or a new way to break a working path?
5. **A retry consuming the turn slot**, which means the pre-retry receipt is dead
   for ordinary continuation too. Acceptable because retry is offered only after
   the encounter ends — but is that a UI assumption encoded as a server rule?

## Where the author is most likely wrong

Stated in the author's own estimation, for you to confirm or refute:

- The **real Web Speech API lifecycle**. The whole hands-free claim rests on a
  model of Chrome's behaviour built from reasoning, not from a physical device.
- The **heard-only guarantee under unusual playback states**. It was verified for
  the common paths; the combinatorics of interrupted, cancelled, zero-segment and
  receipt-lost states were not exhaustively explored.
- **Whether the deterministic probes test what they appear to.** One probe in #566
  initially asserted the wrong thing and passed straight through a real gap; that
  was caught, but it is evidence the probe suite can look green while proving less
  than it claims.

## How to verify anything yourself

```sh
npm --prefix sp-preview ci && npm --prefix sp-proxy ci --include=dev
npm --prefix sp-preview test          # 134 tests
node bin/redteam-offline.mjs          # 18 deterministic gate probes
bash _prototypes/sp-interview/tests/run-all.sh
bash bin/verify.sh                    # the full local gate, ~4 minutes
```

Paid hosted proofs exist (`npm --prefix sp-preview run test:hosted`,
`run test:hosted-retry`) and require credentials that are **not** in the repository.
Do not attempt them; they cost real API units.

## Ground rules for your review

- Fictional patients only. Do not propose changes to clinical content, gate logic,
  attestation status, or the instrument-reproduction rules; those are governance
  decisions reserved to the clinician who owns this repository.
- No secrets appear in this repository. If you believe you have found one, say so
  rather than quoting it.
- Prefer "this claim is unsupported because X" over "consider adding Y".
- If you think a decision was defensible but under-evidenced, say that plainly
  rather than splitting the difference.
