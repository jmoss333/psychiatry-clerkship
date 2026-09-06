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

## Hosted run record

*(This section is completed by an actual `DANA_QA_MODE=automatic` run against the
deployed preview. Leave it empty rather than describing an intended run.)*

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
