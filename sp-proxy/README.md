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
passcode, requires the exact canonical MS3 origin, and makes one authenticated `GET /api/sp`.
Because the check is GET-only, it does not invoke the actor, evaluator, budget ledger,
transcription, synthesis, or another paid provider operation.

Each run replaces Blob key `latest` in the site-scoped, strong-consistency `sp-health-canary` store
with a content-free receipt. Success records only timestamps, case count, learner-ready state, and a
SHA-256 contract identifier; failure records only a bounded failure code and timestamp. It never
stores credentials, raw model or pack identifiers, case content, learner activity, request headers,
URLs, or exception text. A `draft-pending-attestation` pack can be reachable and healthy while
`learnerReady` remains false; the receipt is not a faculty approval.

Public `GET /api/sp/health-status` requires no credential and exposes only that bounded receipt with
`Cache-Control: no-store`. A success becomes non-success when it is more than eight hours old or the
recorded `nextRun` is over ten minutes late, so a missed invocation or lost Blob write cannot hide
behind the prior success. GitHub checks this surface after each scheduled slot, and the independent
Codex deadman supplies the separate alert path.

This check proves authenticated read-only reachability only. It does not exercise live actor POSTs,
model or voice behavior, authorize managed voice, or replace the deploy/model/pack red-team
checklist and external activation gates below.

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
| `SP_STUDENT_PASSCODE` | learner passcode. **Standing decision 2026-08-31: this is a fixed, non-rotating passcode** — see *Passcode policy* below for what that changes. |
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
   Step-by-step, with the mechanical probes scripted: [`docs/RED_TEAM_RUNBOOK.md`](../docs/RED_TEAM_RUNBOOK.md).

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
- **Passcode policy (changed 2026-08-31, Joshua Moss, MD).** The learner passcode is now
  **fixed and does not rotate**. It is chosen to be memorable and sayable out loud so it can be
  given in a room without a handout. Still shared in person, not by email. The value never appears
  in this repo, in a commit, or in a transcript.

  This was a deliberate trade of a security property for classroom usability, and the property
  traded away is the important one to name: **rotation was the revocation path.** With a fixed
  passcode there is no date on which a leaked credential stops working. That shifts three things:

  1. **A leak is permanent until someone acts.** The remedy is no longer "wait for the block to
     end" — it is an explicit emergency rotation. That procedure is in
     `docs/RED_TEAM_RUNBOOK.md` under *Rollback*, and it is now the ONLY containment available.
  2. **Budget exposure compounds.** The `$20` hard cap is per `SP_ROTATION_ID`, not per passcode.
     A credential that survives rotation boundaries can burn a fresh cap each block. Watch the
     rotation ledger for usage that does not match a real cohort.
  3. **`SP_ALLOWED_ORIGINS` is doing more work than before.** It is the remaining boundary on
     casual misuse from a browser; curl is unaffected by it. Keep it tight, and remove
     `http://localhost:8888` when not actively testing.

  If the passcode is ever posted, screenshotted, or forwarded: change it that day and re-issue in
  person. Do not wait for a block boundary — there is no longer one that helps.

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
