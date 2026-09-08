# Protected spoken Interview Room

A protected pilot of ten spoken turns with Dana, Marcus, Ray, Morgan, or Morgan and Maya, hosted separately from the learner sites. The learner sites' Interview Room links here through a top-level navigation, so microphone and media permissions belong to this origin. The original Interview Room and its production SP proxy continue to work. Dana's disclosure overlay and conversational portrayal retain their recorded review status.

## Local verification

Requires Node 22 or later. Install dependencies here and in `../sp-proxy`, then run `npm test` and `npm run build`. Both also run in `ci.yml`'s `build-test-validate` job and in `bin/verify.sh`, so a change here reddens a pull request rather than surfacing only when someone remembers the commands. Run the full root and prototype suites sequentially. The `dist` folder contains only the five browser assets listed below; never publish the repository root, `_prototypes`, or `sp-preview` itself.

The opt-in `npm run test:hosted` also requires the `tests/smoke` Playwright dependencies, explicit `DANA_QA_URL` and `DANA_QA_ACCESS_FILE` environment variables, and an authorized preview passcode file. It makes one paid opening and ten paid conversation requests, with synthetic recognition and native muted audio at 2x. It never runs as part of `npm test` or in CI; reports contain counts/timings, not dialogue, keys, or state receipts.

It has two modes. `DANA_QA_MODE=automatic` (the default) is the hands-free proof: it waits out the real 4.5-second quiet window on every turn and makes no click, key press, focus change or composer write after Start — the page counts every such event it receives and the run fails if any arrives. It reports `quietMs` (final recognized words to dispatch) separately from `replyMs` (dispatch to first audio), so the wait for automatic completion is never confused with provider latency. `DANA_QA_MODE=shortcut` retains coverage of the Space completion path as its own separate paid run.

Neither mode is microphone evidence: both replace `SpeechRecognition`, and both assert and record `nativeRecognition: false`. Only a human walkthrough in a supported browser can close that gap. See `ACCEPTANCE.md` for what has and has not been verified.

## Cases

The preview carries Dana (admission interview), Marcus (a focused interview), Ray (establishing a working conversation), Morgan (motivational interviewing), and Morgan and Maya (a shared family meeting). The learner picks one at the door and it is fixed for that encounter. Morgan and the family meeting retain their authored pending faculty-review status and are visibly labeled drafts.

Each encounter is bound to its case twice over. The state codec's binding embeds
the case id and a hash of the case definition, so a receipt sealed for one case
fails to open under another and dies as `preview_state_invalid` before any
reservation. The case id also travels inside the sealed state and is cross-checked
against every request. The second check is deliberate redundancy: the first is
emergent from a template string, and an edit that dropped the case hash from the
binding would otherwise go unnoticed.

Morgan reuses the existing local alcohol-ambivalence case without introducing new history or a required abstinence ending. The family case uses only the existing public Morgan/Maya projection. Each learner turn has one named respondent, selected from the speaker control or a direct address at the beginning ("Maya, ..."). Mentioning a person later in a sentence does not switch the respondent. The transcript, voice, marked moments, and alternative retain that person's identity. The alternative restores the original addressee from authenticated history, regardless of who spoke last.

The hosted family case has no private channel or private check-in operation. Its prompt receives no authored private inventory; the local prototype's private workflow is not transplanted into this stateless endpoint. In this version, asking both participants means inviting each perspective on successive turns. Each response still uses one actor request and at most two speech requests, so the existing conservative allowance remains sufficient.

Hosted delivery instructions live in `lib/portrayal.mjs`, separate from the archived recordings and other prototypes. Marcus uses continuous urgent phrasing and compressed pauses; a clear redirect changes topic without instantly changing his underlying presentation. Morgan, Maya, and Ray receive subtle case-specific emotional delivery. Dana's accepted voice remains unchanged. Marcus uses a modest 1.12 speech-synthesis setting after the first audition; the other cases retain 1.0 and browser playback remains 1.0. This is an authored portrayal setting, not a diagnostic speech-rate threshold. No extra provider call or speaking-speed/fluency grading is added. Natural spoken barge-in is not implemented: Interrupt/Escape stops playback; microphone capture resumes when the learner chooses Resume.

