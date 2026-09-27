# Interview Room red-team governance: staged cases and guided evidence

**Status:** conversation design and written spec approved by Joshua Moss, MD on 2026-09-26 Eastern time. Implementation plans drafted; no code implementation begun.
**Scope:** Interview Room case registration, red-team execution, and the red-team receipt.
**Starting point:** `main` at `ae992321` and open PR #841 at `2f93c558`. Recheck both before implementation. This spec changes no clinical wording, pack case, attestation row, deploy, or activation flag.

## 1. The problem and the evidence boundary

The current runbook requires three kinds of proof after a deploy affecting the Interview Room, model change, or pack change. Tier 1 exercises deterministic case and disclosure rules. Tier 2 exercises the deployed endpoint, including authorization and refusal of client-supplied state. Tier 3 requires a person to judge character, clinical boundaries, debrief accuracy, and operational behavior. Real-time voice adds the spoken checks in checklist section R. A passing script proves only its own tier; a Netlify `ready` deploy and a green health receipt prove neither clinical judgment nor spoken behavior.

Two workflow problems make the valid proof hard to produce:

1. **A new case has no green staging step.** With the rule proposed in #841, a `reviewed` case without a passing probe fails Tier 1. A `pending` case in the current reviewed pack fails `validate_attestation_consistency.py`. Probes added before the case fail because the case is absent. Putting content and red-team governance code in one PR violates the repository's L1 separation rule. The repo needs a state in which a case can be registered, unselectable, and visibly untested while a separate probe PR is prepared.
2. **The receipt can overstate what was checked.** `record_red_team.py` accepts `--state passed`, defaults its section list to A–E, and hashes the pack in the caller's checkout. `monthly_review.py` accepts a passed receipt when its date is after the pack's last change and its pack hash matches; it does not inspect the listed sections, the deployed revision, or the runtime model. No red-team receipt is tracked on `main` at this starting point. These are limits of the current contract, not evidence that a human review was skipped.

The intended outcome is one guided sequence that names what the machine proved, what the owner still has to examine, and the exact deployed object the owner signs. The sequence must remain usable without exposing the learner passcode, provider key, transcript, or patient-like text to an agent or a receipt.

## 2. Decisions

### 2.1 Stage a case as `pending` in the reviewed pack

The validator will accept a case with `facultyReview.status: "pending"` in a pack whose top-level status is reviewed. Only the exact `pending` value gains this exception. A pending case must have no claim of faculty sign-off in its per-case review fields. The pack's top-level review status continues to describe its **selectable reviewed cases**, and the validator must prove every selectable case is reviewed. The full pack bytes remain an `extraSources` input to the `sp-interview.html` attestation hash, so adding a pending case makes that tool's existing signature drift until the console re-attests the final pack.

This is a **selection rule**, not a privacy barrier. `sp-interview.pack.json` ships as a public learner-site asset; a person can fetch a pending synthetic case's raw JSON even while the UI and proxy refuse to select it. The content must therefore remain synthetic and free of PHI. If the owner requires pending case text to be absent from public assets, use an unshipped candidate file instead and revise this design before implementation.

The case landing sequence is:

1. **Content PR:** add the new case as `pending`. The UI, offline mock, typed proxy, real-time route, and direct case-ID requests must refuse it. Tier 1 lists the pending case and its gates as unevaluated, and may pass over the still-reviewed selectable cases. The report names the pending count; zero reviewed cases remains a failure.
2. **Governance PR:** add probes for that case in the red-team runner. Keep the probes separate from the clinical content PR under L1. A controlled test copy that changes only this case's status to `reviewed` exercises the candidate probes before promotion; the official run still reports the pending case as unevaluated. Candidate results cannot count as passing coverage of a selectable production case. The existing reviewed-case and per-(case, gate) checks from #841 remain mandatory.
3. **Promotion and faculty review:** after the probes pass, an owner-reviewed content PR changes the case to `reviewed` with its reviewer/date record. CI must fail that PR if any reviewed case or gate lacks a passing matching probe. The faculty console then re-attests the changed `sp-interview.html` pack hash; the per-case block remains registration under decision `pack-case-review-is-registration`.

The validator, runtime filters, and reports must use the same status meaning. Unknown status strings fail closed. A reviewed case requires its existing reviewer/date and speech-profile rules. No agent writes a faculty ledger promotion or represents a case registration as faculty sign-off.

### 2.2 Use a guided preflight and an explicit owner record

Provide one operator entry point with two phases:

- **Prepare (read-only):** identify the immutable SP proxy deploy ID and commit, the pack hash at that commit, the model pins and voice activation state that can be independently verified, and the current learner-site release revisions. Run Tier 1 against those exact pack/code bytes. Offer the existing Tier 2 script through its hidden passcode prompt; never take a passcode as a command argument or write one to a report. Print a short checklist of manual rows still due: A, the human C/D/E rows, and R when real-time voice is confirmed enabled. Include V if managed voice is enabled. Unknown flag or model state is **unverified**, not “not applicable.” Prepare writes only a local, content-free work file and cannot emit `passed`.
- **Record (owner action):** present every required manual row and collect a pass, fail, or blocked result plus a bounded reason for each. Ask the named owner to confirm the whole run after seeing the exact deploy, pack hash, model, and incomplete/failed rows. The recorder refuses `passed` if a required row is missing, failed, blocked, or bound to a different deploy or pack. It writes a content-free receipt at the existing `receipts/sp-red-team.json` path for a separate owner-controlled review/commit. A failure or partial run is recorded honestly without becoming a pass.

