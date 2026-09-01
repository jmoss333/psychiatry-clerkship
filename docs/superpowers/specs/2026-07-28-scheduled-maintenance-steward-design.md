# Scheduled Maintenance Steward — Design

**Date:** 2026-07-28
**Owner:** Joshua Moss, MD
**Scope:** Psychiatry Clerkship Library, its two learner sites, and the Interview Room proxy

## Decision

Build one layered maintenance steward with repository-native schedules for deterministic checks and
Codex heartbeats for checks that must remain independent of GitHub Actions or need authenticated
connectors. The system observes, validates, creates bounded receipts or review evidence, and routes
work for human review. It never edits clinical teaching content, marks content reviewed or attested, enables managed
voice, refreshes visual baselines, or invents rotation dates.

This design deliberately repairs the existing surveillance spine before adding more schedules. The
current link and citation workflows can overwrite one another, successful checks with no findings do
not advance freshness, the status page is based on report-local status rather than current GitHub
issue state, and scheduled report publication attempts to push directly to protected `main`.

## Goals

1. Make every scheduled run distinguish a clean check from a missing, malformed, or failed
   collector.
2. Keep protected `main` protected while preserving a reviewable, git-native surveillance audit
   trail.
3. Exercise both production learner sites daily at the HTTP, rendered-navigation, security-header,
   search-index, and deployed-media layers.
4. Exercise the authenticated Interview Room health route every six hours without a model call,
   transcript, learner record, or provider charge.
5. Re-run the complete release gate weekly on a fresh Ubuntu runner without automatically updating
   snapshots.
6. Produce weekly governance and monthly evidence/operations digests that route decisions to faculty
   without asserting clinical authority.
7. Produce a rotation-readiness passport seven days before a configured block and a single honest
   `configuration_required` state when no block dates are known.
8. Detect missed or stale automation from outside GitHub Actions.
9. Emit a content-free “release twin” receipt that identifies drift without storing clinical text,
   credentials, learner activity, or PHI.

## Non-goals

- No automatic curriculum edits, evidence mapping decisions, question attestation, page review
  stamps, or issue closure.
- No automated passcode, operations-key, provider-key, or rotation-ID generation or rotation.
- No synthetic calendar anchors. Rotation dates must be explicitly configured or found in a
  connected authoritative calendar.
- No automatic screenshot-baseline refresh.
- No live model conversation, evaluation, transcription, synthesis, or other paid provider call.
- No claim that a local or static green run proves a hosted production flow is healthy.
- No learner analytics, transcripts, messages, case activity, or patient data in reports.

## Schedule matrix

All GitHub and Netlify cron expressions run in UTC. Human-facing Codex heartbeats run in
`America/New_York`.

| Layer | Cadence | Cron / local rule | Execution home | Mode |
|---|---:|---|---|---|
| Link surveillance | Monday 06:00 UTC | `0 6 * * 1` | GitHub Actions | Issues + artifact + rolling review PR |
| Citation surveillance | Monday 07:00 UTC | `0 7 * * 1` | GitHub Actions | Issues + artifact + rolling review PR |
| Guideline surveillance | First day monthly, 06:00 UTC | `0 6 1 * *` | GitHub Actions | Issues + artifact + rolling review PR |
| Resource intake | On demand only | Manual dispatch | GitHub Actions | Issues + 90-day artifact + rolling review PR |
| Interview Room authenticated health | Every 6 hours | `0 */6 * * *` | Netlify scheduled function | Durable content-free receipt |
| Interview Room health receipt monitor | Every 6 hours, 15 minutes later | `15 */6 * * *` | GitHub Actions | Alert-only + 90-day artifact |
| Production learner canary + release twin | Daily 09:20 UTC | `20 9 * * *` | GitHub Actions | Alert-only + 90-day artifact |
| Internal workflow heartbeat | Daily 10:45 UTC | `45 10 * * *` | GitHub Actions | Alert-only + receipt |
| Clean-room full release rehearsal | Sunday 08:00 UTC | `0 8 * * 0` | Existing CI workflow | Alert-only |
| Faculty governance digest | Monday 12:30 UTC | `30 12 * * 1` | GitHub Actions | Rolling faculty issue + 90-day artifact |
| Evidence and operations review | First day monthly, 13:00 UTC | `0 13 1 * *` | GitHub Actions | Rolling faculty issue + 90-day artifact |
| Rotation-readiness evaluator | Daily 13:15 UTC | `15 13 * * *` | GitHub Actions | Issue only when due/overdue |
| External automation deadman | Daily 08:30 local | Calendar-local daily | Codex heartbeat | Notify only on stale/failure |
| External policy/provider/Zotero review | First Tuesday 09:00 local | Calendar-local first Tuesday | Codex heartbeat | Monthly review proposal |
| Rotation-date/readiness follow-up | Monday 09:15 local | Calendar-local Monday | Codex heartbeat | Notify only when actionable |

