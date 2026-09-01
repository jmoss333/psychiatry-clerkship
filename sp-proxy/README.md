# SP Interview Proxy

Serverless endpoint that gives The Interview Room (`_prototypes/sp-interview/`) a live LLM patient.
Same trust model as the faculty console: **the API key never leaves the server; the browser holds
only a rotation-block passcode.**

```
sp-proxy/
  index.html                  placeholder page (the site is just the function)
  netlify.toml                base-dir config (publish + functions)
  netlify/functions/sp.mjs    the endpoint: converse + evaluate + health
  netlify/functions/sp-health-canary.mjs
                              scheduled authenticated health receipt
  netlify/functions/sp-health-status.mjs
                              public content-free receipt status
  package.json                @netlify/blobs (durable daily quota counter)
  REDTEAM_CHECKLIST.md        run after every deploy and every model/pack change
```

## What the function does

- **Converse** (`POST /api/sp`): re-derives rapport/gates/intents from the full transcript
  server-side (the client is untrusted — a modified client cannot unlock Dana's disclosure),
  assembles the actor prompt from the **attested pack fetched from the repo**, and returns
  `{reply, state}`. Locked disclosures are never placed in model context — only their
  deflection lines — so injection cannot extract what the model was never given.
- **Evaluate** (`POST` with `mode:"evaluate"`): deterministic coverage map + rubric context +
  the student's self-assessment → structured JSON feedback. Parse failure degrades gracefully
  to the tool's deterministic debrief.
- **Health** (`GET /api/sp`): the versioned actor/evaluator model pins, pack version/status, and
  reviewed case summaries — this is what the tool's "Test connection" button calls.
- **Logs are metadata only** — case id, turn number, rapport, date. Never message text.

## Scheduled health receipts

The published proxy runs `sp-health-canary` every six hours. It reuses the server-side learner
passcode, requires the exact canonical MS3 origin, and makes two authenticated calls in sequence:

1. **Contract leg** — `GET /api/sp`. No provider call. Validates the model/pack contract and yields
   the reviewed case IDs. If this leg fails, the run stops here and no turn is spent.
2. **Capability leg** — **only when `learnerReady` is true** — one `POST /api/sp` with
   `mode:converse`, a throwaway 22-character `encounterId`, `turnId: 1`, `turns: []`, and a fixed
   neutral opening question. The run succeeds only if a non-empty `reply` comes back.

The gate on `learnerReady` is load-bearing. `sp.mjs` refuses every POST unless the pack status is in
`POST_PACK_STATUSES` (`reviewed`, `attested`) — which is exactly the set that makes `learnerReady`
true. A draft pack therefore refuses the probe by design, so the canary does not send one and
records `actorReady: false`. That is a healthy receipt, not an outage: nothing was probed because
nothing is being served. The canary uses a live actor POST exactly when learners can, and never
otherwise.

The second leg exists because the first one is not evidence the Interview Room works. `mode:open`
returns pack copy without calling the provider, so on 2026-09-01 `/api/sp/health-status` reported
`{"state":"success","learnerReady":true}` while a dead `ANTHROPIC_API_KEY` meant the tool could not
produce a single patient reply. Reachability was never capability. **This reverses the original
GET-only design constraint — see the 2026-09-01 amendment in
`docs/superpowers/specs/2026-07-28-scheduled-maintenance-steward-design.md` for the reasoning and
what it costs.**

The capability leg spends one real actor turn against the shared rotation budget, four times a day
(~120 turns/month, roughly $0.60 against the $20 cap at the pinned Haiku rate). A `429` from that
leg is recorded as `actor_budget` rather than `actor_status` precisely because it is the one failure
the canary can inflict on itself.

Each run replaces Blob key `latest` in the site-scoped, strong-consistency `sp-health-canary` store
with a content-free receipt. Success records only timestamps, case count, learner-ready state,
actor-ready state, a coarse reply-latency bucket, and a SHA-256 contract identifier; failure records
only a bounded failure code and timestamp. **The patient reply is measured and dropped inside the
probe — it is never returned, logged, or stored.** The receipt never stores credentials, raw model or pack identifiers, case
content, learner activity, request headers, URLs, or exception text. A `draft-pending-attestation`
pack can be reachable and healthy while `learnerReady` remains false; the receipt is not a faculty
approval.

`actorReady` is `true` only when a live turn actually completed; a probe that ran and could not get
a reply writes a *failure* receipt instead. `learnerReady: true` with `actorReady: false` is
rejected as malformed everywhere — that is precisely the shape the health surface had while the tool
was mute. The reverse (`false`/`false`, a draft pack) is honest and valid. The earlier seven-key
receipt fails validation and reads as `malformed` rather than being mistaken for a green result.

`replyLatencyBucket` records how long the live turn took as one of `fast` (<3s), `normal` (3–8s),
`slow` (≥8s), or `not-probed`. It is a bucket rather than a duration on purpose: a raw millisecond
count tracks how much the patient said, and D6 is kept by construction rather than by judging that
channel too weak to matter. The bucket and `actorReady` are two views of one fact and may never
disagree — a turn that completed has a timing, one that was never sent has none — and a mismatch is
malformed. **Watch it across days, not runs:** four samples a day drifting from `fast` toward `slow`
is the earliest available signal of provider degradation, throttling, or a silent model change, and
it shows up well before anyone opens a ticket. A single `slow` reading is noise.

**On first deploy the stored receipt is the old shape, so `/api/sp/health-status` returns 503
`malformed` until the next scheduled run writes a new one (up to six hours). Trigger the function
manually from the Netlify UI to close that window.**

Public `GET /api/sp/health-status` requires no credential and exposes only that bounded receipt with
`Cache-Control: no-store`. A success becomes non-success when it is more than eight hours old or the
recorded `nextRun` is over ten minutes late, so a missed invocation or lost Blob write cannot hide
behind the prior success. GitHub checks this surface after each scheduled slot, and the independent
Codex deadman supplies the separate alert path.

This check proves that the contract is intact and that the actor answered one neutral turn. It does
**not** evaluate what the actor said, exercise the evaluator, the safety screen, voice behavior, or
the coverage map; it does not authorize managed voice; and it does not replace the deploy/model/pack
red-team checklist and external activation gates below. A green receipt still is not release
evidence (D7) — it is now evidence that the tool can speak, which is strictly more than it proved
before and still much less than a red-team pass.

## One-time setup (~10 min, Netlify dashboard)

> Per house routing: do this in the **Netlify dashboard via Chrome** (the Cowork Netlify MCP
> is authed to a different account and 404s these sites).

1. **Add new site → Import from Git →** `jmoss333/psychiatry-clerkship`
   - Base directory: `sp-proxy` · Build command: `npm ci --omit=dev` · Publish: `sp-proxy`
   - Functions auto-detect from `sp-proxy/netlify/functions`; `netlify.toml` pins Node 20.
2. **Environment variables:**

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key (console.anthropic.com) |
| `SP_STUDENT_PASSCODE` | strong passcode; **rotate each rotation block** |
| `SP_OPERATIONS_KEY` | separate strong operations credential; never give it to learners |
| `SP_SPEECH_TICKET_SECRET` | independent random signing secret; keep server-only |
| `SP_ROTATION_ID` | unique non-identifying ID for this rotation's shared budget ledger |
| `SP_PACK_URL` | `https://api.github.com/repos/jmoss333/psychiatry-clerkship/contents/_prototypes/sp-interview/sp-interview.pack.json?ref=main` *(update on promotion out of _prototypes)* |
| `SP_PACK_TOKEN` | fine-grained GitHub PAT, **Contents: read** on this repo only (repo is private) — lets the function read the pack. Rotate as needed. |
| `SP_ALLOWED_ORIGINS` | `https://une-ms3-psychiatry.netlify.app,https://mmc-psychiatry-residents-sanford.netlify.app` (+ `http://localhost:8888` while testing) |
| `SP_MANAGED_VOICE_ENABLED` | keep `false` until every external activation gate is recorded |

3. Deploy, then verify with an allowed learner origin:
   `curl -H "Origin: https://une-ms3-psychiatry.netlify.app" -H "x-student-key: <passcode>" https://<site>/api/sp`
   → `{"schemaVersion":1,"actorModel":"claude-haiku-4-5-20251001","evaluatorModel":"claude-haiku-4-5-20251001","packVersion":"<reviewed pack version>","packStatus":"<reviewed status>","cases":[...]}`.
4. In the tool: mode chip → **Live** → settings panel → paste endpoint URL
   (`https://<site>/api/sp`) + passcode → **Test connection**.
5. Run `REDTEAM_CHECKLIST.md` end to end **before giving students the passcode**.

## Governance couplings (do not skip)

- **Immutable model, output, and turn pins.** Production hard-pins the actor and evaluator to the
  same reviewed model, currently `claude-haiku-4-5-20251001`, with output maxima of 300 and 1,500
  tokens. The reviewed pack must match those pins and currently sets a 40-turn maximum; no
  environment variable can override them. Changing source or pack pins re-triggers faculty review:
  replay the golden transcript
  (the 19-message skilled-interview script in `/tmp`-test / checklist) and eyeball Dana's voice.
- **Pack changes deploy themselves** (the function re-fetches within 5 min) — which is exactly
  why `SP_PACK_URL` must point at `main`, where nothing lands without your PR review.
- **Cost envelope:** the reviewed pack rate card and atomic rotation ledger are authoritative.
  Estimates in prose are not deployment controls.
- **Passcode hygiene:** one passcode per rotation block, shared in person (not email),
  and rotated at block end.

## Managed voice remains disabled

Managed voice is opt-in and fail-closed. Merge is allowed while the pack speech engine, voice
profiles, privacy record, and external gates remain pending, because production still requires
`SP_MANAGED_VOICE_ENABLED=true` and a production deployment context. Preview deploys cannot enable
it. Typing and device voice remain available independently.

Do not turn managed voice on merely because automated tests pass. The release passport reports
missing gates; it does not approve them. The current OpenAI server credential is associated
operationally with the project named **Voice Over**, but only the server receives that credential.

## Environment variables (names only)

Enter secrets and deployment-specific values only in the hosting dashboard. Never place them in
source, screenshots, tickets, browser settings, test fixtures, logs, or the release passport.

| Name | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Server-only actor/evaluator credential |
| `OPENAI_API_KEY` | Server-only Voice Over speech credential |
| `ELEVENLABS_API_KEY` | Server-only alternate speech credential; unused unless its stack is reviewed |
| `SP_STUDENT_PASSCODE` | Learner credential for the current rotation |
| `SP_OPERATIONS_KEY` | Separate operations credential for content-free usage only |
| `SP_SPEECH_TICKET_SECRET` | Server-only signing/HMAC secret |
| `SP_PACK_URL` | Reviewed pack source |
| `SP_PACK_TOKEN` | Read-only credential for a private pack source |
| `SP_ALLOWED_ORIGINS` | Exact learner-site origin allowlist |
| `SP_ROTATION_ID` | Non-identifying, unique rotation ledger ID |
| `SP_MANAGED_VOICE_ENABLED` | Explicit production voice kill switch |
| `SP_VOICE_STACK_ID` | Reviewed speech-stack pin |
| `SP_VOICE_TRANSCRIPTION_PROVIDER` | Reviewed transcription-provider pin |
| `SP_VOICE_TRANSCRIPTION_MODEL` | Reviewed transcription-model pin |
| `SP_VOICE_SYNTHESIS_PROVIDER` | Reviewed synthesis-provider pin |
| `SP_VOICE_SYNTHESIS_MODEL` | Reviewed synthesis-model pin |
| `SP_VOICE_ZERO_RETENTION_ENTITLED` | Explicit reviewed account-entitlement pin; never inferred |

## Retention and deletion

Application retention and vendor retention are separate decisions. The application keeps request
audio only in bounded request memory and does not put audio, transcript text, prompts, replies,
self-assessments, tickets, or credentials in Blob storage or logs. The durable ledger contains only
hashed operation identities, lifecycle state, expiry, and content-free usage totals.
All application logs are content-free logs containing only allowlisted operational metadata.

Provider retention depends on the separately reviewed provider policy and account controls. Do not
claim zero retention from an API parameter alone. A zero-retention option may be sent only when the
reviewed runtime records that the account is entitled to it. Follow the approved vendor deletion
process when applicable; rotating local credentials does not delete vendor-held data.

## Accidental PHI response

The Interview Room is for fictional simulation only. If a learner enters possible PHI:

1. Set `SP_MANAGED_VOICE_ENABLED=false` and redeploy if audio may be involved.
2. Revoke the learner passcode and rotate the separate operations credential; rotate a provider key
   if exposure of that key is suspected.
3. Notify the designated privacy lead through the institution's approved incident channel.
4. Preserve only content-free timestamps, operation states, and usage needed for the investigation;
   do not copy the learner text or audio into a ticket, chat, or ordinary email.
5. Use the reviewed provider process to request deletion or investigation, then document the
   disposition without reproducing the content.

## Rate card and budget

The frozen reviewed pack rate card is the only pricing input. The ledger uses integer micro-dollars
and one durable operation identity per actor, evaluation, transcription, or synthesis call. At the
`$16` warning boundary, new managed voice reservations stop while the remaining actor/evaluator
envelope is preserved. At the `$20` hard rotation cap, no new paid provider operation starts.
Storage ambiguity is charged conservatively and never authorizes a second provider call.

## Operations usage access

Read content-free rotation usage with `GET /api/sp/voice?op=usage` and the
`x-operations-key` header. This route uses the separate operations credential, has no browser CORS,
and must never be exposed to learners. Its allowlisted response contains costs, operation counts,
budget band, and timestamps—not case IDs, encounter IDs, tickets, transcripts, audio, prompts,
replies, or raw idempotency material.

## Vendor alerts and policy review

Subscribe an accountable owner to provider security, privacy, retention, price, model-deprecation,
and incident notices. A policy, model, price, voice, adapter mapping, or account-control change makes
the corresponding review stale: disable managed voice, update the pack evidence and hashes, repeat
privacy and faculty review, and rerun the red-team checklist before considering reactivation.

## Rollback

Set `SP_MANAGED_VOICE_ENABLED=false`, redeploy, and verify authenticated voice health reports
`enabled:false` and `acceptingVoice:false`. Confirm typing and device voice still work. Do not delete
or rewrite an active rotation ledger during rollback; its tombstones prevent duplicate paid calls.
If the actor path is affected, leave the explicit learner choice to continue offline rather than
silently changing modes.

## Rotation turnover

For each new block, issue a new non-identifying `SP_ROTATION_ID`, learner passcode, and separate
operations credential. Revoke the old learner and operations credentials, record the prior
content-free final usage receipt, and retain its ledger under the approved retention schedule. Never
derive or reuse a rotation ID from a passcode, learner, date of birth, medical record, case, or
transcript. Do not compact an active ledger.

## External activation gates

All of these must be recorded outside the automated receipt before learner activation:

- faculty audition and clinical-safety approval for every case/voice pairing;
- privacy approval of provider policy, retention, deletion, and account controls;
- evidence that any claimed zero-retention entitlement applies to the deployed account;
- a deployment preflight confirming the separate operations credential and new non-identifying
  rotation ID are present before restoring live actor access;
- confirmation that the learner site's consent version/account-control record matches the exact
  reviewed pack and speech stack deployed by the proxy; recheck after either site deploys;
- pronunciation checks for suicide, violence, medication, and emergency-safety language;
- a small supervised learner pilot with explicit fallback and accessibility review.

`node _prototypes/sp-interview/release-passport.mjs` prints only status and SHA-256 hashes. Missing
external gates permit merge with managed voice disabled; they do not permit learner activation.