The receipt records a schema version, immutable deploy IDs/permalinks for the SP proxy and affected learner sites, deploy commits, deployed pack SHA-256, confirmed runtime model pins, checked-at time after publication, required and completed section IDs, mechanical result references, and signer. It contains no passcode, API key, request headers, learner text, patient replies, audio, or raw logs. The proxy and learner sites have different production branches today (`main` and `release`). A mismatch remains visible and cannot be described as a joint learner release. The `signedBy` field records the owner's declaration; the script cannot authenticate a clinical judgment by itself.

`monthly_review.py` validates the receipt's structure, required sections for its recorded activation state, deploy identity, pack/model equality with the verified deployed object, and time ordering. It reports `missing`, `incomplete`, `stale`, `mismatch`, or `current` with a named reason; it cannot determine whether the owner's clinical judgment was correct. A legacy receipt without the new fields is `incomplete` rather than silently upgraded. A missing deploy fact or inaccessible provider is `unverified`, never a pass.

The current full human checklist remains the required default after each deploy affecting the Interview Room on a learner or proxy site, model change, or pack change. This design improves execution and evidence binding. Any future change-based reduction of manual rows is a separate faculty policy decision with an explicit impact map and a fail-closed full-check fallback.

### 2.3 Keep activation separate

A current red-team receipt does not enable real-time voice. The existing privacy review, provider hard spending limit, model/rate-card checks, faculty speech audition, supervised headset and speaker pilot, and production-context activation flag remain independent gates. Section R is required for a spoken-room pass when the route is enabled; absence of R cannot be hidden by the recorder's A–E default.

## 3. Sources and ownership

| Fact | Authority | Change owner |
|---|---|---|
| Case text and per-case `facultyReview` registration | Canonical pack | Content PR and recorded faculty read |
| Which cases the learner tools and proxy can select | Pack status plus runtime filters | Code/content PR with denial tests |
| Tool/pack faculty attestation | `reviewed.json` and faculty console | Faculty console on `attest/pending` |
| Deterministic case/gate coverage | `bin/redteam-offline.mjs` and CI | Separate governance PR; #841 owns current corrections |
| Live human red-team outcome | Owner-run checklist and receipt | Joshua Moss, MD |
| What was actually served | Immutable Netlify deploy and release receipts | Deployment records and verifier |

The guided tool derives facts from these authorities and stores references. It must not create a second copy of faculty-review status in a release passport or treat a report as permission to deploy or activate. `decisions.json` needs an owner-approved entry or amendment for the pending-case exception because it changes the active `pack-case-review-is-registration` mechanics; an agent may draft that change but not decide it.

## 4. Failure behavior and proof

| Deliberate break | Required result |
|---|---|
| Add a pending case to a reviewed pack | Validator accepts only the explicit pending shape; every learner/proxy route denies selection; report names the unevaluated case and gates |
| Change that case to reviewed before its probes pass | Tier 1 and CI fail, naming the case and uncovered gates |
| Reuse a gate ID across cases | Only a passing probe that drove the same case receives credit (#841 contract) |
| Remove or duplicate a probe declaration, or spell an unknown case status | Fail closed; no green coverage over a smaller case/gate set |
| Run the receipt recorder with an uncompleted manual row or omit R while spoken voice is enabled | No passed receipt; monthly review reports incomplete |
| Test one deploy and record another, change pack/model after testing, or record before publication | No current receipt; exact mismatch or stale reason shown |
| Make deploy/model/voice state unavailable | Report unverified; no inferred pass |
| Run all mechanical checks without the human review | Mechanical results remain green; overall red-team state remains incomplete |

Tests use synthetic packs, fake deploy records, controlled activation states, and no live credential. A separate operator rehearsal exercises the hidden passcode prompt and a deliberately incomplete manual checklist without writing `passed`. A real production pass still requires the owner to perform the live checklist and sign the exact deployed revision.

## 5. Rollout and coordination

Implement after #841 is merged or its exact head is accounted for; do not edit its active red-team runner, checklist, runbook, or tests concurrently. #842 owns current faculty attestation writes. This spec is a new file in an isolated checkout and makes no change to either PR. The implementation plan should sequence the status/selection invariant before the guided receipt, keep content and governance PRs separate, and use the collision sentinel on every proposed edit path.

The first deployment of the guided recorder treats the absent/legacy receipt as incomplete. It does not create a retroactive pass. The owner can keep using the existing runbook until the new preflight and receipt validator are proven against deliberately broken fixtures and the live immutable deploy metadata. Only an owner-run full checklist produces the first `current` receipt.

## 6. Alternatives considered

- **Keep the strict pack validator and stage a case in an unshipped candidate registry.** This keeps pending bytes off public learner sites. It adds a second case source and a promotion/copy step; choose it if raw pending JSON visibility is unacceptable.
- **Allow case content and red-team governance tests in one PR.** This reduces PR count but weakens L1's independent review of content and the checks that judge it. Keep the separate PRs.
- **Shorten the human checklist based on a file diff now.** A file path alone does not establish whether model output, privacy, or voice behavior changed. Defer any narrower policy until exact-deploy evidence and a reviewed impact map exist.

## 7. Review questions for the owner

1. Is publication of a pending synthetic case's raw JSON acceptable while every learner/proxy selection path denies it? If not, choose the unshipped candidate alternative.
2. Should the first implementation retain the full manual checklist after every SP proxy deploy as this spec states? A narrower cadence would require a separate faculty policy decision.
