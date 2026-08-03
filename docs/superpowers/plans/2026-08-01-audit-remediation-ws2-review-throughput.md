# WS2 — Content Governance & Faculty Review Throughput Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the faculty-review backlog (20 pending reviewed.json surfaces, 18/18 draft simulation-registry items, 47-soon-48 draft qbank items) and land the small tooling fixes that make attestation visible and trustworthy, now that PR #284 deliberately re-serves labelled drafts to learners.

**Architecture:** All attestation state lives in git-tracked JSON registries (`13_Faculty_Resources/reviewed.json`, `question_bank.json`, `communication_cases.json`, `family_systems_scenarios.json`, `_prototypes/*/**.pack.json`) validated by Python contract validators that run in both CI and the Netlify build gate. Faculty review itself is human work ([JOSH] tasks); every session is paired with an agent task that lands the decisions via branch + PR, because the faculty console's direct-commit write path is unreliable until WS1 lands and the console never covered the two simulation registries at all. Code changes (badge port, id-prefix gate) are TDD'd through the repo's existing node:test and unittest harnesses.

**Tech Stack:** Vanilla single-file HTML tools (no build-time JS framework), Python 3 contract validators (jsonschema Draft-07), node:test regression suites (`tests/*.test.mjs`), Playwright smoke (CI only), GitHub PR workflow (branch-protected main), Netlify deploy-on-push.

## Global Constraints

- main is branch-protected (GH006 on direct push): every change lands via feature branch + `gh pr create`; required checks: build-test-validate + smoke.
- Playwright hangs locally on this macOS — verify smoke via CI, not locally.
- Build gate: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` must pass (this IS the Netlify build command). Root tests: `node --test tests/*.test.mjs`.
- Any edit to `_prototypes/sp-interview/sp-interview.html` or the pack requires `node _prototypes/sp-interview/generate-preview.mjs --write` (byte-reproducibility test gates it).
- Attesting an SP persona changes the case-card count → interview-room smoke specs must use the caseCard()/supportedButton() helpers (already structural); pack edits also require regenerating the preview and keeping the review-filter snapshot's synthetic-pack negative test.
- localStorage keys MUST be cw_* (shared) or rp_* (resident) — QA gate hard-fails others. (No new keys are introduced by this plan.)
- No PHI anywhere. Dose literals banned in rp-*/-trainer tools. New qbank content must be derivable from library page text (QUESTION_BANK_STANDARD.md §1) and original (no NBME/COMAT/UWorld reproduction).
- Crisis contacts (988 etc.) ONLY via crisis_resources.json + `<!-- crisis-block -->` markers; never hard-code numbers. (Review sessions verify the block *renders*; they never edit numbers.)
- Since #264, shared build logic lives in `13_Faculty_Resources/_automation/site_build/common.py` — put new shared transforms THERE, not in both callers. (This plan adds no build transforms; noted so nobody "fixes" the badge at build time instead of in the source tool.)

## Verified current state (2026-08-01, origin/main = 817ef90)

Facts every task below relies on — re-verified against the current tree, do not re-derive:

