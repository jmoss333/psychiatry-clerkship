# Scheduled Maintenance Operations

This is the operator index for the repository's scheduled checks. The checks observe,
validate, retain bounded evidence, and route decisions to people. Maintenance receipts
and digests do not retain clinical teaching content. Surveillance evidence may retain
complete normalized text for authoritative public sources explicitly configured as
`full_text`, plus bounded change excerpts; `signal_only` sources remain hash-only. It
never includes PHI, patient data, learner identity, or credentials. The checks
do not edit clinical teaching content, attest or approve it, close review issues, rotate
credentials, enable managed voice, or invent rotation dates.

See also [Curriculum Surveillance](../surveillance/README.md), the
[Git and Netlify deployment plan](../GIT_AND_DEPLOY_PLAN.md), and the Interview Room
[red-team checklist](../../../sp-proxy/REDTEAM_CHECKLIST.md).

## Activation and clocks

GitHub and Netlify cron expressions are UTC. A GitHub schedule is active only when its
workflow file is on the repository's default branch; a branch-local cron is not an active
schedule. Until merge, any external status report must call it `pending_merge`.

The three Codex heartbeats below are controller-activated automations specified for the
operational handoff. They are not repository jobs and must not be reported as active until
their definitions and next-run times have been inspected in Codex. Their clock is
`America/New_York`, so daylight-saving changes do not move the human-facing local time.

## Schedule and evidence matrix

All maintenance and surveillance GitHub artifacts in this matrix are retained for 90
days, the repository-supported ceiling. The existing CI smoke artifact remains 14 days.

| Check | Cadence | Workflow or home | Artifact and retention |
|---|---|---|---|
| Interview Room authenticated GET | Every 6 hours, `0 */6 * * *` | Netlify `sp-health-canary` | Blob store `sp-health-canary`, key `latest`; not a GitHub artifact |
| Interview Room receipt monitor | Every 12 hours at minute 15, `15 */12 * * *` | `maintenance-sp-health-monitor.yml` | `maintenance-sp-health-${{ github.run_id }}` — 90 days |
| Production learner canary | Daily 09:20 UTC, `20 9 * * *` | `maintenance-production-canary.yml` | `maintenance-production-canary-${{ github.run_id }}` — 90 days |
| Internal workflow heartbeat | Daily 10:45 UTC, `45 10 * * *` | `maintenance-heartbeat.yml` | `maintenance-workflow-heartbeat-${{ github.run_id }}` — 90 days |
| Clean-room release rehearsal | Sunday 08:00 UTC, `0 8 * * 0` | `ci.yml` | `smoke-test-results-${{ github.run_number }}` — 14 days |
| Faculty governance digest | Monday 12:30 UTC, `30 12 * * 1` | `maintenance-governance-digest.yml` | `maintenance-governance-${{ github.run_id }}` — 90 days |
| Evidence and operations review | First day monthly 13:00 UTC, `0 13 1 * *` | `maintenance-monthly-review.yml` | `maintenance-monthly-${{ github.run_id }}` — 90 days |
| Rotation readiness | Daily 13:15 UTC, `15 13 * * *` | `maintenance-rotation-readiness.yml` | `maintenance-rotation-${{ github.run_id }}` — 90 days |
| Link surveillance | Monday 06:00 UTC, `0 6 * * 1` | `surveillance-link-monitor.yml` | `surveillance-link-monitor-${{ github.run_id }}` — 90 days |
| Citation surveillance | Monday 07:00 UTC, `0 7 * * 1` | `surveillance-citations.yml` | `surveillance-citation-monitor-${{ github.run_id }}` — 90 days |
| Guideline surveillance | First day monthly 06:00 UTC, `0 6 1 * *` | `surveillance-guideline.yml` | `surveillance-guideline-monitor-${{ github.run_id }}` — 90 days |
| Resource intake | On demand only | `surveillance-resource-intake.yml` | `surveillance-resource-intake-${{ github.run_id }}` — 90 days |
| External automation deadman | Daily 08:30 local | Controller-managed Codex heartbeat; verify current status | Notification; no repository artifact |
| Policy/provider/Zotero review | First Tuesday 09:00 local | Controller-managed Codex heartbeat; verify current status | Read-only review proposal |
| Rotation follow-up | Monday 09:15 local | Controller-managed Codex heartbeat; verify current status | Notification only when actionable |

## State meanings

