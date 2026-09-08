# Hosted Dana acceptance record

Engineering preview, not faculty approval or learner activation.

## 2026-09-06 · hands-free repair

### What this run proves, and what it does not

The acceptance requirement is that after Start and microphone permission the
learner speaks, waits, hears Dana, and continues — with no click, Space press,
focus change or composer edit on any normal turn.

| Claim | Status |
| --- | --- |
| A spoken turn sends itself after 4.5 s (8 s with more thinking time) | Verified, synthetic recognition |
| Ten consecutive turns with no interaction after Start | Verified, synthetic recognition |
| The same, through the hosted service and native audio | *(recorded below once run)* |
| A physical microphone in a supported browser | **Verified 2026-09-08** — see below |

Synthetic recognition replaces `SpeechRecognition` with a scripted object. It can
prove the application's turn lifecycle; it cannot prove that a real microphone,
real speech-service latency, or real background noise behave the same way. The QA
report records `nativeRecognition: false` for exactly this reason, and the run
fails if that field is ever true, so this record cannot be mistaken for a
microphone audition.

### Local verification at this commit

- 87 hosted-preview checks pass (was 81), including the eight event sequences
  below and ten controller cycles driven only by speech.
- 15 conversation-recordings checks pass (was 13).
- Full prototype `run-all.sh`: ALL SUITES PASSED.
- Full `bin/verify.sh`: all steps pass, now including the hosted preview suite
  and its public build.

Event sequences pinned by test, each failing before this change or asserted for
the first time:

```text
Final A -> 4499 ms: 0 turns -> 1 ms: exactly 1 turn
Final A -> speech -> final B -> B+4500 ms: one combined A+B turn
Thinking time: final A -> 7999 ms: 0 -> 1 ms: one turn
Hold: final A -> 60000 ms: 0; release or explicit finish: exactly one turn
Final A -> no-speech/onend -> restart: A kept, original quiet deadline kept
Final A + live interim B -> service ends: words kept, microphone recovers,
                                          truncated half never auto-sent
Wordless voice activity: bounded to one grace period, cannot stall the turn
30 ordinary silence cycles: microphone survives; a true restart storm is
                            bounded and stops with an explicit error
Duplicate/stale result lists: one copy of each phrase, one request
```

### Defects found and fixed

Three lifecycle defects, each reproduced against a recognizer that follows
Chrome's real ordering before any code changed. The 4.5-second timer itself was
never broken; every failure was in the recognition session *between* utterances.

1. **Voice activity that never became words suppressed the turn forever.**
   `onspeechstart` cleared the quiet timer and only `speechend` or a later result
   re-armed it. A fan or a hallway voice trips the detector without necessarily
   ending it, so the draft sat complete and unsent indefinitely. This is the
   closest match to the reported experience of having to click every turn.
2. **An unfinished interim at session end stopped the microphone.** Refusing to
   send a truncated question was right; leaving capture off with no recovery was
   not. Hands-free ended for the rest of the encounter.
3. **The restart throttle retired the microphone during an ordinary pause.** Four
   short restarts called `recognition_failed` permanently, and Chrome's
   no-speech cycle is often shorter than the 5-second grace it measured — on
   `Date.now()`, the one un-injected clock in the file, so no test could pin it.

### Correction to the previous record

The hosted run described in the earlier version of this file — one opening, ten
questions, 21 audio completions, Space-to-audio median 2.93 s (range
2.00–12.28 s) — **cannot be reproduced from the repository as committed**. The
only committed state of `qa/hosted-browser.mjs` before this change (`d6bac57`)
throws `ReferenceError: Cannot access 'URL' before initialization` at module
load: `const URL = process.env.DANA_QA_URL` shadows the global in module scope and
line 4 calls `new URL(...)` before that binding initialises. No browser launches.

Those numbers may have come from an uncommitted local edit; that is not
recoverable from here. They are retained above as history, not as evidence, and
should not be re-quoted as a service characteristic. Separately, that harness
pressed Space on every turn, so even a successful run of it would have measured
Space-to-audio latency and never automatic completion.

### CI

Run `34037107500` at `8d3f43f` failed on
`conversation-recordings.test.mjs` with "expected asynchronous adapter work to
settle". Run `34040350114` at `b50c972` — a documentation-only commit — passed
the same suite. A test that passes and fails at the same code is a race, not a
breakage: the helper polled 30 `setImmediate` turns, which elapse in
microseconds, while `crypto.subtle.digest` settles on wall-clock time. The wait
is now bounded by elapsed time, and two tests pin the failure mode from both
sides — both fail against the previous helper.