Only Dana receives the direct-suicide-question overlay. It is reviewed for her
alone and is never applied to another case.

## The student station

`dist` publishes five files: `index.html`, `app.js`, `styles.css`, `station.js` and `station-content.js`. The station renders the door note, task and objectives, the chart-request disclosure, the patient's stated priorities and observable cue, marked moments with a reflection each, and the attending presentation once the encounter ends.

It is a projection of the controller snapshot and nothing more. It holds no reference to `send()`, makes no network request, and reads and writes no browser storage — `build.test.mjs` fails the build if `fetch(`, `localStorage`, `sessionStorage`, `indexedDB` or `XMLHttpRequest` appears in either station file. Marked moments quote only what was actually heard: a reply that did not finish playing is quoted at its completed segments, and a moment with nothing confirmed heard says so rather than showing an empty quotation. `station-content.js` carries learner-facing content only; the participant `portrayal` guidance is actor direction and stays server-side.

**Known limitation.** Chart-request cards ship client-side, as they do in the local prototype. "Request available chart information" is therefore a teaching affordance, not an information barrier: a learner who opens developer tools can read cards they did not request. Serving them through the authenticated endpoint would be a protocol change and belongs in a later slice. The content is fictional teaching material and nothing gated by the safety overlay is involved.

## Hosting configuration

Use a separate Netlify preview site with this directory as its base. Keep its provider key and access credentials separate from learner/faculty console credentials. Required Function environment variables:

| Name | Meaning |
| --- | --- |
| `DANA_PREVIEW_ENABLED` | Exactly `true` to permit this engineering preview. Missing/false fails closed. |
| `DANA_PREVIEW_PASSCODE` | Access phrase, at least 15 characters. Configured server-side; held only in browser memory during an encounter. |
| `DANA_PREVIEW_STATE_KEY` | Random 32-byte key encoded as 43 base64url characters. Server only. |
| `OPENAI_API_KEY` | Existing user-authorized Psychiatherapy key. Server only; never public assets. |
| Deployment identity | Supplied by trusted Function `context.deploy.id`; encrypted encounter state binds to that deployment. Do not rely on build-only `DEPLOY_ID`. |
| `DANA_PREVIEW_BUDGET_NAMESPACE` | Required, stable site-wide ledger namespace. Pin it once to the original production deployment's ledger and use the same value in every deployment context. Never rotate it when deploying. |
| `DANA_PREVIEW_ORIGIN` | Optional explicit exact origin for a local test or assigned preview alias. |

The September 8 integration authorizes the stable protected pilot at `https://interview-room-faculty-preview.netlify.app`, linked from the learner sites. Deploy this configuration only to its separate site; never to either learner site's site ID or to `sp-interview-proxy`. Keep the passcode and provider key in Function environment variables. This integration does not enable the canonical `speechEngine` flag or change faculty attestation.

The owner-approved small pilot allows **20 encounter start attempts per UTC calendar day**, shared across all five cases, users, and deployment contexts on this Netlify site. A separate allowance permits **680 operation units per UTC day and 340 per rolling 30 minutes**. An opening costs one unit and each question or alternative costs three. Twenty ten-question encounters plus one alternative each therefore fit the daily unit allowance; up to ten such encounters fit a thirty-minute window. Starts and daily units renew at **00:00 UTC**. Reaching twenty starts does not prevent an already admitted encounter from continuing within the remaining unit allowance. Verification attempts and failed/cancelled work count, so this is a limit on attempts, not a promise of twenty successful completions or a dollar-billing plan.