- `ready`: the automated gate found no action that its contract treats as blocking.
  It is not clinical approval or proof of every hosted control plane.
- `review`: the run succeeded but queued a human or faculty decision. Automation may
  update a rolling issue, but it has not approved the underlying material.
- `blocked`: required evidence is invalid, unavailable, unsafe, stale, or failed. Do
  not release or advance the affected workflow on the strength of that receipt.
- `configuration_required`: no authoritative rotation block is configured. This is
  intentionally quiet and creates no daily issue; a faculty-provided date and opaque
  ID are required.
- `pending_first_run`: the exact current workflow blob was recently activated and no
  qualifying scheduled run exists yet, within that workflow's freshness allowance.
  It is temporary grace, not success. It becomes `missing` and blocks when grace expires.

## Local operator checks

Run from the repository root. These commands keep generated reports under `/tmp`; the
production and status probes use the public network. The heartbeat additionally requires
`GITHUB_REPOSITORY` and `GITHUB_TOKEN` to be exported through a secure shell and a
full-history checkout of the current default branch. Never print or paste a token.

```bash
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py \
  > /tmp/scheduled-workflow-validation.txt 2>&1

python3 13_Faculty_Resources/_automation/maintenance/production_canary.py \
  --config 13_Faculty_Resources/_automation/maintenance/maintenance_config.json \
  --source-sha "$(git rev-parse HEAD)" \
  --out /tmp/release-twin.json

node 13_Faculty_Resources/_automation/maintenance/governance_digest.mjs \
  --out-json /tmp/governance-digest.json \
  --out-md /tmp/governance-digest.md

python3 13_Faculty_Resources/_automation/maintenance/monthly_review.py \
  --out-json /tmp/monthly-review.json \
  --out-md /tmp/monthly-review.md

python3 13_Faculty_Resources/_automation/maintenance/rotation_readiness.py \
  --config 13_Faculty_Resources/_automation/maintenance/rotation_blocks.json \
  --out-json /tmp/rotation-passport.json \
  --out-md /tmp/rotation-passport.md

python3 13_Faculty_Resources/_automation/maintenance/sp_health_monitor.py \
  --out /tmp/sp-health-monitor.json

python3 13_Faculty_Resources/_automation/maintenance/workflow_heartbeat.py \
  --repo-root . \
  --out /tmp/workflow-heartbeat.json
```

