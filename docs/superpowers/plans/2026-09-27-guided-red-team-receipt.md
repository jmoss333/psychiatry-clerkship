# Guided Red-Team Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Interview Room owner one guided, content-free route from exact deployed revisions and mechanical checks to an honest human red-team receipt that monthly maintenance can verify.

**Architecture:** A read-only prepare command collects immutable Netlify deploy records, reconstructs the deployed pack from the proxy commit, checks the runtime manifests, and runs Tier 1/Tier 2 without exposing the passcode. A separate record command collects human row outcomes and writes a schema-v2 receipt only after checking every required row. Monthly review applies a pure receipt validator to the same deploy identities and pack/model facts; missing or changed evidence stays unverified, incomplete, stale, or mismatched.

**Tech Stack:** Python 3.11 `unittest`, `urllib.request`, Git; existing Bash Tier 2; Netlify read-only API; GitHub Actions monthly workflow.

**Spec:** `docs/superpowers/specs/2026-09-27-red-team-governance-simplification-design.md` §§2.2–2.3, 3–5.

## Global Constraints

- Begin after the staged-case plan and Claude-owned PR #841 are incorporated, or re-evaluate their exact heads. Keep #841's red-team runner/checklist edits out of concurrent changes.
- The full A–E human checklist remains required after each affected Interview Room deploy, model change, or pack change. Add R if real-time voice is verified enabled and V if managed voice is verified enabled; unknown activation state is unverified, not false.
- The passcode is entered only at the existing hidden terminal prompt. Neither a command argument, JSON file, receipt, log, nor agent transcript may contain it. Do not read or print Netlify secret variables.
- `passed` requires a named owner's explicit declaration, every required manual row passing, Tier 1 and Tier 2 passing, and exact immutable deploy, pack, and runtime model evidence. Script output does not authenticate a person's clinical judgment.
- The SP proxy's production branch is `main`; the two learner sites currently publish `release`. Store and compare each site's own deploy ID and commit; never imply one joint release SHA.
- A `ready` Netlify deploy or green health receipt proves only its own bounded condition. Real-time voice activation remains separately gated by privacy, spending, rate-card, audition, headset, and production-context checks.
- Reuse site IDs from `13_Faculty_Resources/_automation/maintenance/maintenance_config.json`. No new credential or raw response is committed. Run the collision sentinel on every edited path before mutations.

## Review Focus

1. A Netlify response with no published production deploy, wrong site ID, missing commit, or preview context must be unverified; Task 1 tests each.
2. A correct checkout pack paired with a different proxy deploy commit must be mismatch; Tasks 1 and 3 test exact-commit hashing.
3. A Tier 2 credential failure or skipped check must not be recorded as passing; Task 2 tests the structured result.
4. Missing R/V when the relevant voice path is enabled, or unknown activation state, must prevent a passed receipt; Task 3 tests these combinations.
5. A legacy A–E receipt, later production deploy, or receipt time before publication must not appear current; Task 4 tests all three.

---

## File map and receipt contract

| File | Responsibility |
|---|---|
| `13_Faculty_Resources/_automation/maintenance/red_team_deploys.py` (new) | Read-only Netlify deploy lookup, strict record normalization, `git show` of the proxy commit's pack |
| `tests/maintenance/test_red_team_deploys.py` (new) | Synthetic Netlify/Git responses, no network |
| `bin/redteam-live.sh`, `tests/redteam-live.test.mjs` | Optional content-free `--result-json` output with per-probe pass/fail/skip and verified manifest fields; preserve hidden prompt |
| `13_Faculty_Resources/_automation/maintenance/red_team_preflight.py` (new) | `prepare` entry point, mechanical checks and local untracked work file |
| `13_Faculty_Resources/_automation/maintenance/record_red_team.py`, `tests/maintenance/test_record_red_team.py` | Pure schema-v2 receipt builder and `record` entry point |
| `13_Faculty_Resources/_automation/maintenance/monthly_review.py`, `tests/maintenance/test_monthly_review.py` | Pure receipt classification against exact current deploy snapshot, with reason |
| `.github/workflows/maintenance-monthly-review.yml` | Pass existing read-only `NETLIFY_AUTH_TOKEN` secret to monthly review; missing token remains unverified |
| `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py` | Update the monthly workflow contract digest if its YAML changes |
| `docs/RED_TEAM_RUNBOOK.md`, `sp-proxy/REDTEAM_CHECKLIST.md` | Operator sequence and precise limits, after #841 |