Before the first capacity-upgrade deployment, set `DANA_PREVIEW_BUDGET_NAMESPACE` in all Function deployment contexts to the existing production ledger's namespace (the previous production deployment ID). The first successful reservation atomically upgrades that same `paid-operations-v1` key to stored schema v2, preserving today's charges and starts and all still-retained operation hashes. A missing namespace, malformed ledger, changed policy, failed read, or ambiguous conditional write fails closed. Do not delete the record, choose a fresh namespace, or change the namespace after this migration. The old deployment then refuses the upgraded record rather than overwriting it. Publish the assigned preview alias with the same namespace before using it for paid verification; old aliases using their own legacy ledger do not participate in the new policy.

Use `netlify deploy --context deploy-preview` with the complete build for the first upload. Verify the function bundle as well as static assets. Routing uses the explicit TOML rewrite to the default function endpoint. Do not also export `config.path`: modern custom paths disable the default endpoint, making that combination return 404. See [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/).

Runtime deployment identity comes from [the Function context](https://docs.netlify.com/build/functions/api/#deploy). `DEPLOY_ID`/`DEPLOY_URL` are build variables and are not among the [read-only runtime variables](https://docs.netlify.com/build/functions/environment-variables/#netlify-read-only-variables).

## Request and information boundaries

The browser sends questions in an authenticated same-origin POST. Browser speech recognition may send microphone audio to the browser vendor; completed text is sent to OpenAI. Dana's voice is AI-generated Marin. No browser transcript persistence, transcript database, durable audio, or dialogue logs are added. OpenAI requests use `store:false`; this does not assert absence of provider retention under the account's terms.

The server validates the complete actor reply before publishing any speculative first-sentence audio. Each complete MP3 segment carries an encrypted receipt containing server-authored dialogue. The next request can acknowledge only issued, generation-complete segments; interruption never treats an unheard tail as communicated. Receipts expire after 30 minutes and are invalid on another deployment/origin or after key/access rotation.

The ledger stores operation hashes, binding hashes, timestamps, and unit counts only. Each opening reserves one paid attempt; each question conservatively reserves three (actor plus up to two speech segments), even if fewer are used, and the one spoken alternative reserves three on the same basis. A full encounter with its alternative therefore reserves 34 units. The alternative is terminal at the server even when it revisits an early question; its receipt cannot start extra questions or a second alternative. Failures/cancellations remain reserved. The current and preceding UTC day's operation hashes stay in the ledger, retaining replay protection for at least 24 hours; encounter receipts expire after 30 minutes. Daily and rolling totals derive from those operations in the same atomic conditional write, including at midnight and during the v1 upgrade. Redeploying **does not renew capacity**. These are operation limits, **not dollar billing or a guarantee against charges outside this preview**.

## Acceptance before sharing

- Wrong/missing access phrase or origin, altered/expired receipts, and budget exhaustion fail before provider calls.
- Ten turns work across fresh Function instances. Duplicate requests start no duplicate generation.
- A spoken turn sends itself 4.5 seconds after the learner's last words (8 with more thinking time), through ordinary recognition restarts and background noise, with no click or key press. Hold suspends it; Space and Done finish early; Escape stops late playback; a composer edit pauses automatic sending until voice resumes or the question is sent explicitly.
- An unfinished recognition ending keeps the completed words, recovers the microphone, and never promotes the truncated half into a question.
- Native MP3 completion, microphone behavior, cancellation, and response delays are verified in the actual hosted browser journey.
- Private source paths are absent from published assets; public failures contain no provider details or keys.
- Canonical production voice flags and learner routes remain unchanged.

## Diagnosing a real microphone session

`DanaPreview.session.getDiagnostics()` returns fixed state codes, counts and timings only — no speech, no transcript, no draft text — and is the intended way to establish what happened on a physical microphone without recording anything. `nativeRecognition` distinguishes the browser's own recognition from a synthetic replacement; `automaticSubmissions` and `explicitSubmissions` distinguish turns that sent themselves from turns sent by Space, Done or the composer; `counts.voice_wordless`, `counts.unfinished` and `counts.reconnect` name the three lifecycle paths that previously ended hands-free operation.

Retry/reflection, Morgan, and the shared family meeting are now hosted. Private family check-ins and the per-person information replay remain in the packaged local prototype; they are not implied by the public-only hosted meeting.