- `13_Faculty_Resources/reviewed.json`: 114 entries, **20 pending** (11 CotW pages + cotw_index.md, rp-agitation.html + rp-brief-psych.html since 2026-07-07, one-patient-six-weeks.html, anki.md, sp-interview.html). Format: compact one-line entries at lines 2–17, multi-line objects further down (lines 453–464, 500–511).
- `communication_cases.json`: 10/10 cases `facultyReview.status:"draft"` (multi-line facultyReview blocks). `family_systems_scenarios.json`: 8/8 draft (single-line facultyReview blocks). **Neither registry is covered by the faculty console** (zero references in `faculty-console/`) nor by `validate_attestation_consistency.py` — PR editing is the only attestation path for them.
- `question_bank.json`: 192 items = 143 attested / 46 draft / 3 retired at tip; after #280+#281 land: 142 attested / 47 draft (qb_pha_011 demoted to draft). Pharm ids run qb_pha_001–016; qb_pha_012 is retired, so blueprint pharm 16/16 needs one **new** item (qb_pha_017). File round-trips exactly with `json.dumps(d, indent=2, ensure_ascii=False) + '\n'`.
- `tests/faculty-qbank-rules.test.mjs:587` is a **live-repo fixture** asserting exact bank counts (`total 189, draft 47, attested 142, answerKeys {A:46,B:1,C:0,D:0}` after #281). Every PR that changes any item's status or adds an item MUST update it in the same PR, or push-CI on main goes red.
- `13_Faculty_Resources/_automation/test_longitudinal_case.py:35` hard-asserts `reviewed["one-patient-six-weeks.html"]["status"] == "pending"` (runs in CI, not in build_and_check.sh) — attesting that tool requires flipping this assertion in the same PR.
- `06_Family_and_Relational/family-systems-practice.html:247` `reviewBadge` has no reviewed branch; `02_Clinical_Skills/Communication_Practice/communication-practice.html:173` has the correct two-branch version (with `.pill.reviewed` CSS at its line 63). Family tool's `.pill.draft` CSS is at line 52; its palette tokens are `--teal/--teal-soft/--teal-dark` (no `--success`).
- SP pack (`_prototypes/sp-interview/sp-interview.pack.json`): pack-level `status:"draft-pending-attestation"` (line 8), but **all 3 cases already carry per-case `facultyReview.status:"reviewed"`** (Dana 2026-07-13; Marcus & Ray 2026-07-22 via PR #257), and `validate_attestation_consistency.py` already validates per-case granularity. speechProfiles remain draft (voice disabled — separate workstream, issue #232) and the validator permits reviewed cases with draft speechProfiles.
- Qbank id-prefix census: canonical prefixes are mood/psy/anx/sud/cog/pha/saf/per/**cdev**/**otherdx**/eth/rel; legacy strays are exactly `qb_chd_001`, `qb_chd_002`, `qb_oth_001`, `qb_oth_002`. `question_bank.schema.json` id pattern (line 18) cannot enforce this. `qbank_attestation_2026-07-05.json` sits at repo root, stale (claims 144/144 attested), zero consumers.
- `question-bank-practice.html` shuffles options at render (`shuffle(item.options.slice())` at :372), so the draft cohort's all-A answer-key skew is invisible to learners; the console's `batch.answer_key_balance` rule offers "attest individually" — do NOT let key rebalancing stall Session D.
- The 2026-07-23 suicide-risk CotW sources carry no pending banner in their first 8 lines; `index_ms3.md`/`index_resident.md` line 3 DOES say "Pending faculty attestation." and `validate_attestation_consistency.py:784` regex-fails a reviewed cotw_index.md while that text remains.
- Faculty console (https://clerkship-faculty-attest.netlify.app) commits directly to the configured branch via the GitHub API (`faculty-console/netlify/functions/attest.mjs`, `DEFAULT_BRANCH='main'`); with enforce_admins branch protection this write path may fail until WS1 lands. Every session below therefore has a PR fallback that works today.

**Out of scope (YAGNI, per audit close-out):** no review-state dashboard one-pager; no per-case SP schema work (it already exists — see premise notes); no new attestation tooling beyond what exists.

---

## Batch 1 — Review-visibility plumbing (agent-executable now)

Branch: `fix/ws2-review-visibility` off current origin/main.

```bash
git fetch origin && git checkout -b fix/ws2-review-visibility origin/main
```

### Task 1: Two-branch review badge in family-systems-practice.html

The moment Session B attests family scenarios, the family tool would render "reviewed - faculty review needed". Port communication-practice's two-branch badge first.

**Files:**
- Test (create): `tests/family-review-badge.test.mjs`
- Modify: `06_Family_and_Relational/family-systems-practice.html` (line 247 function; CSS insert after line 52)

**Interfaces:**
- Consumes: `facultyReview` objects `{status, reviewer, lastReviewed}` from `family_systems_scenarios.json` scenarios.
- Produces: `reviewBadge(it)` returning `<span class="pill reviewed">Reviewed · <reviewer> · <date></span>` when `status==='reviewed'`, else the existing draft pill — byte-identical output to communication-practice.html's `reviewBadge` for the same input (Task 8 relies on this rendering).

**Steps:**

- [ ] Write the failing test at `tests/family-review-badge.test.mjs` (auto-picked up by the CI glob `node --test tests/*.test.mjs`):

```js
// Review badge parity: family-systems-practice.html must render the same
// two-branch faculty-review badge as communication-practice.html.
//
// 2026-08-01 audit (WS2): family's reviewBadge had no 'reviewed' branch, so
// attested scenarios would still display 'faculty review needed'. Behavioural
// extraction (same pattern as family-srs-parity.test.mjs): re-introducing the
// divergence turns this red.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractReviewBadge(file) {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const m = src.match(/function reviewBadge\([^)]*\)\{[^\n]*/);
  assert.ok(m, `reviewBadge not found in ${file}`);
  const esc = (value) => String(value);
  return new Function('esc', `${m[0]}\nreturn reviewBadge;`)(esc);
}

const commBadge = extractReviewBadge('02_Clinical_Skills/Communication_Practice/communication-practice.html');
const famBadge = extractReviewBadge('06_Family_and_Relational/family-systems-practice.html');

const fixtures = [
  { facultyReview: { status: 'reviewed', reviewer: 'Joshua Moss, MD', lastReviewed: '2026-08-02' } },
  { facultyReview: { status: 'reviewed' } },
  { facultyReview: { status: 'draft' } },
  { facultyReview: { status: 'draft-pending-attestation' } },
  {},
];

for (const item of fixtures) {
  assert.equal(
    famBadge(item),
    commBadge(item),
    `family badge must match communication badge for ${JSON.stringify(item)}`,
  );
}

const reviewed = famBadge(fixtures[0]);
assert.match(reviewed, /pill reviewed/);
assert.match(reviewed, /Reviewed · Joshua Moss, MD · 2026-08-02/);
assert.doesNotMatch(reviewed, /faculty review needed/);

const draft = famBadge(fixtures[2]);
assert.match(draft, /pill draft/);
assert.match(draft, /faculty review needed/);

const famSrc = fs.readFileSync(
  path.join(repo, '06_Family_and_Relational/family-systems-practice.html'), 'utf8');
assert.match(famSrc, /\.pill\.reviewed\{/, 'family tool must style the reviewed pill');

console.log('Family review badge parity with communication-practice verified');
```

- [ ] Run it and confirm the expected failure: `node --test tests/family-review-badge.test.mjs` → `# fail 1` with `AssertionError ... family badge must match communication badge for {"facultyReview":{"status":"reviewed",...}}`.
- [ ] Implement: in `06_Family_and_Relational/family-systems-practice.html` replace line 247 exactly:

Old:
```js
function reviewBadge(it){var rv=it.facultyReview||{};return '<span class="pill draft">'+esc((rv.status||'draft').replace(/-/g,' '))+' - faculty review needed</span>';}
```
New:
```js
function reviewBadge(it){var rv=it.facultyReview||{};if(rv.status==='reviewed')return '<span class="pill reviewed">Reviewed'+(rv.reviewer?' · '+esc(rv.reviewer):'')+(rv.lastReviewed?' · '+esc(rv.lastReviewed):'')+'</span>';return '<span class="pill draft">'+esc((rv.status||'draft').replace(/-/g,' '))+' · faculty review needed</span>';}
```

- [ ] Add the reviewed-pill style. After line 52 (`.pill.draft{border-color:var(--gold);background:var(--gold-soft);color:var(--gold)}`) insert a new line:

```css
.pill.reviewed{border-color:var(--teal);background:var(--teal-soft);color:var(--teal-dark)}
```

- [ ] Run to pass: `node --test tests/family-review-badge.test.mjs` → `# pass 1`, prints `Family review badge parity with communication-practice verified`.
- [ ] Full regression: `node --test tests/*.test.mjs` → 0 failures (the `family-srs-parity` extraction is untouched — `applyGrade` was not edited).
- [ ] Commit:

```bash
git add tests/family-review-badge.test.mjs 06_Family_and_Relational/family-systems-practice.html
git commit -m "fix(family-systems): render the reviewed branch of the faculty review badge

Port the two-branch reviewBadge from communication-practice.html:173 so
attested scenarios show 'Reviewed · reviewer · date' instead of
'reviewed - faculty review needed'. Parity locked by
tests/family-review-badge.test.mjs.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Canonical qbank id-prefix gate in validate_registry_schemas.py

**Files:**
- Test (modify): `13_Faculty_Resources/_automation/test_validate_registry_schemas.py` (append two tests before the `if __name__` guard)
- Modify: `13_Faculty_Resources/_automation/validate_registry_schemas.py` (constants after PAIRS at line 29; wiring at lines 174–181)
- Modify: `question_bank.schema.json` (id description, line 19)

**Interfaces:**
- Consumes: `question_bank.json` `items[].id` / `items[].category`.
- Produces: `qbank_prefix_diagnostics(document) -> list[str]` in `validate_registry_schemas.py`; exit code 1 + `question_bank.json: INVALID at /items/<i>/id: ...canonical prefix...` diagnostic on drift. Constants `QBANK_CANONICAL_PREFIXES` (dict category→prefix) and `QBANK_GRANDFATHERED_IDS` (frozenset of the 4 legacy ids).

**Steps:**

- [ ] Append the failing tests to `13_Faculty_Resources/_automation/test_validate_registry_schemas.py` (inside `RegistrySchemaGateTests`, after `test_errors_have_deterministic_order_and_pointer_format`):

```python
    def test_question_bank_id_prefix_must_match_category(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = json.loads(
                (root / "question_bank.json").read_text(encoding="utf-8")
            )
            item = next(i for i in document["items"] if i["id"] == "qb_cdev_001")
            item["id"] = "qb_chd_003"
            (root / "question_bank.json").write_text(
                json.dumps(document), encoding="utf-8"
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("question_bank.json: INVALID at /items/", result.stdout)
        self.assertIn("qb_chd_003", result.stdout)
        self.assertIn("canonical prefix", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_question_bank_grandfathered_legacy_ids_still_pass(self) -> None:
        # qb_chd_001/002 and qb_oth_001/002 predate the cdev/otherdx conventions
        # and are permanent identities (SRS cards + cw_qb_v1 key on them).
        result = run_validator(ROOT)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("question_bank.json: OK", result.stdout)
```

- [ ] Run and confirm the expected failure: `python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py` → `FAILED (failures=1)`, the new mismatch test failing on `AssertionError: 0 != 0` (validator wrongly accepts the mutated copy).
- [ ] Implement in `validate_registry_schemas.py`. Insert after the `PAIRS` tuple (after line 29):

```python
# Canonical id prefix per blueprint category. The schema pattern ^qb_[a-z]+_[0-9]{3}$
# cannot express this pairing, so it is enforced semantically here. Ids are permanent
# identities (SRS cards QB#<id> and cw_qb_v1 responses key on them), so the four
# pre-convention legacy ids are grandfathered rather than renamed.
QBANK_CANONICAL_PREFIXES = {
    "mood": "mood",
    "psychosis": "psy",
    "anxiety": "anx",
    "substance": "sud",
    "neurocog": "cog",
    "pharm": "pha",
    "safety": "saf",
    "personality": "per",
    "childdev": "cdev",
    "otherdx": "otherdx",
    "ethics": "eth",
    "relational": "rel",
}
QBANK_GRANDFATHERED_IDS = frozenset(
    {"qb_chd_001", "qb_chd_002", "qb_oth_001", "qb_oth_002"}
)


def qbank_prefix_diagnostics(document):
    """Semantic gate: each item id must use its category's canonical prefix."""
    diagnostics = []
    items = document.get("items", []) if isinstance(document, dict) else []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        category = item.get("category")
        if not isinstance(item_id, str) or category not in QBANK_CANONICAL_PREFIXES:
            continue  # shape problems are the schema's job
        if item_id in QBANK_GRANDFATHERED_IDS:
            continue
        expected = "qb_%s_" % QBANK_CANONICAL_PREFIXES[category]
        if not item_id.startswith(expected):
            diagnostics.append(
                "question_bank.json: INVALID at /items/%d/id: %r does not use the "
                "canonical prefix %r for category %r (grandfathered: %s)"
                % (
                    index,
                    item_id,
                    expected,
                    category,
                    ", ".join(sorted(QBANK_GRANDFATHERED_IDS)),
                )
            )
    return diagnostics
```

- [ ] Wire it into `validate_root`. Replace lines 174–181 exactly:

Old:
```python
        if errors:
            has_errors = True
            diagnostics.extend(
                f"{document_name}: INVALID at {json_pointer(error.absolute_path)}: {error.message}"
                for error in errors
            )
        else:
            diagnostics.append(f"{document_name}: OK ({schema_name})")
```
New:
```python
        semantic = (
            qbank_prefix_diagnostics(document)
            if document_name == "question_bank.json"
            else []
        )
        if errors or semantic:
            has_errors = True
            diagnostics.extend(
                f"{document_name}: INVALID at {json_pointer(error.absolute_path)}: {error.message}"
                for error in errors
            )
            diagnostics.extend(semantic)
        else:
            diagnostics.append(f"{document_name}: OK ({schema_name})")
```

- [ ] Document the convention in `question_bank.schema.json` line 19. Replace:

Old:
```json
            "description": "Stable forever. Prefix matches the blueprint category (qb_sud_001)."
```
New:
```json
            "description": "Stable forever. Prefix matches the blueprint category's canonical prefix — mood, psy, anx, sud, cog, pha, saf, per, cdev, otherdx, eth, rel (e.g. qb_sud_001). Enforced semantically by validate_registry_schemas.py; qb_chd_001/002 and qb_oth_001/002 are grandfathered legacy ids."
```

- [ ] Run to pass: `python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py` → `OK` (16 tests). Then `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py` → all six `OK` lines, exit 0.
- [ ] Commit:

```bash
git add 13_Faculty_Resources/_automation/validate_registry_schemas.py \
        13_Faculty_Resources/_automation/test_validate_registry_schemas.py \
        question_bank.schema.json
git commit -m "feat(qbank): enforce canonical per-category id prefixes in the registry gate

Pins mood/psy/anx/sud/cog/pha/saf/per/cdev/otherdx/eth/rel as the one
prefix convention and grandfathers the four legacy qb_chd_*/qb_oth_* ids,
closing the audit's id-prefix drift finding at the validator layer.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Archive the stale root attestation export

**Files:**
- Move: `qbank_attestation_2026-07-05.json` → `99_Archive/qbank_attestation_2026-07-05.json` (then edit in place to add `_note`)

**Interfaces:** none (verified zero consumers across *.py/*.mjs/*.sh/*.html/*.yml).

**Steps:**

- [ ] Re-confirm zero consumers (guards against drift since audit): `grep -rn "qbank_attestation_2026-07-05" --include="*.py" --include="*.mjs" --include="*.sh" --include="*.html" --include="*.yml" . | grep -v _build` → no output.
- [ ] `git mv qbank_attestation_2026-07-05.json 99_Archive/qbank_attestation_2026-07-05.json`
- [ ] Edit `99_Archive/qbank_attestation_2026-07-05.json` — replace the opening:

Old:
```json
{
  "exported": "2026-07-05T00:00:00Z",
```
New:
```json
{
  "_note": "HISTORICAL — point-in-time faculty attestation export from 2026-07-05 (claims 144/144 attested). Superseded by the live status fields in question_bank.json, which has since retired qb_pha_012/qb_sud_015/qb_sud_016 and re-drafted items. Nothing consumes this file; kept for provenance only.",
  "exported": "2026-07-05T00:00:00Z",
```

- [ ] Verify it still parses: `python3 -c "import json; json.load(open('99_Archive/qbank_attestation_2026-07-05.json')); print('ok')"` → `ok`.
- [ ] Commit:

```bash
git add -A
git commit -m "chore: archive the stale 2026-07-05 qbank attestation export out of repo root

It asserted 144/144 attested, which no longer matches the live bank, and
had zero consumers — moved to 99_Archive with a HISTORICAL note per the
2026-08-01 audit.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] Batch verification before PR: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` → ends `── build_and_check: ms3 OK`; `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → ends `── build_and_check: res OK`; `node --test tests/*.test.mjs` → 0 failures.

**PR boundary:** branch `fix/ws2-review-visibility`, PR title `fix: reviewed-badge parity, canonical qbank id-prefix gate, archive stale attestation export (audit WS2)` via `git push -u origin fix/ws2-review-visibility && gh pr create --title "..." --body "..."`. Required green: **build-test-validate + smoke**. No dependency on #284/#280/#281 (touches disjoint files/lines) — may land in any order relative to them, but MUST land before Task 8 (Session B) merges.

---

## Batch 2 — Pharm blueprint restoration (agent; blocked until #280, #281, #284 are merged)

Branch: `content/qbank-pharm-017-maoi-washout` off origin/main **after** #280/#281/#284 merge (Task 4's evidence field quotes primer text that #280 adds, and its fixture math assumes #281's 47/142 baseline).

```bash
git fetch origin
git log origin/main --oneline | head -5   # confirm #280, #281, #284 merge commits present
git checkout -b content/qbank-pharm-017-maoi-washout origin/main
```

### Task 4: Author qb_pha_017 (MAOI washout) as a draft item + fixture update

Restores the authored path to blueprint pharm 16/16 (qb_pha_012 retired with no replacement). Item is AI-drafted → `status:"draft"`; per #284 it ships labelled "Draft — not yet faculty-reviewed" immediately, and Josh attests it in Session D. Correct key is D (avoids deepening the all-A draft-cohort skew).

**Files:**
- Test (modify): `tests/faculty-qbank-rules.test.mjs` (live-bank fixture at ~line 587, post-#281 text)
- Modify: `question_bank.json` (insert item after qb_pha_016)

**Interfaces:**
- Consumes: `psychopharm_primer.md` MAOI-washout sentence added by #280 (evidence-derivability per QUESTION_BANK_STANDARD.md §1); `assessBank` counting semantics (draft-only answerKeys tally).
- Produces: item `qb_pha_017` (sba, category pharm, competency [pharm, safety], difficulty 2, correct key D). Session D (Task 11/12) references this id.

**Steps:**

- [ ] TDD — update the fixture FIRST so it fails. In `tests/faculty-qbank-rules.test.mjs` replace the post-#281 block:

Old:
```js
test('current repository bank has 189 blocker-free active items, mostly-A draft cohort plus one demoted attested item', () => {
```
New:
```js
test('current repository bank has 190 blocker-free active items; draft cohort is mostly-A plus qb_pha_011 (B) and qb_pha_017 (D)', () => {
```

Old:
```js
  assert.equal(result.counts.total, 189);
  assert.equal(result.counts.draft, 47);
  assert.equal(result.counts.attested, 142);
  assert.equal(Object.keys(result.byId).length, 189);
  assert.equal(Object.values(result.byId).flatMap(entry => entry.blockers).length, 0);
  assert.deepEqual(result.answerKeys, { A: 46, B: 1, C: 0, D: 0 });
```
New:
```js
  // qb_pha_017 (MAOI washout, correct key D) was authored 2026-08 to replace
  // retired qb_pha_012 and restore blueprint pharm 16/16 once attested.
  assert.equal(result.counts.total, 190);
  assert.equal(result.counts.draft, 48);
  assert.equal(result.counts.attested, 142);
  assert.equal(Object.keys(result.byId).length, 190);
  assert.equal(Object.values(result.byId).flatMap(entry => entry.blockers).length, 0);
  assert.deepEqual(result.answerKeys, { A: 46, B: 1, C: 0, D: 1 });
```

- [ ] Run and confirm expected failure: `node --test tests/faculty-qbank-rules.test.mjs` → 1 failing test, `AssertionError ... 189 !== 190` (bank not yet grown).
- [ ] Insert the item (formatting-safe — the file round-trips with indent=2/ensure_ascii=False):

```bash
python3 - <<'EOF'
import json

NEW_ITEM = {
  "id": "qb_pha_017",
  "status": "draft",
  "type": "sba",
  "category": "pharm",
  "competency": ["pharm", "safety"],
  "difficulty": 2,
  "pages": ["psychopharm_primer.md"],
  "link": {
    "label": "Open the Psychopharmacology Primer",
    "href": "?page=psychopharm_primer.md"
  },
  "stem": "A 58-year-old man with recurrent major depressive disorder that has not responded to sequential SSRI trials is planned for a switch from fluoxetine to tranylcypromine. The inpatient team is asked how to time the transition. Which recommendation is most appropriate?",
  "options": [
    {
      "key": "A",
      "t": "Stop the fluoxetine and start the MAOI after a 2-week washout — the standard interval after stopping any SSRI.",
      "trap": {
        "name": "Right rule, wrong drug",
        "note": "Two weeks is the standard washout after most SSRIs, but fluoxetine's long half-life and active metabolite (norfluoxetine) keep serotonergic activity elevated for weeks longer — it is the one SSRI that needs about 5 weeks."
      }
    },
    {
      "key": "B",
      "t": "Cross-taper: start low-dose tranylcypromine while tapering the fluoxetine over 2 weeks to avoid a depressive relapse in the gap.",
      "trap": {
        "name": "Cross-taper reflex",
        "note": "Cross-tapering works for many antidepressant switches, but any overlap of a serotonergic agent with an MAOI risks serotonin syndrome — the washout must be complete, not bridged."
      }
    },
    {
      "key": "C",
      "t": "No washout is required if blood pressure and mental status are monitored daily during the first week of MAOI therapy.",
      "trap": {
        "name": "Monitoring substitutes for prevention",
        "note": "Monitoring does not make the combination safe: serotonin syndrome is a pharmacodynamic interaction that must be prevented by separation in time, not watched for."
      }
    },
    {
      "key": "D",
      "t": "Stop the fluoxetine and wait at least 5 weeks before starting the MAOI, because fluoxetine's long half-life and active metabolite prolong serotonergic exposure.",
      "c": True
    }
  ],
  "why": "Right rule, wrong drug is the target trap. Most SSRIs need at least 2 weeks off before an MAOI can start, but fluoxetine's active metabolite norfluoxetine persists for weeks, so the washout stretches to at least 5 weeks. The interval in the other direction — stopping an MAOI before starting any serotonergic agent — is about 2 weeks, set by MAO enzyme regeneration rather than drug clearance. Overlap in either direction risks serotonin syndrome or hypertensive crisis.",
  "pearl": "MAOI washouts: at least 2 weeks after most SSRIs, at least 5 weeks after fluoxetine, and at least 2 weeks after an MAOI before starting any serotonergic agent.",
  "evidence": "psychopharm_primer.md — The classic avoidable trigger is switching too soon around an MAOI: allow ≥2 weeks after stopping most SSRIs (≥5 weeks after fluoxetine, due to its long half-life) before starting an MAOI, and ≥2 weeks after stopping an MAOI before starting a serotonergic agent — to avoid serotonin syndrome / hypertensive crisis."
}

path = 'question_bank.json'
with open(path, encoding='utf-8') as fh:
    bank = json.load(fh)
ids = [item['id'] for item in bank['items']]
assert 'qb_pha_017' not in ids, 'qb_pha_017 already exists'
bank['items'].insert(ids.index('qb_pha_016') + 1, NEW_ITEM)
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(bank, fh, indent=2, ensure_ascii=False)
    fh.write('\n')
print('inserted qb_pha_017 after qb_pha_016; total items:', len(bank['items']))
EOF
```

Expected output: `inserted qb_pha_017 after qb_pha_016; total items: 193`. Confirm the diff is only the new object: `git diff --stat question_bank.json` → 1 file changed, insertions only.

- [ ] Run to pass: `node --test tests/faculty-qbank-rules.test.mjs` → 0 failures. Also `node --test tests/qbank-draft-visibility.test.mjs` → 0 failures (synthetic fixtures, unaffected).
- [ ] Validators + gates: `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py` → `question_bank.json: OK` (prefix gate from Task 2 accepts pha); `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` → OK (dup-id and near-dup-stem checks pass; no SOFT near-dup expected — the MAOI stem shares <85% tokens with qb_saf_015's NMS/SS discriminator); `node --test tests/*.test.mjs` → 0 failures.
- [ ] Commit:

```bash
git add question_bank.json tests/faculty-qbank-rules.test.mjs
git commit -m "content(qbank): author qb_pha_017 (MAOI washout timing) as an attestable pharm draft

Replaces retired qb_pha_012's blueprint slot (pharm 16/16 once attested).
Derived from the MAOI-washout teaching added to psychopharm_primer.md by
#280; correct key D to avoid deepening the all-A draft-cohort skew.
AI-drafted, status draft, pending Dr. Moss's attestation (Session D).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**PR boundary:** branch `content/qbank-pharm-017-maoi-washout`, PR title `content(qbank): new pharm draft qb_pha_017 — MAOI washout timing (restores blueprint slot for retired qb_pha_012)`. Required green: **build-test-validate + smoke**. Mark the PR body `[NEEDS FACULTY ATTESTATION — served as labelled draft until Session D]`.

---

## Batch 3 — Faculty review sessions (paired [JOSH] + agent-landing tasks)

General session mechanics, applying to Tasks 5–12:

- Preferred console: **https://clerkship-faculty-attest.netlify.app** (covers reviewed.json pages/tools + question_bank items in one queue, with in-frame preview). **Its write path may fail until WS1 lands** (direct-to-main commit vs branch protection). If any save/attest errors: do not retry-loop — record the decision (item id + verdict + date) and hand the list to the paired agent task, which lands identical edits by PR. The two simulation registries (Session B) have **no console path at all**; they are PR-only by design.
- Every landing PR runs the same gate set: `python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py` (expect `attestation consistency OK — 87 manifest item(s), 14 topic facultyReview entries aligned.`), `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py`, `node --test tests/*.test.mjs`, `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res`; smoke via CI.
- reviewed.json compact entries are edited as exact single-line string replacements (never re-dump the whole file — it is not `json.dumps`-round-trippable).
- Date fields (`at`, `lastReviewed`) must be the **actual session date**; the literals below use the planned session dates 2026-08-02 (A), 2026-08-03 (B), 2026-08-04 (C), 2026-08-05 (D) — substitute the real date if a session slips, keeping the ISO format.

### Task 5 [JOSH]: Session A — safety surfaces (highest clinical priority, ~45–60 min)

**[JOSH]** Review, in this order (longest-pending safety content first is items 3–4 at 25 days, but suicide-risk CotW outranks on clinical stakes):

1. Suicide-risk CotW, MS3: https://une-ms3-psychiatry.netlify.app/index.html?page=cotw_20260723_suiciderisk_ms3.md
2. Suicide-risk CotW, resident: https://mmc-psychiatry-residents-sanford.netlify.app/index.html?page=cotw_20260723_suiciderisk_res.md
3. Agitation Ladder trainer (resident): https://mmc-psychiatry-residents-sanford.netlify.app/tools/rp-agitation.html — pending since 2026-07-07
4. Brief-psychotherapy trainer (resident): https://mmc-psychiatry-residents-sanford.netlify.app/tools/rp-brief-psych.html — pending since 2026-07-07

Review checklist per artifact:
- [ ] Clinical accuracy and level-appropriateness (MS3 vs resident edition).
- [ ] Suicide-risk pages: recognition/structured-assessment/escalation/safety-planning frame holds throughout; **no method detail anywhere**; the 988 crisis block renders at the page bottom (it is build-injected — if missing, STOP and file it as a build bug, do not attest).
- [ ] rp trainers: no dose literals (they are banned and QA-gated in rp-* tools — spot-check the hazard-feedback text); "Call your senior" path always visible; de-escalation gates precede pharmacologic reasoning.
- [ ] rp trainers: decide the LOCAL_POLICY question (master decision D4): attest with the current "verify at point of care" placeholder values, or hold until Sanford-specific values are entered.
- [ ] Record one verdict per artifact: `attest` (with date) or `needs-edits` (with the specific edit). Hand the four verdicts to Task 6.

Console path (if WS1 has landed): open https://clerkship-faculty-attest.netlify.app, enter the faculty key, filter the queue to each slug, Review → Resolve → Confirm. If every save succeeds and CI on the console's commits is green, Task 6 shrinks to verification only.

### Task 6: Land Session A attestations (agent)

Branch: `attest/session-a-safety-surfaces` off current origin/main. Execute only the entries Josh attested; leave any `needs-edits` entry pending and open a follow-up issue quoting his note.

**Files:**
- Modify: `13_Faculty_Resources/reviewed.json` (lines 6–7 single-line; lines 453–464 multi-line)
- Modify (only if rp tools attested): `_prototypes/agitation-trainer/rp-agitation.html` (line 6 meta), `_prototypes/agitation-trainer/rp-agitation.pack.json` (top-level status), `_prototypes/brief-psych/rp-brief-psych.html` (meta line), `_prototypes/brief-psych/rp-brief-psych.pack.json` (top-level status)

**Interfaces:** Consumes Task 5's verdict list. Produces reviewed.json states consumed by check-static-site.mjs:132 and validate_tool_governance.py.

**Steps:**

- [ ] `git fetch origin && git checkout -b attest/session-a-safety-surfaces origin/main`
- [ ] CotW flips — exact single-line replacements in `13_Faculty_Resources/reviewed.json`:

Old (line 6):
```json
  "cotw_20260723_suiciderisk_ms3.md": {"status": "pending", "at": "2026-07-23", "by": "Joshua Moss, MD"},
```
New:
```json
  "cotw_20260723_suiciderisk_ms3.md": {"status": "reviewed", "at": "2026-08-02", "by": "Joshua Moss, MD"},
```

Old (line 7):
```json
  "cotw_20260723_suiciderisk_res.md": {"status": "pending", "at": "2026-07-23", "by": "Joshua Moss, MD"},
```
New:
```json
  "cotw_20260723_suiciderisk_res.md": {"status": "reviewed", "at": "2026-08-02", "by": "Joshua Moss, MD"},
```

- [ ] rp-agitation flip (only if attested) — replace the whole multi-line entry:

Old:
```json
 "rp-agitation.html": {
  "status": "pending",
  "at": "2026-07-07",
  "by": "Joshua Moss, MD",
  "note": "Resident prototype ships with draft-pending-attestation pack and unresolved LOCAL_POLICY tokens."
 },
```
New:
```json
 "rp-agitation.html": {
  "status": "reviewed",
  "at": "2026-08-02",
  "by": "Joshua Moss, MD",
  "note": "Teaching content attested. LOCAL_POLICY tokens intentionally remain point-of-care placeholders (no local order-set content); re-review on pack change."
 },
```

Then in `_prototypes/agitation-trainer/rp-agitation.html` line 6, inside the CLERKSHIP-META comment, replace `status="draft-pending-attestation"` with `status="reviewed"`; and in `_prototypes/agitation-trainer/rp-agitation.pack.json` replace the top-level line `  "status": "draft-pending-attestation",` (anchor with its preceding line if the string is not unique) with `  "status": "reviewed",`.

- [ ] rp-brief-psych flip (only if attested): identical three edits in the rp-brief-psych entry (lines 459–464), `_prototypes/brief-psych/rp-brief-psych.html` meta line, and `_prototypes/brief-psych/rp-brief-psych.pack.json` top-level status. (The `*.preview.html` siblings are unshipped — leave untouched.)
- [ ] Run the full gate set (see batch header). Expected: attestation consistency OK; `node --test tests/*.test.mjs` 0 failures (governance tests use synthetic fixtures, not live statuses); both builds OK.
- [ ] Commit and PR:

```bash
git add 13_Faculty_Resources/reviewed.json _prototypes/agitation-trainer _prototypes/brief-psych
git commit -m "attest: session A — suicide-risk CotW (ms3+res) and resident safety trainers

Faculty review by Joshua Moss, MD on 2026-08-02. Flips reviewed.json,
CLERKSHIP-META status, and pack status for the surfaces attested in
session A of the 2026-08 review sprint (audit WS2 finding 1a).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin attest/session-a-safety-surfaces
gh pr create --title "attest: session A — suicide-risk CotW + resident safety trainers" \
  --body "Faculty verdicts recorded 2026-08-02 (session A). Longest-pending safety surfaces from the 2026-08-01 audit. CI: build-test-validate + smoke."
```

**PR boundary:** branch `attest/session-a-safety-surfaces`, PR as above. Required green: **build-test-validate + smoke**. Independent of Batches 1–2.

### Task 7 [JOSH]: Session B — simulation registries (10 communication cases + 8 family scenarios, ~60–90 min)

**[JOSH]** These are PR-only (no console coverage exists). Review each item in the shipped tool, then record verdicts (id → attest date or needs-edits note):

- Communication cases (10) at https://une-ms3-psychiatry.netlify.app/tools/communication-practice.html — case ids, SI-adjacent first: `suicide_direct_question_001`, `psychosis_validation_001`, `mania_limit_sleep_001`, then `guardedness_privacy_001`, `rupture_limit_setting_001`, `bpd_rupture_repair_001`, `medication_ambivalence_001`, `family_meeting_opening_001`, `collateral_questions_001`, `family_conflict_discharge_001`.
- Family scenarios (8) at https://une-ms3-psychiatry.netlify.app/tools/family-systems.html — `collateral_baseline_safety_001`, `family_meeting_opening_001`, `discharge_barrier_map_001`, `high_expressed_emotion_001`, `psychosis_family_psychoeducation_001`, `family_involvement_boundaries_001`, `caregiver_baseline_adaptations_001`, `culture_interpreter_family_001`.

Per-item checklist:
- [ ] The `best` choice is genuinely best and its feedback teaches why; `partial`/`harmful` labels are defensible.
- [ ] Suicide/psychosis cases: direct-language norms held (ask directly about suicide; validate fear without endorsing delusional content); no method detail.
- [ ] linkedPages point at the right topics; setting/learnerGoal accurate; drill Include/Avoid lists sound.
- [ ] Family scenarios: confidentiality/consent boundaries correct (esp. `collateral_baseline_safety_001`, `family_involvement_boundaries_001`); interpreter-use practices correct in `culture_interpreter_family_001`.
- [ ] Hand the two verdict lists to Task 8.

### Task 8: Land Session B registry attestations (agent — requires Batch 1 merged first)

Branch: `attest/session-b-sim-registries` off origin/main (which must already contain `fix/ws2-review-visibility`, or reviewed scenarios will render the broken badge).

**Files:**
- Modify: `communication_cases.json` (multi-line facultyReview blocks), `family_systems_scenarios.json` (single-line facultyReview blocks)

**Interfaces:** Consumes Task 7 verdict lists. Produces `facultyReview: {status:"reviewed", reviewer, lastReviewed}` consumed by both tools' `reviewBadge` (two-branch after Task 1).

**Steps:**

- [ ] `git fetch origin && git checkout -b attest/session-b-sim-registries origin/main` and confirm Task 1 is present: `grep -c "pill reviewed" 06_Family_and_Relational/family-systems-practice.html` → `1`.
- [ ] Apply verdicts with the anchored text-replacement script (preserves each file's exact formatting; edit the two APPROVED lists to match Josh's actual verdicts — the lists below assume all 18 approved on 2026-08-03):

```bash
python3 - <<'EOF'
COMM_APPROVED = {
  'suicide_direct_question_001': '2026-08-03',
  'psychosis_validation_001': '2026-08-03',
  'mania_limit_sleep_001': '2026-08-03',
  'guardedness_privacy_001': '2026-08-03',
  'rupture_limit_setting_001': '2026-08-03',
  'bpd_rupture_repair_001': '2026-08-03',
  'medication_ambivalence_001': '2026-08-03',
  'family_meeting_opening_001': '2026-08-03',
  'collateral_questions_001': '2026-08-03',
  'family_conflict_discharge_001': '2026-08-03',
}
FAM_APPROVED = {
  'collateral_baseline_safety_001': '2026-08-03',
  'family_meeting_opening_001': '2026-08-03',
  'discharge_barrier_map_001': '2026-08-03',
  'high_expressed_emotion_001': '2026-08-03',
  'psychosis_family_psychoeducation_001': '2026-08-03',
  'family_involvement_boundaries_001': '2026-08-03',
  'caregiver_baseline_adaptations_001': '2026-08-03',
  'culture_interpreter_family_001': '2026-08-03',
}

COMM_OLD = ('      "facultyReview": {\n'
            '        "status": "draft",\n'
            '        "reviewer": "",\n'
            '        "lastReviewed": ""\n'
            '      }')
COMM_NEW = ('      "facultyReview": {\n'
            '        "status": "reviewed",\n'
            '        "reviewer": "Joshua Moss, MD",\n'
            '        "lastReviewed": "%s"\n'
            '      }')
FAM_OLD = '"facultyReview": {"status": "draft", "reviewer": "", "lastReviewed": ""}'
FAM_NEW = ('"facultyReview": {"status": "reviewed", "reviewer": "Joshua Moss, MD", '
           '"lastReviewed": "%s"}')

def apply(path, approved, old, new):
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    for item_id, date in approved.items():
        anchor = '"id": "%s"' % item_id
        start = text.index(anchor)
        block = text.index(old, start)
        text = text[:block] + (new % date) + text[block + len(old):]
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print('%s: %d attested' % (path, len(approved)))

apply('communication_cases.json', COMM_APPROVED, COMM_OLD, COMM_NEW)
apply('family_systems_scenarios.json', FAM_APPROVED, FAM_OLD, FAM_NEW)
EOF
```

Expected output: `communication_cases.json: 10 attested` / `family_systems_scenarios.json: 8 attested`. Confirm formatting-only-status diff: `git diff --stat` → 2 files changed.

- [ ] Validate: `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py` → `communication_cases.json: OK` and `family_systems_scenarios.json: OK`; `python3 13_Faculty_Resources/_automation/test_family_systems_scenarios.py` → OK; `node --test tests/*.test.mjs` → 0 failures; both `build_and_check.sh` targets OK.
- [ ] Commit and PR:

```bash
git add communication_cases.json family_systems_scenarios.json
git commit -m "attest: session B — communication cases and family systems scenarios

Faculty review by Joshua Moss, MD on 2026-08-03; both learner-facing
simulation registries move from 100% draft to reviewed (audit WS2
finding 1b). Reviewed badges render via the two-branch reviewBadge
landed in fix/ws2-review-visibility.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin attest/session-b-sim-registries
gh pr create --title "attest: session B — communication + family simulation registries" \
  --body "18 registry items faculty-reviewed 2026-08-03. Requires the reviewed-badge PR to be on main (it is). CI: build-test-validate + smoke."
```

**PR boundary:** branch `attest/session-b-sim-registries`. Required green: **build-test-validate + smoke**. Hard ordering: Batch 1 PR merged first.

### Task 9 [JOSH]: Session C — remaining reviewed.json backlog (15 entries, ~60 min)

**[JOSH]** Review the remaining pending surfaces (sp-interview.html is deliberately excluded — it is Task 13's decision):

- 9 CotW pages: `cotw_20260709_ssnms_{ms3,res}.md`, `cotw_20260713_agitation_{ms3,res}.md`, `cotw_20260720_bipolar_{ms3,res}.md`, `cotw_20260720_mdd_{ms3,res}.md` — plus the already-recent `cotw_20260726_etohwd_{ms3,res}.md` and `cotw_20260727_oud_{ms3,res}.md` if time allows (13 total). URLs: `https://une-ms3-psychiatry.netlify.app/index.html?page=<slug>` for `_ms3`, `https://mmc-psychiatry-residents-sanford.netlify.app/index.html?page=<slug_res>` for `_res`.
- `cotw_index.md`: https://une-ms3-psychiatry.netlify.app/index.html?page=cotw_index.md (attesting it also removes the "Pending faculty attestation." banner — Task 10 handles the edit).
- `one-patient-six-weeks.html`: https://une-ms3-psychiatry.netlify.app/tools/one-patient-six-weeks.html (six weekly states, checklists, links).
- `anki.md`: https://une-ms3-psychiatry.netlify.app/index.html?page=anki.md (navigation/download page; cards derive only from attested content).
- [ ] Record verdicts per slug and hand to Task 10.

### Task 10: Land Session C attestations (agent)

Branch: `attest/session-c-reviewed-backlog` off origin/main. Apply only attested slugs.

**Files:**
- Modify: `13_Faculty_Resources/reviewed.json` (lines 2–5, 8–16 single-line; one-patient + anki multi-line at 500–511)
- Modify: `08_Cases_and_Simulation/case-of-the-week/index_ms3.md` and `index_resident.md` (line 3 banner — REQUIRED if cotw_index.md attested, else the validator hard-fails)
- Modify (if one-patient attested): `08_Cases_and_Simulation/one-patient-six-weeks.html` (line 114) AND `13_Faculty_Resources/_automation/test_longitudinal_case.py` (line 35)

**Steps:**

- [ ] `git fetch origin && git checkout -b attest/session-c-reviewed-backlog origin/main`
- [ ] For each attested single-line CotW entry (lines 2–5, 9–16), replace `"status": "pending", "at": "<old-date>"` with `"status": "reviewed", "at": "2026-08-04"` keeping the rest of the line byte-identical (same pattern as Task 6's CotW edits).
- [ ] cotw_index.md (line 8), if attested:

Old:
```json
  "cotw_index.md": {"status": "pending", "at": "2026-07-23", "by": "Joshua Moss, MD"},
```
New:
```json
  "cotw_index.md": {"status": "reviewed", "at": "2026-08-04", "by": "Joshua Moss, MD"},
```

AND in BOTH `08_Cases_and_Simulation/case-of-the-week/index_ms3.md` and `index_resident.md` replace line 3:

Old:
```markdown
> **About these cases:** Educational teaching cases; fictional composites only, no PHI. Curated by Joshua Moss, MD. Pending faculty attestation.
```
New:
```markdown
> **About these cases:** Educational teaching cases; fictional composites only, no PHI. Curated and attested by Joshua Moss, MD.
```

- [ ] one-patient-six-weeks.html, if attested — three coupled edits in ONE commit:

reviewed.json old:
```json
 "one-patient-six-weeks.html": {
  "status": "pending",
  "at": "2026-07-11",
  "by": "Pending faculty review",
  "note": "Fictional composite longitudinal simulation; attest before learner release."
 },
```
new:
```json
 "one-patient-six-weeks.html": {
  "status": "reviewed",
  "at": "2026-08-04",
  "by": "Joshua Moss, MD",
  "note": "Fictional composite longitudinal simulation; attested 2026-08-04."
 },
```

`08_Cases_and_Simulation/one-patient-six-weeks.html` line 114 old:
```js
  var state={caseData:null,current:requestedWeek(),progress:loadProgress(),review:{status:'pending',by:'Pending faculty review',at:''}};
```
new:
```js
  var state={caseData:null,current:requestedWeek(),progress:loadProgress(),review:{status:'reviewed',by:'Joshua Moss, MD',at:'2026-08-04'}};
```

`13_Faculty_Resources/_automation/test_longitudinal_case.py` line 35 old:
```python
    assert reviewed["one-patient-six-weeks.html"]["status"] == "pending"
```
new:
```python
    assert reviewed["one-patient-six-weeks.html"]["status"] == "reviewed"
```

- [ ] anki.md, if attested — replace the multi-line entry:

Old:
```json
 "anki.md": {
  "status": "pending",
  "at": "2026-07-12",
  "by": "Joshua Moss, MD",
  "note": "Awaiting faculty attestation. Navigation/download page for the Anki decks; the cards themselves are extracted only from already-attested content (no AI-generated cards). Ships watermarked until attested via the faculty console."
 }
```
New:
```json
 "anki.md": {
  "status": "reviewed",
  "at": "2026-08-04",
  "by": "Joshua Moss, MD",
  "note": "Navigation/download page for the Anki decks; the cards themselves are extracted only from already-attested content (no AI-generated cards). Attested 2026-08-04."
 }
```

- [ ] Verify + run the full gate set (batch header). Extra check for this task: `python3 13_Faculty_Resources/_automation/test_longitudinal_case.py` → `test_longitudinal_case: OK — ...`.
- [ ] Commit and PR:

```bash
git add 13_Faculty_Resources/reviewed.json 08_Cases_and_Simulation 13_Faculty_Resources/_automation/test_longitudinal_case.py
git commit -m "attest: session C — CotW backlog, cotw index, one-patient simulation, anki page

Faculty review by Joshua Moss, MD on 2026-08-04. Clears the remaining
reviewed.json backlog except sp-interview.html (pack-level decision
tracked separately). Removes the now-false pending banners and updates
the longitudinal contract test in the same change.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin attest/session-c-reviewed-backlog
gh pr create --title "attest: session C — reviewed.json backlog (CotW, one-patient, anki)" \
  --body "Session C verdicts 2026-08-04. Coupled edits: index banners + one-patient in-tool state + test_longitudinal_case.py expectation. CI: build-test-validate + smoke."
```

**PR boundary:** branch `attest/session-c-reviewed-backlog`. Required green: **build-test-validate + smoke**. Independent of other batches; land promptly to minimize the reviewed.json rebase surface against draft PR #263.

### Task 11 [JOSH]: Session D — qbank draft attestation (48 drafts, ~2–3 h, splittable)

**[JOSH]** After Batch 2 lands, the attestable draft cohort is 48: the 46 long-standing drafts + qb_pha_011 (re-attest after #280's wording fix) + qb_pha_017 (new MAOI item). All are already learner-visible with a "Draft — not yet faculty-reviewed" label (#284, your 2026-07-15 policy) — attestation removes the label and restores full trust.

Priority order (blueprint gaps first):
1. **otherdx (5 drafts)** — restores blueprint 12/12.
2. **qb_pha_011 + qb_pha_017** — restores pharm 16/16.
3. personality (10), childdev (10), ethics (8) — thinnest served categories.
4. anxiety (4), safety (4), relational (3), psychosis (2).

Tooling:
- Console (post-WS1): https://clerkship-faculty-attest.netlify.app — question queue, per-item Review → Resolve → Confirm. Note: the batch `answer_key_balance` warning ("strong answer-position cue") WILL fire on all-A batches — choose "attest individually"; the served tool shuffles options at render, so the stored key skew is invisible to learners. Do not rewrite keys just to silence it.
- Local fallback (works today): from repo root run `python3 -m http.server 8080`, open http://localhost:8080/13_Faculty_Resources/qbank-attest.html, review each item (Approve / Flag with note), then use the tool's export button — it downloads `qbank_attestation_<date>.json`. Hand that file to Task 12.
- [ ] Deliverable either way: the set of approved item ids (+ flagged ids with notes) and the session date.

### Task 12: Apply qbank attestation decisions + fixture update (agent)

Branch: `attest/session-d-qbank-drafts` off origin/main.

**Files:**
- Modify: `question_bank.json` (status flips only), `tests/faculty-qbank-rules.test.mjs` (live-bank fixture)

**Steps:**

- [ ] `git fetch origin && git checkout -b attest/session-d-qbank-drafts origin/main`
- [ ] Apply the decisions (script reads the exported decisions file; for a console-only session, build APPROVED from Josh's verdict list instead):

```bash
python3 - <<'EOF'
import json
import sys

DECISIONS_PATH = 'qbank_attestation_2026-08-05.json'  # Josh's export from Task 11
with open(DECISIONS_PATH, encoding='utf-8') as fh:
    decisions = json.load(fh)
approved = {
    item_id for item_id, verdict in decisions['items'].items()
    if verdict.get('status') == 'approved'
}

with open('question_bank.json', encoding='utf-8') as fh:
    bank = json.load(fh)
flipped = 0
for item in bank['items']:
    if item['id'] in approved:
        assert not item.get('retired'), '%s is retired; never attest retired items' % item['id']
        assert item['status'] == 'draft', '%s is not a draft' % item['id']
        item['status'] = 'attested'
        flipped += 1
with open('question_bank.json', 'w', encoding='utf-8') as fh:
    json.dump(bank, fh, indent=2, ensure_ascii=False)
    fh.write('\n')

active = [i for i in bank['items'] if not i.get('retired')]
drafts = [i for i in active if i['status'] == 'draft']
keys = {'A': 0, 'B': 0, 'C': 0, 'D': 0}
for item in drafts:
    correct = next(o for o in item['options'] if o.get('c'))
    keys[correct['key']] += 1
print('flipped %d items to attested' % flipped)
print('new fixture values -> total: %d, draft: %d, attested: %d, answerKeys: %s'
      % (len(active), len(drafts), len(active) - len(drafts), keys))
EOF
```

- [ ] Update the live-bank fixture in `tests/faculty-qbank-rules.test.mjs` (~line 587) to the printed values. If ALL 48 were approved, the exact new block is:

```js
test('current repository bank has 190 blocker-free active items and an empty draft cohort (2026-08-05 attestation session)', () => {
  const bank = JSON.parse(fs.readFileSync(path.join(repo, 'question_bank.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/site_manifest.json'), 'utf8'));
  const manifestPages = (manifest.md || []).map(([, slug]) => slug);
  const result = assessBank(bank.items, { manifestPages, activeItems: bank.items });

  assert.equal(result.counts.total, 190);
  assert.equal(result.counts.draft, 0);
  assert.equal(result.counts.attested, 190);
  assert.equal(Object.keys(result.byId).length, 190);
  assert.equal(Object.values(result.byId).flatMap(entry => entry.blockers).length, 0);
  assert.deepEqual(result.answerKeys, { A: 0, B: 0, C: 0, D: 0 });
  for (const item of bank.items.filter(entry => entry.retired)) {
    assert.equal(Object.hasOwn(result.byId, item.id), false);
  }
});
```

(For a partial session, keep the existing test body and substitute the printed total/draft/attested/answerKeys values, updating the test title's counts to match.)

- [ ] Run to pass: `node --test tests/faculty-qbank-rules.test.mjs` → 0 failures; `node --test tests/*.test.mjs` → 0 failures (qbank-draft-visibility is synthetic — unaffected); `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py` → OK; both `build_and_check.sh` targets OK.
- [ ] Do NOT commit the decisions export into the repo root (that is how the stale 2026-07-05 file happened — Task 3). If provenance is wanted, place it at `99_Archive/qbank_attestation_2026-08-05.json` with the export's own summary intact.
- [ ] Commit and PR:

```bash
git add question_bank.json tests/faculty-qbank-rules.test.mjs 99_Archive
git commit -m "attest: session D — qbank draft cohort attested by faculty

Applies Dr. Moss's 2026-08-05 attestation decisions: drafts flip to
attested (blueprint otherdx 12/12 and pharm 16/16 restored), draft
labels disappear from the served bank, and the live-bank fixture in
faculty-qbank-rules is updated in the same change.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin attest/session-d-qbank-drafts
gh pr create --title "attest: session D — qbank draft cohort" \
  --body "Faculty attestation session 2026-08-05. Status flips + fixture update only; no stems/options edited. CI: build-test-validate + smoke."
```

**PR boundary:** branch `attest/session-d-qbank-drafts`. Required green: **build-test-validate + smoke**. Hard ordering: after Batch 2 (so qb_pha_017 exists) and after #280/#281 (so qb_pha_011 is a draft and the fixture baseline matches).

---

## Batch 4 — SP Interview pack-level attestation (decision-gated)

### Task 13 [JOSH]: Decision — attest The Interview Room at pack level

**[JOSH]** The per-persona granularity the audit asked for **already exists**: all three cases carry `facultyReview.status:"reviewed"` (Dana 2026-07-13; Marcus & Ray 2026-07-22, your PR #257), and the validator enforces per-case rules. The only remaining draft state is the pack-level `status` and the reviewed.json `sp-interview.html` entry — i.e., the "Redesigned — pending faculty review" badge learners see.

Decide: flip pack-level status to reviewed now?

- Precondition (hard): the sp-proxy red-team receipt must exist first — the pack changed 2026-07-28 with no recorded red-team run (that gate is another workstream's task). Check: `test -f 13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json && echo present || echo missing` must print `present`.
- Review basis: golden-transcript spot-check of the 3 personas against the pinned model (claude-haiku-4-5-20251001) in live mode, plus the B-section SI-gate probes already covered by the red-team run.
- If NO (keep pack draft): nothing to do; reviewed.json keeps sp-interview.html pending; revisit at the next pack change.
- If YES: Task 14 executes.

### Task 14: Execute pack-level attestation (agent; only if Task 13 = YES)

Branch: `attest/sp-interview-pack` off origin/main.

**Files:**
- Modify: `_prototypes/sp-interview/sp-interview.pack.json` (line 8 top-level status; line 12 checklist note), `_prototypes/sp-interview/sp-interview.html` (line 6 CLERKSHIP-META status; line 838 badge), `13_Faculty_Resources/reviewed.json` (line 17)
- Regenerate: `_prototypes/sp-interview/sp-interview.preview.html` (via generator — never hand-edit)

**Steps:**

- [ ] `git fetch origin && git checkout -b attest/sp-interview-pack origin/main`
- [ ] Confirm the red-team receipt exists (command in Task 13). If missing, STOP and return the task to Josh.
- [ ] Pack top-level status — replace (anchored to the preceding line for uniqueness):

Old:
```json
  "reviewCadenceDays": 180,
  "status": "draft-pending-attestation",
```
New:
```json
  "reviewCadenceDays": 180,
  "status": "reviewed",
```

(Leave `speechEngine.status` and every `speechProfile.status` as `draft-pending-attestation` — voice remains disabled and the validator explicitly allows reviewed cases with draft speech profiles.)

- [ ] Pack checklist note (line 12) — replace:

Old:
```json
    "facultyReview": "PENDING — do not add to reviewed.json until Joshua Moss, MD attests. Ships watermarked 'Draft — pending faculty review'.",
```
New:
```json
    "facultyReview": "Attested at pack level by Joshua Moss, MD on 2026-08-05 after red-team receipt sp-red-team.json. All three personas carry per-case reviewed status (Dana 2026-07-13; Marcus and Ray 2026-07-22). reviewed.json flipped in the same commit.",
```

- [ ] `sp-interview.html` line 6: inside the CLERKSHIP-META comment replace `status="draft-pending-attestation"` with `status="reviewed"`.
- [ ] `sp-interview.html` line 838 badge — replace:

Old:
```js
      e('span',{className:'badge draft'},'Redesigned — pending faculty review'),
```
New:
```js
      e('span',{className:'badge'},'Faculty-attested'),
```

- [ ] reviewed.json line 17 — replace:

Old:
```json
  "sp-interview.html": {"status": "pending", "at": "2026-07-13", "by": "Joshua Moss, MD"},
```
New:
```json
  "sp-interview.html": {"status": "reviewed", "at": "2026-08-05", "by": "Joshua Moss, MD"},
```

- [ ] Regenerate the derived preview (MANDATORY after any sp-interview.html or pack edit): `node _prototypes/sp-interview/generate-preview.mjs --write` → rewrites `sp-interview.preview.html`; commit the result.
- [ ] Run the SP suites: `bash _prototypes/sp-interview/tests/run-all.sh` → all 15 suites pass (the review-filter synthetic-pack negative test is untouched and must stay green); `python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py` → `attestation consistency OK ...` (the reviewed-pack branch now enforces per-case reviewed status — all three already are); `node --test tests/*.test.mjs` → 0 failures; both `build_and_check.sh` targets OK. Interview-room smoke runs in CI (structural caseCard()/supportedButton() helpers — case-card count is unchanged at 3, so no spec edits are expected).
- [ ] Commit and PR:

```bash
git add _prototypes/sp-interview 13_Faculty_Resources/reviewed.json
git commit -m "attest: pack-level attestation of The Interview Room

Per-case review was already complete (Dana 2026-07-13; Marcus & Ray
2026-07-22, #257); this flips the pack-level status, meta header, learner
badge, and reviewed.json entry per Dr. Moss's 2026-08-05 decision, after
the sp-red-team receipt was recorded. Preview regenerated via
generate-preview.mjs --write. Voice/speechProfiles remain draft (issue #232).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin attest/sp-interview-pack
gh pr create --title "attest: Interview Room pack-level attestation" \
  --body "Executes the Task 13 decision. Red-team receipt verified present. CI: build-test-validate + smoke."
```

**PR boundary:** branch `attest/sp-interview-pack`. Required green: **build-test-validate + smoke**. Hard ordering: after the sp-proxy red-team receipt lands (other workstream) and after Josh's YES in Task 13.
