# Claude prompt: independent review of the complete spoken Interview Room

Updated September 6 after the five-feature student-station implementation.

Review the work we have built, using medical-student learning, standardized-patient methodology, psychiatric communication, accessibility, and software reliability as separate lenses. Be candid and evidence-based. I want to know what actually works, what feels artificial, what could teach the wrong lesson, and what to do next. This is a review, not an implementation or deployment request.

## Locate the actual work

Repository: `/Users/jm/Psychiatry-Clerkship-Library`

Implementation worktree: `/Users/jm/Psychiatry-Clerkship-Library/.worktrees/dana-spoken-prototype`

Expected branch: `codex/dana-spoken-prototype`.

Read `CLAUDE.md`/`AGENTS.md` and inspect the current branch/status before reviewing. Much of this work is untracked or uncommitted; `git diff` alone does not contain the implementation. Review the actual files without resetting, switching, staging, or changing unrelated work. If the worktree is missing, explain that limitation rather than reviewing main as if it contained this prototype.

Start with these files inside the worktree:

- `_prototypes/sp-interview/DANA_CONVERSATION.md`
- `_prototypes/sp-interview/FAMILY_VISIT.md`
- `_prototypes/sp-interview/FAMILY_VISIT_CONTRACT.md`
- `docs/superpowers/plans/2026-09-05-family-visit-simulator.md`
- `docs/superpowers/plans/2026-09-06-sp-complete-encounter.md` for the current implementation and completion evidence.
- `_prototypes/sp-interview/sp-interview.pack.json` and `sp-interview.local-cases.js` for the authored case boundaries.

Then inspect the relevant implementation:

- `_prototypes/sp-interview/sp-interview.{turns,conversation,live,recordings,responses,bookmarks,retry}.js`
- `_prototypes/sp-interview/sp-encounter-{profiles,rhythm,ui}.js` for all five current student-station features.
- `_prototypes/sp-interview/dana-live-{server,context}.mjs`
- `_prototypes/sp-interview/dana-openai-provider.mjs`, `dana-openai-worker.py`, and `conversation-speech-profiles.mjs`
- `_prototypes/sp-interview/family-visit-{case,state}.mjs`, `family-live-server.mjs`, `family-visit.js`, and `family-visit.html`
- `_prototypes/sp-interview/sp-interview.html`, its generated preview and generator, and the two local start commands.
- The scoped node tests and `tests/smoke/` conversation/family browser tests.

## What has been built

The local spoken prototype includes Dana's reusable Marin recordings and case-grounded live replies; Marcus and Ray; a new fictional Morgan alcohol motivational-interviewing case; and a separate Morgan/Maya family meeting with distinct voices. Conversation controls include a 4.5-second pause, extra thinking time, Hold, Space to finish, interruptions, repair, bookmarks, reflection, and one isolated alternative. Both single-patient and family prototypes have optional headphone-based simultaneous recognition: exact short acknowledgments allow playback to continue, while substantive responses interrupt and preserve first words. Family audio uses explicit targets and ordered playback with private check-ins. The local station adds door notes, requested chart information, an accommodated optional timer, a natural-close panel, authored observable cues, separate attending presentation, and exact-quote patient-perspective reflection. The quiet family participant can request the floor after completed public exchanges. Distinguish these actual implementations from permissioned disclosure sharing, avatars, extra relatives, or automated faculty evaluation, which are not built.

These are local drafts. Their generated dialogue and new case content do not carry faculty approval or establish learner readiness. The production canonical pack and learner-site activation are separate.

Local URLs, if already running:

- Single patient: `http://127.0.0.1:4319/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1`
- Family: `http://127.0.0.1:4320/_prototypes/sp-interview/family-visit.html`

Do not restart an active encounter or open its microphone. Use mocked tests for this review; do not read credentials or make paid provider calls. Identify any real microphone or live-provider checks still needed for Joshua to perform separately. No sending messages, committing, deployment, or changes to case/review records are requested.

## Review questions

1. **Authentic patient portrayal.** Do the characters speak like patients, with their own priorities, uncertainty, vocabulary, and questions? Check greeting, reassurance, apology, reflection without a question, a compound question, silence, a mid-sentence correction, a misunderstood phrase, and negation. Look for repetitive clarifications, stock empathy rewards, overlong speeches, automatic agreement, and unsupported personal or clinical facts. Distinguish consistent case facts from flexible wording. Examine whether legacy keyword or rapport gates could teach an inappropriate interviewing habit, including in safety assessment; report concerns without changing the canonical pack.

2. **An MS3 encounter.** Walk from setup through introduction, permission, agenda, history, response to emotion, closing summary, and debrief. Does the learner know their role and task? Test the implemented door chart, requested clinical information, observable cues, optional accommodated time frame, natural close, and spoken/typed attending presentation. Does the station preparation overwhelm the encounter controls? Does first-end focus lead to the attending presentation? Does dictation remain separate from patient API calls and stop on retry, Clear, or hiding? Separate an observed cue from an inferred diagnosis. Keep the learner's and patient's statements distinguishable from authored findings.