Schema-v2 receipt fields are `schemaVersion: 2`, `state`, `checkedAt`, `packSha256`, `packVersion`, `model`, `deployments` (`proxy`, `ms3`, `res`, each with `siteId`, `deployId`, `commitRef`, `deployUrl`, `publishedAt`), `runtime` (`actorModel`, `evaluatorModel`, `realtimeEnabled`, `realtimeModel`, `transcriptionModel`, `managedVoiceEnabled`, `managedVoiceStack`), `requiredSections`, `completedSections`, `manualRows` (row ID -> `pass|fail|blocked` plus bounded reason), `mechanical` (Tier 1/2 result IDs and times), `signedBy`, and `checklist`. Manual IDs are A1–A5, C1/C2/C4/C5, D2/D3/D4/D6/D7, and one E golden-transcript verdict; B1–B7, C3, D1/D5 come from the mechanical tiers. R1–R16 and V1–V10 join the manual list only when the corresponding route is verified enabled. The schema contains references and verdicts only; no prompts, patient replies, audio, headers, or raw logs. Keep the existing `packSha256`, `model`, and `state` fields for consumers, but do not treat legacy receipts as upgraded.

### Task 1: Identify the exact deployed object without a secret readback

**Files:** Create `13_Faculty_Resources/_automation/maintenance/red_team_deploys.py`, `tests/maintenance/test_red_team_deploys.py`.

**Interfaces:** `deployed_pack_bytes(proxy_commit: str, git_show: Callable) -> bytes` reads only that Git revision; `fetch_snapshot(config: dict, token: str, get_json: Callable, git_show: Callable) -> dict` returns normalized `deployments`, `packSha256`, `packVersion`, and `model` or raises `EvidenceUnavailable(reason)`; its callers never receive raw Netlify JSON. `get_json` is injected for tests. Query `GET /api/v1/sites/{site_id}/deploys?production=true&latest-published=true&per_page=1`, then `GET /api/v1/deploys/{id}` for each site, and require an exact `site_id`, `context == 'production'`, `state == 'ready'`, nonempty `commit_ref`, valid `published_at`, and deploy permalink.

- [ ] **Step 1: Write failing tests with fake records.** Give all three configured site IDs one ready production record and a fake `git_show(commit, path)` returning synthetic pack bytes. Assert the SHA-256 matches those bytes, not the caller's checkout. Vary each of: empty result list, second site ID, missing commit, `context='deploy-preview'`, and absent `published_at`; assert `EvidenceUnavailable` with a specific reason.

```python
with self.assertRaisesRegex(EvidenceUnavailable, "preview context"):
    fetch_snapshot(config, "fixture-token", preview_get_json, fake_git_show)
self.assertEqual(snapshot["packSha256"], sha256(deployed_pack_bytes).hexdigest())
```

- [ ] **Step 2: Run the new test and confirm the import/function failure.**

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_red_team_deploys.py'
```

Expected: FAIL because `red_team_deploys.py` does not exist.

- [ ] **Step 3: Implement strict normalization and exact-commit pack loading.** Use the site IDs in config, a 20-second API timeout, and `git show <proxy_commit>:_prototypes/sp-interview/sp-interview.pack.json` via an argument list with no shell. Reject a missing local commit as unverified; do not substitute the working tree. Validate `deploy_ssl_url` or `deploy_url` is an immutable deploy URL containing the returned ID. Never call the Netlify environment-variable API.

```python
pack_bytes = deployed_pack_bytes(proxy["commitRef"], git_show)
pack = json.loads(pack_bytes)
return {"deployments": deployments,
        "packSha256": sha256(pack_bytes).hexdigest(),
        "packVersion": pack["version"],
        "model": pack["engine"]["modelPinned"]}
