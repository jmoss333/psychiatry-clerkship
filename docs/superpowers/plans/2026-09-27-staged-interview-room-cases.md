# Staged Interview Room Cases Implementation Plan

> **Superseded in part, 2026-09-27** — decision `sp-redteam-signoff-retired` (`docs/superpowers/specs/2026-09-27-red-team-signoff-retired.md`). The live checklist and receipt are now optional, not the required default after every deploy, and a new case no longer needs hand-written probes in a separate governance PR: it lands in one content PR, and `bin/redteam-offline.mjs` checks every reviewed case automatically (S1–S3). The `pending` stage and the per-(case, gate) coverage table remain, the latter as a report. The text below is kept as it was designed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit a synthetic `pending` case to be registered in the reviewed Interview Room pack while keeping it unavailable to learners and visibly outside deterministic red-team coverage until promotion.

**Architecture:** The pack validator accepts one narrowly defined pending shape and still requires at least one selectable reviewed case. Existing learner and proxy filters continue to select only literal `reviewed`; synthetic denial tests pin every route. The Tier 1 runner divides the pack into reviewed and pending sets, enforces coverage only for reviewed cases, and prints the pending set and its unevaluated gates.

**Tech Stack:** Python `unittest`; Node 22 `node:test`; static HTML/JS, Netlify Functions; existing `bin/verify.sh`.

**Spec:** `docs/superpowers/specs/2026-09-27-red-team-governance-simplification-design.md` §§2.1, 3–5.

## Global Constraints

- Wait for Claude-owned PR #841 to merge, or explicitly incorporate its exact head; refresh `main` and the collision report before editing `bin/redteam-offline.mjs`, its tests, or the red-team runbook.
- Keep case content, case probes, and faculty ledger writes in separate PRs. Do not edit `reviewed.json` or #842's attestation work in this implementation.
- The complete pack remains a public learner-site asset and an `extraSources` input to the `sp-interview.html` attestation hash; only synthetic, no-PHI pending content is permitted.
- A per-case `facultyReview` block registers selectable status; the faculty console's `reviewed.json` row remains the attestation of record. Do not promote a case or sign a faculty review in tests or automation.
- Literal `pending` is the only new allowed status in a reviewed pack; unknown values fail closed. A passing mechanical check never means a human red-team pass.
- Run `python3 tools/coordination/collision_report.py --check --path <each edited path>` before each PR and coordinate any `OCCUPIED` or `COORDINATE` result. Preserve unrelated changes.

## Review Focus

1. A pending case with a stale reviewer/date must fail validation; Task 1 tests the exact pending shape.
2. An unknown status such as `reviewed-pending` must fail rather than be treated as pending; Task 1 tests it.
3. A reviewed pack containing only pending cases must fail; Tasks 1 and 3 test the empty selectable set.
4. A direct case ID in typed, real-time, or managed voice must be denied even if the menu hides the case; Task 2 tests each path.
5. A pending case with a new gate must be named as unevaluated, while the same gate after promotion must require a passing same-case probe; Task 3 tests both states.

---

## File map and execution boundary

| File | Responsibility |
|---|---|
| `13_Faculty_Resources/_automation/validate_attestation_consistency.py` | Pack registration rule and nonempty reviewed selectable set |
| `13_Faculty_Resources/_automation/test_validate_attestation_consistency.py` | Synthetic validator fixtures |
| `decisions.json` | Owner-approved amendment to `pack-case-review-is-registration`; amend its note only, preserving decision history |
| `_prototypes/sp-interview/tests/review-filter.test.mjs` | Learner menu and managed-voice denial |
| `sp-proxy/tests/sp-pack-governance.test.mjs`, `sp-proxy/tests/sp-realtime-handler.test.mjs` | Direct ID denial on typed and real-time paths |
| `bin/redteam-offline.mjs`, `sp-proxy/tests/redteam-offline.test.mjs` | Claude-owned #841 supplies per-(case, gate) coverage, pending-case reporting, and unknown-status rejection; verify their final merged contract without duplicating it |
| `docs/RED_TEAM_RUNBOOK.md` | Record the now-green case landing order after #841 |

This plan ships **staging support only**. A later content PR adds a real pending case; a separate governance PR adds that case's probes; a later owner-reviewed content PR promotes it. No example clinical case is committed by this plan.

### Task 1: Make the pack registration rule explicit

**Files:** Modify `13_Faculty_Resources/_automation/validate_attestation_consistency.py:722-782`, `13_Faculty_Resources/_automation/test_validate_attestation_consistency.py:610-670`, `decisions.json:245-255`.