The hosted preview suite and its public build now run in `ci.yml` and in
`bin/verify.sh`. The paid hosted proof is absent from both by design.

## Hosted run record — 2026-09-06, automatic mode

- Preview: <https://dana--interview-room-faculty-preview.netlify.app>
- Deploy: `6a9d88fb67b31fba859f641d` (branch-deploy, alias `dana`; the site has no
  production deploy and remains unlinked from Git by design).
- Application assets built from `sp-preview/public/` at `dbd3170`.
- Run: `DANA_QA_MODE=automatic`, 15:43:32–15:46:18 UTC.

**Ten turns sent themselves.** After Start and the opening, the run made no click,
key press, focus change or composer write. The page counted every `keydown`,
`pointerdown`, `click`, `focusin` and `input` it received while armed and recorded
exactly one: `focusin:clear`, which is the application moving focus to the Clear
button when the encounter ends, after the tenth turn was already complete. No
learner-capable event occurred at all.

| Measure | Result |
| --- | --- |
| Automatic submissions / explicit submissions | 10 / 0 |
| Quiet window, final recognized words to dispatch | 4500–4503 ms (nominal 4500) |
| Provider latency, dispatch to first audio | 2450–3759 ms |
| HTTP responses | 11 × 200; 1 start, 10 turns, 0 blocked extras |
| Native audio segments created / played / ended / errors | 21 / 21 / 21 / 0 |
| Transcript rows | 10 learner, 11 Dana, all "Voice completed" |
| Recognition sessions | 11 (one mid-encounter session end at turn 5, survived) |
| Page errors / console errors | 0 / 0 |
| Microphone at End / browser storage / mobile overflow at 390 px | off / empty / none |
| `nativeRecognition` | **false — synthetic recognition** |

The quiet window is the number the acceptance requirement is about, and it is
separated from provider latency on purpose: the previous record could only report
Space-to-audio, which conflates the two and measures the shortcut rather than
automatic completion.

`captureCounts` from the same run: `wait_interim: 10` — on every turn the service
delivered `speechend` while an interim was still live, so the timer correctly
refused to arm until the final result landed. That is the ordering the previous
test doubles never produced, and the one the repair is built around.
`reconnect: 1` is the deliberate mid-encounter session end at turn 5.

Two paid runs were made. The first completed all ten turns with the same
substantive results and failed only on this file's own interaction assertion,
which had not yet allowed for the application's end-of-encounter focus move; the
harness now records the event type and target rather than a bare count, so the
report names what happened instead of leaving it to be inferred. Both runs
together reserved 62 conservative operation units against the 72-per-half-hour
and 120-per-deployment ceilings. The redeploy was a single intentional one to
ship the repair, not a budget reset.

### Physical microphone — verified 2026-09-08

A real spoken encounter with Dana on the deployed preview, run by the author. Five
turns before ending early, and the page's own record is the evidence rather than a
report of one:

- Every learner turn reads **Submitted**; every patient reply reads **Voice
  completed**, except one that reads *"1 completed audio segment(s) remembered;
  the remaining text did not finish playing"* — a genuine mid-reply interruption,
  reported accurately rather than silently.
- Long utterances survived intact, including a 17-word question spoken as one
  breath. Nothing was truncated, which is the class of failure R2 and R3 fixed.
- The retry panel offered the moment and quoted it as heard.
- The closing cue read *"Dana looks toward you and waits"* — the closing cue, not
  the interruption cue, confirming the R9 fix under real playback.

What this does **not** establish: it is one encounter, one browser, one voice, one
room. It says the lifecycle works, not that it works for every speaker or in every
acoustic environment. Diagnostics counts were not captured, so how often the
stall or withdrawn-interim paths fire in real use remains unmeasured.

**The run also found a defect no test had.** The shared page carried "Begin with
her story." — hard-coded and gendered, wrong for two of the three patients — and
three more hard-coded "Dana" labels in the station's quotes and retry copy. The
identity work in slice 2 covered the heading and voice tag and stopped short of
these. Fixed, with a test that fails on any gendered pronoun in the shared chrome.

### Browser journeys under the deployed CSP — 2026-09-08

`tests/smoke/hosted-preview-browser.spec.js`, project `hosted-preview`, running in
Chromium in CI on every pull request. The spec serves `sp-preview/dist` itself with
the response headers read from the preview's own `netlify.toml`, so it cannot drift
from the policy the preview deploys with, and it makes no paid call — the endpoint
is mocked and audio is stubbed.

Five journeys: each of the three cases named correctly with its own voice, door note
and title and no other case's content or an assumed pronoun; the station grid
computing as `grid` under `style-src 'self'`; and Clear removing the marked
exchange, the reflection and the attending presentation from the rendered page.

