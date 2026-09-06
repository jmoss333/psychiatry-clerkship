# Hosted Dana acceptance record — 2026-09-06

Engineering preview, not faculty approval or learner activation.

## Deployed proof

- Preview: https://dana--interview-room-faculty-preview.netlify.app
- Deploy: `6a9d6d1f8081232c9e948e03`
- Source: `d6bac57` (application); subsequent acceptance documentation does not change the deployed application.
- Actual API and native browser audio: one opening, ten questions sent through synthetic speech recognition and Space, zero composer interactions.
- All 11 HTTP responses succeeded; all 21 native audio segments played and ended; no browser, console, or audio errors.
- Native audio was muted and played at 2x for this automated test. This is not a physical-microphone or human voice-quality audition.
- Space to first native audio: median 2.93s; range 2.00–12.28s. One response exceeded 12 seconds; the proof establishes continuity, not consistently low latency.
- End stopped recognition; Clear removed the conversation and access phrase; browser storage stayed empty. Mobile width 390px had no horizontal overflow.
- A separate one-opening hosted test interrupted native audio with Escape, waited eight seconds, verified that audio stayed paused, and then cleared all conversation rows without browser storage.
- Private case, server, environment, and access-phrase paths returned 404. The root page returned 200; unauthorized API requests returned 403 and authenticated malformed input returned 400 before provider work.

## Local checks

- 81 focused preview checks passed.
- 573 prototype node tests plus legacy suites passed.
- 1,801 root tests passed; two were skipped.
- Full `bin/verify.sh` passed, including sequential MS3/resident builds, proxy tests, and existing gates.
- Desktop/mobile mocked browser checks exercised passcode recovery, partial playback, before-receipt restart, spoken/typed input, 4.5/8-second pacing, Hold, Space, Escape, End/Clear, and keyboard focus under the deployed CSP.
- A local cancellation test returned speech after abort and verified that no late audio escaped. Provider-failure reservations remain charged conservatively.

## Material limits and next release work

This hosted slice is Dana only. The full station UI, Morgan, family visit, bookmarks, retry, and optional information replay are preserved in the local prototype source and await later hosted migration. The draft direct-suicide-question overlay and actor portrayal still require faculty review. A convincing conversation is not readiness evidence.

Next validation: a human microphone walkthrough and investigation of the occasional latency outlier before extending the hosted pilot. If generation stops before a new state receipt arrives, the UI explicitly asks for a new encounter; it does not silently resend the uncertain request. Durable limits are 72 conservative operation units per rolling half hour and 120 per deployment, not exact dollar accounting.