**Interfaces:** Consumes `norm_status`, `is_reviewed`, `_validate_speech_engine`; produces `_validate_pack(...) -> list[str]` with `pending` accepted only when its `reviewer`, `lastReviewed`, and `reviewedAt` are empty, and with at least one literal `reviewed` selectable case in a reviewed pack. Preserve the existing `attested` alias for reviewer/date validation; it does not satisfy the literal selectable-case floor.

- [ ] **Step 1: Write failing fixture assertions.** Add a helper that copies `pending_pack()`, sets top-level `status = 'reviewed'`, adds one synthetic case with `facultyReview = {'status': 'pending', 'reviewer': None, 'lastReviewed': None}`, and uses the existing `write_fixture(...)`/`self.validate(root)` pattern. Assert `errors == []` for that shape. In subtests replace `reviewer` with `'Old Reviewer'`, `lastReviewed` with `'2026-09-01'`, and `status` with `'reviewed-pending'`; assert each yields a case-specific error. Set every case to pending and assert a reviewed-pack/no-reviewed-case error.

```python
with self.subTest(field="reviewer"):
    pack["cases"][-1]["facultyReview"]["reviewer"] = "Old Reviewer"
    with tempfile.TemporaryDirectory() as root:
        write_fixture(root, ledger_status="reviewed", tool_status="reviewed", pack=pack)
        errors = self.validate(root)
    self.assertTrue(any("pending case" in e and "reviewer" in e for e in errors))
```

- [ ] **Step 2: Run the validator test and confirm the allowed pending case fails under the current rule.**

```bash
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
```

Expected: the new positive assertion reports `attested pack contains non-reviewed case`; existing draft rejection stays green.

- [ ] **Step 3: Implement the narrow branch.** Count cases whose raw `review.get('status') == 'reviewed'`; for a reviewed pack accept only raw `pending` with empty sign-off fields as the new exception, otherwise retain the non-reviewed error. Check the literal reviewed count after the loop. Do not change the existing `attested` reviewer/date rule or speech-profile checks.

```python
pending = review.get("status") == "pending"
if pending and any(review.get(key) for key in ("reviewer", "lastReviewed", "reviewedAt")):
    errors.append("%s: pending case %s has reviewer or review date" % (slug, case_id))
if is_reviewed(pack_status) and not is_reviewed(case_status) and not pending:
    errors.append("%s: attested pack contains non-reviewed case %s" % (slug, case_id))
```

Amend the active decision's `note` to state that a pending synthetic case may be registered but is not selectable, and that promotion plus final console re-attestation remain owner acts. The user's approval of the written spec is the decision authority; retain the original `decided` and `rationaleRef` history.

- [ ] **Step 4: Run focused tests and the validator.**

```bash
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
```

Expected: both exit 0. Also temporarily remove the new branch in a scratch diff, observe the positive fixture fail, then restore it; this proves the fixture detects the actual change.

- [ ] **Step 5: Commit the validator, tests, and decision amendment.**

```bash
git add 13_Faculty_Resources/_automation/validate_attestation_consistency.py 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py decisions.json
git commit -m "feat: allow unselectable pending interview cases in reviewed packs"
```

### Task 2: Pin selection denial on all learner and proxy paths

**Files:** Modify `_prototypes/sp-interview/tests/review-filter.test.mjs`, `sp-proxy/tests/sp-pack-governance.test.mjs`, `sp-proxy/tests/sp-realtime-handler.test.mjs`; modify a runtime file only if its controlled fixture reveals a real fail-open path.

**Interfaces:** Consumes a synthetic pack with one `reviewed` and one `pending` case. Produces tests proving `eligibleCases` and `reviewedCaseSummaries` omit pending, `resolveReviewedCase` rejects its direct ID with `case_not_reviewed`, and managed voice/realtime reject it. Existing runtime policy must remain literal `reviewed`.

- [ ] **Step 1: Add controlled denial assertions.** In `review-filter.test.mjs`, change the synthetic pending status from `draft-pending-attestation` to literal `pending` and assert managed voice with `caseStatus: 'pending'` is false. In the proxy suites, clone a reviewed fixture case, set `facultyReview` to pending with no reviewer/date, preserve a separate reviewed case, and call the existing handler harness directly with the pending ID.

```js
assert.deepEqual(testApi.eligibleCases({ cases: [
  { id: 'ready', facultyReview: { status: 'reviewed' } },
  { id: 'staged', facultyReview: { status: 'pending' } },
]}).map(c => c.id), ['ready']);
assert.equal(eligibleWith({ ...reviewedAll, caseStatus: 'pending' }), false);
```

