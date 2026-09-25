# Scheduled Maintenance: Six Targeted Fixes Implementation Plan

> **Execution:** Use `superpowers:subagent-driven-development`; each code task begins red, then receives a scoped review.

**Goal:** Complete the six approved scheduled-maintenance repairs without broadening clinical, faculty, deployment, or credential authority.

**Spec:** `docs/superpowers/specs/2026-09-15-scheduled-maintenance-six-fixes-design.md`

## Global constraints

- Work only in the isolated `codex/scheduled-maintenance-six-fixes-2026-09-15` worktree.
- Preserve unrelated work, clinical content, `reviewed.json`, rotation records, secrets, and LFS media.
- Use `apply_patch` for edits and test-first development for behavior changes.
- Automation remains read-only except for its already reviewed draft-PR/issue publication paths; it never merges, approves, attests, closes issues, deletes branches, or deploys manually.
- Use the validator's own loader/digest implementation for semantic workflow changes.
- Recheck PR #655 overlap before publication and exact-head merge.

### Task 1: Fix rotation selection during the successor window

**Files:**

- `tests/maintenance/test_rotation_readiness.py`
- `13_Faculty_Resources/_automation/maintenance/rotation_readiness.py`

1. Add failing cases for an active block plus an adjacent successor at seven days (`due`, successor ID, exit 10), six days (`overdue`, successor ID, exit 10), and eight or more days (still `active`, active ID, exit 0).
2. Run `python3 -m unittest tests.maintenance.test_rotation_readiness -v` and capture the expected failures.
3. Retain the active block as a candidate, evaluate the earliest future non-completed block, return that future block only when `daysUntilStart <= 7`, otherwise return the active candidate. Preserve output shape and privacy validation.
4. Rerun the focused suite and commit the isolated unit.

### Task 2: Enroll the queue schedule in heartbeat freshness

**Files:**

- `tests/maintenance/test_workflow_heartbeat.py`
- `13_Faculty_Resources/_automation/maintenance/workflow_heartbeat.py`

1. Update the exact expectation test first to require `maintenance-queue-runner.yml: 30` and cron `40 4 * * *`; run it red.
2. Add the expectation and cron mapping. Preserve the existing delegation rule: a fired-and-failed maintenance run belongs to escalation, while stale/missing/unavailable evidence belongs to heartbeat.
3. Run `python3 -m unittest tests.maintenance.test_workflow_heartbeat -v` and commit.

### Task 3: Make queue no-op incapable of recovery

**Files:**

- `tests/maintenance/test_escalation_issue.py`
- `13_Faculty_Resources/_automation/maintenance/escalation_issue.py`
- `.github/workflows/automation-failure-escalation.yml`
- `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py`

1. Add failing tests proving: queue failure + `nothing-to-do` remains failing; queue failure + missing/unrecognized outcome remains failing; queue failure + `did-work` becomes recovered; non-queue success behavior is unchanged; CLI reads an optional outcome file safely.
2. Add workflow-wiring tests for a best-effort queue-artifact download and least-privilege permissions.
3. Run the focused tests red.
4. Implement a queue-workflow-specific recovery predicate. Add a workflow step that, only for successful queue runs, downloads `maintenance-queue-runner-${RUN_ID}` and passes `outcome.txt` to the renderer; unavailable evidence must not fail the deadman or imply recovery.
5. Update the escalation step inventory and canonical digest with the validator's own functions.
6. Run the escalation tests plus scheduled-workflow validator and commit.

### Task 4: Add a read-only branch-without-open-PR steward

**Files:**

- new `tests/maintenance/test_automation_branch_prs.py`
- new `13_Faculty_Resources/_automation/maintenance/automation_branch_prs.py`
- `.github/workflows/maintenance-heartbeat.yml`
- `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py`
- `tests/maintenance/test_scheduled_workflows.py`

1. Write failing tests for: queue branch without PR; surveillance inbox without PR; exact open draft PR clears the row; wrong head/closed PR does not; unknown automation names are discarded; malformed/oversized/API failure is blocked/unavailable; output is bounded and content-free.
2. Implement strict normalization, evaluation, GitHub reads, JSON receipt, and exit 0/2 contract. Reuse the queue branch grammar pinned by `queue_pr_fallback.py`; never render untrusted remote text.
3. Wire the steward into `maintenance-heartbeat.yml` with `if: always()`, existing read permissions, and a separate 90-day artifact.
4. Update exact step inventory and heartbeat digest using the validator's loader/digest.
5. Run the new suite, `tests.maintenance.test_scheduled_workflows`, and the validator; commit.

### Task 5: Correct current operator documentation

**Files:**

- `13_Faculty_Resources/_automation/maintenance/README.md`
- `sp-proxy/README.md`
- `sp-proxy/REDTEAM_CHECKLIST.md`
- `tests/maintenance/test_scheduled_workflows.py` or a narrowly scoped documentation-contract test

1. Add a failing operator-doc assertion for the queue schedule, one consolidated heartbeat, fixed learner passcode/separate operations credential, actor-capability canary, `nothing-to-do`, and `missing_open_pr` semantics.
2. Correct only verified current guidance: schedule matrix, Codex cadence, SP canary and monitor cadence, passcode policy, queue outcome semantics, and branch steward/resolution boundaries. Remove the same obsolete every-slot monitor, passcode-rotation, and GET-only claims from the current SP proxy instructions so operator documents agree.
3. Run documentation and maintenance tests; commit.

### Task 6: Verify, integrate, and complete external recovery

1. Run focused suites:

   ```bash
   python3 -m unittest \
     tests.maintenance.test_rotation_readiness \
     tests.maintenance.test_workflow_heartbeat \
     tests.maintenance.test_escalation_issue \
     tests.maintenance.test_automation_branch_prs \
     tests.maintenance.test_scheduled_workflows
   python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
   node --test tests/*.test.mjs
   ```

2. Run `bash bin/verify.sh`; run the MS3 and resident builds sequentially if not already covered. Do not bypass a red gate.
3. Fetch `origin/main`, inspect PR #655's exact current files/head, rerun the coordination collision gate, and resolve overlap before publication.
4. Re-verify the GitHub Actions setting retains default `read` and allows Actions PR publication. Preserve live proof for Link run `35044704046`/PR #658 and Citation run `35044999293`.
5. Close issue #585 only after both previously failing surveillance workflows have genuine successful publication evidence; do not infer recovery from a no-op.
6. Freshly recheck `automation/queue-isbn-derive-2026-09-12`: exact SHA, all PR states, unique commit/path diff, main blob equality, and absence of a retention dependency. Delete exactly that remote ref only if still redundant; verify the ISBN ref is gone and `automation/surveillance-inbox` remains.
7. Publish one PR for repository changes, wait for exact-head required checks, merge only if green and conflict-free under the user's explicit six-fix authorization, and verify default-branch activation. Do not manually deploy or claim faculty approval.

## Preflight rulings

- The original draft's “active remains primary with advisory successor” conflicts with the approved active-first bug fix; the due/overdue successor wins only inside the seven-day window.
- The original draft placed no-op recovery in `queue_pr_fallback.py`, but the false recovery occurs in `escalation_issue.py`; fix the ledger that makes the incorrect transition and keep branch visibility independent.
- The branch/PR receipt is a separate steward/artifact, not an overloaded `stranded_prs.py` contract.