GitHub schedules become active only after their workflow files reach the default branch. Codex
heartbeats may be activated immediately, but they must label repository-native schedules as
`pending_merge` until the default branch contains them.

The Codex rows are target controller configurations, not repository jobs. Their current active,
paused, and next-run state must be verified in the Codex automation control plane.

## Architecture

### 1. Repair the surveillance truth chain

`citation-monitor` becomes a distinct job identity and writes
`citation_audit_YYYY-MM-DD.{json,csv}`. Link monitoring remains
`link_audit_YYYY-MM-DD.{json,csv}`.

Every collector writes a checked-source JSON array even when it emits zero findings. `sync_findings`
accepts that file through `--checked-sources`, validates it as a unique array of non-empty strings,
and advances `last_run.json` from the checked list rather than from the findings list. A missing,
empty-by-error, or malformed collector output fails visibly.

`sync_findings` also writes a normalized snapshot of every surveillance-labelled GitHub issue it
read or created. `build_status.py --issues-json <path>` loads all relevant report history, overlays
current issue state by fingerprint, excludes closed issues from the active queue, and retains
unissued overflow findings. Without an issue snapshot it keeps a clearly labelled legacy/offline
mode.

Generated surveillance state is published to one rolling branch,
`automation/surveillance-inbox`, and one review PR. A helper hydrates only these generated paths from
an existing open inbox before a collector runs:

- `13_Faculty_Resources/_automation/surveillance/history/**`
- `13_Faculty_Resources/_automation/surveillance/STATUS.md`
- `13_Faculty_Resources/_automation/surveillance/status.html`

The helper rejects any inbox branch whose diff contains another path, captures the exact remote SHA,
and publishes with an exact `--force-with-lease`. All surveillance workflows share one concurrency
group. They never push to `main`. Reports are also uploaded as immutable workflow artifacts so a PR
publication failure cannot erase the run evidence.

### 2. Interview Room health without a second secret

Add `sp-health-canary.mjs` and `sp-health-status.mjs` beside the existing Netlify functions. The
canary is a published-deploy-only scheduled function with cron `0 */6 * * *`. It reads the already
configured `SP_STUDENT_PASSCODE`, requires the exact canonical learner origin
`https://une-ms3-psychiatry.netlify.app` to be present in `SP_ALLOWED_ORIGINS`, and then performs an
authenticated `GET` to the public `/api/sp` route. It never accepts an arbitrary first HTTPS origin.

The canary accepts only:

- HTTP 200;
- `schemaVersion === 1`;
- equal, non-empty actor and evaluator model pins;
- a non-empty pack version;
- a known pack status: `draft-pending-attestation`, `reviewed`, or `attested`;
- at least one reviewed case with a unique non-empty ID.

The receipt sets `learnerReady: true` only for `reviewed` or `attested`. The repository's current
pack is intentionally `draft-pending-attestation`; that is a healthy authenticated connection with
`learnerReady: false`, not an infrastructure outage and not permission to use live actor POSTs. An
unknown status remains a failure; the release twin separately records the canonical expected
pack/model contract for review.

The request is a GET, so it cannot invoke the actor, evaluator, budget ledger, or a speech provider.
An integration test calls the real `createSpHandler` health route with fakes and asserts zero actor,
evaluator, budget, ticket, transcription, synthesis, and provider calls.

Each invocation writes one bounded receipt to the site-scoped, strong-consistency Netlify Blob store
`sp-health-canary` at key `latest`. A successful receipt contains only schema version, state,
learner-ready boolean, case count, UTC checked/next-run timestamps, and SHA-256 identifiers for the
model/pack contract. On a validation failure, the function best-effort writes a receipt containing
only a bounded failure code and timestamp, then throws so Netlify also records a failed invocation.
It must never store or log request headers, passcodes, URLs containing credentials, raw model or
pack identifiers, case content, exception messages, or learner activity.

The public GET-only `/api/sp/health-status` function reads that receipt and returns only its bounded
content-free fields with `Cache-Control: no-store`. Missing or malformed state returns a failure
status; no credential is required because the receipt contains neither clinical content nor secret
material. A success is current only while both conditions hold: it is no more than eight hours old,
and current time has not passed its recorded `nextRun` by more than ten minutes. A GitHub workflow
runs at `15 */6 * * *`, uploads the normalized result for 90 days, and fails on missing, late-slot,
stale, or failed state. Thus a prior success cannot hide one missed six-hour invocation or a later
Blob-write failure. This makes a Netlify invocation failure visible in GitHub rather than relying on
someone to inspect function logs. The independent Codex deadman checks the same receipt and the
authenticated Netlify deploy/function inventory.

