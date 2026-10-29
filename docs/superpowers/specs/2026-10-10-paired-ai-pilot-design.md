# Reading Companion and Faculty Evidence Brief: Paired Pilot

Status: proposed implementation design; feature selection approved in chat on October 10, 2026. This document plans implementation, not activation, clinical approval, or release. No provider requests or product changes were made while preparing it.

## Goal and plain-language design

Help learners understand a reviewed reading and help faculty examine changed evidence with less clerical work. The app chooses a small, permitted set of source passages; AI explains those passages; ordinary code checks references, scope, and freshness. Faculty still judges meaning. A valid quotation does not establish that the explanation is correct.

The first learner experience is a protected, text-only page in the existing Interview Room preview site. The first faculty experience is a button inside the existing evidence inbox. They share a small source-reference contract and bounded OpenAI transport, while keeping separate authentication, prompts, response schemas, and usage budgets.

## Evidence used to prepare this design

Repository baseline: refreshed `origin/main` at `78082c882be9aff968e14c0bcf34ded48981de50` (October 8, 2026). Recheck current main and path overlaps before implementing. This is source inspection, not proof of live feature activation.

| Confirmed source fact | Design consequence |
| --- | --- |
| `sp-preview/lib/openai-provider.mjs` already uses Responses, structured output, `store:false`, bounded requests, and server-held credentials. | Follow its transport conventions in a separate module; do not weaken moment or patient schemas. |
| `sp-preview` is same-origin, has an exact public-asset allowlist, and is a separate Netlify site. | Put the first companion there; no learner-site CORS/CSP expansion or new hosting site. |
| `pg_interview.md` is shipped to both audiences; its source attestation is BOUND at `a341d44a4006f6e773948d77f533c533bf627973`, reviewed September 21. | Use a narrow, attributed snapshot of this existing source; verify again before extraction. |
| The current evidence GET calls `ensureBranchFresh()` before reading. | The new brief route must return before that mutation path and use a read-only repository capability. |
| Current Firecrawl inbox is live, generated October 5, with five unchanged observations, zero change packets and zero failures. The faculty decisions array is empty. | There are no five resolved cases available here. Corpus recovery and faculty labeling are required work, not an assumed completed input. |
| Packets can contain mapped passages and a shortened display diff without complete historical source snapshots. | Track supplied-packet completeness separately from historical context and clinical impact. |

Implementation plans: [Reading companion](../plans/2026-10-10-reading-companion-pilot.md) and [Faculty evidence brief](../plans/2026-10-10-faculty-evidence-brief-pilot.md).

## Scope A: reading companion

Audience for the first facilitated pilot: MS3 learners. The source happens to ship on both sites; this does not authorize resident-facing rollout.

Source: `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md`, slug `pg_interview.md`. Extract these four headings only, stopping at the next level-two heading: `The Interview Frame`, `High-Yield Opening Questions`, `Trauma-Informed Moves`, and `Closing The Interview`. Keep source wording and attribution. Exclude the iframe, safety assessment, withdrawal, MSE instruments, external papers, and other sections. Faculty verifies the chosen excerpt before pilot activation.

The source viewer displays the excerpt and its snapshot/review dates. Five preset buttons:

| ID | Button | Allowed answer |
| --- | --- | --- |
| `frame` | Explain the four parts of the opening | Plain-language explanation of role, purpose, time, and consent. |
| `opening` | Summarize these opening questions | A short paraphrase of what the listed questions ask; no invented efficacy claims. |
| `permission` | Explain the trauma-informed moves | Paraphrase the selected moves with citations; no new clinical recommendations. |
| `closing` | Summarize how to close | Explain the source's summary, correction invitation, and next step. |
| `recall` | Check my recall | Show the authored question “What four things should the opening cover?”; a separate Reveal button shows a generated source-backed explanation. No submitted learner answer or score. |

No free-text box, selected-passage upload, microphone, conversation history, patient scenario, automated grade, or saved learning record. The browser sends only identifiers. Clear/navigation removes the answer from memory. “AI-generated explanation of the source snapshot” labels every answer; it never inherits the page's faculty-attestation badge.