`maintenance_issue.py` is deliberately not a local inspection command: it has no dry-run
mode and creates or updates GitHub issues. Let the reviewed workflow call it. Surveillance
collector and offline-fixture commands are in the
[surveillance runbook](../surveillance/README.md#local-operator-runs).

## Internal heartbeat provenance

First-run grace is tied to the exact current workflow, not merely to a cron string. From
a full-history default-branch checkout, the heartbeat first confirms that parsed `HEAD`
contains the expected cron, records the workflow's Git blob SHA, and walks the path's
first-parent history. The activation commit is the oldest commit in the current contiguous
suffix with that exact blob. Any workflow-byte change starts a new activation window even
when the cron is unchanged.

A completed scheduled run qualifies only when:

- its created and updated timestamps are not earlier than activation;
- the activation commit is an ancestor of the run's head SHA; and
- the workflow blob at the run head exactly equals the activation blob.

Missing or malformed Git, YAML, ancestry, blob, or Actions API proof produces a blocking
provenance state. This prevents an older run with the same cron but different permissions
or steps from satisfying the current workflow. The run head SHA is used for this proof but
is not serialized into the bounded heartbeat receipt.

## Interview Room health path

Netlify runs `sp-health-canary` at `0 */6 * * *`. It reuses the server-only learner
passcode for one authenticated `GET /api/sp`, makes no actor, evaluator, speech, budget,
transcription, or synthesis call, and replaces strong-consistency Blob key
`sp-health-canary/latest` with a bounded receipt. The public credential-free
`GET /api/sp/health-status` response is `Cache-Control: no-store`.

GitHub checks that status 15 minutes after each slot. A success blocks if it is more than
eight hours old or if `nextRun` is more than ten minutes late; missing, malformed, failed,
and unavailable receipts also block. A prior success therefore cannot hide a missed slot
or Blob-write loss.

The public receipt is the alert surface, not the only operational proof. After a deploy,
pack/model change, credential rotation, or forced canary failure, inspect Netlify's
`sp-health-canary` scheduled-function invocations and logs. Confirm the expected six-hour
slots and that failure logs contain only `event`, `state`, and an allow-listed
`failureCode`. Apply red-team check D6 to both a success and a forced failure. A green
receipt proves authenticated read-only reachability only; it does not replace the full
red-team checklist or faculty/privacy activation gates.

## Production cache and integrity contract

For both learner sites, the daily canary requires:

- `/`: HTTP 200 HTML; `Cache-Control` includes `public`, `max-age=0`, and
  `must-revalidate`; valid CSP; `X-Content-Type-Options: nosniff`; and
  `Referrer-Policy: strict-origin-when-cross-origin`.
- `/nav.json`: HTTP 200 JSON; the same `public, max-age=0, must-revalidate`
  contract; a non-empty section/item structure with non-empty `t`, `f`, and `k`.
- `/search-index.json`: HTTP 200 JSON; `public, max-age=86400`; schema version 1,
  non-empty documents/postings, matching `n`, and consistent document frequencies.
- every unique `served: true` media path in `media_manifest.json`: request
  `Range: bytes=0-511`; accept only HTTP 200/206 with an allowed media content type,
  `public, max-age=604800`, exactly 512 prefix bytes, and
  `Content-Range: bytes 0-511/<full length>` where the full length is greater than 512.
  Reject Git LFS pointer prefixes.
- each media response: one non-empty quoted strong `ETag` (never `W/`). The receipt
  hashes sorted `path|full length|ETag|prefix SHA-256` records, so the strong ETag
  represents drift outside the downloaded prefix.

The release twin contains hashes, counts, URLs, and the expected SP contract. Hashes are
identifiers, not faculty approval and not proof that an authenticated Netlify deploy is
current.

## Review issue lifecycles

Governance and monthly workflows upload evidence first. On `review` or `blocked`, the
router creates or updates at most one open issue using a fixed ownership marker; `ready`
creates or updates nothing. Rotation creates or updates one issue per validated opaque
block ID only for `due` or `overdue`; `configuration_required`, `not_due`, `active`, and
`complete` create nothing. Ambiguous marker matches fail closed. Routers search only open
issues, so a persistent condition may create a new issue after a person closes the prior
one; automation itself never reopens or closes it.

Automation never closes these issues, records a faculty decision, edits clinical
content, or writes attestation. Faculty review the linked run and artifact, make any
separately reviewed content/registry change, record attestation through the authoritative
faculty path, and close the issue manually when the work is genuinely complete.

Surveillance uses a separate rolling branch and PR. A collector emits findings plus an
explicit checked-source list, syncs idempotent issues and dated reports, rebuilds status
from live issue truth, uploads the run artifact, and publishes generated state to
`automation/surveillance-inbox`. The rolling branch helper rejects every path except:

- `13_Faculty_Resources/_automation/surveillance/history/**`
- `13_Faculty_Resources/_automation/surveillance/STATUS.md`
- `13_Faculty_Resources/_automation/surveillance/status.html`

It never pushes to `main`. An existing open or closed surveillance fingerprint is
deduplicated; automation does not comment on, reopen, or update that issue. Guideline
findings can open a separate attestation-routed proposal PR, but faculty remain the
authority for the edit, review stamp, and issue closure.

## Failure escalation

Every workflow above reports its completion to `automation-failure-escalation.yml`
(`workflow_run`), which folds the event into one rolling issue,
`automation: scheduled job failures`, under the marker
`<!-- automation:failure-escalation -->`. The body lists each failing workflow, its
consecutive-failure count, the run link, and the first error line; a success flips that row
to recovered and resets the count.

It shares no code path with `maintenance_issue.py` on purpose — the escalation has to keep
reporting when that path is the thing that broke. State round-trips through a JSON block in
the issue body, so the escalation depends on nothing but GitHub itself, and a malformed body
degrades to an empty state rather than wedging the job.

The same rule applies here as everywhere else: **automation records recovery but never
closes the row.** A person closes it once the underlying job is genuinely healthy. This is
enforced, not merely documented — `validate_scheduled_workflows.py` rejects an issue-closing
command in any scoped workflow, and `tests/maintenance/test_escalation_issue.py` asserts that
no input produces a close decision.

## Rotation configuration and manual boundary

`rotation_blocks.json` accepts only an opaque ID, ISO start/end dates, and
`planned`, `active`, or `completed`. The following are synthetic format examples only;
never copy their dates into the live config unless an authoritative faculty source
confirms them:

```json
{
  "schemaVersion": 1,
  "blocks": [
    {
      "id": "rot-2026-hx-a1b2c3d4e5f60718",
      "startsOn": "2026-08-10",
      "endsOn": "2026-09-20",
      "status": "planned"
    },
    {
      "id": "rot-2027-hx-1a2b3c4d5e6f7081",
      "startsOn": "2027-01-04",
      "endsOn": "2027-02-14",
      "status": "planned"
    }
  ]
}
```

Never add a name, email, learner/institution ID, assignment, patient information, or a
secret. A human must supply the authoritative dates and non-identifying ID. Before a new
block, an authorized operator separately rotates the learner passcode and operations
credential, preserves the prior content-free usage receipt, and runs the Interview Room
red-team checklist and golden transcript. Do not put credential values in git, issues,
artifacts, chat, or logs. Managed voice remains disabled until all required external
faculty and privacy gates are recorded.

GitHub's monthly report compares the red-team receipt's pack hash and timestamp with the
canonical SP pack and its latest Git change: this is **pack-versus-red-team recency**.
GitHub cannot prove the hosted deploy. The external Codex deadman, using authenticated
Netlify metadata, separately compares the receipt with the latest SP deploy
timestamp/commit: this is **deploy-versus-red-team recency**. Neither check substitutes
for faculty attestation.

## Updating workflow pins or contracts

Third-party actions must stay at an approved immutable full commit SHA. Every literal
`uses:` line must retain its semantic tag comment such as `# v7`; whole-step YAML aliases
for remote actions are intentionally forbidden because one aliased source line cannot
provide a semantic tag for every parsed `uses` occurrence.

For an intentional update:

1. Verify the upstream release and immutable commit, then update `PINNED_ACTIONS` and
   `PIN_TAGS` in `validate_scheduled_workflows.py`.
2. Update every literal workflow occurrence and its tag comment. Update the validator's
   expected job IDs, step inventory, commands, permissions, cadence, or artifact rules
   when the intended semantics changed.
3. Load the edited workflow with the validator's GitHub-compatible typed loader and
   recompute its canonical `_contract_digest`; review the parsed semantic diff before
   replacing only that file's `EXPECTED_WORKFLOW_CONTRACT_DIGESTS` value. The projection
   keeps `true`/`false` and null typed, preserves `on` as a string, coerces action inputs
   as the runner does, and rejects duplicate keys and legacy sexagesimal values. Pin
   comments are checked separately from the digest.
4. Update the exact expectations in `tests/maintenance/test_scheduled_workflows.py`, then
   run the scheduled-workflow unit tests and validator. Never weaken the contract to make
   an unrelated runner or account failure green.

A rebase that leaves the parsed workflow unchanged does not require a new typed contract
digest. A semantic workflow change does. A comment-only workflow change does not alter
that digest, but it does alter the exact Git blob used by heartbeat activation; every
literal action line must still pass its separate semantic-tag check.

## Pause and resume

For a temporary GitHub pause, open **Actions**, choose the exact workflow, use its
overflow menu to **Disable workflow**, and record the owner, reason, and expected resume
date. Do not delete the cron as a pause mechanism. Re-enable from the same menu, run one
manual dispatch when safe, and confirm a fresh artifact before clearing the pause.
Do not disable `ci.yml` merely to pause its Sunday rehearsal: that would also disable the
PR and push safety gates. Pause that schedule only through a separately reviewed workflow
change.

For a Codex heartbeat, open Codex Automations, choose the exact automation, and pause it.
On resume, re-check its prompt, `America/New_York` cadence, read-only scope, notification
policy, and next-run time. A paused or unavailable controller must be reported honestly;
it does not make the repository checks green.

The Netlify scheduled canary has no repository runtime pause switch. To pause it, remove
the scheduled-function export through a reviewed SP-proxy change and deploy, preserve the
latest bounded receipt and invocation evidence, and coordinate the GitHub receipt monitor
and external deadman so their expected blocking state is explicit. To resume, restore the
schedule through review, deploy, confirm a fresh six-hour invocation and receipt, and run
the required success/failure log check plus red-team checklist. Never delete or invalidate
a credential merely to simulate a pause.

## Operator response

When a gate fails, preserve the artifact, identify whether the evidence is repository,
public-production, or authenticated-control-plane evidence, and route the smallest
human action. Do not treat unrelated CI noise as proof that the named check failed, and
do not treat a local green check as proof that production recovered.
