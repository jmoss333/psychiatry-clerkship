# Scheduled Maintenance: Six Targeted Fixes — Design

**Date:** 2026-09-15
**Scope:** Scheduled-maintenance publication, readiness, and deadman truthfulness

## Decision

Implement the six repairs approved after the read-only maintenance review:

1. Restore GitHub Actions pull-request publication while keeping the repository default token permission read-only.
2. Fix rotation readiness so an active block cannot hide a successor that has entered its seven-day preparation window.
3. Add deadman coverage for the autonomous queue schedule and for owned automation branches that lack an open pull request.
4. Prevent a successful queue no-op from being recorded as recovery of an earlier queue failure.
5. Correct the operator runbook where its cadence, canary, passcode, and recovery descriptions no longer match the implementation.
6. Delete only the redundant remote branch `automation/queue-isbn-derive-2026-09-12` after a fresh exact-branch recheck; preserve `automation/surveillance-inbox` through its review PR.

No change grants merge, approval, faculty-attestation, content-editing, credential, deployment, or issue-closing authority.

## 1. Actions publication recovery

GitHub exposes one coupled repository setting for Actions-created and Actions-approved pull requests. Keep `default_workflow_permissions=read`, enable the coupled setting, and rely on each workflow's narrow job-level permissions. Recovery is proven only by a real publication path: a successful workflow-generated commit, a matching open PR, the expected base/head/SHA, and an allowlisted file set. A green wrapper or branch push alone is insufficient.

The Link Monitor and Citation Validity workflows share `automation/surveillance-inbox`; the first may create the PR and the second may correctly adopt and advance it. The resulting PR remains review evidence, not faculty approval or authorization to merge.

## 2. Rotation readiness priority

`evaluate_rotation()` retains an active block as a candidate, then inspects the earliest non-completed future block:

- successor starts in more than seven days: return the active block;
- successor starts exactly seven days away: return the successor as `due`;
- successor starts fewer than seven days away: return the successor as `overdue`;
- no active block: retain the existing future/not-due/due/overdue/complete behavior.

The selected block remains represented only by its faculty-supplied dates and opaque synthetic-format ID. `due` and `overdue` keep exit code 10 and route a review request; automation never infers dates, identities, completion, approval, or credentials.

## 3. Queue and branch deadman coverage

Add `maintenance-queue-runner.yml` to the internal workflow heartbeat with its actual `40 4 * * *` cron and a 30-hour freshness allowance. A failed run remains delegated to the failure-escalation workflow; missing, stale, provenance-unavailable, or inaccessible schedule evidence remains the heartbeat's own blocker.

Add a separate read-only branch/PR steward, `automation_branch_prs.py`, invoked by `maintenance-heartbeat.yml`. It reads remote refs and open PR heads and admits only:

- exact `automation/surveillance-inbox`; and
- queue branches matching `automation/queue-[a-z0-9][a-z0-9-]{0,63}-YYYY-MM-DD`.

It emits bounded, content-free rows such as `{branch, state: "missing_open_pr"}`. API failure, malformed input, ambiguity, or an over-limit result is `unavailable`, never an empty healthy result. A draft open PR counts as open. Closed/merged historical PRs do not. Unknown `automation/*` names are not rendered. The steward never opens, edits, closes, merges, or deletes anything.

## 4. Queue no-op is not recovery

The queue runner already retains `outcome.txt` with explicit values including `did-work` and `nothing-to-do`. The failure-escalation workflow must consume that artifact for successful queue runs:

- `did-work`: a successful run actually exercised the mutation/publication path, so the workflow-level failure row may become recovered;
- `nothing-to-do`: neutral/idle; retain any prior failing row unchanged;
- absent, unreadable, or unrecognized outcome: unverified; retain any prior failing row unchanged;
- queue failure: record failure exactly as today;
- successful non-queue workflow: retain existing recovery semantics.

This is intentionally a workflow-level ledger. A successful later queue run can show the workflow is operational, while the branch/PR steward independently keeps any older stranded branch visible. Automation still never closes the rolling issue.

## 5. Runbook corrections

Update the current operator README from live code and workflow contracts:

- one consolidated Codex heartbeat, with Monday and first-Tuesday work gated inside it;
- queue runner schedule and artifact;
- GitHub SP monitor runs every 12 hours, while the Netlify canary runs every six hours;
- the canary performs a contract GET and, when learner-ready, one live actor POST per slot;
- learner passcode is fixed; the separate operations credential is rotated;
- queue outcomes distinguish idle from did-work;
- branch-without-open-PR receipt and no-op recovery rule.

Preserve dated historical documents unless they present a current operator instruction that must be amended.

## 6. Exact branch cleanup

Before deletion, re-read the exact remote SHA, all PRs for the exact head, the branch's unique commit/path evidence, and the corresponding main blob. Delete only `automation/queue-isbn-derive-2026-09-12` if its only content is already present on `main`, no PR depends on it, and no unresolved evidence requires retention. Record the SHA so the deletion remains recoverable while the object is reachable. Verify the named ref is gone and `automation/surveillance-inbox` still exists. Never use a glob or sweep.

## Verification and integration

Every behavior change starts with a failing test. Workflow changes update their exact step inventories and canonical digests using `validate_scheduled_workflows.py`'s own loader and `_contract_digest()`. Run focused maintenance tests, the workflow validator, root Node tests, and full `bash bin/verify.sh` before publication.

PR #655 overlaps `maintenance/README.md` and the scheduled-workflow validator. Recheck its exact head and current `main` immediately before publication; incorporate or resolve overlap rather than duplicating its change. Publish one reviewed PR, wait for exact-head checks, and merge only under the user's explicit six-fix authorization and repository protection. Natural deploy-on-main is separate evidence, not the definition of these repairs.