This suite exists because the preview's node tests drive a DOM stub, and a stub
cannot see a CSP violation, a computed style, or what is left on the page after
Clear. Three defects reached the deployed preview through that gap — R8, R4, and
the gendered heading the author's own microphone run caught. Verified with teeth:
reintroducing R8 and R4 fails all five.

### Still not verified

A physical microphone in a supported browser. Both QA modes replace
`SpeechRecognition`, so nothing above speaks to real microphone permission, real
speech-service latency, real accents, or a real noisy room — which is where two of
the three fixed defects actually live. That check is a human walkthrough; see the
diagnostics note at the end of this file for how to read the result without
recording anything.

## WP-5m adopted — Dana's suicide-follow-up chain, 2026-09-06

`main` carries `f94f987` (WP-5m, "the Interview Room taught a suicide chain the rest
of the library does not"). It adds an `si_behavior` intent — past attempts and
preparatory acts — with Dana's reply and its locked deflection, reframes her
disclosure from active ideation to passive ideation with method contemplation, and
flips the pack `status` from `reviewed` to `draft-pending-attestation`.

Merging it made three pins fail closed, each by design and each rebound to the
merged pack rather than edited by hand:

| Pin | Where | Action |
| --- | --- | --- |
| `SOURCE_GATE` / `SOURCE_GATE_HASH` | `sp-interview.local-dana.js` | `unlocks` gains `si_behavior`; hash recomputed from the merged pack. Reveal, deflections and repeat-ask are unchanged from the reviewed text. |
| `FACT_SOURCE_HASH` / `localDraftHash` | `dana-live-context.mjs` | Both recomputed through the module's own `groundingSources()` shape. |
| Canonical line count, 75 → 77 | adapter, recorded-speech reader, four test suites | The catalog is now 64 response lines + 12 gated + 1 opening. |

The overlay's own `scope` no longer calls the disclosure an "active-ideation
response", which WP-5m specifically corrects.

**Adoption decision.** Taken by the author on 2026-09-06, not inferred. The hosted
preview is an engineering/faculty preview that already states it is not faculty
approval; carrying `draft-pending-attestation` content is consistent with that, and
the alternative — hosted Dana teaching a suicide chain the library has just
corrected — is the defect WP-5m exists to fix.

### Redeployed with the adopted gate

The Function bundles the pack, the local-dana overlay and the live context, so the
correction only reaches the preview through a deploy. Deploy
`6a9da178fe2df33df5c23744`, same site, same `dana` alias — the second and last
intentional deploy of this delivery.

The hands-free evidence above was **not** re-purchased. `sp-preview/public/` is
byte-identical between the proven run and this deploy (`app.js` sha256 begins
`61754a6b6f5de38a`, verified against the served file), and WP-5m changes only the
Function's private grounding, so the recognition lifecycle under test is unchanged.
Re-verified for free after the deploy: root 200, missing and wrong passcode 403,
`/lib/case.mjs`, `/preview-access.txt`, `/.env.hosted` and `/package.json` all 404,
and the CSP, `Permissions-Policy`, `Cache-Control: no-store` and `X-Robots-Tag`
headers intact.

### Two lines have no archived recording

WP-5m **added** two lines and removed or reworded none, so **all 75 existing
recordings still verify and none were regenerated**:

| SHA-256 (first 12) | Line |
| --- | --- |
| `2470b015eeb3` | "No. Never — not now, not when I was younger. Standing in the bathroom is the closest I have come…" |
| `775682565bb7` | "Tried what? *frowns* I'm not sure what you're asking me." |

This does **not** affect the hosted preview, which synthesises Marin per encounter
through the speech model and never reads `output/speech/`. It affects the **local
prototype's device mode only**, where the manifest must carry all 77 entries before
recorded playback will load. Generating those two lines is a separate, deliberate
act against the existing manifest tooling; nothing here does it implicitly.

## One-moment retry (slice 1B)

A learner can re-ask one earlier moment of a finished encounter and hear Dana's
alternative reply. What it does, and what it deliberately does not:

- It is a **child session**, not a replayed receipt. The client presents its
  latest, unconsumed receipt plus a `turnId`; the server truncates the stored
  history, mints a fresh `sid`, and runs the ordinary turn path.
- **The anti-replay control is untouched.** Re-presenting a consumed turn receipt
  still fails as `preview_operation_duplicate`, and a test pins that it does — it
  is the control the whole design was shaped around rather than through.
- **Only what was heard reaches the actor.** The parent's history already records
  the heard prefix and `omittedTail`, so truncation carries the guarantee. A test
  asserts the prompt contains the earlier question and the alternative wording,
  and contains neither the retried question nor the reply it produced.
- **One alternative per encounter**, sealed into the receipt as `retried:true`, so
  a page reload cannot restore it. A second attempt is refused with
  `preview_encounter_finished` before any provider call.
- **Three budget units**, the same as a turn. A full encounter with its
  alternative reserves 34 of the 72-per-half-hour and 120-per-deployment ceilings.
- An alternative that loses its receipt asks for a restart and explains why. It is
  never resent automatically.
- The client reports no playback for a retry and cannot: those counts describe the
  reply it last heard at the end of the encounter, not the moment being returned
  to. The server synthesizes them from the child's own settled state.

### Verified against the live preview — 2026-09-07

Deploy `6a9ed10fd85e0ef5a2ddbe4c`, alias `dana`. `npm --prefix sp-preview run
test:hosted-retry`, a harness capped at four paid requests: one opening, two
turns, one alternative — **10 reserved units** of the 72-per-half-hour ceiling.

| Check | Result |
| --- | --- |
| Opening and two turns through the real Function and provider | 200, 200, 200 |
| Alternative asked at turn 2 | 200, reply `turn: 2`, two segments |
| Second alternative | refused `preview_encounter_finished`, no provider call |
| Reusing the receipt the alternative was asked from | refused `preview_operation_mismatch` |

**The first run of this harness found a real defect, which is the argument for
having made it.** The retry reserved `retry:sid:nonce:turnId` — a different ledger
slot from the `turn:sid:nonce` a turn consumes — so the receipt a retry was asked
from stayed live. A turn from it would branch without the `retried` flag, and a
second alternative could be asked from the branch. The one-alternative cap was
bypassable by anyone holding the pre-retry receipt, which is every client, since
the cap exists precisely to survive the client forgetting. A retry now consumes
the same slot a turn does: one continuation per receipt, whatever kind.

Two paid runs, 20 units total, both inside the window. What this run does **not**
prove is the truncation property — that the actor sees nothing from the retried
turn onward is unobservable from outside and is pinned by the node handler tests
instead.

## Slice 2 — multi-case transport (Marcus and Ray)

Verified by test:

- A receipt sealed for one case does not open under another. This is the
  load-bearing property of the slice.
- A request whose `caseId` disagrees with its sealed receipt is refused before any
  reservation, as is an unknown or unregistered case.
- Each case's opening is spoken with its own case id, and speech now refuses a
  missing case rather than defaulting to Dana's voice — with three cases that
  default would have spoken a reply in the wrong patient's voice, silently.
- Every registered case carries learner-facing station content and no actor
  direction, and rendering one case leaks no other case's door note.
- The startup grounding-drift check runs for every registered case, so a drift in
  any of them throws at module load before a paid request is accepted.

Not verified: **no live hosted run has exercised Marcus or Ray.** Everything above
is mocked. A hosted check would cost paid units and needs a redeploy first.

Also not covered: Marcus and Ray have gated content of their own (4 and 3 gates)
running on the same engine as Dana's. This slice adds no gate logic and no
deterministic red-team probes for them; their gate coverage is tracked separately.

## Material limits and next release work

This hosted slice is Dana only. The full station UI, Morgan, Marcus, Ray, the
family visit, bookmarks, retry, and optional information replay are preserved in
the local prototype source and await later hosted migration. The draft
direct-suicide-question overlay and actor portrayal still require faculty review.
A convincing conversation is not readiness evidence.

Next validation, in order: a human microphone walkthrough in a supported browser
(the only thing that can close the physical-microphone row above), then the
occasional latency outlier, then the first migration slice. If generation stops
before a new state receipt arrives, the UI explicitly asks for a new encounter;
it does not silently resend the uncertain request. Durable limits remain 72
conservative operation units per rolling half hour and 120 per deployment, which
are operation reservations and not exact dollar accounting.

### Reading the diagnostics after a real microphone run

`DanaPreview.session.getDiagnostics()` in the browser console returns fixed state
codes, counts and timings only — no speech, no transcript, no draft text. It is
the intended way to tell what actually happened on a physical microphone:

- `nativeRecognition: true` means the browser's own recognition was used. A
  synthetic replacement reports `false`.
- `automaticSubmissions` versus `explicitSubmissions` separates turns that sent
  themselves from turns sent by Space, Done or the composer.
- `counts.voice_wordless` counts noise that tripped the detector without becoming
  words; `counts.unfinished` counts service endings that dropped a live interim;
  `counts.reconnect` counts ordinary session restarts.