One accessible results area, explicit loading/cancel/unavailable states, and source quotations expanded by default. Source links come from the trusted manifest, never from model output. The protected page has no ordinary learner-navigation entry during the facilitated pilot.

## Scope B: faculty evidence brief

One `Prepare AI brief` button per eligible existing evidence packet. Three areas: `What changed`, `Teaching to examine`, and `What still needs checking`. Existing comparisons and disposition forms remain intact. Generating a brief never preselects a disposition, fills the rationale, writes to the repository, creates a branch/PR, signs content, or produces replacement teaching paragraphs in v1.

The browser sends the packet identity and displayed revision receipt, not text. After existing faculty authentication, the console server loads the authoritative packet and current teaching from exact commits through a capability exposing only `headOf`, `read`, and `readRaw`. It verifies an explicit pilot source/packet allowlist and rights record. Only permitted source passages and necessary teaching fields enter the context. No faculty identity, rationale, password, GitHub credential, or learner material reaches the provider.

The console forwards the context server-to-server to a new dedicated function on `sp-preview`. An HMAC envelope authenticates the request; the provider key stays on the preview service. This function does not reuse or relax the Dana browser handler. The console rechecks report, teaching, registry, and applicable policy revisions after generation and discards a changed result as stale.

Every target in the deterministic input inventory must appear exactly once in the result, including a source-level target when no teaching is localized. Missing, duplicated, or invented targets reject the whole result. The inventory describes known packet targets, not every possible curriculum dependency.

Four separate coverage facts accompany the prose:

1. Collector scan status and examined/eligible question counts.
2. Mapping status, including unavailable or not configured.
3. Expected/included target counts for this supplied packet.
4. Historical source context: `full`, `supplied-excerpt`, or `unavailable`.

An excerpt-only packet can receive a clearly limited brief, but cannot be described as a complete source review. Unknown rights, no usable source text, missing target revisions, or an oversized context stop before a paid call. Never substitute a latest snapshot for a packet's historical new-source revision.

## Shared implementation contracts

### Deployment and capabilities

Keep `sp-preview` on Node 22 and the faculty console on its existing Node 24 setting. Use native `fetch` and JSON Schema; add no agent framework, vector database, hosted file store, retrieval service, or conversation API for this bounded pilot. Use a separate provider module under `sp-preview/lib/ai-pilot/`; leave the existing actor, speech, and moment adapters behaviorally unchanged.

Retain the existing text-model snapshot `gpt-5.4-2026-03-05` as the first evaluation baseline. Confirm availability and structured-output compatibility during the authorized live evaluation; an unavailable model is a recorded blocker, not silent substitution. A model/prompt change reruns the fixed evaluation set. Model selection is an evaluation decision, not an implementation prerequisite requiring a speculative upgrade.

| Proposed setting | Purpose |
| --- | --- |
| `READING_COMPANION_ENABLED=false` | Default-off learner endpoint. |
| `FACULTY_EVIDENCE_BRIEF_ENABLED=false` | Default-off on both console and preview; both must be enabled. |
| `AI_PILOT_READER_PASSCODE` | Dedicated pilot access, held in browser memory and sent in `x-ai-pilot-key`; no reuse of faculty credentials. |
| `AI_PILOT_RELAY_SECRET` | Separate random server-only HMAC secret on console and preview. |
| `AI_PILOT_SERVICE_URL` | Exact allowlisted preview function URL on console; never supplied by the browser. |
| `AI_PILOT_PROVIDER_KEY` | Server-only provider credential on preview, provisioned only through the authorized key workflow. |
| `AI_PILOT_BUDGET_NAMESPACE` | Stable prefix with separate `/reader` and `/faculty` records; never deployment-derived. |
| `AI_PILOT_EXPIRES_AT` | Required UTC instant, at most 14 days after the approved start; missing/expired fails closed. |

Reader: at most 20 paid attempts/day and 5/rolling 30 minutes. Faculty: 10/day and 2/rolling 30 minutes. Enforce with durable atomic reservations before calling the provider, separate from all existing SP ledger records. Failures and cancellations remain charged; retries are explicit new attempts. A duplicate request ID with the same context returns `already_submitted` without another call; the same ID with different context returns conflict. Retain operation hashes for 15 days, covering the full trial plus one day, and never clear them to renew capacity. Do not persist answers to replay them.