3. **Family realism and information boundaries.** Check explicit targeting, both-person order, interruptions, Maya's independent perspective and limits, Morgan's autonomy, and the possibility of disagreement. Test private → public and public → private transitions and retries on both sides. Verify that unplayed or interrupted text does not become shared history. Specifically assess whether excluding all private dialogue from public actor prompts makes a participant unrealistically forget their own earlier conversation. Propose a way to separate personal memory from permission to disclose, without giving the other actor private facts or silently treating a warm interaction as consent.

4. **Speech and lifecycle reliability.** Inspect recognition reconnects, long pauses, brief acknowledgments, Space, spoken interruption where supported, Esc, audio ordering, partial playback, delayed responses, duplicate submissions, cancellation failures, tab hiding, End, Clear, expiry, and retry. Look for swallowed first words, lost negation, self-captured patient audio, accidental mic restart, stale second speakers, and visible text falsely marked as heard. Distinguish the family and single-patient implementations instead of assuming they behave identically. Check keyboard, focus, screen-reader announcements, captions, mobile controls, and available alternatives if recognition is unavailable.

5. **Case integrity, privacy, latency, and cost.** Verify server-owned case identity, permitted knowledge, unknowns, voice identity, safe text rendering, local endpoint restrictions, actual retention/deletion, and API-key isolation. Examine the earlier family response failure and the narrower limits of the final successful sample. Check what happens when a first sentence has played but final validation fails. Identify avoidable delay and wasted generation, but do not recommend bypassing validation, auto-resending failed questions, or unbounded speculative calls. Distinguish operation caps, estimated cost, and actual provider billing; missing usage accounting is a finding, not permission to invent a dollar total.

6. **Reflection and evaluation.** Confirm that bookmarks and alternatives preserve the original and use the right snapshot, channel, target, and completed words. Any patient-perspective or coaching suggestion must be tied to actual transcript evidence and clearly labeled as simulation-based interpretation. Do not infer real emotions or grade accent, speed, fluency, personality, global empathy, competence, or entrustment. Do not reproduce copyrighted assessment instruments.

## Evidence and verification

Use these commands where useful, from the implementation worktree:

```bash
bash _prototypes/sp-interview/tests/run-all.sh
node --test tests/*.test.mjs
```

From its `tests/smoke` directory:

```bash
npm run test:dana-conversation
npm run test:family-visit
```

Check configured test ports before running; do not stop the active preview servers. Prefer focused reproduction over repeating every suite without a reason.

The September 6 completion ledger and `output/complete-encounter-*-tests.log` / `output/complete-encounter-*-browser.log` record this implementation’s verification. Revalidate their correspondence to current files; do not reuse earlier counts as if freshly executed. Earlier local family evidence is in:

- `output/speech/family-native-qa/report.json` — earlier run with an unclassified response failure after Morgan's fourth-turn reply.
- `output/speech/family-native-qa-final/report.json` and nearby screenshots — final three-scene run: nine original learner turns, one alternative, and 23 completed native audio segments.
- Additional single-patient evidence is indexed in `DANA_CONVERSATION.md`.

The final family sample reported 2.69–3.96 seconds from Space to initial browser playback, median 3.23 seconds across nine samples. Recognition was synthetic and native playback was muted at 2x speed. These checks do not establish physical microphone accuracy, audible naturalness, broad clinical fidelity, or a service-level latency guarantee. Do not label the earlier failure fixed merely because the later sample passed. Read the code and evidence; label unavailable evidence explicitly.

## Implemented features to challenge, not simply endorse

Evaluate each of these five additions against its actual code, UI, and tests. Report partial implementations honestly and recommend the five most valuable subsequent improvements:

1. Patient initiative and sustained, case-consistent reactions to interruptions, assumptions, and repair, without a hidden rapport score.
2. More natural conversational floor control: brief acknowledgments, pauses within a patient response, and a family member requesting a turn.
3. A complete student encounter: short door chart and task, requested information, natural close, and a brief attending handoff.
4. Sparse, authored nonverbal observations with accessible text equivalents; no inferred emotion detector or obligatory avatar.
5. An evidence-linked debrief extending the existing bookmark/retry: patient perspective and a separate teaching lens, including “Same sentence, two perspectives.”

For the family case, also evaluate the still-unbuilt permissioned bridge: the patient chooses one statement to share after a private check-in, or elects to say it themselves. No automatic copying of the private transcript.

The current real-provider evidence is under `output/speech/complete-encounter-single-qa/` and `output/speech/complete-encounter-family-qa/`. Read the reports, including any failure fields, before asserting success. Both use synthetic recognition and muted native audio at 2x speed. Native `playing`/`ended` events confirm browser playback, not that a human heard or understood the response.

## Deliver the review

Start with a short plain-English verdict. Then provide:

- A prioritized findings table: severity, status (`CONFIRMED`, `PARTIAL`, `NOT REPRODUCED`, or `NOT TESTED`), exact file/line or browser evidence, reproduction, learner impact, and smallest proposed correction. Do not inflate a hypothesis into a confirmed bug.
- A concise account of what you actually tested, what only came from earlier artifacts, and what requires a human microphone audition or faculty judgment.
- The top five improvements ranked by realism/educational value, effort, and risk. Explain what each changes for a student in concrete terms and which existing feature it extends.
- One recommended next work package with acceptance criteria; one innovative idea worth prototyping later.
- Separate conclusions for a local demonstration, a supervised faculty pilot, and learner-site release. Do not imply authority to approve clinical content or certify learners.

Report first. Do not implement fixes as part of this review.
