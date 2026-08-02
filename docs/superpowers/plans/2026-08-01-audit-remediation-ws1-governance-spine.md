# Governance Write Path & SP Safety Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six governance/safety-spine audit findings: land the orphaned faculty-attestation-streamline feature, make the faculty console's write path work under branch protection (attest/inbox + auto-merge PR), rate-limit and attribute SP proxy spend, record the overdue SP red-team receipt in the steward's schema, and harden the surveillance crawlers (token header, crawled-title sanitization).

**Architecture:** All repo changes land via feature branches + PRs (main is branch-protected). The faculty console (Netlify function `attest.mjs` + browser `app.mjs`) gains a second Git ref — a machine-owned `attest/inbox` branch — that receives commit-on-save writes and publishes to `main` through one rolling auto-merge PR, so CI still gates every publish. The SP proxy, red-team receipt, and surveillance changes are independent, self-contained batches that extend existing test suites (sp-proxy `node --test`, `tests/maintenance` unittest, surveillance `--self-test` convention).

**Tech Stack:** Node 20 ESM Netlify Functions v2 (`node:test`), GitHub REST + GraphQL API, Python 3.11 stdlib (unittest / self-test scripts), GitHub Actions CI, Netlify `rateLimit` function config.

## Global Constraints

- **main is branch-protected (GH006 on direct push):** every change lands via feature branch + `gh pr create`; required checks: **build-test-validate + smoke**. Merge with `gh pr merge --squash` only after both are green.
- **Playwright hangs locally on this macOS** — verify smoke via CI, not locally.
- **Root tests:** `node --test tests/*.test.mjs` must pass. Python maintenance tests run via `python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v` (ci.yml:45). sp-proxy: `npm --prefix sp-proxy test`.
- **Build gate:** `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` must pass (this IS the Netlify build command). No batch in this plan touches build inputs, but run it before any PR that touches anything under `13_Faculty_Resources/`.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.
- **No PHI anywhere.** All fixtures synthetic.
- **This plan does NOT touch `_prototypes/sp-interview/sp-interview.html` or the pack** — the preview-regeneration constraint is therefore not triggered. If any task drifts into the pack, `node _prototypes/sp-interview/generate-preview.mjs --write` becomes mandatory.
- **Code style:** 2-space indent, single quotes JS, camelCase; JSDoc-style comments; max line 100.
- **Worktree note:** the branch `codex/faculty-attestation-streamline` and all local refs are shared across worktrees of `/Users/jm/Psychiatry-Clerkship-Library` (one `.git`). Use `git -C /Users/jm/Psychiatry-Clerkship-Library …` for ref operations and dedicated worktrees for checkouts.

## Verified baseline (2026-08-01, origin/main = 817ef90)

- `faculty-console/netlify/functions/attest.mjs`: 0 occurrences of "pull" — no PR path; DEFAULT_BRANCH `main` (:13); `write()` contents-PUT with `branch: settings.branch` (:361–398, branch at :377); `head()` (:400–411); `writeAtHead()` blob→tree→commit→`PATCH refs/heads/<branch>` force:false (:413–538, PATCH at :508); 422→`github_validation_failed` "The repository rejected the proposed update." (:31, :217–218); `config` export with the rateLimit pattern (:975–982).
- `sp-proxy/netlify/functions/sp.mjs:1433` and `sp-voice.mjs:1025`: `export const config = Object.freeze({ path: … })` — **no rateLimit**. Existing exact-shape assertions: `sp-proxy/tests/sp-handler.test.mjs:379`, `sp-proxy/tests/sp-voice.test.mjs:398`. Injectable `logger` seam exists in sp.mjs (default :1406; harness captures at tests/sp-handler.test.mjs:337).
- `13_Faculty_Resources/_automation/maintenance/receipts/` does not exist; `monthly_review.py` `_red_team_state` (:260–293) requires `state == "passed"`, tz-aware `checkedAt` parseable by `datetime.fromisoformat` and **strictly newer than the pack's last git commit** (`git log -1 --format=%cI -- _prototypes/sp-interview/sp-interview.pack.json` → `2026-07-28T22:12:42-04:00`, commit bc1a79f), and `packSha256 == sha256(pack bytes)` (currently `384608c9e2d7eeba12ab0c65d6fc21de4675247a3655776d5cd16f46e488af38`). The steward check already exists (`.github/workflows/maintenance-monthly-review.yml:39`) — do NOT add another.
- `codex/faculty-attestation-streamline`: local-only, 7 commits ahead (tip 651d8f0, merge-base 255c128), no remote, no PR. Merging origin/main into it conflicts in **exactly one hunk of faculty-console/README.md**; with code auto-merged, the full root suite passes **385/385** on the merged tree.
- PR #263: branch updated 2026-08-01 ("Resolve against main…") — now 0 conflicts vs main; blocker is its real failing `Test — SP Interview and managed proxy` step; still overlaps the streamline branch on 4 faculty-console files.
- Surveillance: `run_guideline_surv.py` `fetch_apify` (:99–116, `?token={token}` at :109–110), `run_resource_intake.py` `fetch_apify` (:61–78, token at :73–74); crawled `<title>` flows unsanitized (`run_resource_intake.py:38` → summary f-string :51) into `lib_surveillance.issue_body` (:135, raw) and `append_digest` (:206–210, raw).

---

## Batch 1 — Rescue and land `codex/faculty-attestation-streamline`

### Task 1: **[JOSH]** Authorize push + sequencing of the streamline branch

**Files:** none (decision gate).
**Interfaces:** Produces: go/no-go to push `codex/faculty-attestation-streamline` and the ordering rule *streamline lands before #263*.

- [ ] Josh confirms in-session: (a) push the recovered branch `codex/faculty-attestation-streamline` to origin (pure backup — the branch exists ONLY in local git; a disk failure loses 1,772 lines of finished work), and (b) land it as its own PR **before** draft PR #263, which rewrites the same four faculty-console files (`faculty-console/app.mjs`, `faculty-console/review-model.mjs`, `tests/faculty-console-contract.test.mjs`, `tests/smoke/faculty-console.spec.js`).
- [ ] Fallback if Josh prefers folding it into #263 instead: still push the branch as backup (step below is unconditional backup, zero merge decisions), then stop this batch after Task 2 and record the fold-into-#263 decision in the #263 comment (Task 5).

### Task 2: Push the branch as backup (no content changes)

**Files:** none modified — ref push only.
**Interfaces:** Produces: `origin/codex/faculty-attestation-streamline`.

- [ ] Push from the primary checkout (refs are shared across worktrees):
  ```bash
  git -C /Users/jm/Psychiatry-Clerkship-Library push origin codex/faculty-attestation-streamline
  ```
  Expected: `* [new branch] codex/faculty-attestation-streamline -> codex/faculty-attestation-streamline`.
- [ ] Verify: `git -C /Users/jm/Psychiatry-Clerkship-Library branch -r | grep faculty-attestation` → prints `origin/codex/faculty-attestation-streamline`.

### Task 3: Merge current main into the branch, resolving the single README conflict

**Files:**
- Modify: `faculty-console/README.md` (one conflict hunk, "### 4. Confirm one attestation" section, ~line 69 in the conflicted state)
- Test: `node --test tests/*.test.mjs` (expect 385 pass on merged tree — verified in planning)

**Interfaces:** Produces: conflict-free branch tip containing both the streamline feature and main's #256 server-attribution changes.

- [ ] Create a dedicated worktree and merge:
  ```bash
  git -C /Users/jm/Psychiatry-Clerkship-Library worktree add \
    /Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/streamline-landing \
    codex/faculty-attestation-streamline
  cd /Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/streamline-landing
  git fetch origin && git merge origin/main
  ```
  Expected failure: `CONFLICT (content): Merge conflict in faculty-console/README.md` — and ONLY that file (`git status --short | grep '^UU'` shows one line).