```

- [ ] **Step 4: Run focused tests, then commit.**

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_red_team_deploys.py'
git add 13_Faculty_Resources/_automation/maintenance/red_team_deploys.py tests/maintenance/test_red_team_deploys.py
git commit -m "feat: bind red-team preparation to immutable Netlify deploys"
```

Expected: tests pass with zero network calls. A failed lookup raises rather than returning an empty snapshot.

### Task 2: Make Tier 2 return content-free machine evidence

**Files:** Modify `bin/redteam-live.sh`, `tests/redteam-live.test.mjs`; create `13_Faculty_Resources/_automation/maintenance/red_team_preflight.py`, `tests/maintenance/test_red_team_preflight.py`.

**Interfaces:** Tier 2's optional `--result-json <path>` writes `{schemaVersion:1, tier:'live', state:'passed|failed|blocked', checks:[{id,status}], actorModel, evaluatorModel, packVersion, packSha256, realtimeEnabled, realtimeModel, transcriptionModel, managedVoiceEnabled, managedVoiceStack}` after authenticated GETs to `/api/sp`, `/api/sp/realtime`, and `/api/sp/voice`; `red_team_preflight.prepare(snapshot, tier1_runner, tier2_runner) -> dict` rejects skip/fail/unknown and returns a content-free work record with `state:'prepared'`, never `passed`. Default Tier 2 terminal behavior and hidden passcode prompt remain unchanged.

- [ ] **Step 1: Add a failing Tier 2 fixture test.** The existing `tests/redteam-live.test.mjs` fake endpoint should force D0 401 and a skipped B5; assert the JSON state is `failed`, not `passed`, and contains no fake passcode or request body. A successful fixture asserts exact actor/evaluator model and pack version from D0's manifest. Add a Python fake runner test where `checks` includes `{id:'B5',status:'skipped'}` and assert `prepare(...)` returns blocked.

```js
assert.equal(result.state, 'failed');
assert.equal(result.checks.find(check => check.id === 'B5').status, 'skipped');
assert.doesNotMatch(JSON.stringify(result), /fixture-passcode|patient reply/i);
```

- [ ] **Step 2: Run tests and confirm the new JSON option fails.**

```bash
node --test tests/redteam-live.test.mjs
python3 -m unittest discover -s tests/maintenance -p 'test_red_team_preflight.py'
```

Expected: the new option/work-record assertions fail before implementation.

- [ ] **Step 3: Add structured emission without touching credential resolution.** Collect the script's existing `ok`, `bad`, and `skip` IDs into a temporary local list; use the same in-process passcode to GET the typed, real-time, and managed-voice health manifests. Emit only the allowlisted model/hash/voice-state fields and check verdicts to an explicit output path with mode `0600`, after all responses and the final exit state are known. In `prepare`, run Tier 1 against an extracted file of the exact proxy-commit pack bytes and reject nonzero or zero-probe output. Run Tier 2 as an attached terminal subprocess so its hidden prompt works; read only its sanitized JSON. Compare actor/evaluator models, pack version, and pack SHA-256 to `snapshot`. A failed voice health lookup is `unverified`, never `false`.

```python
if live["state"] != "passed" or any(c["status"] != "pass" for c in live["checks"]):
    raise EvidenceUnavailable("Tier 2 failed or skipped")
if (live["actorModel"], live["evaluatorModel"]) != (snapshot["model"], snapshot["model"]):
    raise EvidenceUnavailable("runtime model mismatch")
if live["packSha256"] != snapshot["packSha256"]:
    raise EvidenceUnavailable("served pack hash mismatch")
```

- [ ] **Step 4: Run both tests, plus the real CLI with a fake local endpoint; commit.**

```bash
node --test tests/redteam-live.test.mjs
python3 -m unittest discover -s tests/maintenance -p 'test_red_team_preflight.py'
git add bin/redteam-live.sh tests/redteam-live.test.mjs 13_Faculty_Resources/_automation/maintenance/red_team_preflight.py tests/maintenance/test_red_team_preflight.py
git commit -m "feat: prepare content-free live red-team evidence"
```

Expected: all tests pass. Do not run the production endpoint or enter a real passcode in an agent session.

### Task 3: Record only complete owner-judged checklists