Reader input context: at most 12,000 characters; faculty context: 24,000 characters. Reject oversized input without truncation. Maximum output tokens: reader 1,400; faculty 2,500. Timeout: 25 seconds per provider request, bounded response body 64 KiB, no automatic retries, no tools, `store:false`, no `previous_response_id`, and no tracing of prompt/response bodies. Abort where supported; cancellation does not promise cancellation of provider billing. Pilot cost is measured from actual token usage; request caps are not provider-wide dollar caps.

### Evidence and provider output

Each authoritative context contains evidence units `{id, text, sourceRef, revision, sectionId}` plus an exact target inventory for briefs. Model statements contain `{text, evidenceIds}`. At least one valid evidence ID is required per substantive statement. Quotes and links are rendered by looking up server-owned units; models never author URLs or quotation offsets. Unknown IDs, missing citations, incomplete/refused provider responses, or invalid schema are unavailable, never shown partially. This proves attribution mechanics, not semantic entailment.

The provider returns structured data only. Application-owned metadata, coverage, source hashes, revision receipts, and status are not taken from generated prose. All display text uses text nodes, not HTML insertion. Retrieved text is untrusted data and cannot alter instructions, invoke tools, or add recipients.

### Freshness and source rights

The reader is explicitly an immutable, dated educational snapshot, not a continuously current clinical answer service. Its bundled source hash must match the client, approved excerpt manifest, and build receipt. At each facilitated session start, the facilitator checks that the source still binds against current main; drift, withdrawal, or unavailable verification stops that session until the pack is rebuilt/reviewed. This check is operational in v1, not falsely represented as runtime monitoring. Endpoint disablement and the 14-day expiry provide withdrawal controls. Public or unattended expansion requires an automated current-eligibility check.

Source-pack generation is isolated from existing room availability: a disabled pilot with an ineligible source produces an unavailable sentinel, not an old pack or a blocked room build. An enabled pilot build requires valid source eligibility. Generated packs and evaluation artifacts receive explicit ignore rules; evaluation directories/files use 0700/0600 permissions. The console build-ignore scope includes the shared contract so it cannot silently miss a dependency update.

The faculty brief uses live, exact revision captures with before/after checks. Allowlist records must explicitly permit the selected excerpts to be sent to the provider. `full_text` surveillance collection permission alone is not permission to upload an entire source. Exclude `signal_only`, uncertain rights, and restricted instrument item text. Use `evidence_registry.json` as authority, not retired YAML.

No PHI, no learner free text, no persistent provider conversations, no automatic disposition/attestation, no new analytics. Budget records contain request/context hashes and counters/times, not source text or identities. Evaluation artifacts may retain approved source excerpts and synthetic outputs in the protected evaluation folder; they contain no participant identities or learner responses. App non-retention is separate from provider retention; do not claim Zero Data Retention without verified account controls.

### Faculty relay envelope

`payload` is a base64url encoding of the exact UTF-8 JSON payload bytes; `signature` is HMAC-SHA256 over those encoded bytes. Payload includes `version:1`, `purpose:"faculty-evidence-brief"`, `method:"POST"`, exact configured endpoint audience/path, issuer `faculty-console`, `issuedAt`, `expiresAt` (90 seconds), UUID `requestId`, `contextDigest`, and bounded context. Verify constant-time signature, strict schema, purpose/audience, time range, digest, allowlist, and size before durable quota reservation or provider access. Reject browser Origin headers on this server-only route; disable redirects on the relay. The envelope is never returned to the browser or logged. A short expiry does not replace atomic replay prevention.

## Evaluation and rollout

### Reference material before live calls

Reader: faculty reviews the four selected sections, five presets, and expected answer/abstention criteria. Run 15 generated answers (five presets x three repetitions) and ten deterministic negative tests covering invalid requests, changed source hashes, injection-shaped source text, unavailable sources, malformed output, and paid-call suppression. Human semantic review covers every generated answer.

