# Interview Room faculty and API review

November 17, 2026 · Source baseline `ac59dddc`

## Which connection to use

**Keep Anthropic for the learner room’s typed patient and debrief. Use OpenAI credits for the spoken-room migration.** The learner proxy already calls Claude’s Messages API server-side. Its case pack pins Haiku 4.5, 300 output tokens for a patient reply, 1,500 for feedback and 40 turns. The public receipt at 06:00 UTC on November 17 recorded five learner-ready cases and one successful neutral reply in 3–8 seconds. Its pack digest matched this checkout. That receipt measures one actor reply. It provides no evidence about the evaluator, pronunciation, microphone or Realtime availability. [Health receipt](https://sp-interview-proxy.netlify.app/api/sp/health-status) · [Actor and evaluator contract](../_prototypes/sp-interview/sp-interview.pack.json) · [Anthropic model lifecycle](https://platform.claude.com/docs/en/about-claude/model-deprecations)

| Room | What the code does | Recommendation |
| --- | --- | --- |
| Learner room, typed or device voice | The proxy decides which case facts may enter Claude’s prompt. The browser can provide device speech. Supported and Realistic already affect how guarded the typed patient sounds. | Keep the reviewed text baseline. Use the question and the patient’s actual reply together when interpreting feedback. |
| Faculty spoken preview | Browser speech recognition or typed input → OpenAI Responses (`gpt-5.4-2026-03-05`) → speech (`gpt-4o-mini-tts-2025-12-15`). The server checks the reply before releasing audio and tracks which segments played. | Preserve that sequence for case fidelity. Migrate the final speech stage first. It can be auditioned with fixed lines and no actor calls. |
| Learner room, Realtime | The browser uses WebRTC. A server exchanges the session offer and supplies permitted disclosures each turn. This has its own enable flag, reservation ledger and wall-clock deadline. | Reserve this for work that needs overlapping speech and interruption. Measure time from the learner finishing to the first audible word on actual classroom devices. The public receipt does not establish the deployed flag or model. |
| ElevenLabs | The separate learner managed-voice adapter already supports Scribe v2 and Eleven v3. The matching live case pack has managed voice disabled and no active stack. This adapter does not power the faculty preview. | Try stock voices on a small set of synthetic, prerecorded lines if the OpenAI audition loses meaningful distinctions. A third provider earns its place if faculty hear improved fidelity at an acceptable cost and delay. Check the account’s retention entitlement before sending learner audio. |

Implementation references include the [faculty actor and speech provider](lib/openai-provider.mjs), [Realtime session and rate card](../sp-proxy/netlify/functions/_shared/sp-realtime-session.mjs) and [managed speech adapter](../sp-proxy/netlify/functions/_shared/sp-speech-provider.mjs). The providers describe the available architectures and retention options in the [OpenAI voice guide](https://developers.openai.com/api/docs/guides/voice-agents), [ElevenLabs synthesis guide](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) and [ElevenLabs zero-retention terms](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode).

### Voice migration dates

| Shutdown | Where it matters here | Engineering action |
| --- | --- | --- |
| January 6, 2027 | The preview’s pinned mini-TTS and the inactive managed stack’s `tts-1-hd` | Audition `gpt-realtime-2.1-mini` speaking supplied text over the Realtime API. A model-name edit on `/v1/audio/speech` will fail. Adapt the audio format to the player, retain interrupted-segment accounting and verify the spoken words. |
| January 20, 2027 | The older `gpt-realtime-mini-2025-12-15` candidate in the learner runbook and rate card | If this is the deployed pin, update the session configuration and matching rate rows together. The current card lacks the replacement mini model. |
| February 26, 2027 | The managed candidate’s Whisper and the runbook’s mini-transcribe | Choose live transcription for streaming microphone input or file transcription for completed recordings. Exercise each route in the mode that actually uses it. |

Dates and replacement workflows come from [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) and its [speech migration notice](https://developers.openai.com/api/docs/guides/text-to-speech).

### What the monthly credits buy

Check that the organization behind each Netlify project key is the one receiving that provider’s grant. The faculty preview and learner speech proxy are separate deployments and can use different projects. Account balances, grant amounts, paid overage settings and deployed voice pins were unverified in this review. Keep the rotation and session limits in place. The preview’s operation units count attempts and cannot predict a dollar invoice. [OpenAI credit coverage](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) · [Claude credit coverage](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)

For scale, a **hypothetical** typed encounter totaling 60,000 uncached input tokens and 2,000 output tokens across all calls would cost $0.07 on Haiku 4.5 at $1/$5 per million. The replacement OpenAI mini voice model lists $10 per million uncached audio input tokens and $20 per million audio output tokens, with text billed separately. For a budgeting decision, divide actual project spend by completed encounters and include retries, feedback and failed attempts. [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [OpenAI mini pricing](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

## What each patient can teach

| Case | Faculty observation to carry into debrief |
| --- | --- |
| Dana, admission | After a direct suicide question, what did Dana actually disclose? Which risk details still need a follow-up question? |
| Marcus | Can the learner acknowledge an important thought, redirect to one question and give Marcus room to answer while his speech stays urgent and intelligible? |
| Ray | Can the learner explore a frightening experience, ask what the voice says and clarify Ray’s response without endorsing the belief or assuming intent? |
| Morgan | Does the learner reflect both sides of ambivalence and leave the next choice with Morgan? Listen for unwarranted agreement in the actor’s reply. |
| Dana, post-discharge, in the learner room | Can the learner distinguish what the discharge chart says, what Dana reports now and what remains unknown? The draft fix sends uncertain replies on three gated facts to transcript review. |
| Morgan and Maya, in the faculty preview | Can the learner invite both accounts and attribute each statement to its speaker? The family door now requests both participants and preserves the pre-visit briefing. |

The preview also offers three short exercises with Elena, Priya and Luis. Its communication coaching has a separate draft review status. One continuing scoring limitation affects Marcus and Ray. An open invitation plus a direct suicide question can yield **Observed** for general technique even if the learner never redirects Marcus or asks Ray about command content. Use the actual exchanges for formative feedback. A future rubric revision can be tested against those two counterexamples and calibrated with faculty. Coordinate proposed case-language edits with the existing review. [Rubric and note grader](../_prototypes/sp-interview/sp-interview.html) · [Clinical proposals #1204](https://github.com/jmoss333/psychiatry-clerkship/pull/1204) · [ASPE standards](https://www.aspeducators.org/standards-of-best-practice)

## A faculty session to try

1. Choose Ray in the protected preview. Select a communication goal, coaching depth and vocal expression under the entry controls. The draft **Get link for this setup** makes these choices reusable across learners. For solo Morgan, faculty can also select **One point, then room for a follow-up**. That setting asks the actor to volunteer less after broad invitations while answering specific questions fully. It travels with the setup link and the encounter. Its effect on live delivery awaits a faculty audition. Each learner supplies their own access and starts the encounter. Faculty can introduce one of the existing room cues during a full encounter.
2. For the voice migration, audition six short case-grounded lines in pairs. Include a negation, an uncertain answer, a direct disclosure, a redirect and a speaker change. Have two faculty listen in blinded order and record exact-word errors, role errors, intelligibility and whether the voice fits this particular patient. Use headphones and a classroom speaker. A changed negation or attributed speaker warrants fixing before using that voice for the station.
3. Use OpenAI’s Audio Playground for the first listening comparison and Claude Console’s evaluation tool for text variants on the same synthetic exchanges. Track end-of-utterance to first sound separately from the interface’s automatic pause. Start with a manual rehearsal and compare the costs in the two usage dashboards. [OpenAI Audio Playground](https://platform.openai.com/audio/live) · [Claude Console evaluation](https://claude.com/blog/evaluate-prompts)

**Teaching experiment.** Give two learners the same Ray case and different vocal-expression presets. Have each mark the exact words supporting their formulation. Compare where the patient supplied evidence and where delivery influenced the interviewer’s inference. This uses the same case facts across both encounters.