### 3. Daily production canary and release twin

The existing Playwright `nav-ms3` and `nav-res` projects run against the two public production URLs.
They retain their one CI retry and exercise every nav target plus representative rendered flows.

A new standard-library Python canary additionally:

- validates root `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, and exact
  cache contracts: root and `nav.json` include `public,max-age=0,must-revalidate`,
  `search-index.json` includes `public,max-age=86400`, and deployed media includes
  `public,max-age=604800`;
- downloads and validates `nav.json` and `search-index.json`;
- reads only `served: true` media paths from `media_manifest.json`;
- requests at most the first 512 bytes of each deployed media object using a Range header and closes
  the response without downloading the full object;
- rejects non-200/206 responses, Git LFS pointer headers, implausibly short assets, and invalid media
  content types;
- requires each media response to include a full-object length in `Content-Range` and a quoted,
  strong (non-`W/`) `ETag`, then hashes the sorted tuple of path, full length, ETag, and prefix
  SHA-256. The aggregate is an integrity-drift identifier; the strong ETag covers changes outside
  the downloaded prefix.

The resulting release-twin JSON is content-free:

```json
{
  "schemaVersion": 1,
  "generatedAt": "UTC ISO-8601",
  "sourceSha": "40 lowercase hex characters",
  "sites": [
    {
      "name": "ms3",
      "baseUrl": "https://une-ms3-psychiatry.netlify.app",
      "navSha256": "64 lowercase hex characters",
      "searchSha256": "64 lowercase hex characters",
      "navItemCount": 1,
      "mediaChecked": 1,
      "mediaIntegrityAggregateSha256": "64 lowercase hex characters"
    }
  ],
  "expectedSp": {
    "packSha256": "64 lowercase hex characters",
    "packVersion": "non-empty string",
    "packStatus": "draft-pending-attestation, reviewed, or attested",
    "learnerReady": false,
    "actorModel": "non-empty string",
    "evaluatorModel": "non-empty string"
  }
}
```

Hashes are identifiers, not claims of clinical approval. The external heartbeat adds live Netlify
deploy SHAs and function inventory to its comparison because those require authenticated control
plane access.

### 4. Internal heartbeat and external deadman

The repository heartbeat queries GitHub’s Actions API with the built-in token and evaluates the
latest completed scheduled run for each expected workflow. It fails when a run is absent, too old,
or concluded other than `success`. First-run grace is explicit: an exact workflow version introduced
less than its allowed age ago may report `pending_first_run` without failing. After confirming that
the parsed `HEAD` workflow contains the expected cron, activation is the oldest commit in the current
first-parent suffix whose workflow Git blob exactly equals the blob at `HEAD`. Any workflow-byte
change, including one that retains the cron, starts a new activation window. Activation always
follows the resulting first-parent path history rather than an assumed authoring or rebase date.

The API `head_sha` is validated for provenance but omitted from the bounded receipt. A completed run
qualifies only when it was created and updated on or after activation, its head commit descends from
the activation commit, and the workflow blob at that run head exactly equals the activation blob.
This handles a schedule added to an older file, same-cron workflow changes, and remove/re-add cycles
without inferring activation from file creation or the design date. Missing or malformed API, YAML,
git, ancestry, or blob proof blocks rather than granting indefinite grace.

The Codex heartbeat is the independent deadman. It reads the current default-branch workflow runs,
the latest release-twin artifact, open automation/surveillance issues, and authenticated Netlify
deploy metadata for these immutable site IDs:

- MS3: `94717a39-679b-4c78-ae02-7b19e809592e`
- residents: `af64d5d4-e0b5-4f03-9857-be40e3b48329`
- SP proxy: `455d2740-4020-4d9c-b9f8-82f72f4b2897`

It compares branch, ready state, commit relationships, learner-site function absence, SP function
presence, and known path-aware deploy skips. It reports only confirmed drift, stale checks, missing
artifacts, or unavailable control planes. It performs no deploy and changes no configuration.

### 5. Weekly clean-room release rehearsal

Add the Sunday schedule to the existing CI workflow so the same authoritative jobs run on a fresh
Ubuntu runner:

- validators and evidence/provenance gates;
- root Node tests;
- SP proxy and prototype tests;
- sequential `build_and_check.sh ms3`, then `build_and_check.sh res`;
- full Playwright smoke and resident visual regression suite.

The scheduled run never invokes the visual-baseline refresh workflow. A visual mismatch remains a
failure requiring human review. The workflow contract gate proves both authoritative jobs are
reachable for the `schedule` event, `smoke-tests` still depends on `build-test-validate`, no
job-level condition excludes scheduled runs, and the LFS project receives the production learner
URLs for scheduled and manual-equivalent runs. A post-merge manual-equivalent dispatch must show
both jobs and every required release-gate step as executed rather than skipped.

### 6. Weekly governance digest

The governance digest imports the real qbank assessment rules and reads the canonical registries. It
reports:

- attestation-consistency errors from the existing validator;
- question-bank total, draft, attested, ready, warned, and blocked counts;
- IDs of blocked questions and the warning count, without reproducing stems or answers;
- topic metadata completeness, grouped by high-risk versus other topics;
- reviewed-ledger coverage and pages already queued for re-attestation.

The scheduled workflow fails only for attestation inconsistency or blocked active questions. Drafts,
warnings, and optional metadata gaps are review queues, not automated clinical errors. It uploads
JSON and Markdown and never modifies `question_bank.json`, `reviewed.json`, `topic_meta.json`, or
clinical pages. When review or blocking items exist, it uploads the artifact first, captures the
returned artifact URL, and then creates or updates one rolling GitHub issue identified by a fixed
HTML marker. The issue contains only counts, safe IDs, and the run/artifact link; it never closes
itself or asserts faculty review.

### 7. Monthly evidence and operations review

The monthly report runs the evidence registry’s existing generated-view validator, then reports:

- evidence identity states, faculty-review status, cadence due/overdue counts, and local-policy-
  dependent sources;
- new media-accessibility regressions separately from existing documented debt;
- age of an allow-listed set of operational runbooks from git history;
- whether the APA refresh prerequisite `library_crosswalk.csv` is still missing;
- whether the OpenEvidence scanner has a recent content-free run receipt;
- current expected SP pack/model hashes and whether a content-free red-team receipt is newer than
  the latest pack change in git.

Existing accessibility debt and unavailable attended-only checks do not fail the workflow. A new
learner-facing media item without its required text alternative/caption record, a broken generated
evidence view, or a false “recent review” claim does fail. Provider-policy and local Zotero checks
remain a monthly Codex read-only review because the GitHub runner cannot authenticate to those local
or external sources. The GitHub workflow uploads its artifact first and then creates or updates one
rolling faculty-review issue with the captured artifact URL when review or blocking items exist. The
external deadman, which has authenticated Netlify control-plane access, separately compares the
red-team receipt with the latest SP deploy timestamp/commit; GitHub never claims deploy recency
without that data source. Heartbeats produce proposals, never registry edits.

### 8. Rotation-readiness passport

`rotation_blocks.json` is the only repository source of block dates. Its v1 records contain only:

- `id`: non-identifying stable identifier matching
  `^rot-[0-9]{4}-hx-(?=[a-f0-9]{16}$)(?=[a-f0-9]*[a-f])(?=[a-f0-9]*[0-9])[a-f0-9]{16}$`;
- `startsOn`: ISO date;
- `endsOn`: ISO date;
- `status`: `planned`, `active`, or `completed`.

Names, emails, learner IDs, clinical assignments, patient data, and credentials are forbidden.
The validator rejects malformed dates, duplicate IDs, blocks shorter than 35 or longer than 49
calendar days, and overlapping planned/active blocks. That bounded window catches obvious data-entry
errors without assuming whether an institution counts the final weekend as part of a six-week block.
The explicit `hx-` token, fixed length, and mixed letter/digit requirement reject names, emails, and
plain numeric institutional IDs such as `rot-2026-joshua` and `rot-2026-12345678`. Automation still
treats the value as opaque and cannot prove what a human chose to encode.

The daily evaluator writes one of `configuration_required`, `not_due`, `due`, `overdue`, `active`,
or `complete`. Exactly seven days before a planned block it creates or updates one GitHub issue
containing a manual checklist:

- issue a new non-identifying `SP_ROTATION_ID`;
- rotate the learner passcode and separate operations credential;
  > **Superseded 2026-08-31.** SP_STUDENT_PASSCODE is now fixed and non-rotating (Joshua Moss, MD); rotation was the revocation path, so this item became "rotate the separate operations credential" plus an origins-hygiene and a ledger-watch item. Live text: `rotation_readiness.py::MANUAL_CHECKLIST`. Rationale: `sp-proxy/README.md`, "Passcode policy".
- preserve the prior content-free usage receipt;
- run the Interview Room red-team checklist and golden transcript;
- verify the latest production canary, release rehearsal, governance digest, and attestation gate;
- confirm managed voice remains disabled unless all external faculty/privacy gates are recorded.

No credential value appears in the issue or artifact. The evaluator may return exit 10 to signal
`due` or `overdue`, but the workflow captures that code, routes the issue, uploads the passport, and
then concludes successfully; only malformed/privacy-invalid input concludes as workflow failure. An
empty block list is honest and quiet: the workflow uploads `configuration_required` but does not
create a daily issue. The weekly Codex follow-up searches a bounded calendar window and asks for a
date only when it can materially improve the passport. It requests a faculty-supplied opaque ID
rather than generating one.

## Failure and notification semantics

- Collector missing/malformed output, production flow breakage, new media accessibility regression,
  blocked active qbank item, or attestation inconsistency: workflow failure.
- External link/provider transient behavior: governed by existing retry and browser-required rules.
- Draft/warned qbank items, optional topic metadata gaps, existing accessibility debt, stale
  attended-only work, or missing future rotation dates: successful run with an explicit review item.
- Every workflow uploads its diagnostic artifact with `if: always()`.
- Governance and monthly review queues are delivered through rolling, content-free faculty-review
  issues; automation never closes those issues or records a faculty decision.
- The independent deadman uses failed-runs-only notifications. Monthly review and actionable
  rotation follow-up use normal notifications.

## Security and privacy

- Built-in `GITHUB_TOKEN` permissions are least-privilege per workflow.
- `APIFY_TOKEN` remains limited to guideline/resource crawling.
- No new GitHub secret is required for the SP canary; it runs inside the existing Netlify
  environment.
- No Netlify token is copied into GitHub; authenticated deploy checks use the connected Netlify
  control plane from the external heartbeat.
- No workflow prints environment values. Secret names may be reported; values may not.
- Every third-party action in a modified or new workflow is pinned to a live-verified immutable
  commit SHA with its semantic tag in a comment. Artifacts use the verified
  `actions/upload-artifact` v7 commit and the repository-supported 90-day maximum retention.
- Maintenance receipts and fixtures are synthetic or exclude clinical teaching content.
  Surveillance evidence may retain complete normalized text for authoritative public sources
  configured as `full_text`, plus bounded change excerpts; `signal_only` sources remain hash-only.
  No report or fixture may contain PHI, learner identity, credentials, or real patient data.

## Acceptance criteria

1. Link and citation dry runs on the same date create different report names.
2. A zero-finding run advances every checked source and a malformed checked-source file fails.
3. A closed GitHub issue disappears from active status even when its historical report says open.
4. No surveillance workflow contains a push to `main`; all share the inbox concurrency group and
   upload artifacts.
5. The report-branch helper rejects an out-of-scope path and uses an exact force-with-lease.
6. The SP canary test proves GET-only behavior against the real handler, zero provider/budget/speech
   side effects, exact canonical origin selection, exact health validation, redacted durable
   receipts, and the six-hour schedule.
7. A public content-free status receipt plus the six-hour GitHub monitor turns a missing, missed-
   slot, stale, Blob-write, or failed Netlify invocation into a visible failed check without another
   secret.
8. Production canary tests reject LFS pointers, missing security/cache headers, malformed
   nav/search, missing or weak ETags, and invalid media while producing a schema-valid release twin.
9. The weekly CI schedule runs both existing authoritative jobs and every required gate without
   baseline updates or schedule-only skips.
10. Governance and monthly reports are deterministic against fixtures, respect their failure
    thresholds, and route review items to rolling faculty-review issues without auto-closing them.
11. Rotation tests cover empty, not-due, exactly-seven-days, overdue, overlapping, exact opaque-ID
    grammar, issue routing, successful due/overdue workflow conclusion, and privacy-invalid
    configurations.
12. Workflow contract validation parses all 11 scoped workflows and locks their typed triggers,
    permissions, concurrency, environment, job IDs, step order, action inputs, commands, immutable
    pins and per-occurrence semantic-tag comments, retention, and mutation boundaries. Heartbeat
    tests separately prove exact-blob activation and run-head ancestry/blob matching.
13. Full repository validators, the current root Node suite, SP tests, sequential MS3/resident
    builds, and Playwright smoke tests pass from the isolated worktree.
14. The branch is published, a review PR exists, external heartbeats are active, and dry-run/live
    evidence confirms cadence, site mapping, read-only behavior, durable monthly prompt state, and
    honest active-versus-`pending_merge` reporting.