Faculty: recover five real historical source changes with exact old/new provenance and relevant teaching; faculty labels the expected implications before seeing AI output. A recovered example is not called “previously resolved” without its original decision receipt. Add two unchanged controls and three failure controls (missing context, unmapped target, and misleading/injected source text). Store case IDs, source/teaching hashes, rights receipt, expected findings, and limitations. Synthetic fixtures can verify plumbing immediately but do not replace five real cases for clinical-quality claims. Historical evaluation contexts use a separate offline runner; never masquerade as current live inbox packets.

Every live evaluation attempt reserves against the applicable durable pilot ledger before contacting the provider, sharing the same cap as deployed calls. Local/in-memory accounting is allowed only for mocked tests. Missing access to the designated durable store blocks live evaluation; it never permits a new unapproved allowance.

### Proposed acceptance thresholds

| Measure | Required for a facilitated pilot |
| --- | --- |
| Credentials, boundaries, replay and budget | All deterministic tests pass; forbidden/disabled/stale requests make zero provider calls. |
| Citations and inventory | All displayed reference IDs resolve; all expected packet targets represented; all missing context visible. |
| Clinical/source faithfulness | Zero critical misleading statements or missed faculty-designated critical implications in the fixed set; failures stop and require repair/retest. |
| Reader usefulness | Faculty rates at least 12/15 outputs useful with no more than minor wording edits. |
| Brief usefulness | At least 4/5 real-case briefs usable without substantive correction; all unsupported statements recorded. |
| Faculty time | Compare median time to the same verified decision with vs. without a brief; target 20% reduction with no loss in correctness. Small sample is directional, not efficacy proof. |
| Usability | Complete keyboard operation and 320px layout; explicit loading, cancel, retry, stale and disabled states; no console errors. Native screen-reader acceptance remains a separate recorded check. |
| Performance | Measure all attempted requests, including failures. Target reader median <=8 s and maximum <=25 s; faculty maximum <=25 s. These are targets, not measured performance. |

For timing, use two faculty reviewers when available, counterbalancing assisted/unassisted cases, then crossing over after a delay; record order effects. If only one reviewer is available, label the result an unblinded feasibility observation and do not claim a reliable percentage benefit. Keep only task durations and correctness ratings in the evaluation report.

Sequence: shared contract and source pack -> offline mocked reader -> offline mocked brief -> faculty-labeled corpus -> authorized limited provider evaluation -> protected facilitated sessions with 3–5 MS3 volunteers and 1–2 faculty over 14 days -> written continue/revise/stop decision. Schedule begins after the reference corpus and activation conditions exist; these dates are not a promise to start today.

The live session needs an explicit activation receipt: owner-approved data flow/provider terms and spending scope, selected source/excerpt approval, evaluation result, feature/model/prompt/source revisions, enabled endpoints, exact deployed revision, and served verification. This is a new pilot's go/no-go record, not a restoration of the retired Interview Room red-team sign-off. No clinical attestation is produced by these tests.

If quality passes but time does not improve, simplify or stop the brief. If the reader is useful but runtime variation is poor, the next option is pre-generated, faculty-reviewed explanation cards using the same presets and source receipts. Innovative follow-on after this pilot: “same idea, different situation” using a faculty-authored case variation; excluded from v1.

## Delivery and verification boundaries

Two independently reviewable implementation tracks follow this spec. Keep faculty-console/governance changes in a governance PR and learner/server/source-pack content changes in a separate content PR; run the repository classification gates against exact proposed paths before committing. Changes to CI/verify enrollment are a separate governance change when required. No hand-edited generated learner builds, ledger promotion, baseline cap increase, or policy bypass.

Run focused contract tests first, then the existing preview regression suite, affected browser journeys, and the required full `bin/verify.sh`/CI checks. Record local tests, CI, preview deployment, enabled state, served revision, native accessibility, and faculty judgment separately. The documentation baseline is not an implementation or deployment receipt.

## Official references checked October 10, 2026

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): schema adherence and refusals; correctness still requires evaluation.
- [Data controls](https://developers.openai.com/api/docs/guides/your-data): response storage settings and provider retention are different controls.
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): task-specific examples, fixed objectives, human calibration, and repeated evaluation.

The design uses these interfaces conceptually; provider account access and live behavior have not been verified.
