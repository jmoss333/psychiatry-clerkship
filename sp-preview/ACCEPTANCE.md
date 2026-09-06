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
| A physical microphone in a supported browser | **Not verified — pending human check** |

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

### Still not verified

A physical microphone in a supported browser. Both QA modes replace
`SpeechRecognition`, so nothing above speaks to real microphone permission, real
speech-service latency, real accents, or a real noisy room — which is where two of
the three fixed defects actually live. That check is a human walkthrough; see the
diagnostics note at the end of this file for how to read the result without
recording anything.

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