**Files:** Modify `13_Faculty_Resources/_automation/maintenance/record_red_team.py`, `tests/maintenance/test_record_red_team.py`; reuse `red_team_preflight.py` for its `record` CLI subcommand.

**Interfaces:** `required_sections(runtime: dict) -> list[str]` returns A–E plus R/V according to verified booleans; `build_receipt(work: dict, manual_rows: dict, signed_by: str, now: datetime, preserve_incomplete: bool = False) -> dict` returns a passed schema-v2 receipt only for complete evidence, otherwise raises `IncompleteReview(reason)` by default. With `preserve_incomplete=True`, it returns `state:'incomplete'` and the missing/failed IDs. `record` reads the local work file, asks the owner for pass/fail/blocked on each checklist row, shows exact deploys/pack/model, and requires explicit final confirmation before writing the existing receipt path.

- [ ] **Step 1: Replace the old permissive receipt tests with a matrix.** A–E all pass with confirmed voice-off -> passed. Real-time enabled with R absent -> `IncompleteReview`; managed voice enabled with V absent -> `IncompleteReview`; either activation unknown -> `IncompleteReview`; a `blocked` C row or failed Tier 2 -> `IncompleteReview`. Assert an incomplete run can be written with `state:'incomplete'` but cannot be upgraded by `--state passed`. Check that `signedBy` is nonempty and reasons are at most 240 characters.

```python
with self.assertRaisesRegex(IncompleteReview, "R"):
    build_receipt(work_with_realtime_enabled, rows_A_to_E, "Joshua Moss, MD", now)
with self.assertRaisesRegex(IncompleteReview, "activation unverified"):
    build_receipt(work_with_unknown_voice, rows_A_to_E, "Joshua Moss, MD", now)
```

- [ ] **Step 2: Run the receipt tests and observe the permissive legacy builder fail them.**

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_record_red_team.py'
```

- [ ] **Step 3: Implement the schema-v2 builder and the owner terminal flow.** For each required section, collect its checklist row IDs from a constant map tied to `sp-proxy/REDTEAM_CHECKLIST.md`; require every ID exactly once with result `pass`. Keep failed/blocked notes bounded and content-free. Delete the old `--state passed` shortcut. Write the work file outside tracked paths with mode `0600`; write a failed/incomplete receipt only when the owner explicitly asks to preserve it. The final `passed` receipt goes to `maintenance/receipts/sp-red-team.json` for a separate owner-controlled review and commit.

```python
if any(row_id not in manual_rows or manual_rows[row_id]["status"] != "pass"
       for row_id in required_row_ids):
    raise IncompleteReview("required manual row missing, failed, or blocked")
if work["mechanical"]["tier1"]["state"] != "passed" or work["mechanical"]["tier2"]["state"] != "passed":
    raise IncompleteReview("mechanical tier incomplete")
```

- [ ] **Step 4: Run tests and a local operator rehearsal with fake deploys.** The rehearsal uses no live credential and deliberately leaves R incomplete; verify exit nonzero, no passed receipt, and no secret or transcript string in either file. Then make all synthetic rows pass and confirm the pure builder emits a schema-v2 receipt.

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_record_red_team.py'
```

- [ ] **Step 5: Commit the recorder and tests.**

```bash
git add 13_Faculty_Resources/_automation/maintenance/record_red_team.py 13_Faculty_Resources/_automation/maintenance/red_team_preflight.py tests/maintenance/test_record_red_team.py
git commit -m "feat: require explicit owner rows before red-team pass"
```

### Task 4: Make monthly review detect stale and mismatched receipts

**Files:** Modify `13_Faculty_Resources/_automation/maintenance/monthly_review.py:410-445`, `tests/maintenance/test_monthly_review.py:780-830`, `.github/workflows/maintenance-monthly-review.yml`, `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py`, `docs/RED_TEAM_RUNBOOK.md`, `sp-proxy/REDTEAM_CHECKLIST.md`.