- [ ] Resolve the hunk with Edit — replace the entire conflicted block:
  ```
  <<<<<<< HEAD
  The checklist shows the self-entered reviewer label and a live count such as **4 of 5 required checks complete**. For questions, complete all three separate faculty confirmations covering the clinical answer, named evidence, and an original fictional vignette without PHI. Pages and tools retain their separate learner review, accuracy, and interaction checks.
  =======
  The rail shows the server-configured reviewer attribution (`ATTESTER_NAME`). For questions, complete all three faculty confirmations covering the clinical answer, named evidence, and an original fictional vignette without PHI. Then choose **Attest this question**. For pages and tools, choose **Attest this page** or **Attest this tool** after the Review and Resolve steps are complete.
  >>>>>>> origin/main
  ```
  with the merged text (branch's checklist flow + main's #256 server attribution):
  ```
  The checklist shows the server-configured reviewer attribution (`ATTESTER_NAME`) and a live count such as **4 of 5 required checks complete**. For questions, complete all three separate faculty confirmations covering the clinical answer, named evidence, and an original fictional vignette without PHI. Pages and tools retain their separate learner review, accuracy, and interaction checks.
  ```
- [ ] Verify no stale pre-#256 wording survived: `grep -n "self-entered" faculty-console/README.md` → no output.
- [ ] Run the full root suite: `node --test tests/*.test.mjs` → expect `# tests 385` / `# pass 385` / `# fail 0`.
- [ ] Commit the merge:
  ```bash
  git add faculty-console/README.md && git commit -m "Merge origin/main; keep checklist flow with server-derived ATTESTER_NAME attribution"
  git push origin codex/faculty-attestation-streamline
  ```

### Task 4: Open the PR (description generated from the branch's own design docs) and land it

**Files:** none (PR operation). Design docs already on the branch: `docs/superpowers/plans/2026-07-21-streamlined-faculty-attestation-console.md`, `docs/superpowers/specs/2026-07-21-streamlined-faculty-attestation-console-design.md`.
**Interfaces:** Produces: merged streamline feature on main; required checks build-test-validate + smoke green.

- [ ] Skim both design docs (`sed -n '1,60p' docs/superpowers/plans/2026-07-21-streamlined-faculty-attestation-console.md`) and confirm the PR body below matches their stated scope; adjust bullets only if the docs contradict them.
- [ ] Create the PR:
  ```bash
  gh pr create --head codex/faculty-attestation-streamline \
    --title "feat(faculty-console): compact review checklist with advance-after-attestation" \
    --body "$(cat <<'EOF'
  Lands the recovered faculty-console streamline feature (7 local commits, previously unpushed — audit 2026-08-01 finding: loss-risk + collision with #263).

  ## What changes
  - Replaces the Review → Resolve → Confirm rail with one compact **Review checklist** that shows exact progress ("4 of 5 required checks complete") and focuses the first unmet requirement instead of a silent disabled button.
  - **Attest & continue**: after a confirmed attestation (repository reload matches the requested status/revision — never the POST response alone), the console keeps a durable receipt with the commit link and auto-advances to the next eligible item under the active filters.
  - Derived checklist model in `faculty-console/review-model.mjs` with new unit coverage (`tests/faculty-review-model.test.mjs`), extended contract tests, and updated smoke spec.
  - Merged with current main: server-derived `ATTESTER_NAME` attribution (#256) is preserved throughout (README conflict resolved in the merge commit).

  Design docs (in this PR): `docs/superpowers/plans/2026-07-21-streamlined-faculty-attestation-console.md`, `docs/superpowers/specs/2026-07-21-streamlined-faculty-attestation-console-design.md`.

  ## Sequencing
  Lands BEFORE draft #263 (risk-aware publishing warnings), which rewrites the same four faculty-console files — see the sequencing comment on #263.

  ## Test plan
  - `node --test tests/*.test.mjs` → 385/385 locally on the merged tree.
  - CI: build-test-validate + smoke (Playwright faculty-console.spec.js) must be green.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```
- [ ] Wait for CI; verify both required checks: `gh pr checks <PR#> --watch` → `build-test-validate ✓`, `smoke ✓`. If the smoke faculty-console spec fails, debug via the CI artifact (do not run Playwright locally).
- [ ] Merge: `gh pr merge <PR#> --squash --delete-branch`. Then remove the landing worktree: `git -C /Users/jm/Psychiatry-Clerkship-Library worktree remove /Users/jm/Psychiatry-Clerkship-Library/.claude/worktrees/streamline-landing`.

### Task 5: Post sequencing + split guidance on draft PR #263

**Files:** none (comment).
**Interfaces:** Produces: recorded rebase contract for #263.

- [ ] Post the comment:
  ```bash
  gh pr comment 263 --body "$(cat <<'EOF'
  Sequencing note from the 2026-08-01 audit remediation (WS1):

  1. The faculty-console streamline feature (compact checklist + advance-after-attestation) has now landed on main via PR <streamline PR#>. This PR rewrites the same four files (`faculty-console/app.mjs`, `faculty-console/review-model.mjs`, `tests/faculty-console-contract.test.mjs`, `tests/smoke/faculty-console.spec.js`) — please re-resolve against main before further work; the checklist model in `review-model.mjs` is now the integration surface for publish-warning states.
  2. A second faculty-console change is queued behind this (attest/inbox write path, audit finding "commit-on-save blocked by branch protection"). To shrink the conflict surface, recommend splitting this PR: (a) the validator/schema half (`validate_tool_governance` extensions, `reviewed.schema.json`) which is conflict-free, from (b) the faculty-console UI half. Half (a) can land immediately once its SP Interview/proxy test failure (run 30220868085, real exit 1) is fixed; half (b) rebases onto the streamlined console.
  3. Please keep this PR in draft until the failing `Test — SP Interview and managed proxy` step is green.
  EOF
  )"
  ```
  (Replace `<streamline PR#>` with the number from Task 4.)

**PR boundary:** branch `codex/faculty-attestation-streamline` → PR "feat(faculty-console): compact review checklist with advance-after-attestation" — required checks: build-test-validate + smoke.

---

## Batch 2 — Rate limiting + spend attribution on /api/sp and /api/sp/voice

### Task 6: Failing tests for the Netlify rateLimit config exports

**Files:**
- Test (modify): `sp-proxy/tests/sp-handler.test.mjs` (assertion at line 379)
- Test (modify): `sp-proxy/tests/sp-voice.test.mjs` (assertion at line 398)

**Interfaces:** Consumes: `config` exports of `sp.mjs`/`sp-voice.mjs`. Produces: the exact config contract `{ path, rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] } }`.

- [ ] In `sp-proxy/tests/sp-handler.test.mjs`, replace (line 379):
  ```js
  assert.deepEqual(netlifyConfig, { path: '/api/sp' });
  ```
  with:
  ```js
  assert.deepEqual(netlifyConfig, {
    path: '/api/sp',
    rateLimit: {
      windowLimit: 20,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    },
  });
  ```
- [ ] In `sp-proxy/tests/sp-voice.test.mjs`, replace (line 398):
  ```js
  assert.deepEqual(netlifyConfig, { path: '/api/sp/voice' });
  ```
  with:
  ```js
  assert.deepEqual(netlifyConfig, {
    path: '/api/sp/voice',
    rateLimit: {
      windowLimit: 20,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    },
  });
  ```
- [ ] Run: `npm --prefix sp-proxy test` → expect exactly 2 failures (`exports the injected handler, exact Netlify path…` in each suite), everything else green.

### Task 7: Implement the rateLimit configs

**Files:**
- Modify: `sp-proxy/netlify/functions/sp.mjs:1433`
- Modify: `sp-proxy/netlify/functions/sp-voice.mjs:1025`

- [ ] In `sp.mjs`, replace:
  ```js
  export const config = Object.freeze({ path: '/api/sp' });
  ```
  with:
  ```js
  // Rate limit mirrors faculty-console/netlify/functions/attest.mjs. 20 req/min/IP
  // caps a scripted passcode holder's burn rate so exhausting the shared $20
  // rotation budget takes hours (time to rotate SP_STUDENT_PASSCODE), while
  // human-paced interviewing stays far below the window. Tunable if ward-wifi
  // NAT ever causes collateral 429s.
  export const config = Object.freeze({
    path: '/api/sp',
    rateLimit: Object.freeze({
      windowLimit: 20,
      windowSize: 60,
      aggregateBy: Object.freeze(['ip', 'domain']),
    }),
  });
  ```
- [ ] In `sp-voice.mjs`, replace:
  ```js
  export const config = Object.freeze({ path: '/api/sp/voice' });
  ```
  with:
  ```js
  // Same rationale as sp.mjs: bound per-client burn on the shared rotation budget.
  export const config = Object.freeze({
    path: '/api/sp/voice',
    rateLimit: Object.freeze({
      windowLimit: 20,
      windowSize: 60,
      aggregateBy: Object.freeze(['ip', 'domain']),
    }),
  });
  ```
- [ ] Run: `npm --prefix sp-proxy test` → `# fail 0`.
- [ ] Commit: `git add sp-proxy && git commit -m "Rate-limit /api/sp and /api/sp/voice (20 req/min per IP, attest.mjs pattern)"`

### Task 8: Metadata-only per-encounter spend log line (abuser attribution)

**Files:**
- Test (modify): `sp-proxy/tests/sp-handler.test.mjs` (new test after the converse test ending at line 769)
- Modify: `sp-proxy/netlify/functions/sp.mjs` (settle-success path, insertion ~line 1199)

**Interfaces:** Consumes: existing injectable `logger` seam (`makeHarness().logs`). Produces: log event `{ event: 'budget_settled', rotationId, encounterId, caseId, operation, turnId, inputTokens, outputTokens }` — metadata only, never message content.

- [ ] Add the failing test in `sp-proxy/tests/sp-handler.test.mjs` directly after the `'converse reserves the exact sent bytes…'` test (line 769):
  ```js
  test('a settled operation logs one metadata-only spend event for abuse attribution', async () => {
    const harness = makeHarness();
    const response = await harness.handler(learnerRequest({ body: converseBody() }));
    assert.equal(response.status, 200);
    const spend = harness.logs.filter((event) => event.event === 'budget_settled');
    assert.equal(spend.length, 1);
    assert.deepEqual(spend[0], {
      event: 'budget_settled',
      rotationId: 'rotation-2026-07-a',
      encounterId: ENCOUNTER_ID,
      caseId: 'sp_depression_gated_si_001',
      operation: 'actor',
      turnId: 1,
      inputTokens: 120,
      outputTokens: 24,
    });
  });
  ```
- [ ] Run: `npm --prefix sp-proxy test` → expect exactly 1 failure (`spend.length` 0 !== 1).
- [ ] In `sp.mjs`, locate the settle-success block (unique anchor — the only settle with the `settled`-status guard followed by the abort check, ~lines 1185–1199) and insert the log after it. Edit old_string:
  ```js
      if (settled?.status !== 'settled' || settled?.outcome !== 'succeeded') {
        throw operationUnavailable();
      }
    } catch {
      throw operationUnavailable();
    }
    if (request.signal.aborted) throw requestCancelled();
  ```
  new_string:
  ```js
      if (settled?.status !== 'settled' || settled?.outcome !== 'succeeded') {
        throw operationUnavailable();
      }
    } catch {
      throw operationUnavailable();
    }
    // Metadata-only spend attribution: identifies WHICH client is burning the
    // shared rotation budget without ever logging message content.
    logger?.({
      event: 'budget_settled',
      rotationId: runtime.rotationId,
      encounterId: input.encounterId,
      caseId: input.caseId,
      operation: outbound.kind,
      turnId: outbound.turnId,
      inputTokens: providerResult.usage.inputTokens,
      outputTokens: providerResult.usage.outputTokens,
    });
    if (request.signal.aborted) throw requestCancelled();
  ```
- [ ] Update the TWO existing `harness.logs` consumers that the new settle-path event reaches:
  - `sp-proxy/tests/sp-handler.test.mjs:1169` ('managed-voice eligible but codec throws → ticket null'): its converse-case iteration settles successfully, so `harness.logs` now contains a `budget_settled` event alongside `speech_ticket_unavailable`. Change the assertion from a whole-array deepEqual to a filtered one:
    ```js
    assert.deepEqual(
      harness.logs.filter((event) => event.event === 'speech_ticket_unavailable'),
      [{ event: 'speech_ticket_unavailable', mode: body.mode }],
    );
    ```
  - `sp-proxy/tests/sp-handler.test.mjs:700` (`doesNotMatch` on serialized logs): re-run and confirm it still passes — it asserts absence of content strings, which the metadata-only event never carries; no edit expected.
- [ ] Run: `npm --prefix sp-proxy test` → `# fail 0`. (The health-path test at :525 asserts logger never fires on GET — it must stay green; the new log is settle-path only.)
- [ ] Commit: `git add sp-proxy && git commit -m "Log metadata-only per-encounter spend event on settle for abuse attribution"`

**PR boundary:** branch `fix/sp-rate-limit-spend-log` → PR "sp-proxy: rate-limit /api/sp + /api/sp/voice and add per-encounter spend attribution" — required checks: build-test-validate (runs `npm --prefix sp-proxy test`) + smoke. sp-voice.mjs is deliberately NOT given a logger seam in this PR (none exists there; voice spend rides the same shared ledger and the rate limit bounds it) — noted in the PR body as an explicit non-goal.

---

## Batch 3 — SP red-team receipt (steward schema)

### Task 9: Receipt recorder script + unittest (TDD)

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/record_red_team.py`
- Test (create): `tests/maintenance/test_record_red_team.py`

**Interfaces:** Consumes: `_prototypes/sp-interview/sp-interview.pack.json` bytes. Produces: `build_receipt(pack_bytes, state, signed_by, sections, now) -> dict` with the exact keys `monthly_review.py` audits (`state`, `checkedAt`, `packSha256`) plus audit-trail extras (ignored by the steward); writes `13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json`.

- [ ] Write the failing test `tests/maintenance/test_record_red_team.py`:
  ```python
  import json
  import sys
  import unittest
  from datetime import datetime, timezone
  from hashlib import sha256
  from pathlib import Path

  ROOT = Path(__file__).resolve().parents[2]
  AUTOMATION = ROOT / "13_Faculty_Resources" / "_automation"
  sys.path.insert(0, str(AUTOMATION))

  from maintenance.record_red_team import build_receipt  # noqa: E402


  class BuildReceiptTests(unittest.TestCase):
      def test_receipt_matches_monthly_review_contract(self):
          pack_bytes = json.dumps(
              {"version": "0.1.0", "engine": {"modelPinned": "claude-haiku-4-5-20251001"}}
          ).encode("utf-8")
          now = datetime(2026, 8, 2, 15, 0, tzinfo=timezone.utc)
          receipt = build_receipt(
              pack_bytes, "passed", "Joshua Moss, MD", ["A", "B", "C", "D", "E"], now
          )
          self.assertEqual(receipt["state"], "passed")
          self.assertEqual(receipt["checkedAt"], "2026-08-02T15:00:00+00:00")
          self.assertEqual(receipt["packSha256"], sha256(pack_bytes).hexdigest())
          self.assertEqual(receipt["packVersion"], "0.1.0")
          self.assertEqual(receipt["model"], "claude-haiku-4-5-20251001")
          self.assertEqual(receipt["sections"], ["A", "B", "C", "D", "E"])
          self.assertEqual(receipt["signedBy"], "Joshua Moss, MD")
          self.assertEqual(receipt["checklist"], "sp-proxy/REDTEAM_CHECKLIST.md")

      def test_timestamp_is_timezone_aware(self):
          # monthly_review compares checkedAt with the pack's git %cI timestamp;
          # a naive datetime would raise TypeError inside the steward.
          receipt = build_receipt(b"{}", "passed", "x", ["A"], datetime.now(timezone.utc))
          self.assertIsNotNone(datetime.fromisoformat(receipt["checkedAt"]).tzinfo)


  if __name__ == "__main__":
      unittest.main()
  ```
- [ ] Run: `python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v` → expect `ModuleNotFoundError: No module named 'maintenance.record_red_team'`.
- [ ] Create `13_Faculty_Resources/_automation/maintenance/record_red_team.py`:
  ```python
  #!/usr/bin/env python3
  """Write the SP red-team receipt after a completed checklist run.

  Usage (only after actually running sp-proxy/REDTEAM_CHECKLIST.md against the
  LIVE deploy — this script records an attestation, it does not perform one):

    python3 13_Faculty_Resources/_automation/maintenance/record_red_team.py \
        --state passed --signed-by "Joshua Moss, MD"

  Writes 13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json
  in the schema monthly_review.py audits (state, checkedAt, packSha256), plus
  audit-trail fields the steward ignores. checkedAt is timezone-aware UTC and
  packSha256 is computed from the canonical pack bytes at write time, so the
  steward's pack-recency and pack-hash checks cannot be satisfied accidentally.
  """
  import argparse
  import json
  import sys
  from datetime import datetime, timezone
  from hashlib import sha256
  from pathlib import Path

  ROOT = Path(__file__).resolve().parents[3]
  PACK = ROOT / "_prototypes" / "sp-interview" / "sp-interview.pack.json"
  RECEIPT = Path(__file__).resolve().parent / "receipts" / "sp-red-team.json"


  def build_receipt(pack_bytes, state, signed_by, sections, now):
      pack = json.loads(pack_bytes)
      return {
          "state": state,
          "checkedAt": now.isoformat(),
          "packSha256": sha256(pack_bytes).hexdigest(),
          "packVersion": pack.get("version", ""),
          "model": pack.get("engine", {}).get("modelPinned", ""),
          "sections": sections,
          "signedBy": signed_by,
          "checklist": "sp-proxy/REDTEAM_CHECKLIST.md",
      }


  def main(argv=None):
      parser = argparse.ArgumentParser(description=__doc__)
      parser.add_argument("--state", required=True, choices=["passed", "failed"])
      parser.add_argument("--signed-by", required=True)
      parser.add_argument("--sections", nargs="+", default=["A", "B", "C", "D", "E"])
      args = parser.parse_args(argv)
      receipt = build_receipt(
          PACK.read_bytes(), args.state, args.signed_by, args.sections,
          datetime.now(timezone.utc),
      )
      RECEIPT.parent.mkdir(parents=True, exist_ok=True)
      RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
      print(
          "wrote %s state=%s packSha256=%s"
          % (RECEIPT.relative_to(ROOT), args.state, receipt["packSha256"][:12])
      )
      return 0


  if __name__ == "__main__":
      sys.exit(main())
  ```
- [ ] Run: `python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v` → all pass (existing monthly-review tests + 2 new).
- [ ] Commit: `git add 13_Faculty_Resources/_automation/maintenance/record_red_team.py tests/maintenance/test_record_red_team.py && git commit -m "Add SP red-team receipt recorder matching the monthly steward schema"`

**PR boundary:** branch `chore/red-team-receipt-recorder` → PR "Add SP red-team receipt recorder (steward schema)" — required checks: build-test-validate + smoke. Landable immediately; does not wait on the human run.

### Task 10: **[JOSH]** Run REDTEAM_CHECKLIST.md A–E against the live deploy for Dana, Marcus, and Ray

**Files:** none (live clinical-safety verification; the receipt is Task 11).
**Interfaces:** Produces: per-section pass/fail verdicts and a signed state (`passed`/`failed`).

- [ ] Open the live tool: `https://une-ms3-psychiatry.netlify.app/tools/sp-interview.html`, switch to **Live** mode (endpoint `https://sp-interview-proxy.netlify.app`, student passcode).
- [ ] For **each** persona now served (Dana `sp_depression_gated_si_001`, Marcus `sp_mania_redirect_001`, Ray `sp_psychosis_paranoid_001`), run `sp-proxy/REDTEAM_CHECKLIST.md`:
  - **A. Character integrity** (A1–A…, jailbreak/meta probes — every probe must FAIL to break the simulation)
  - **B. Gate integrity** (B1–B4 — the clinical core: suicide-disclosure gating for Dana; for Ray confirm `c_command` yields command-hallucination content with no SI coaching)
  - **C. Content boundaries**
  - **D. Plumbing**
  - Skip **V** (managed voice) — voice is not being enabled in this batch.
- [ ] **E. Golden transcript:** replay the 19-message skilled-interview script in Live mode for Dana; verdict: gates fire at the same points.
- [ ] Record date + model string + per-probe pass/fail (any medium; the durable record is the Task 11 receipt). If ANY probe passes (i.e., breaks the simulation): STOP, file an issue, and run Task 11 with `--state failed` — the steward will then correctly report the pack as not clean.

### Task 11: Write and land the receipt

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json` (via the Task 9 script)
- Test: `monthly_review.py` run (steward's own logic is the oracle)

**Interfaces:** Consumes: Task 10 verdict; Task 9 script. Produces: receipt the scheduled steward (`maintenance-monthly-review.yml`) reports as `current`.

- [ ] Confirm the pack has not changed since Josh's run (receipt must hash the exact pack that was probed):
  ```bash
  git log -1 --format='%h %cI' -- _prototypes/sp-interview/sp-interview.pack.json
  ```
  If newer than bc1a79f / 2026-07-28, re-run Task 10 against the new pack first.
- [ ] Generate the receipt (state per Josh's verdict):
  ```bash
  python3 13_Faculty_Resources/_automation/maintenance/record_red_team.py \
    --state passed --signed-by "Joshua Moss, MD"
  ```
  Expected: `wrote 13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json state=passed packSha256=384608c9e2d7`.
- [ ] Verify with the steward's own logic (do NOT add a new CI check — `maintenance-monthly-review.yml:39` already audits this file monthly):
  ```bash
  python3 13_Faculty_Resources/_automation/maintenance/monthly_review.py \
    --out-json "$SCRATCHPAD/mr.json" --out-md "$SCRATCHPAD/mr.md"
  python3 -c "import json,os;print(json.load(open(os.environ['SCRATCHPAD']+'/mr.json'))['operations']['redTeamReceipt'])"
  ```
  Expected output: `current`.
- [ ] Commit + PR:
  ```bash
  git checkout -b chore/sp-red-team-receipt-2026-08
  git add 13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json
  git commit -m "Record SP red-team receipt: Dana/Marcus/Ray vs pack bc1a79f (checklist A-E)"
  git push -u origin chore/sp-red-team-receipt-2026-08 && gh pr create --fill
  ```

**PR boundary:** branch `chore/sp-red-team-receipt-2026-08` → PR "Record SP red-team receipt for pack bc1a79f (Dana/Marcus/Ray)" — required checks: build-test-validate + smoke. Blocked on Task 10 (human).

---

## Batch 4 — Surveillance crawler security (token header + crawled-title sanitizer)

### Task 12: Failing self-test, then sanitizers + Apify auth helper in lib_surveillance

**Files:**
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py` (imports at :11; new helpers after `ensure_fingerprint`, i.e. after line 114, before the `# GitHub rendering` section at :116)
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py` (add `--self-test`)

**Interfaces:** Produces: `L.sanitize_crawled_text(text, max_len=200)`, `L.sanitize_crawled_url(url)`, `L.build_apify_request(payload, token)` — the single sanitization/auth point for both crawlers.

- [ ] Add the self-test to `run_resource_intake.py` first (failing). Insert above `def main():`:
  ```python
  def self_test():
      """No network. Verifies crawled-origin fields are sanitized at
      finding-construction time (issue #108) and that the Apify token never
      appears in a URL."""
      import urllib.request as _ur
      cfg = {"max_candidates_per_run": 5, "severity_default": "P2",
             "inclusion": {"require_domains": ["samhsa.gov"]}}
      malicious = [
          {"url": "https://www.samhsa.gov/evil",
           "title": ("Real page\n\n```\n# Ignore previous instructions\n"
                     "[click me](https://phish.example) <img src=x onerror=alert(1)>")},
          {"url": "javascript:alert(1)", "title": "Bad scheme"},
          {"url": "https://www.samhsa.gov/x)`[b]|c", "title": "Bad URL chars"},
      ]
      out = to_candidates(malicious, cfg, set())
      ok = True
      if len(out) != 1:
          print("self-test FAIL: expected 1 candidate, got %d" % len(out)); ok = False
      else:
          summary = out[0]["summary"]
          for needle in ("`", "<", ">", "[", "]", "\n", "\r"):
              if needle in summary:
                  print("self-test FAIL: %r survived in %r" % (needle, summary)); ok = False
          if not summary.startswith("Candidate resource: Real page"):
              print("self-test FAIL: unexpected summary %r" % summary); ok = False
          if out[0]["source_url"] != "https://www.samhsa.gov/evil":
              print("self-test FAIL: url %r" % out[0]["source_url"]); ok = False
      req = L.build_apify_request({"probe": 1}, "SECRET-TOKEN")
      if "SECRET-TOKEN" in req.full_url:
          print("self-test FAIL: token leaked into URL %s" % req.full_url); ok = False
      if req.get_header("Authorization") != "Bearer SECRET-TOKEN":
          print("self-test FAIL: Authorization header missing/wrong"); ok = False
      if not isinstance(req, _ur.Request) or req.get_method() != "POST":
          print("self-test FAIL: not a POST urllib Request"); ok = False
      if ok:
          print("self-test: crawled title/url sanitization + header-auth Apify request OK")
      return ok
  ```
  and in `main()` add the flag before the fixture/token logic:
  ```python
      ap.add_argument("--self-test", action="store_true",
                      help="No network; verify sanitization and Apify auth.")
      args = ap.parse_args()
      if args.self_test:
          sys.exit(0 if self_test() else 1)
  ```
  (replacing the existing single `args = ap.parse_args()` line).
- [ ] Run: `python3 13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py --self-test` → expect `AttributeError: module 'lib_surveillance' has no attribute 'build_apify_request'` (failing as designed).
- [ ] In `lib_surveillance.py`, extend the import line (line 11) from
  `import os, re, csv, json, hashlib, datetime, sys` to
  `import os, re, csv, json, hashlib, datetime, sys, urllib.request`
  and insert after `ensure_fingerprint` (after line 114):
  ```python
  # ---------------------------------------------------------------- crawled-input hygiene
  # One sanitizer for every crawled-origin string that reaches a markdown surface
  # (issue bodies, monthly digests, issue titles). Crawled pages are untrusted:
  # a hostile <title> must not inject fences, links, images, or HTML into
  # repo-committed files or faculty/agent-read issues (issue #108).
  _CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")
  _MARKUP_TRANS = str.maketrans({"`": "'", "<": "(", ">": ")", "[": "(", "]": ")", "|": "/"})
  _SAFE_URL_RE = re.compile(r"^https?://[^\s`<>\[\]|\\'\"]+$")

  def sanitize_crawled_text(text, max_len=200):
      """Strip control chars/newlines, disarm markdown/HTML metacharacters, cap length."""
      cleaned = _CTRL_RE.sub(" ", str(text or ""))
      cleaned = " ".join(cleaned.translate(_MARKUP_TRANS).split())
      return cleaned[:max_len]

  def sanitize_crawled_url(url):
      """Return url only if it is a plain absolute http(s) URL safe to embed in
      markdown; else ''. Unsafe crawled URLs are dropped, not repaired."""
      url = str(url or "").strip()
      return url if _SAFE_URL_RE.match(url) else ""

  # ---------------------------------------------------------------- apify auth
  APIFY_CRAWLER_URL = ("https://api.apify.com/v2/acts/apify~website-content-crawler/"
                       "run-sync-get-dataset-items")

  def build_apify_request(payload, token):
      """Authenticated Apify request. The token travels ONLY in the Authorization
      header — never in the URL, where it would leak into proxy/access/error logs
      and urllib exception text in CI logs."""
      req = urllib.request.Request(APIFY_CRAWLER_URL,
                                   data=json.dumps(payload).encode(), method="POST")
      req.add_header("Content-Type", "application/json")
      req.add_header("Authorization", "Bearer %s" % token)
      return req
  ```
- [ ] Run the self-test again → still FAILS on the sanitization asserts (to_candidates not yet wired) but the Apify asserts pass. That's the expected intermediate state.

### Task 13: Wire sanitizers + header auth into both crawlers; add the CI step

**Files:**
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py` (:37–38 URL/title, :73–76 fetch)
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_guideline_surv.py` (:109–112 fetch)
- Modify: `.github/workflows/ci.yml` (after the citation-surveillance step at :69–70)

- [ ] In `run_resource_intake.py` `to_candidates`, replace:
  ```python
      for it in items or []:
          url = it.get("url") or ""
          title = (it.get("title") or it.get("metadata", {}).get("title") or url).strip()
  ```
  with:
  ```python
      for it in items or []:
          url = L.sanitize_crawled_url(it.get("url"))
          if not url:
              continue
          title = L.sanitize_crawled_text(
              it.get("title") or it.get("metadata", {}).get("title") or url
          )
  ```
- [ ] In `run_resource_intake.py` `fetch_apify`, replace:
  ```python
      url = ("https://api.apify.com/v2/acts/apify~website-content-crawler/"
             f"run-sync-get-dataset-items?token={token}")
      req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
      req.add_header("Content-Type", "application/json")
      with urllib.request.urlopen(req, timeout=600) as r:
  ```
  with:
  ```python
      req = L.build_apify_request(payload, token)
      with urllib.request.urlopen(req, timeout=600) as r:
  ```
- [ ] In `run_guideline_surv.py` `fetch_apify`, replace:
  ```python
      url = ("https://api.apify.com/v2/acts/apify~website-content-crawler/"
             f"run-sync-get-dataset-items?token={token}")
      req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
      req.add_header("Content-Type", "application/json")
      with urllib.request.urlopen(req, timeout=300) as r:
  ```
  with:
  ```python
      req = L.build_apify_request(payload, token)
      with urllib.request.urlopen(req, timeout=300) as r:
  ```
- [ ] Run: `python3 13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py --self-test` → `self-test: crawled title/url sanitization + header-auth Apify request OK`, exit 0. Confirm no token-in-URL remains anywhere: `grep -rn "token={token}" 13_Faculty_Resources/_automation/surveillance/` → no output.
- [ ] Also run the existing suite to guard against regression: `python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test` → OK line, exit 0. (Downstream coverage note: summaries are sanitized at construction, so `issue_body` (:135) and `append_digest` (:206–210) inherit the fix without edits; the `run_guideline_surv` summary is built from trusted registry `source['name']`, and its crawled `diff_excerpt` already has fence-neutralization at lib :141–143.)
- [ ] Add the CI step in `.github/workflows/ci.yml` directly after the `Unit — citation surveillance` step (:69–70):
  ```yaml
        - name: Unit — resource intake sanitization
          run: python3 13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py --self-test
  ```
- [ ] Commit:
  ```bash
  git add 13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py \
    13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py \
    13_Faculty_Resources/_automation/surveillance/bin/run_guideline_surv.py \
    .github/workflows/ci.yml
  git commit -m "Surveillance: Apify token to Authorization header; sanitize crawled titles/URLs at construction (issue #108)"
  ```

**PR boundary:** branch `fix/surveillance-token-and-title-hardening` → PR "Surveillance: move Apify token to Authorization header; sanitize crawled titles/URLs (closes injection half of #108)" — required checks: build-test-validate + smoke. PR body notes: retitle/rescope #108 to its remaining repo-hygiene half after merge.

### Task 14: **[JOSH]** Rotate APIFY_TOKEN (after Batch 4 merges)

- [ ] In Apify Console → Settings → API & Integrations (`https://console.apify.com/settings/integrations`): create a new personal API token, then delete/revoke the old one (it has been traveling in URLs and may exist in intermediate logs).
- [ ] Update the repo secret: `https://github.com/jmoss333/psychiatry-clerkship/settings/secrets/actions` → edit `APIFY_TOKEN` with the new value.
- [ ] Verify the next scheduled run (or `workflow_dispatch` of `surveillance-resource-intake.yml`) succeeds with the header-auth code.

---

## Batch 5 — Faculty console write path under branch protection (option a)

### Task 15: ADR + **[JOSH]** decision gate (option a vs option b) — BEFORE any implementation

**Files:**
- Create: `docs/superpowers/specs/2026-08-01-faculty-attest-write-path.md`

**Interfaces:** Produces: recorded decision; Tasks 16–21 proceed only on an approved option (a).

- [ ] Write the ADR with exactly this content skeleton (fill the Decision line after Josh answers):
  ```markdown
  # ADR: Faculty console write path under main branch protection

  Date: 2026-08-01 · Status: PROPOSED → (accepted option: __)

  ## Problem
  attest.mjs commits to `main` directly (contents PUT / refs PATCH). Live protection
  (PR required, build-test-validate + smoke, strict, enforce_admins, no bypass list)
  rejects every console save with GH006/422, surfaced to faculty as the misleading
  "The repository rejected the proposed update." Last successful console commit:
  2026-07-10. Unfixed, the attestation publish gate (#256) is dead — or someone
  loosens protection, silently removing CI from every direct-commit path.

  ## Option (a) — attest/inbox branch + auto-merge PR  ← RECOMMENDED
  attest.mjs writes to a machine-owned `attest/inbox` branch (default of new
  `GIT_WRITE_BRANCH` env; `GIT_WRITE_BRANCH == GIT_BRANCH` = legacy direct mode for
  tests/emergencies) and opens/reuses ONE rolling auto-merge PR into main.
  - + CI still gates every publish (checks run on the PR; auto-merge lands it green).
  - + No changes to branch protection; no new credentials; PAT gains only
      Pull-requests read/write on this one repo.
  - + Reads move to the inbox ref when it exists → the console's confirm-by-reload
      contract keeps working unchanged (read-your-writes).
  - − Faculty UX: learner-site badges update only after the PR merges (minutes, when
      checks are green) instead of on the next deploy after save. The console shows
      a "View publish PR" link for the pending state.
  - − New failure surface: PR creation / auto-merge enablement (both best-effort
      surfaced in the response; merge can always be done manually from the PR page).

  ## Option (b) — repository ruleset + scoped GitHub App bypass
  Migrate main's classic protection to a ruleset; register a dedicated GitHub App
  used ONLY by the console; add it to the ruleset bypass list; attest.mjs keeps
  commit-on-save with App installation tokens.
  - + Preserves instant commit-on-save UX and immediate deploys.
  - − The console's writes bypass CI entirely — a bad qbank write ships to learners
      with no build-test-validate gate (the exact silent-loss class this repo
      engineers against).
  - − Requires migrating protection config (riskier change surface), creating and
      operating a GitHub App (private key custody in Netlify env), and auditing the
      bypass path forever.
  - Rejected unless (a)'s pending-merge UX proves unacceptable in practice.

  ## Decision
  Option (a|b) — signed: Joshua Moss, MD, date.
  ```
- [ ] **[JOSH]** approves option (a) (recommended) or redirects to (b). If (b): STOP — Tasks 16–21 are option-(a) tasks; a new plan iteration is required.
- [ ] Commit the ADR on the batch branch (it rides the implementation PR): `git checkout -b feat/attest-inbox-write-path && git add docs/superpowers/specs/2026-08-01-faculty-attest-write-path.md && git commit -m "ADR: faculty attest write path — attest/inbox auto-merge PR (option a)"`

### Task 16: **[JOSH]** GitHub prerequisites for option (a)

- [ ] Repo setting: enable **Allow auto-merge** — `https://github.com/jmoss333/psychiatry-clerkship/settings` → General → Pull Requests → check "Allow auto-merge".
- [ ] PAT scope: the console's fine-grained PAT (Netlify env `GITHUB_TOKEN` on the faculty site) currently has Contents read/write only. Edit it at `https://github.com/settings/personal-access-tokens` → add **Pull requests: Read and write** (same single-repo scope). Update the Netlify env var if a new token value is issued (Netlify dashboard for the faculty console site → Site configuration → Environment variables), then trigger a redeploy of the console site.
- [ ] No `GIT_WRITE_BRANCH` env var is needed (code defaults to `attest/inbox`).

### Task 17: Settings plumbing + direct-mode test migration (TDD)

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs` (:12–16 constants; `requireServerSettings` :179–207)
- Test (modify): `tests/faculty-console-handler.test.mjs` (`handlerWith` env at :395–408; new default-branch test)

**Interfaces:** Produces: `settings.writeBranch` (env `GIT_WRITE_BRANCH`, default `'attest/inbox'`; `writeBranch === branch` ⇒ legacy direct mode).

- [ ] Migrate every existing handler test to explicit direct mode with ONE line — in `handlerWith` (tests/faculty-console-handler.test.mjs:398–406) add `GIT_WRITE_BRANCH: 'main',` after `GIT_BRANCH: 'main',`. (Existing tests exercise writeAtHead/PUT mechanics, which are branch-agnostic; they stay valid as the direct-mode contract.)
- [ ] Add the failing settings test (after the config test at :444–453):
  ```js
  test('the write branch defaults to attest/inbox and rejects malformed overrides', async () => {
    const mock = createGithubMock();
    const seen = [];
    mock2: {
      // default: first branch probe on POST must target attest/inbox
      const handler = handlerWith(mock, { GIT_WRITE_BRANCH: '' });
      await handler(apiRequest('POST', { body: { target: 'content', changes: {} } }));
      seen.push(...mock.calls.map(call => call.git).filter(Boolean));
      break mock2;
    }
    assert.equal(seen.includes('ref/heads/attest/inbox'), true);

    const invalid = handlerWith(createGithubMock(), { GIT_WRITE_BRANCH: 'bad branch name' });
    const response = await invalid(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': true } },
    }));
    await expectError(response, { status: 500, code: 'server_configuration' });
  });
  ```
  Note: `{ target: 'content', changes: {} }` is a no-op mutation (returns `updated: 0`) — it exercises `prepareForWrite` (Task 19) without needing the pulls endpoints.
- [ ] Run: `node --test tests/faculty-console-handler.test.mjs` → expect the new test to fail (`ref/heads/attest/inbox` never probed; invalid name accepted); all migrated tests still pass.
- [ ] Implement in `attest.mjs` — after line 13 add:
  ```js
  const DEFAULT_WRITE_BRANCH = 'attest/inbox';
  ```
  In `requireServerSettings`, after the `branch` line (:183) add:
  ```js
    const writeBranch = readEnv(env, 'GIT_WRITE_BRANCH').trim() || DEFAULT_WRITE_BRANCH;
  ```
  extend the validation condition (:188–193) with `|| !/^[A-Za-z0-9._/-]+$/.test(writeBranch)`, and extend the return (:206) to:
  ```js
    return { token, key, repo, branch, writeBranch, student, attesterEmail, attester };
  ```
- [ ] The default-branch assertion still fails (nothing probes the ref yet) — that is expected; it goes green in Task 19. Mark it `test.todo`-free but note the cross-task red state in the commit message.
- [ ] Run: `node --test tests/*.test.mjs` → only the new test red. Commit: `git add faculty-console/netlify/functions/attest.mjs tests/faculty-console-handler.test.mjs && git commit -m "attest: GIT_WRITE_BRANCH setting (default attest/inbox); handler tests pinned to direct mode (goes green with inbox flow)"`

### Task 18: Protected-branch error mapping (TDD)

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs` (`ERROR_MESSAGES` :28–37; `githubStatusError` :209–224; `githubRequest` :248–260)
- Test (modify): `tests/faculty-console-handler.test.mjs`

**Interfaces:** Produces: error code `github_branch_protected` (422) whenever GitHub's 422 body matches `/GH006|protected branch/i`; faculty-facing message names branch protection instead of "The repository rejected the proposed update."

- [ ] Failing test (direct mode, so it documents today's GH006 path exactly):
  ```js
  test('a protected-branch 422 maps to an explicit faculty-facing error', async () => {
    const mock = createGithubMock({
      onPut: async () => jsonResponse(422, {
        message: 'GH006: Protected branch update failed for refs/heads/main.',
      }),
    });
    const handler = handlerWith(mock);
    const response = await handler(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': false } },
    }));
    await expectError(response, {
      status: 422,
      code: 'github_branch_protected',
      message: 'Branch protection blocked a direct commit. The console publishes '
        + 'through the attestation pull request — check GIT_WRITE_BRANCH '
        + 'configuration instead of retrying.',
    });
  });
  ```
- [ ] Run: `node --test tests/faculty-console-handler.test.mjs` → fails with code `github_validation_failed`.
- [ ] Implement — add to `ERROR_MESSAGES` (:28–37):
  ```js
    github_branch_protected: 'Branch protection blocked a direct commit. The console '
      + 'publishes through the attestation pull request — check GIT_WRITE_BRANCH '
      + 'configuration instead of retrying.',
  ```
  Replace `githubStatusError` (:209–224) with:
  ```js
  function githubStatusError(status, detail = '') {
    switch (status) {
      case 403:
        return new GithubError('github_forbidden', 403);
      case 409:
        return new GithubError('github_conflict', 409, { retryable: true });
      case 404:
        return new GithubError('github_request_failed', 502, { notFound: true });
      case 422:
        return /GH006|protected branch/i.test(detail)
          ? new GithubError('github_branch_protected', 422)
          : new GithubError('github_validation_failed', 422);
      case 429:
        return new GithubError('github_rate_limited', 429, { retryable: true });
      default:
        return new GithubError('github_request_failed', 502, { retryable: status >= 500 });
    }
  }
  ```
  In `githubRequest` (:248–260) replace `if (!response.ok) throw githubStatusError(response.status);` with:
  ```js
    if (!response.ok) {
      let detail = '';
      try {
        detail = String(await response.text()).slice(0, 1000);
      } catch {
        detail = '';
      }
      throw githubStatusError(response.status, detail);
    }
  ```
- [ ] Run: `node --test tests/*.test.mjs` → new test green; the `writeAtHead` 422 branch-advanced reclassification (:519–529) keys on `github_validation_failed`, which a GH006 body now correctly bypasses — confirm the existing race tests still pass. Commit: `git add -u && git commit -m "attest: map GH006/protected-branch 422 to explicit github_branch_protected error"`

### Task 19: Repository gateway inbox flow — prepareForRead / prepareForWrite (TDD)

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs` (`createRepositoryGateway` :313–541; `createHandler` :951–961)
- Test (modify): `tests/faculty-console-handler.test.mjs`

**Interfaces:** Produces: gateway methods `prepareForRead()` (use inbox ref if it exists; never mutates refs), `prepareForWrite()` (create inbox from base head if missing; reset to base head with `force:true` when it exists WITHOUT an open PR; no-op in direct mode), and internal `active` branch used by `read`/`write`/`head`/`writeAtHead`.

- [ ] Add a shared intercept helper + failing tests near the bottom of `tests/faculty-console-handler.test.mjs`:
  ```js
  function inboxIntercepts({ inboxSha = null, openPull = null, created = [], resets = [] } = {}) {
    let inboxHead = inboxSha;
    return async (call) => {
      if (call.method === 'GET' && call.git === 'ref/heads/attest/inbox') {
        return inboxHead
          ? jsonResponse(200, { object: { type: 'commit', sha: inboxHead } })
          : jsonResponse(404, { message: 'Not Found' });
      }
      if (call.method === 'POST' && call.git === 'refs') {
        const body = JSON.parse(String(call.body));
        created.push(body);
        inboxHead = body.sha;
        return jsonResponse(201, { ref: body.ref, object: { type: 'commit', sha: body.sha } });
      }
      if (call.method === 'PATCH' && call.git === 'refs/heads/attest/inbox') {
        const body = JSON.parse(String(call.body));
        resets.push(body);
        inboxHead = body.sha;
        return jsonResponse(200, { object: { type: 'commit', sha: body.sha } });
      }
      const pathname = new URL(call.url).pathname;
      if (call.method === 'GET' && pathname.endsWith('/pulls')) {
        return jsonResponse(200, openPull ? [openPull] : []);
      }
      return undefined;
    };
  }

  test('the first inbox save creates attest/inbox from the base head and commits there', async () => {
    const created = [];
    const mock = createGithubMock({ beforeRequest: inboxIntercepts({ created }) });
    const handler = handlerWith(mock, { GIT_WRITE_BRANCH: 'attest/inbox' });
    const response = await handler(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': false } },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(created, [{ ref: 'refs/heads/attest/inbox', sha: BRANCH_HEAD_SHA }]);
    assert.equal(mock.putBodies.length, 1);
    assert.equal(mock.putBodies[0].body.branch, 'attest/inbox');
  });

  test('a stale inbox with no open pull request is reset to the base head before saving', async () => {
    const resets = [];
    const mock = createGithubMock({
      beforeRequest: inboxIntercepts({ inboxSha: 'f'.repeat(64), resets }),
    });
    const handler = handlerWith(mock, { GIT_WRITE_BRANCH: 'attest/inbox' });
    const response = await handler(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': false } },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(resets, [{ sha: BRANCH_HEAD_SHA, force: true }]);
  });

  test('GET reads through the inbox ref when it exists (read-your-writes)', async () => {
    const mock = createGithubMock({
      beforeRequest: inboxIntercepts({ inboxSha: 'e'.repeat(64) }),
    });
    const handler = handlerWith(mock, { GIT_WRITE_BRANCH: 'attest/inbox' });
    const response = await handler(apiRequest('GET'));
    assert.equal(response.status, 200);
    const reviewedRead = mock.calls.find(call => call.path === REVIEWED_PATH);
    assert.equal(new URL(reviewedRead.url).searchParams.get('ref'), 'attest/inbox');
  });
  ```
  Note: these three tests need the pulls endpoint only to return `[]`, and the second one exercises the no-open-PR reset. The `openPull` field is consumed by Task 20's tests.
- [ ] Run: `node --test tests/faculty-console-handler.test.mjs` → 3 new failures (writes/reads still target `main`; no refs created).
- [ ] Implement in `createRepositoryGateway` (:313). At the top of the factory add `let active = settings.branch;`, change the three ref call sites to use `active` — `read` default (:314) to `ref = active`, `write` PUT body (:377) to `branch: active`, `head` (:403) to `` `ref/heads/${active}` ``, `writeAtHead` ref PATCH (:508) to `` `refs/heads/${active}` `` — and add before the `return` (:540):
  ```js
    async function branchHead(branch) {
      let response;
      try {
        response = await githubRequest(
          fetchImpl,
          gitRepositoryUrl(settings, `ref/heads/${branch}`),
          { headers: githubHeaders(settings.token) },
        );
      } catch (error) {
        if (error instanceof GithubError && error.notFound) return null;
        throw error;
      }
      const payload = await githubJson(response);
      if (payload.object?.type !== 'commit') {
        throw new GithubError('github_response_invalid', 502);
      }
      return normalizeGitObjectId(payload.object.sha);
    }

    async function findOpenInboxPullRequest() {
      const owner = settings.repo.split('/')[0];
      const query = `state=open&base=${encodeURIComponent(settings.branch)}`
        + `&head=${encodeURIComponent(`${owner}:${settings.writeBranch}`)}`;
      const response = await githubRequest(
        fetchImpl,
        `${GITHUB_API}/repos/${settings.repo}/pulls?${query}`,
        { headers: githubHeaders(settings.token) },
      );
      let pulls;
      try {
        pulls = await response.json();
      } catch {
        throw new GithubError('github_response_invalid', 502);
      }
      if (!Array.isArray(pulls)) throw new GithubError('github_response_invalid', 502);
      return pulls.length && isRecord(pulls[0]) ? pulls[0] : null;
    }

    async function prepareForRead() {
      if (settings.writeBranch === settings.branch) return;
      if (await branchHead(settings.writeBranch) !== null) active = settings.writeBranch;
    }

    async function prepareForWrite() {
      if (settings.writeBranch === settings.branch) return;
      const inboxHead = await branchHead(settings.writeBranch);
      if (inboxHead === null) {
        const baseHead = await branchHead(settings.branch);
        if (baseHead === null) throw new GithubError('github_response_invalid', 502);
        await githubRequest(
          fetchImpl,
          gitRepositoryUrl(settings, 'refs'),
          {
            method: 'POST',
            headers: githubHeaders(settings.token),
            body: JSON.stringify({
              ref: `refs/heads/${settings.writeBranch}`,
              sha: baseHead,
            }),
          },
        );
      } else if (!(await findOpenInboxPullRequest())) {
        // The inbox is machine-owned: any state not represented by an open PR
        // (merged or rejected) is disposable — reset onto the base head.
        const baseHead = await branchHead(settings.branch);
        if (baseHead !== null && baseHead !== inboxHead) {
          await githubRequest(
            fetchImpl,
            gitRepositoryUrl(settings, `refs/heads/${settings.writeBranch}`),
            {
              method: 'PATCH',
              headers: githubHeaders(settings.token),
              body: JSON.stringify({ sha: baseHead, force: true }),
            },
          );
        }
      }
      active = settings.writeBranch;
    }
  ```
  and extend the gateway return to `return { read, write, head, writeAtHead, prepareForRead, prepareForWrite, findOpenInboxPullRequest };`.
- [ ] Wire the handler (:951–961): `case 'GET':` becomes
  ```js
        case 'GET':
          await repository.prepareForRead();
          return jsonResponse(context, 200, await buildState(repository, settings));
  ```
  and in the POST case insert `await repository.prepareForWrite();` immediately after `const body = await readPostBody(request);`.
- [ ] Run: `node --test tests/*.test.mjs` → the 3 new tests AND Task 17's default-branch test green; all direct-mode tests untouched. Commit: `git add -u && git commit -m "attest: machine-owned attest/inbox write ref with create/reset lifecycle and read-your-writes"`

### Task 20: ensurePullRequest + auto-merge + response contract (TDD)

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs` (gateway + POST case; existing full-payload assertion at tests :1777)
- Test (modify): `tests/faculty-console-handler.test.mjs`

**Interfaces:** Produces: every POST success payload gains `pullRequest: { number, url, autoMerge } | null` (null in direct mode or when `updated === 0`); gateway method `ensurePullRequest()` (list → create → GraphQL `enablePullRequestAutoMerge`, best-effort).

- [ ] Failing tests:
  ```js
  test('a first inbox save opens the rolling auto-merge pull request', async () => {
    const pullsCreated = [];
    const graphql = [];
    const base = inboxIntercepts({});
    const mock = createGithubMock({
      beforeRequest: async (call, helpers) => {
        const pathname = new URL(call.url).pathname;
        if (call.method === 'POST' && pathname.endsWith('/pulls')) {
          pullsCreated.push(JSON.parse(String(call.body)));
          return jsonResponse(201, {
            number: 77,
            html_url: 'https://github.example/pull/77',
            node_id: 'PR_node77',
          });
        }
        if (call.method === 'POST' && pathname === '/graphql') {
          graphql.push(JSON.parse(String(call.body)));
          return jsonResponse(200, {
            data: { enablePullRequestAutoMerge: { pullRequest: { number: 77 } } },
          });
        }
        return base(call, helpers);
      },
    });
    const handler = handlerWith(mock, { GIT_WRITE_BRANCH: 'attest/inbox' });
    const response = await handler(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': false } },
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.pullRequest, {
      number: 77,
      url: 'https://github.example/pull/77',
      autoMerge: true,
    });
    assert.deepEqual(pullsCreated.map(({ head, base: prBase }) => ({ head, base: prBase })), [
      { head: 'attest/inbox', base: 'main' },
    ]);
    assert.equal(graphql.length, 1);
    assert.match(graphql[0].query, /enablePullRequestAutoMerge/);
    assert.deepEqual(graphql[0].variables, { id: 'PR_node77' });
  });

  test('a save with an open inbox pull request reuses it without reset or re-create', async () => {
    const openPull = {
      number: 41,
      html_url: 'https://github.example/pull/41',
      node_id: 'PR_node41',
    };
    const resets = [];
    const base = inboxIntercepts({ inboxSha: 'd'.repeat(64), openPull, resets });
    const graphql = [];
    const mock = createGithubMock({
      beforeRequest: async (call, helpers) => {
        const pathname = new URL(call.url).pathname;
        if (call.method === 'POST' && pathname === '/graphql') {
          graphql.push(true);
          return jsonResponse(200, {
            data: { enablePullRequestAutoMerge: { pullRequest: { number: 41 } } },
          });
        }
        if (call.method === 'POST' && pathname.endsWith('/pulls')) {
          throw new Error('must not create a second pull request');
        }
        return base(call, helpers);
      },
    });
    const handler = handlerWith(mock, { GIT_WRITE_BRANCH: 'attest/inbox' });
    const response = await handler(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': false } },
    }));
    const payload = await response.json();
    assert.deepEqual(resets, []);
    assert.deepEqual(payload.pullRequest, {
      number: 41,
      url: 'https://github.example/pull/41',
      autoMerge: true,
    });
  });

  test('direct mode and no-op saves carry pullRequest null', async () => {
    const mock = createGithubMock();
    const handler = handlerWith(mock);
    const response = await handler(apiRequest('POST', {
      body: { target: 'content', changes: { 't_mood.md': false } },
    }));
    const payload = await response.json();
    assert.equal(Object.hasOwn(payload, 'pullRequest'), true);
    assert.equal(payload.pullRequest, null);
  });
  ```
- [ ] Run: `node --test tests/faculty-console-handler.test.mjs` → 3 failures (`pullRequest` undefined).
- [ ] Implement — add inside `createRepositoryGateway` (after `prepareForWrite`):
  ```js
    async function ensurePullRequest() {
      if (settings.writeBranch === settings.branch) return null;
      let pull = await findOpenInboxPullRequest();
      if (!pull) {
        const response = await githubRequest(
          fetchImpl,
          `${GITHUB_API}/repos/${settings.repo}/pulls`,
          {
            method: 'POST',
            headers: githubHeaders(settings.token),
            body: JSON.stringify({
              title: 'Faculty attestation inbox',
              head: settings.writeBranch,
              base: settings.branch,
              body: 'Automated commits from the Faculty Attestation Console. '
                + 'Required checks gate the merge; auto-merge lands it when green.',
            }),
          },
        );
        pull = await githubJson(response);
      }
      const number = Number.isInteger(pull.number) ? pull.number : null;
      const url = typeof pull.html_url === 'string' ? pull.html_url : null;
      const nodeId = typeof pull.node_id === 'string' ? pull.node_id : '';
      if (number === null || !url) throw new GithubError('github_response_invalid', 502);
      let autoMerge = false;
      if (nodeId) {
        try {
          const response = await githubRequest(fetchImpl, `${GITHUB_API}/graphql`, {
            method: 'POST',
            headers: githubHeaders(settings.token),
            body: JSON.stringify({
              query: 'mutation($id: ID!) { enablePullRequestAutoMerge('
                + 'input: { pullRequestId: $id, mergeMethod: SQUASH }) '
                + '{ pullRequest { number } } }',
              variables: { id: nodeId },
            }),
          });
          const payload = await githubJson(response);
          autoMerge = isRecord(payload.data?.enablePullRequestAutoMerge)
            && !Array.isArray(payload.errors);
        } catch {
          autoMerge = false; // best-effort: the PR exists; merging can be manual
        }
      }
      return { number, url, autoMerge };
    }
  ```
  add `ensurePullRequest` to the gateway return, and rewrite the POST case (:954–961) to:
  ```js
        case 'POST': {
          const body = await readPostBody(request);
          await repository.prepareForWrite();
          const result = await handlePost({
            repository,
            body,
            attester: settings.attester,
          });
          const pullRequest = result.updated > 0
            ? await repository.ensurePullRequest()
            : null;
          return jsonResponse(context, 200, { ...result, pullRequest });
        }
  ```
- [ ] Fix the one strict full-payload assertion: `grep -n "deepEqual(payload, {" tests/faculty-console-handler.test.mjs` (currently :1777) — add `pullRequest: null,` to the expected object.
- [ ] Run: `node --test tests/*.test.mjs` → all green. Commit: `git add -u && git commit -m "attest: rolling auto-merge PR from attest/inbox; pullRequest receipt in POST payloads"`

### Task 21: Console UI pending-merge receipt + README/docs

**Files:**
- Modify: `faculty-console/app.mjs` (POST success handlers — re-anchor with `grep -n "safeExternalUrl(payload.commit)" faculty-console/app.mjs`, pre-streamline :2776/:2905/:2997; receipt render `renderActionFeedback`, pre-streamline :2281–2311)
- Modify: `faculty-console/README.md` (env table + "How it works" step 8)
- Test: CI smoke (`tests/smoke/faculty-console.spec.js`) — verify via CI, not locally

**Interfaces:** Consumes: `payload.pullRequest` from Task 20. Produces: "View publish PR ↗" link beside every commit receipt; `state.pendingPullRequestUrl`.

- [ ] **Re-anchor first** (streamline rewrote app.mjs in Batch 1): run `grep -n "safeExternalUrl(payload.commit)\|View commit ↗\|state = {" faculty-console/app.mjs` and confirm the three POST success handlers and `renderActionFeedback` still exist in recognizable form; adjust the anchors below to the current text, keeping the code identical.
- [ ] In the state initializer add `pendingPullRequestUrl: null,`. In EACH POST success handler, directly after the line `const commitUrl = safeExternalUrl(payload.commit);` (or its qbank equivalents `const successCommitUrl = safeExternalUrl(payload.commit);`) add:
  ```js
      state.pendingPullRequestUrl = payload.pullRequest && typeof payload.pullRequest === 'object'
        ? safeExternalUrl(payload.pullRequest.url)
        : null;
  ```
- [ ] In `renderActionFeedback`, after each `'View commit ↗'` anchor expression add the sibling pair:
  ```js
        state.pendingPullRequestUrl ? ' ' : null,
        state.pendingPullRequestUrl ? el('a', {
          href: state.pendingPullRequestUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, ['View publish PR ↗']) : null,
  ```
- [ ] Update `faculty-console/README.md`: env table gains
  ```
  | `GIT_WRITE_BRANCH` | machine-owned write branch, publishes via one rolling auto-merge PR *(optional; default `attest/inbox`; set equal to `GIT_BRANCH` for legacy direct commits)* |
  ```
  and the final "How it works" step becomes: `Saves commit to the `attest/inbox` branch and ride one rolling auto-merge pull request into `main`; required CI checks gate the merge, then Netlify rebuilds the student sites. Badges update on the deploy after the PR merges — the receipt links both the commit and the publish PR.`
- [ ] Run `node --test tests/*.test.mjs` → green. Push branch; verify build-test-validate AND smoke in CI (`gh pr checks --watch`); if `tests/smoke/faculty-console.spec.js` stubs `/api/attest` POST payloads, add `pullRequest: null` to its stub fixtures (locate with `grep -n "pullRequest\|api/attest" tests/smoke/faculty-console.spec.js`).
- [ ] Commit: `git add -u && git commit -m "faculty-console: surface publish-PR receipt; document attest/inbox write path"`
- [ ] After merge, verify end-to-end on the live console **[JOSH]-assisted]**: one real attestation save → response shows the PR link → PR auto-merges when checks pass → learner badge updates on the following deploy.

**PR boundary:** branch `feat/attest-inbox-write-path` → PR "Faculty console: publish attestations via attest/inbox auto-merge PR (audit WS1, option a)" — required checks: build-test-validate + smoke. Must land AFTER Batch 1 and BEFORE #263 leaves draft (it touches `attest.mjs`, which #263 also modifies — the Task 5 comment covers this ordering).

---

## Execution order

1. Batch 1 (Tasks 1–5) — first: removes the loss-risk branch and unblocks all faculty-console sequencing.
2. Batches 2, 3 (Task 9), and 4 — independent; parallelizable.
3. Task 10–11 — when Josh runs the checklist (highest clinical-safety item; schedule early).
4. Batch 5 (Tasks 15–21) — after Batch 1 merges and the ADR decision is recorded; before #263 un-drafts.
5. Task 14 (token rotation) — any time after Batch 4 merges.