- [ ] **Step 2: Run the focused suites.**

```bash
node _prototypes/sp-interview/tests/review-filter.test.mjs
npm --prefix sp-proxy test -- --test-name-pattern='case not reviewed|pending'
```

Expected: the positive reviewed route succeeds and all pending menu/direct-ID/voice routes deny. If the test name filter is unsupported by this package script, run `npm --prefix sp-proxy test` and preserve the same assertions.

- [ ] **Step 3: If a path fails open, make only that path call the existing shared policy.** For proxy paths, use `resolveReviewedCase({ pack, caseId, now })` from `sp-proxy/netlify/functions/_shared/sp-governance.mjs`; for the browser, keep `facultyReview?.status === 'reviewed'`. Avoid duplicating an allowlist in a new file.

```js
const caseDef = resolveReviewedCase({ pack, caseId, now: runtime.now });
```

- [ ] **Step 4: Break and restore one denial condition in a temporary scratch diff, then rerun the test.** Replacing the literal browser or shared-proxy check with an always-true predicate must turn the new assertion red. Restore the source and rerun the focused suites green.

- [ ] **Step 5: Commit denial coverage and any minimal repair.**

```bash
git add _prototypes/sp-interview/tests/review-filter.test.mjs sp-proxy/tests/sp-pack-governance.test.mjs sp-proxy/tests/sp-realtime-handler.test.mjs
git commit -m "test: pin pending interview case denial across routes"
```

Include any runtime file actually repaired in that commit's `git add` list after reviewing its diff.

### Task 3: Verify the landing sequence against Claude's merged coverage guard

**Files:** Read `bin/redteam-offline.mjs` and `sp-proxy/tests/redteam-offline.test.mjs` from #841's final merge; modify `docs/RED_TEAM_RUNBOOK.md` only.

**Interfaces:** Consumes #841's established rule: only literal `reviewed` cases are selectable and coverable; `pending` cases and their gates are shown but unevaluated; `attested` and unknown statuses fail Tier 1 even though the older Python validator recognizes `attested` as a reviewed alias. This plan changes the validator exception for `pending` without loosening #841's fail-closed runner.

- [ ] **Step 1: Confirm #841's final contract and tests on the actual merged head.** Check the PR's merge SHA and the working branch's ancestry. Run the existing pending, promotion, repeated-gate-ID, duplicate-probe-ID, and unknown-status fixtures from `sp-proxy/tests/redteam-offline.test.mjs`.

```bash
gh pr view 841 --json state,mergedAt,mergeCommit,headRefOid
node --test sp-proxy/tests/redteam-offline.test.mjs
```

Expected: #841 merged and all its contract tests pass. If it remains open, keep this task waiting while Tasks 1–2 proceed on non-overlapping paths.

- [ ] **Step 2: Exercise the cross-boundary pending shape.** Use Task 1's reviewed-pack/pending-case fixture to confirm Python accepts it. Use #841's pending fixture to confirm Tier 1 exits 0 and names the pending case/gates as unevaluated; use its promoted fixture to confirm Tier 1 exits 1 until a matching probe passes. Run both modes so the prose table and CI exit agree.

```bash
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
node --test sp-proxy/tests/redteam-offline.test.mjs
node bin/redteam-offline.mjs --coverage
```

Expected: the real pack and controlled pending fixture pass their intended checks; the controlled premature-promotion fixture fails. No pending case is counted as a passing production probe.

- [ ] **Step 3: Document the green landing order.** In `docs/RED_TEAM_RUNBOOK.md`, add the four steps: pending synthetic case in a content PR; case-specific probes in a separate governance PR tested on a status-flipped temporary copy; owner-reviewed promotion in a content PR; faculty-console re-attestation of the final `sp-interview.html` pack hash. State that the pending raw JSON is public and that candidate probe results are not production coverage or faculty sign-off.

```markdown
1. Register the synthetic case as `pending`; learners cannot select it.
2. Add its probes separately and test a temporary copy with only its status flipped to `reviewed`.
3. Promote it in an owner-reviewed content change after the probes pass.
4. Re-attest the final pack through the faculty console.
```

- [ ] **Step 4: Run the full local gate and commit the operator clarification.**

```bash
bash bin/verify.sh
git add docs/RED_TEAM_RUNBOOK.md
git commit -m "docs: record the staged Interview Room case landing order"
```

Expected: the full gate passes and the final diff contains no case content, red-team runner edit, or `reviewed.json` write. Before opening a PR, rerun the collision report on every changed path and confirm #841's final merge is in this branch.