**Interfaces:** `classify_red_team_receipt(receipt: dict | None, snapshot: dict | None, today: date, pack_changed_at: datetime | None) -> tuple[str,str]` yields one of `missing`, `incomplete`, `stale`, `mismatch`, `unverified`, `current` plus a short reason; `build_monthly_review(..., deploy_snapshot=None)` stores the state in `operations.redTeamReceipt` and the reason in `operations.redTeamReason`. The CLI obtains `deploy_snapshot` with Task 1's read-only lookup; a missing token or API error supplies `None` and an unverified reason, never a current state. `current` means the receipt still matches the immutable deployed revisions and pinned model; it does not re-exercise the human or voice checks.

- [ ] **Step 1: Add deliberately broken receipt fixtures.** Test a missing receipt; a legacy `state:'passed'` with only A–E; valid schema-v2 but later current proxy deploy ID; pack hash changed; model changed; receipt checked before `publishedAt`; enabled realtime with missing R; Netlify unavailable. Assert each expected state and nonempty reason. A complete receipt against the same immutable snapshot must be `current`.

```python
self.assertEqual(classify_red_team_receipt(legacy, snapshot, today, changed_at)[0], "incomplete")
self.assertEqual(classify_red_team_receipt(valid, newer_proxy_snapshot, today, changed_at)[0], "stale")
self.assertEqual(classify_red_team_receipt(valid, None, today, changed_at)[0], "unverified")
```

- [ ] **Step 2: Run focused tests to verify the old checker fails the new contract.**

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_monthly_review.py'
```

- [ ] **Step 3: Implement the pure classification and read-only CLI injection.** Validate schema and all required rows before comparing deploys. Compare each site ID, deploy ID, commit, immutable URL, proxy pack hash, and pinned model; compare the recorded actor/evaluator models against the pinned model. Require `checkedAt > max(publishedAt)` for the affected deploys. Preserve the existing pack-git-change comparison as a second staleness check. Render the short reason in JSON/Markdown without private content. In the monthly workflow, pass `NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}` only to the review step; never print it. Recompute the pinned monthly workflow digest in `validate_scheduled_workflows.py` with that validator's `_load`/`_contract_digest`, and run its own tests. Add the new result category to any downstream gate/issue tests that expect the old `pack_mismatch` spelling.

```python
if receipt.get("schemaVersion") != 2:
    return "incomplete", "legacy receipt lacks exact-deploy and manual-row evidence"
if snapshot is None:
    return "unverified", "current production deploy could not be read"
if receipt["deployments"]["proxy"]["deployId"] != snapshot["deployments"]["proxy"]["deployId"]:
    return "stale", "SP proxy production deploy changed after the red-team run"
```

Compute the updated workflow digest with a one-off local read of the validator's parsed YAML, then replace only the `maintenance-monthly-review.yml` pinned digest:

```bash
python3 - <<'PY'
from pathlib import Path
import sys
sys.path.insert(0, '13_Faculty_Resources/_automation/maintenance')
import validate_scheduled_workflows as v
errors = []
document, _ = v._load(Path.cwd(), 'maintenance-monthly-review.yml', errors)
assert not errors, errors
print(v._contract_digest(document))
PY
```

- [ ] **Step 4: Run maintenance and full gates, then break the equality check once in a scratch diff.**

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_monthly_review.py'
python3 -m unittest discover -s tests/maintenance -p 'test_maintenance_issue.py'
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
bash bin/verify.sh
```

Expected: all pass; the altered equality condition makes the mismatch fixture fail, then restoration passes. The monthly job reports `unverified` if the Netlify token or API is unavailable.

- [ ] **Step 5: Update the operator docs and commit.** State plainly what each tier proves, where the hidden passcode is entered, which manual rows remain, why R/V appear, and what exact-deploy receipt can and cannot claim. Keep #841's latest wording and checklist IDs; do not change clinical judgment text.

```bash
git add 13_Faculty_Resources/_automation/maintenance/monthly_review.py tests/maintenance/test_monthly_review.py .github/workflows/maintenance-monthly-review.yml 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py docs/RED_TEAM_RUNBOOK.md sp-proxy/REDTEAM_CHECKLIST.md
git commit -m "feat: classify red-team receipts against current deploy evidence"
```

Refresh PR/CI/deploy state before opening a PR. The first real `current` receipt requires the owner to run the complete live checklist and sign the served revision; no test or document commit creates that clinical sign-off.
