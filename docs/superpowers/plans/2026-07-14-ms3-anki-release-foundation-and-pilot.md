# MS3 Anki Release Foundation and Faculty Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the governed, fail-closed Anki release engine and deliver a 36-card internal Core pilot for faculty review without publishing unapproved clinical cards to learners.

**Architecture:** This is Phase 1 of a two-phase implementation. Canonical governance JSON lives under `13_Faculty_Resources/anki/`; a small Python package under `13_Faculty_Resources/_automation/anki/` validates, renders, inspects, and reviews it; the existing site-build shell calls that package only through explicit candidate or release profiles. Phase 1 puts the learner site into a truthful maintenance state, proves legacy qbank withdrawal/update behavior, and generates the non-public faculty pilot. Phase 2 begins only after faculty/evidence inputs are available, expands to exactly 144 Core and 48 Application cards, records all qbank render approvals, and flips the already-tested production release gate.

**Tech Stack:** Python 3.11; `genanki==0.13.1`; `jsonschema==4.26.0`; `pytest==9.1.1`; headless Anki import tests on `anki==23.10.1` and `anki==26.5`; SQLite and ZIP inspection from the Python standard library; vanilla HTML/CSS/JavaScript; Node 20 CI with Playwright 1.46; Node 22 local fallback for Playwright.

## Global Constraints

- Execute in an isolated worktree created from the commit containing this plan. Preserve `.worktrees/` and every unrelated local change.
- Treat curriculum Markdown, `question_bank.json`, `13_Faculty_Resources/_automation/site_build/site_manifest.json`, `13_Faculty_Resources/reviewed.json`, `13_Faculty_Resources/_automation/surveillance/config/needs_reattest.json`, `evidence_registry.json`, and reviewed policy records as inputs. Do not rewrite clinical source content to make a card pass.
- Never invent a faculty approver, human editor, evidence reviewer, policy owner, approval date, source quote, or approval hash. Mechanical code may compute hashes; a named human must make each review decision.
- Keep generated `.apkg`, CSV, receipt, candidate manifest, HTML clinic, and review exports non-canonical. Only the four reviewed registries and their schemas/configuration are committed authorities.
- Freeze the legacy qbank contract exactly: model `1607392901`, deck `2059400191`, model name `PCL Vignette (Moss)`, deck name `Psychiatry Clerkship Library (Moss)`, template `Card 1` ordinal `0`, nine ordered fields, base GUID `genanki.guid_for(item_id)`, and Tier 2 GUID `genanki.guid_for(item_id + "::t2")`. Do not add field/template IDs to that legacy model.
- Do not reuse legacy Concepts IDs `1740111001`, `1740111002`, `2059400192`, or legacy combined-only IDs `2059400193` and `2059400194` for v2.
- Use the permanent v2 IDs defined in Task 1. Once committed, a change requires a new ID plus `supersedes`; it is never an in-place edit.
- Generate every package with an explicit integer release epoch. A new governed release epoch must be greater than every prior shipped epoch in `release_history.json`; an idempotent rebuild may reuse only the exact same latest release ID/date/epoch when every governed contract matches.
- `maintenance` mode is the deploy gate while downloads are off: it hard-fails malformed schemas/registries, identity/history corruption, source-map/authority failures, known safety-hold drift, and new/changed unreviewed quarantine, but reports expected incomplete coverage/card/qbank/evidence approvals without failing. It writes no packages.
- `authoring` mode may validate drafts and build internal review artifacts. It may not produce learner filenames, stage a site download, or claim release readiness.
- `release` mode is strict: exact 144/48 coverage, every rendered approval, qbank-render approvals, evidence/policy requirements, quarantine reconciliation, package inspection, migration, history, staging, site, and receipt gates all pass or nothing stages.
- During Phase 1, `release_config.json.siteMode` is `maintenance`. The MS3 site contains a safety/maintenance page and no Anki binary downloads; the resident site contains neither the page nor artifacts. Only Phase 2 may change `siteMode` to `release`.
- The 36-card pilot samples one Core card from each Week-by-Domain cell, remains internal, and is never written under a production filename.
- `qb_pha_002` is an initial detected quarantine proposal, not a preaccepted decision. Test-only candidate qbank fixtures must exercise its neutral same-GUID withdrawal and prove the prior clinical language is absent; a real governed exclusion/withdrawal requires the named faculty disposition in Task 9.
- The historical `qbank_attestation_2026-07-05.json` is evidence of a past event, not current eligibility authority. Do not edit it or use it to override current item state.
- If the default Node 25 runtime hangs locally, rerun Playwright with `/usr/local/bin/node` (Node 22) before reporting a browser-test failure.
- Commit after each task with the exact commit message listed. Do not combine faculty decisions with mechanical engine changes.

## Phase Boundary and Release Decision

Phase 1 is complete when the full mechanical suite passes, the maintenance-site boundary passes, a test-only 168-note qbank migration fixture proves 167 active notes plus the neutral `qb_pha_002` withdrawal update, and the 36-card Core clinic is ready for named faculty review. The test fixture is not a governed qbank candidate or learner release; the real qbank remains blocked until every rendered base/Tier-2 note is reviewed in Phase 2.

Phase 2 may be planned only after all of these inputs exist:

1. Named faculty disposition of the initial quarantine.
2. Named human editing and faculty review of the 36-card pilot.
3. Reviewed evidence-registry coverage adequate for all proposed High-risk cards, including psychopharmacology.
4. A versioned, reviewed policy record for every proposed `LocalPolicy` card, or an explicit decision to exclude that card.
5. Faculty agreement on any wording-rule revisions discovered by the pilot.

## File Structure

### Canonical governance inputs

- Create `13_Faculty_Resources/anki/cards.json`: approved Core/Application registry; empty until review exports are applied.
- Create `13_Faculty_Resources/anki/cards.schema.json`: closed Draft-07 card schema.
- Create `13_Faculty_Resources/anki/qbank_render_reviews.json` and `.schema.json`: base/Tier-2 rendered-note approvals.
- Create `13_Faculty_Resources/anki/quarantine.json` and `.schema.json`: explicit pending/accepted/resolved quarantine decisions.
- Create `13_Faculty_Resources/anki/release_history.json` and `.schema.json`: append-only shipped identities.
- Create `13_Faculty_Resources/anki/release_config.json` and `.schema.json`: permanent identities, matrices, artifact allowlist, canonical URL, Anki support window, release epoch, and `siteMode`.

### Automation package

- Create `13_Faculty_Resources/_automation/anki/requirements-core.in`, `requirements.in`, `requirements-min.in`, `requirements-current.in` and the three hash-locked `.lock` outputs.
- Create `13_Faculty_Resources/_automation/anki/run_python.sh`: lock-keyed virtualenv runner under ignored `_build/anki-venv/`.
- Create `13_Faculty_Resources/_automation/anki/pcl_anki/{__init__,contract,sources,qbank,governance,history,render,package,inspect,release,review}.py`.
- Create `13_Faculty_Resources/_automation/anki/{build_release,build_review,bootstrap_legacy_history}.py`; release profiles are `maintenance|authoring|prepare|release`.

### Tests and independent fixtures

- Create `tests/anki/conftest.py` and focused test modules named in the tasks below.
- Create `tests/anki/fixtures/legacy_qbank_2026-07-12.apkg`, copied from the independently shipped standalone artifact and protected by SHA-256 `07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5`.
- Create `tests/anki/fixtures/legacy_all_2026-07-12.apkg`, copied from the independently shipped combined artifact and protected by SHA-256 `6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3`.
- Create `tests/anki/fixtures/anchor_vectors.json`, `release_n.json`, and `release_n_plus_1.json`.
- Create `tests/anki/build_release_site_fixture.py`: generates a fully approved, non-clinical release-mode site under ignored `_build/anki-release-fixture/`.
- Create `tests/smoke/anki-downloads.spec.js` and `tests/smoke/source-anchor.spec.js`.

### Existing integration surfaces

- Modify `13_Faculty_Resources/_automation/site_build/{spa_index.html,build_anki.sh,build_and_check.sh,resident_section.py}`.
- Create `13_Faculty_Resources/_automation/site_build/check_anki_site.py`.
- Modify `.github/workflows/ci.yml`, `tests/smoke/playwright.config.js`, `tests/smoke/package.json`, and `tests/smoke/README.md`.
- Modify `09_Exam_Prep/anki_export/anki.md`, `09_Exam_Prep/anki_export/README.md`, and `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`.

### Shared typed contracts

Define these dataclasses once in `pcl_anki.contract` (package snapshots may live in `inspect.py`) and import them everywhere else; do not replace them with untyped dictionaries at module boundaries:

```python
Severity = Literal["hard", "review", "info"]
Namespace = Literal["core", "application", "qbank"]
Identity = Literal["base", "tier2"]

@dataclass(frozen=True)
class Issue:
    code: str
    severity: Severity
    subject: str
    message: str

@dataclass(frozen=True)
class ManifestIndex:
    path_to_slug: Mapping[str, str]
    slug_to_path: Mapping[str, str]
    slug_to_title: Mapping[str, str]

@dataclass(frozen=True)
class WeekMap:
    slug_to_first_week: Mapping[str, int]
    tool_to_first_week: Mapping[str, int]

@dataclass(frozen=True)
class Section:
    anchor: str
    title: str
    level: int
    start_line: int
    end_line: int
    raw_text: str
    normalized_text: str

@dataclass(frozen=True)
class SourceResolution:
    path: str
    slug: str
    anchor: str
    url: str
    quote: str
    quote_sha256: str
    section_sha256: str
    reviewed_at: date
    introduced_week: int | None

@dataclass(frozen=True)
class HistoryRegistry:
    identity_entries: tuple[dict, ...]
    releases: tuple[dict, ...]

@dataclass(frozen=True)
class ReleaseInputs:
    repo_root: Path
    cards: tuple[dict, ...]
    qbank_reviews: tuple[dict, ...]
    quarantine: tuple[dict, ...]
    release_history: HistoryRegistry
    release_config: dict
    qbank_items: tuple[dict, ...]
    manifest: ManifestIndex
    reviewed: Mapping[str, dict]
    evidence_records: Mapping[str, dict]
    surveillance: Mapping[str, dict]
    week_map: WeekMap
    governed_inputs: "GovernedInputSnapshot"

@dataclass(frozen=True)
class GovernedInputSnapshot:
    path_sha256: Mapping[str, str]
    aggregate_sha256: str

@dataclass(frozen=True)
class RenderedNote:
    namespace: Namespace
    uid: str
    identity: Identity
    guid: str
    deck_id: int
    model_id: int
    template_ordinal: int
    fields: tuple[str, ...]
    tags: tuple[str, ...]
    front_html: str
    back_html: str
    template_contract_sha256: str
    render_sha256: str
    active: bool
    withdrawn: bool

@dataclass(frozen=True)
class CardDecision:
    namespace: Namespace
    uid: str
    identity: Identity
    eligible: bool
    rendered: RenderedNote | None
    issues: tuple[Issue, ...]

@dataclass(frozen=True)
class QuarantineFinding:
    namespace: Namespace
    uid: str
    identity: Identity
    reason_code: str
    subject_sha256: str
    source_path: str | None
    first_seen_commit: str

@dataclass(frozen=True)
class QuarantineResult:
    new: tuple[QuarantineFinding, ...]
    changed: tuple[QuarantineFinding, ...]
    accepted: tuple[QuarantineFinding, ...]
    resolved: tuple[QuarantineFinding, ...]

@dataclass(frozen=True)
class Withdrawal:
    namespace: Namespace
    uid: str
    identity: Identity
    guid: str
    deck_id: int
    model_id: int
    template_ordinal: int
    field_names: tuple[str, ...]
    reason_code: str
    affected_release_id: str

@dataclass(frozen=True)
class CandidateRelease:
    release_id: str | None
    release_date: date | None
    release_epoch: int
    governed_input_sha256: str
    evaluated_at: date
    core_active: tuple[RenderedNote, ...]
    application_active: tuple[RenderedNote, ...]
    qbank_active: tuple[RenderedNote, ...]
    withdrawals: tuple[RenderedNote, ...]
    quarantine: QuarantineResult
    coverage: Mapping[str, object]
    issues: tuple[Issue, ...]

@dataclass(frozen=True)
class PackageNote:
    guid: str
    model_id: int
    fields: tuple[str, ...]
    tags: tuple[str, ...]

@dataclass(frozen=True)
class PackageCard:
    note_guid: str
    deck_id: int
    ordinal: int
    queue: int

@dataclass(frozen=True)
class PackageSnapshot:
    path: Path
    models: Mapping[int, dict]
    decks: Mapping[int, dict]
    notes: tuple[PackageNote, ...]
    cards: tuple[PackageCard, ...]

@dataclass(frozen=True)
class InspectionResult:
    snapshots: Mapping[str, PackageSnapshot]
    receipt: Mapping[str, object]
    identity_fingerprints: Mapping[tuple[str, str, str], str]
    artifact_sha256: Mapping[str, str]
    issues: tuple[Issue, ...]

@dataclass(frozen=True)
class MigrationResult:
    seed_release_id: str
    seed_mode: Literal["legacy", "predecessor", "candidate_redeploy"]
    contract_sha256: str
    issues: tuple[Issue, ...]

@dataclass(frozen=True)
class HistoryAppend:
    new_identity_entries: tuple[dict, ...]
    release_record: dict

@dataclass(frozen=True)
class ReviewPatch:
    target_registry: Literal["cards", "qbank_render_reviews", "quarantine", "release_history"]
    generated_from_commit: str
    input_sha256: str
    decisions: tuple[dict, ...]
```

---

### Task 1: Pin dependencies, freeze identities, and preserve the independent legacy fixture

**Files:**
- Create: `.python-version` with exact content `3.11.9`
- Create: `13_Faculty_Resources/_automation/anki/requirements-core.in`
- Create: `13_Faculty_Resources/_automation/anki/requirements.in`
- Create: `13_Faculty_Resources/_automation/anki/requirements-min.in`
- Create: `13_Faculty_Resources/_automation/anki/requirements-current.in`
- Create: `13_Faculty_Resources/_automation/anki/requirements.lock`
- Create: `13_Faculty_Resources/_automation/anki/requirements-min.lock`
- Create: `13_Faculty_Resources/_automation/anki/requirements-current.lock`
- Create: `13_Faculty_Resources/_automation/anki/run_python.sh`
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/__init__.py`
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/contract.py`
- Create: `tests/anki/conftest.py`
- Create: `tests/anki/test_identity.py`
- Create: `tests/anki/fixtures/legacy_qbank_2026-07-12.apkg`
- Create: `tests/anki/fixtures/legacy_all_2026-07-12.apkg`

**Interfaces:**
- `contract.py` exports legacy/v2 deck, model, template, field, GUID, and artifact constants.
- `run_python.sh COMMAND [ARGUMENTS]` requires CPython 3.11, creates or reuses a venv keyed by the interpreter version plus SHA-256 of the selected lock, installs with `--require-hashes`, and executes the command. `ANKI_LOCK=build|min|current` selects `requirements.lock`, `requirements-min.lock`, or `requirements-current.lock`; `build` is the default. `PCL_ANKI_PYTHON` may point to an explicit 3.11 interpreter.
- `tests/anki/conftest.py` prepends `13_Faculty_Resources/_automation/anki` to `sys.path`.

- [ ] **Step 1: Add failing frozen-identity tests**

Create assertions for:

```python
def test_legacy_qbank_identity_is_frozen():
    assert LEGACY_QBANK_MODEL_ID == 1607392901
    assert LEGACY_QBANK_DECK_ID == 2059400191
    assert LEGACY_QBANK_FIELDS == (
        "UID", "Question", "Options", "Answer", "Why",
        "Pearl", "Evidence", "Link", "Meta",
    )
    assert legacy_qbank_guid("qb_pha_002") == "x9m9qM{_w7"

def test_v2_identity_is_frozen():
    assert CORE_DECK_ID == 2059400201
    assert APPLICATION_DECK_ID == 2059400202
    assert CORE_BASIC_MODEL_ID == 1740112001
    assert CORE_CLOZE_MODEL_ID == 1740112002
    assert APPLICATION_MODEL_ID == 1740112003

def test_fixture_is_the_independent_shipped_package(legacy_qbank_path):
    assert sha256(legacy_qbank_path.read_bytes()).hexdigest() == (
        "07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5"
    )

def test_combined_fixture_is_the_independent_shipped_package(legacy_all_path):
    assert sha256(legacy_all_path.read_bytes()).hexdigest() == (
        "6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3"
    )
```

Also assert the model names, deck names, template names/ordinals, all v2 field IDs, all v2 template IDs, and that Core/Application GUIDs are unchanged when wording changes. Inspect the legacy model JSON and require every qbank field/template `id` key to be absent; inspect a v2 fixture and require its fixed field/template IDs to be present as explicit serialized model-JSON keys.

- [ ] **Step 2: Pin/provision CPython 3.11 and compile hashed locks**

Use these top-level requirements:

```text
# requirements-core.in
genanki==0.13.1
jsonschema==4.26.0
pytest==9.1.1
```

```text
# requirements.in — production build/release environment
-r requirements-core.in
anki==26.5

# requirements-min.in
-r requirements-core.in
anki==23.10.1
```

```text
# requirements-current.in
-r requirements-core.in
anki==26.5
```

Create `.python-version` with exact content `3.11.9`. This Mac currently exposes only Python 3.13, so use the installed `uv` to provision 3.11.9 and compile each lock under that interpreter:

```bash
uv python install 3.11.9
uv venv --python 3.11.9 --clear /tmp/pcl-anki-lock
uv pip install --python /tmp/pcl-anki-lock/bin/python pip-tools==7.5.3
/tmp/pcl-anki-lock/bin/python -m piptools compile --generate-hashes --resolver=backtracking \
  --output-file 13_Faculty_Resources/_automation/anki/requirements.lock \
  13_Faculty_Resources/_automation/anki/requirements.in
/tmp/pcl-anki-lock/bin/python -m piptools compile --generate-hashes --resolver=backtracking \
  --output-file 13_Faculty_Resources/_automation/anki/requirements-min.lock \
  13_Faculty_Resources/_automation/anki/requirements-min.in
/tmp/pcl-anki-lock/bin/python -m piptools compile --generate-hashes --resolver=backtracking \
  --output-file 13_Faculty_Resources/_automation/anki/requirements-current.lock \
  13_Faculty_Resources/_automation/anki/requirements-current.in
```

Expected: three fully resolved lock files with hashes; `pip install --require-hashes -r` succeeds in clean venvs.

The default `requirements.lock` is the production lock and must contain `anki==26.5`; prepare/release and history-patch reinspection run migration under that default environment. `requirements-current.lock` intentionally provides an independently compiled same-version matrix lane, while `requirements-min.lock` proves the supported floor. Add a test that imports `anki` through the default runner and rejects production profiles when it is absent or not 26.5.

Implement `run_python.sh` now, before the first test run. Interpreter resolution order is: executable `PCL_ANKI_PYTHON`; `python3.11`; `python3` only when it reports major/minor `3.11`; installed `uv` provisioning/finding `3.11.9`; otherwise exit nonzero with commands to install `uv` or set `PCL_ANKI_PYTHON`. Reject every interpreter whose `sys.version_info[:2] != (3, 11)`.

- [ ] **Step 3: Run the test to prove the contract module is absent**

Run:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_identity.py
```

Expected: FAIL with `ModuleNotFoundError: No module named 'pcl_anki'` while reporting CPython 3.11.x.

- [ ] **Step 4: Copy and verify the legacy fixture**

Run:

```bash
mkdir -p tests/anki/fixtures
cp 09_Exam_Prep/anki_export/psychiatry_clerkship_library.apkg \
  tests/anki/fixtures/legacy_qbank_2026-07-12.apkg
cp 09_Exam_Prep/anki_export/psychiatry_clerkship_library_ALL.apkg \
  tests/anki/fixtures/legacy_all_2026-07-12.apkg
shasum -a 256 tests/anki/fixtures/legacy_qbank_2026-07-12.apkg
shasum -a 256 tests/anki/fixtures/legacy_all_2026-07-12.apkg
```

Expected SHA-256 values: standalone `07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5`; combined `6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3`.

- [ ] **Step 5: Implement the permanent identity constants and GUID helpers**

Use these permanent v2 identities:

| Contract | Value |
|---|---:|
| Core deck | `2059400201`, `Psychiatry Clerkship MS3 (Moss)::Core Recall` |
| Application deck | `2059400202`, `Psychiatry Clerkship MS3 (Moss)::Clinical Application` |
| Core Basic model | `1740112001`, `PCL MS3 Core Basic v2` |
| Core Cloze model | `1740112002`, `PCL MS3 Core Cloze v2` |
| Application model | `1740112003`, `PCL MS3 Clinical Application v2` |
| Core Basic template ID | `8777453155042897990` |
| Core Cloze template ID | `3287951719162080235` |
| Application template ID | `29615640114988655` |

Encode these exact ordered field IDs in `contract.py`:

```text
Core Basic:
UID 7715026946512367336
Front 1581891087570822773
Answer 3648809565985408987
Explanation 2174348647067507977
Caveat 3436125447725103097
SourceQuote 2553051568381521149
SourceLink 2854218784170519640
Meta 1744796410914045706

Core Cloze:
UID 1799494823268918589
Text 7771538009428565766
Answer 4332612271198974114
Explanation 7364136103503060308
Caveat 7788919485417581378
SourceQuote 1452385292661756254
SourceLink 6557169000714987829
Meta 5637910376665094000

Application:
UID 1131999658638281388
Question 3636781603027082657
Answer 9202232928613487235
Discriminator 403813941556652594
Trap 3236073075272291878
Detail 5987568621819550144
Caveat 3260351373777911252
SourceQuote 8755104689011360910
SourceLink 1306800255169644962
Meta 14791453266034096
```

Implement:

```python
def core_guid(card_id: str) -> str:
    return genanki.guid_for("pcl-ms3-core-v2", card_id)

def application_guid(card_id: str) -> str:
    return genanki.guid_for("pcl-ms3-application-v2", card_id)

def legacy_qbank_guid(item_id: str, identity: str = "base") -> str:
    key = item_id if identity == "base" else item_id + "::t2"
    return genanki.guid_for(key)
```

Finish `run_python.sh` so it resolves the lock selected by `ANKI_LOCK`, hashes that file and the CPython `3.11.x` version, creates `_build/anki-venv/$PYTHON_AND_LOCK_SHA256`, installs the selected hash-locked file, and propagates all failures.

- [ ] **Step 6: Run the identity tests and dependency sanity check**

Run:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_identity.py
bash 13_Faculty_Resources/_automation/anki/run_python.sh -m pip check
```

Expected: PASS; `pip check` reports `No broken requirements found.`

- [ ] **Step 7: Commit**

```bash
git add .python-version 13_Faculty_Resources/_automation/anki tests/anki
git commit -m "build: pin governed Anki identity environment"
```

### Task 2: Define closed schemas, canonical hashes, and authoring/release profiles

**Files:**
- Create: `13_Faculty_Resources/anki/cards.json`
- Create: `13_Faculty_Resources/anki/cards.schema.json`
- Create: `13_Faculty_Resources/anki/qbank_render_reviews.json`
- Create: `13_Faculty_Resources/anki/qbank_render_reviews.schema.json`
- Create: `13_Faculty_Resources/anki/quarantine.json`
- Create: `13_Faculty_Resources/anki/quarantine.schema.json`
- Create: `13_Faculty_Resources/anki/release_history.json`
- Create: `13_Faculty_Resources/anki/release_history.schema.json`
- Create: `13_Faculty_Resources/anki/release_config.json`
- Create: `13_Faculty_Resources/anki/release_config.schema.json`
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/contract.py`
- Create: `tests/anki/test_contract.py`
- Create: `tests/anki/fixtures/anchor_vectors.json`

**Interfaces:**
- `canonical_json_bytes(value) -> bytes`: UTF-8, sorted object keys, compact separators, preserved array order.
- `canonical_json_sha256(value) -> str`.
- `normalize_source(text) -> str`: Unicode NFC, LF line endings, collapsed whitespace, trimmed.
- `validate_registry(path, schema_path) -> list[Issue]`.
- Every registry root contains integer `schemaVersion: 1` plus its named array/config fields; every schema sets `additionalProperties: false` at every governed object level.

- [ ] **Step 1: Add failing schema and canonicalization tests**

Test the complete field/enumeration contract from the approved specification, plus:

```python
def test_normalize_source_contract():
    assert normalize_source("Cafe\u0301\r\n  safety\tplan") == "Café safety plan"

def test_canonical_json_is_order_independent_for_objects():
    assert canonical_json_sha256({"b": 2, "a": 1}) == canonical_json_sha256({"a": 1, "b": 2})

def test_release_config_contains_exact_crosswalks(config):
    assert sum(config["coverage"]["core"].values()) == 144
    assert sum(config["coverage"]["application"].values()) == 48

def test_maintenance_config_has_no_release_identity(config):
    assert config["siteMode"] == "maintenance"
    assert config["releaseId"] is None
    assert config["releaseDate"] is None
    assert config["releaseEpoch"] is None

def test_release_config_schema_requires_release_identity(config, config_schema):
    candidate = {**config, "siteMode": "release"}
    assert schema_issue_codes(candidate, config_schema) == {
        "RELEASE_ID_REQUIRED", "RELEASE_DATE_REQUIRED", "RELEASE_EPOCH_REQUIRED"
    }
```

Also test word limits, vague/ordinal prompts, negative lead-ins, Application choices, raw Markdown in rendered fields, one scheduled cloze deletion, absolute source URL, required `qbank.taskBundle`, and required Application `reinforces`.

- [ ] **Step 2: Run the focused tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_contract.py
```

Expected: FAIL because schemas and canonical helpers do not exist.

- [ ] **Step 3: Implement canonical helpers and the closed schemas**

Implement:

```python
def normalize_source(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\s+", " ", text).strip()

def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
```

The card schema must condition on `state`:

- `draft` may omit human/faculty/evidence/policy decisions but cannot omit the factual card/source/risk structure.
- `approved` requires named human editor, exact render hash, named card approver/date, and every risk-dependent review.
- `quarantined` and `retired` remain tombstones and cannot count toward coverage.
- `application` requires qbank fields, `taskBundle`, and `reinforces`; Core forbids qbank fields.

Each qbank-render review record is separately keyed by qbank UID plus base/Tier-2 identity and requires the approved item/source hashes, frozen template version, `templateContractSha256`, exact rendered-note hash, risk object, required evidence/policy references, named faculty approver, and approval date. Its legacy template-contract projection uses explicit `null` sentinels for absent field/template IDs; the schema and validator reject attempts to add those IDs to the frozen model.

The release-history root has exactly `schemaVersion`, `identityEntries`, and `releases`. Both arrays are append-only. `identityEntries` contains exactly one immutable contract per `(namespace, uid, identity)`—GUID, model/deck/template/field identities, first-shipped release, and origin `legacy_pre_governance|governed`. It never stores a mutable current approval/render hash. Each release record stores release ID/date/epoch, `governedInputSha256`, canonical content fingerprints/counts for the four packages, deterministic CSV SHA-256/size, canonical receipt-contract hash, `migrationSeedReleaseId`, `migrationContractSha256`, and a membership snapshot for every packaged identity. Each membership records active/withdrawn status, approval hash (`null` only for legacy pre-governance shipment), exact shipped/render hash, and artifact/deck membership. An active membership uses the exact card/qbank render approval. A withdrawal membership uses the named accepted quarantine/retirement decision's exact neutral-render approval hash and template version; disposition alone never authorizes an unseen render. A same-GUID copy update in release N+1 therefore appends a new membership snapshot with a new approved/render hash without changing or duplicating the immutable identity contract. Do not use raw `.apkg` or receipt ZIP/file hashes as cross-build governance identities: `genanki` ZIP member timestamps can change raw bytes even when inspected Anki content is identical. The per-build receipt still records raw hashes/sizes of the five downloadable payload files so staging and HTTP delivery can verify the bytes produced by that build.

Initialize `cards.json` and `qbank_render_reviews.json` with empty arrays. Initialize `quarantine.json` with an empty accepted list; the detected `qb_pha_002` proposal is produced in Task 5 and cannot be marked accepted before a named review. Initialize `release_history.json` with empty `identityEntries` and `releases` until Task 6 bootstraps it from the independent packages.

Implement Step 3 in these independently testable slices:

- [ ] Add canonical JSON/source helpers and make only their unit tests green.
- [ ] Add closed empty-root schemas/fixtures for all five files.
- [ ] Add common card fields/enums/limits and their mutation tests.
- [ ] Add Core state/kind conditionals and their mutation tests.
- [ ] Add Application qbank/taskBundle/reinforces conditionals and their mutation tests.
- [ ] Add qbank-render review and quarantine schemas/tests.
- [ ] Add immutable-identity/per-release-membership history schemas/tests.
- [ ] Add maintenance/release config conditionals/tests; keep content gates for Task 5.

- [ ] **Step 4: Encode the exact release contract**

`release_config.json` must contain:

- canonical base URL `https://une-ms3-psychiatry.netlify.app/`;
- `siteMode: "maintenance"`;
- minimum supported desktop Anki `23.10` and current tested Anki `26.5`;
- all permanent identities from Task 1;
- exact Core Week-by-Domain and Application Week-by-task matrices from the approved specification;
- exact six-file production allowlist;
- `releaseId: null`, `releaseDate: null`, and `releaseEpoch: null` while in maintenance mode; all three become required, non-null reviewed values in release mode;
- template versions `pcl-ms3-core-basic-v2`, `pcl-ms3-core-cloze-v2`, `pcl-ms3-application-v2`, and frozen `pcl-qbank-legacy-v1`.
- `knownSafetyHolds` containing only qbank UID `qb_pha_002` with reason code `QBANK_STALE_SAFETY_WORDING`; this detects the hold but does not accept it.
- `frontJaccardReviewThreshold: 0.80` and `answerJaccardReviewThreshold: 0.80`; normalize fronts and direct answers independently with Unicode NFKC, case-folding, HTML/Markdown removal, non-alphanumeric punctuation removal, and collapsed whitespace. Normalized exact equality is a hard duplicate; token-set Jaccard at or above the field's threshold creates a faculty-review quarantine unless `reinforces` points to that exact live approved card. Self, retired, unrelated, or missing targets never waive the finding.
- `sequenceMapPath: "14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md"`.
- `primaryAuthorityPathPrefixes` limited to the actual canonical directories `02_Clinical_Skills/`, `03_Core_Topics/`, `04_Acute_and_Safety/`, `05_Psychopharmacology/`, `06_Family_and_Relational/`, and `07_Evidence_and_Reading/`, plus the curated MS3 subdirectories `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/`, `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/`, and `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/`.
- `contextOnlyPathPrefixes` contains `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/` and `14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/`; these may supply transfer context or critical-fail behavior but never primary support for a new treatment claim.
- `sequencingOnlyPaths` contains exactly `14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md`, `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md`, `14_Tracks/MS3/Student_Ready_Pack/core_reading_list.md`, `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md`, and `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md`. They may propose concepts or sequence work but never support the card answer.

- [ ] **Step 5: Run the contract suite**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_contract.py
```

Expected: PASS. The schema proves maintenance cannot be relabeled as a release without a release ID and epoch; exact content blockers are added in Task 5.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/anki 13_Faculty_Resources/_automation/anki tests/anki
git commit -m "feat: define governed Anki registry contracts"
```

### Task 3: Resolve exact reviewed source passages and make learner anchors work

**Files:**
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/sources.py`
- Read: `14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Create: `tests/anki/test_sources.py`
- Create: `tests/smoke/source-anchor.spec.js`
- Modify: `tests/smoke/playwright.config.js`

**Interfaces:**
- `load_manifest(path) -> ManifestIndex` with unique `path_to_slug` and `slug_to_path` maps.
- `heading_slug(text) -> str` using lowercase ASCII and one hyphen per non-alphanumeric run.
- `parse_markdown_sections(text) -> tuple[Section, ...]` supporting ATX and Setext headings.
- `load_week_map(path, manifest) -> WeekMap` extracts each `?page=` slug and its earliest Week; tool links are sequencing aids but never primary card authorities.
- `resolve_introduced_week(source, week_map, card_review=None) -> int | None`.
- `resolve_source(repo_root, source, manifest, reviewed, surveillance) -> SourceResolution`.
- The SPA assigns the same deterministic IDs, opens a collapsed H2 section containing `location.hash`, then scrolls the target into view.
- Playwright project `source-ms3` matches `source-anchor.spec.js` and uses the local MS3 base URL.

- [ ] **Step 1: Add source mutation tests and golden anchor vectors**

Start from one passing synthetic fixture and mutate one input per test:

```text
missing manifest path
declared slug differs from manifest slug
slug is pending in 13_Faculty_Resources/reviewed.json
pending-review banner appears in source
heading anchor is missing or duplicated
quote is missing, duplicated, or moved outside its section
Unicode/CRLF/whitespace-only changes normalize equivalently
slug is present in 13_Faculty_Resources/_automation/surveillance/config/needs_reattest.json
source path is outside the configured primary-authority prefixes
configured authority prefix does not exist or matches no manifest Markdown path
weekly map, Rapid Review, core-reading list, shelf guide, or orientation packet is used as primary clinical authority
case or OSCE context is used as primary authority for a treatment claim
Core/Application source slug has no sequence introduction and no card-level faculty override
Core/Application Week is earlier than the source's earliest introduced Week
card-level sequence override lacks reviewer/date/rationale or is absent from the approval hash
full-qbank note is incorrectly quarantined merely because its source is absent from the weekly map
```

The golden vectors must include punctuation, Unicode accents, repeated whitespace, an ATX heading, and a Setext heading. Both Python and browser tests consume the same expected fragments.

- [ ] **Step 2: Run the source tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_sources.py
```

Expected: FAIL because `sources.py` does not exist.

- [ ] **Step 3: Implement exact source resolution**

For each primary Markdown source:

1. Require exact membership in the `md` array of `13_Faculty_Resources/_automation/site_build/site_manifest.json`.
2. Require a unique path and slug mapping.
3. Require `13_Faculty_Resources/reviewed.json[slug].status == "reviewed"`.
4. Parse the named heading and define its section through the next equal-or-higher heading.
5. Reject duplicate heading fragments.
6. Require the normalized `source.quote` exactly once inside that section.
7. Hash the normalized raw Markdown quote, never prettified HTML.
8. Construct `f"https://une-ms3-psychiatry.netlify.app/?page={quote(slug)}#{anchor}"` with `urllib.parse.quote`.
9. Quarantine whenever the slug is listed in `13_Faculty_Resources/_automation/surveillance/config/needs_reattest.json`. That committed file contains slugs, not dates, so presence itself is the fail-closed signal; do not invent a recency comparison.
10. Require the canonical source path to match a configured primary-authority prefix. Validate at startup that every configured prefix exists and matches at least one manifest Markdown path. Curated MS3 pocket guides, expansion modules, and documentation material are eligible; weekly/index material is not. Cases and OSCEs are context-only and cannot be the primary authority for a new treatment claim.
11. For Core/Application only, parse the configured weekly map and require `card.week >= introducedWeek`. If an eligible clinical authority is absent from that map, require `review.sequenceBasis: faculty_override` plus named reviewer/date/rationale on that card, and include those fields in its exact approval hash. Full-qbank notes have no Week and are exempt from sequence membership. A sequencing override never changes a source's authority role.

Compute heading fragments from visible heading text with this cross-language contract: normalize NFKD, remove combining marks, drop non-ASCII characters that do not transliterate, lowercase, replace each non-alphanumeric run with one hyphen, and trim hyphens. Strip ATX closing hashes and Markdown emphasis/code markers; links contribute their visible label. Mirror the same operations in JavaScript and require both implementations to pass `anchor_vectors.json`.

- [ ] **Step 4: Add matching SPA heading IDs and fragment navigation**

Add pure JavaScript helpers matching `anchor_vectors.json`. After `marked.parse()` and before/after `makeCollapsible()` as appropriate:

- assign deterministic IDs to rendered `h1`-`h6` elements;
- suffix duplicate DOM IDs for HTML validity but leave duplicate base anchors invalid for governance;
- on initial load and route changes, open the containing collapsed section;
- call `scrollIntoView({block: "start"})` after content render;
- preserve existing `?page=` routing and back/forward behavior.

- [ ] **Step 5: Run Python and browser source tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_sources.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
cd tests/smoke
npm ci
npx playwright install chromium
python3 -m http.server 4200 --directory ../../_build/ms3 >/tmp/pcl-ms3-source-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
npx playwright test --project=source-ms3
```

Expected: Python tests PASS; the browser lands on the requested heading, opens its section, and the heading is inside the viewport.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/anki \
  13_Faculty_Resources/_automation/site_build/spa_index.html \
  tests/anki tests/smoke
git commit -m "feat: bind Anki cards to exact reviewed source anchors"
```

### Task 4: Freeze qbank projections and exact rendered-note review inputs

**Files:**
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/qbank.py`
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/render.py`
- Create: `tests/anki/test_qbank_governance.py`
- Create: `tests/anki/test_render.py`
- Modify: `13_Faculty_Resources/anki/release_config.json`
- Modify: `13_Faculty_Resources/_automation/site_build/export_anki.py`
- Modify: `question_bank.json` root `_note` only; do not change item IDs, statuses, or content

**Interfaces:**
- `qbank_item_payload(item) -> dict` selects the exact learner-visible governed fields.
- `qbank_item_sha256(item) -> str` hashes canonical JSON.
- `validate_qbank_item(item, question_bank_schema, manifest) -> list[Issue]` applies both JSON Schema and cross-field integrity rules.
- `resolve_primary_qbank_source(item: dict, primary_page: str, primary_anchor: str, inputs: ReleaseInputs) -> SourceResolution`.
- Existing `render_options`, `answer_html`, `meta_html`, `link_html`, and `tags_for` become imported/shared rendering primitives without changing output.
- `render_card(card) -> RenderedNote` is the single source for the exact learner-visible HTML, tags, template-contract hash, and approval render hash.
- `build_core_note`, `build_application_note`, and `build_qbank_notes` return fixed-contract notes; the history-backed withdrawal adapter is added in Task 6.

- [ ] **Step 1: Add failing qbank drift and identity tests**

Use this exact projection order as a named constant:

```python
QB_HASH_FIELDS = (
    "id", "status", "retired", "stem", "options", "why", "pearl",
    "evidence", "pages", "link", "tier2", "category", "difficulty",
    "competency", "type", "hy",
)
```

Start from a qbank item that passes `question_bank.schema.json`, then mutate one rule at a time: duplicate/missing A-D option key, zero/two correct options, missing wrong-option trap, trap on the correct option, retired item not draft or missing reason, two-tier item missing Tier 2, non-two-tier item carrying Tier 2, duplicate/missing Tier 2 keys, zero/two Tier 2 correct options, option text, trap name, status, retired flag, primary page not in `pages`, slug mismatch, primary anchor mismatch, and source-anchor drift. Assert item IDs and `pages` values are unique where required. Assert `qb_pha_002` is detected from the current qbank, while `qb_pha_011` is not automatically quarantined.

Also assert eligibility/counts are derived from item fields rather than root `_note`, and that the descriptive note reports the current 143 active attested items and 49 draft records, including 3 retired items. In `test_render.py`, assert exact Core Basic/Cloze and Application field/template IDs, exact qfmt/afmt/CSS bytes, sorted active tag sets, one scheduled cloze deletion, HTML escaping exactly once, source links, nonempty fronts/backs, and that every approval hash is computed from precisely the displayed render payload. For base and Tier-2 qbank notes, require `templateContractSha256` in every approval; recompute it with `null` field/template ID sentinels, and fail if generation introduces an ID or any ordered name/ordinal/qfmt/afmt/CSS byte drifts.

- [ ] **Step 2: Run the focused test**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_qbank_governance.py tests/anki/test_render.py
```

Expected: FAIL because qbank projection, source reconciliation, and fixed renderers do not exist.

- [ ] **Step 3: Implement qbank projection and eligibility**

Eligibility requires current `question_bank.json` state, not the historical attestation export:

```python
eligible = item["status"] == "attested" and item.get("retired") is not True
```

Before eligibility, validate the root file against `question_bank.schema.json`, require unique item IDs, then apply the cross-field rules above. Any structural issue is hard and note-specific; no malformed base or Tier 2 note reaches rendering.

For Application cards require `primaryPage in item.pages`, exact source slug/anchor equality, and `primaryTrap` equal to exactly one incorrect option's `trap.name`. For the full qbank treat base and Tier 2 as separate rendered identities and separate approval/quarantine decisions.

Compute `qbank.sourceAnchorSha256` from the full normalized primary Markdown section returned by `resolve_primary_qbank_source`, not merely the shorter card quote. Array order in the qbank item projection remains significant.

- [ ] **Step 4: Implement the fixed v2 renderers and refactor legacy helpers without output drift**

Implement the exact active-tag, qfmt, afmt, CSS, template-name, template-version, and template-contract hash rules enumerated in Task 7 Step 3 before implementing any approval logic. Compute each exact template-contract hash, write it to `release_config.json`, and assert runtime recomputation matches. The frozen qbank projection uses its model/deck IDs and names, nine ordered field names with `id: null`, template `Card 1`/ordinal `0` with `id: null`, exact qfmt/afmt/CSS, and template version; do not add ID keys to legacy model JSON. Move the reusable qbank output logic into `pcl_anki.qbank` or import it from the shared renderer, then keep `export_anki.py` as a compatibility wrapper until final cutover. Compare every field and tag from a regenerated fixture against the independent 2026-07-12 package; do not compare ZIP bytes or timestamps. Task 7 must consume these renderers unchanged rather than define a second rendering path.

Freeze qbank identity and template structure, not stale clinical text. The compatibility snapshot must reproduce the historical package for migration tests; a governed current render may update field content or add the approved source fragment under the same GUID only when its exact new render has a qbank-render approval.

Correct only the root descriptive `_note` in `question_bank.json` to current counts and state explicitly that eligibility comes from each item's `status` and `retired` fields. Leave `qbank_attestation_2026-07-05.json` unchanged as historical evidence.

- [ ] **Step 5: Run qbank and identity tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_qbank_governance.py tests/anki/test_render.py \
  tests/anki/test_identity.py
```

Expected: PASS; current-state diagnostic reports 143 active attested items, 25 active Tier 2 identities, and 168 pre-quarantine notes.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/anki \
  13_Faculty_Resources/_automation/site_build/export_anki.py \
  13_Faculty_Resources/anki/release_config.json question_bank.json tests/anki
git commit -m "refactor: govern qbank render inputs without identity drift"
```

### Task 5: Implement approval, risk, quarantine, and exact coverage decisions

**Files:**
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/governance.py`
- Create: `13_Faculty_Resources/_automation/anki/scan_quarantine.py`
- Create: `tests/anki/test_governance.py`
- Create: `tests/anki/test_coverage.py`
- Create: `tests/anki/fixtures/passing_release_inputs/`

**Interfaces:**
- `evaluate_card(card, inputs, candidate_date) -> CardDecision`.
- `evaluate_qbank_note(item, identity, inputs, candidate_date) -> CardDecision`.
- `detect_quarantines(inputs, rendered_notes, candidate_date) -> tuple[QuarantineFinding, ...]`.
- `reconcile_quarantines(detected, ledger) -> QuarantineResult`.
- `compute_core_coverage(cards) -> Counter[(week, domain)]`.
- `compute_application_coverage(cards) -> Counter[(week, task_bundle)]`.
- `validate_release_coverage(cards, contract) -> list[Issue]`.

- [ ] **Step 1: Add a passing synthetic release fixture**

Create compact, explicitly non-clinical fixture templates in `tests/anki/fixtures/passing_release_inputs/` plus a pytest factory that expands them to the exact 144 Core and 48 Application matrix when release coverage is under test. Use invented neutral tokens such as `Condition Alpha`, never real treatment claims. The fixture includes reviewed source pages, qbank items, evidence/policy records, approvals, history, and an accepted quarantine so each mutation test starts from a known pass.

- [ ] **Step 2: Add failing one-mutation governance tests**

Cover:

```text
rendered front/back changed after approval
tag, template version, risk object, or source object changed after approval
reinforces or supersedes changed, added, or removed after approval
High review absent, expired, or evidence-record hash changed
Medication/Emergency/Pregnancy/Legal/Regulatory/Numerical/EvidenceSensitive facet is mislabeled Routine
LocalPolicy facet lacks a versioned reviewed policy record
new or changed quarantine is absent from the accepted ledger
withdraw disposition lacks named reviewer/date, affected release, frozen withdrawal template version, or exact approved neutral-render hash
accepted quarantine is excluded and coverage still holds
accepted quarantine breaks one exact quota cell
Application taskBundle is absent
Application reinforces is absent, later-week, non-Core, or not approved
front duplicate without reinforces is exact, just below `0.80`, or exactly at the configured token-set Jaccard boundary
direct-answer duplicate without reinforces is exact, just below `0.80`, or exactly at the configured token-set Jaccard boundary
valid reinforces waives only the exact compared live approved target; self, retired, missing, or unrelated links do not
retired or quarantined record is counted as active
Week 1 or Week 5 lacks both a `Recognize` and an `Escalate` Core task
an MS3 direct answer independently tells the student to prescribe, discharge, medically clear, restrain, determine legal disposition, or titrate
```

The render approval hash payload is exact canonical JSON over rendered front, rendered back, sorted tags, `id`, `kind`, `family`, Week, Domain, task, risk, source, optional qbank object, `review.sequenceBasis`, `review.sequenceRationale`, `review.sequenceReviewedBy`, `review.sequenceReviewedAt`, `reinforces`, `supersedes`, template version, and `templateContractSha256`. Null/absent sequencing-override and relationship fields remain explicit under the closed schema so the same canonical projection is used at authoring, review, and release.

- [ ] **Step 3: Run governance and coverage tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_governance.py tests/anki/test_coverage.py
```

Expected: FAIL because governance and coverage decisions are not implemented.

- [ ] **Step 4: Implement fail-closed review logic**

Rules:

- Source review is only a prerequisite; it never approves a card.
- Qbank attestation is only a prerequisite; it never approves a rendered note.
- `Routine` still requires exact rendered-card approval before release.
- Any `Medication`, `Emergency`, `Pregnancy`, `Legal`, `Regulatory`, `Numerical`, or `EvidenceSensitive` facet requires `risk.level == "High"`. `LocalPolicy` alone may be Routine but still requires policy review; when combined with any High trigger, both evidence and policy reviews are required.
- `High` requires `evidence_registry.json#` followed by an exact existing source ID, reviewed status, exact record hash, named evidence reviewer/date, and unexpired `reviewDue`.
- `LocalPolicy` always requires a versioned policy source with owner, path/anchor, exact passage hash, named owner/date, and unexpired `reviewDue`.
- Matching the source again never auto-restores a quarantined approval.
- Accepting quarantine authorizes exclusion only by default. A history-backed neutral withdrawal additionally requires the reviewer to approve the exact rendered withdrawal notice/template version shown in the clinic; generated code never invents that approval.
- `authoring` mode returns blockers in reports but may render draft previews.
- `release` mode raises on any hard issue.

- [ ] **Step 5: Implement exact coverage equality**

Compare `Counter` objects for all 36 Core cells and all 36 Application cells. Derive row/column totals from the cells and require exact totals 144 and 48. Require every approved Core family and every approved Core task to appear at least once. Secondary tags never satisfy a cell. The 36-card pilot uses a separate authoring assertion: exactly one draft per Core Week-by-Domain cell; that assertion never weakens the production matrix.

Require Week 1 and Week 5 each to contain at least one `task: Recognize` and one `task: Escalate` Core card. Add a role-safety linter for direct answers that rejects independent MS3 action constructions such as `the student/you should|must|can prescribe|discharge|clear|restrain|determine|titrate`; safe recognition-and-notification language remains allowed. `StudentAction`, `Escalation`, `Monitor`, `Disposition`, every High card, and any legally sensitive card must include an explicit supervision/escalation caveat. Mutation tests include unsafe and safe minimal pairs so substring matching cannot be bypassed or overblock phrases such as “do not restrain.”

- [ ] **Step 6: Produce, but do not accept, the initial quarantine finding**

Run the narrow diagnostic added in this task; do not depend on the Task 9 release CLI:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/scan_quarantine.py \
  --repo . --out _build/anki-review/quarantine-proposals.json
```

The non-canonical report must include `qb_pha_002`, reason code `QBANK_STALE_SAFETY_WORDING`, first-seen source commit, and owner required. It must not place a fabricated reviewer in `quarantine.json`.

- [ ] **Step 7: Run the focused suites**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_governance.py tests/anki/test_coverage.py
```

Expected: PASS. Current release-mode diagnostic remains blocked by real missing card/qbank approvals and evidence/policy coverage; that is an expected safety result, not a test failure.

- [ ] **Step 8: Commit**

```bash
git add 13_Faculty_Resources/_automation/anki tests/anki
git commit -m "feat: enforce Anki approval quarantine and coverage gates"
```

### Task 6: Bootstrap truthful history and generate neutral same-GUID withdrawals

**Files:**
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/history.py`
- Create: `13_Faculty_Resources/_automation/anki/bootstrap_legacy_history.py`
- Create: `13_Faculty_Resources/_automation/anki/prepare_history_baseline.py`
- Modify: `13_Faculty_Resources/anki/release_history.json`
- Modify: `13_Faculty_Resources/anki/quarantine.json` only after named faculty review
- Create: `tests/anki/test_release_history.py`
- Create: `tests/anki/test_withdrawals.py`

**Interfaces:**
- `validate_history(current: HistoryRegistry, baseline: HistoryRegistry | None = None) -> list[Issue]`.
- `bootstrap_legacy_history(packages, source_commit, shipped_at) -> HistoryRegistry` creates unique immutable identity contracts plus one legacy release membership snapshot without losing either artifact/deck location.
- `propose_history_append(inspection, migration, candidate, current) -> HistoryAppend` consumes only successful `InspectionResult`/`MigrationResult` values and records exact identity/package fingerprints, deterministic CSV hash/size, canonical receipt-contract hash, migration seed/contract, and `candidate.governed_input_sha256`.
- `prepare_history_baseline(repo, out, base_ref=None, before_release_id=None, audit_lineage=False) -> Path` extracts an explicit base-ref registry, finds the valid registry before a candidate release ID, or audits the full first-parent history lineage for maintenance/Netlify, including the one-time independently verified bootstrap. Exactly one selector is required; the CLI options `--base-ref`, `--before-release-id`, and `--audit-lineage` are mutually exclusive.
- `build_withdrawals(history, decisions) -> tuple[Withdrawal, ...]`.
- `Withdrawal` carries namespace, UID, base/Tier-2 identity, original GUID/model/deck/template/field contract, reason code, and affected release.

- [ ] **Step 1: Add failing append-only and withdrawal tests**

Tests must assert:

```text
prior history entries compare byte-for-byte through canonical JSON
only appends are accepted
an ID cannot change kind/model/deck/template/card ordinal/field identities/order
identityEntries are unique by namespace/UID/base-or-tier2 and never repeat for copy updates
release N to N+1 wording change keeps one identity contract and appends a membership with the new approval/render hash
base and Tier 2 are separate history identities
retired IDs cannot reactivate
supersedes points to a different retired ID
a withdrawal GUID must already exist in history
unshipped quarantine emits no note
shipped Core/Application/qbank quarantine emits the original GUID
unshipped retired/tombstone record emits no note
shipped retired Core, Application, qbank base, and qbank Tier 2 identities emit neutral same-GUID withdrawals
a shipped withdrawal without a named accepted exact withdrawal-render hash emits no releasable note and remains a hard blocker
a shipped identity missing from canonical current inputs produces a hard governance issue plus a withdrawal preview; release waits for an explicit reviewed retired/quarantine tombstone
qb_pha_002 withdrawal preserves model, deck, nine fields, ordinal, and x9m9qM{_w7
withdrawal is excluded from active counts and CSV
withdrawal contains none of the prior clinical strings
history proposal refuses an InspectionResult containing any hard issue
history proposal refuses a MigrationResult containing any hard issue and binds its seed release/scenario contract
governed release record binds the governed-input aggregate, inspected package content fingerprints, deterministic CSV, and stable receipt contract rather than nondeterministic ZIP bytes
first-PR baseline bootstrap succeeds only when the base ref has no history file and current history byte-matches a fresh rebuild from both frozen fixtures
first-PR baseline bootstrap rejects any fixture mismatch or hand-edited current entry
before-release history discovery finds the same prior registry under squash, merge-commit, and last-append-then-rebase histories and rejects shallow/ambiguous ancestry
lineage mode validates every historical transition from absent file/bootstrap through current as byte-preserving prefix plus append, then emits a current-equivalent maintenance baseline
the baseline CLI rejects zero selectors or any selector combination and maps each of --base-ref, --before-release-id, and --audit-lineage to the matching function mode
```

Prohibited `qb_pha_002` substrings include `mandatory ANC`, `mandated monitoring`, `most critical ongoing monitoring parameter`, `Wrong monitoring target`, and `Treat the number, not the patient`.

- [ ] **Step 2: Run the focused tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_release_history.py tests/anki/test_withdrawals.py
```

Expected: FAIL because history and withdrawals do not exist.

- [ ] **Step 3: Bootstrap history from the independent shipped package**

Run:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/bootstrap_legacy_history.py \
  --package standalone=tests/anki/fixtures/legacy_qbank_2026-07-12.apkg \
  --package combined=tests/anki/fixtures/legacy_all_2026-07-12.apkg \
  --source-commit a96e32fe237ecf820d0cb187edfa4bac505435d6 \
  --release-id legacy-qbank-2026-07-12 \
  --released-at 2026-07-12 \
  --release-epoch 1783902620 \
  --out 13_Faculty_Resources/anki/release_history.json
```

Expected: exactly 168 unique qbank `identityEntries`, not 336 duplicates, plus one `legacy_pre_governance` release record covering both artifacts. Each immutable identity has `origin: "legacy_pre_governance"`. Its release membership has `approvedCardSha256: null`, a non-null `shippedCardSha256`, and artifact/deck records for both the standalone and combined packages when that GUID appears in both. Every legacy artifact record includes the exact artifact SHA-256. The standalone membership uses deck `2059400191`; the combined membership truthfully records historical deck `2059400193`; the governed identity remains `2059400191`. The script must fail if either fixture hash, GUID formula, model, deck, template, field order, overlap, or package count differs.

`prepare_history_baseline.py` handles the repository's first governance PR without weakening append-only checks. With `--base-ref`, if `BASE_REF:13_Faculty_Resources/anki/release_history.json` exists, extract it byte-for-byte. If it does not exist, require that the path is genuinely new relative to the base ref, rebuild the expected legacy registry into a temporary file from both frozen fixtures and fixed bootstrap metadata, require the current registry to byte-match it, and write a canonical empty `{schemaVersion: 1, identityEntries: [], releases: []}` baseline. Any other missing-base case fails. Once the first PR lands, the ordinary base-ref file is mandatory.

For a protected-branch/Netlify release where a PR base SHA is unavailable, `--before-release-id ID` walks complete first-parent history, audits every history-file transition, and selects the newest valid historical registry that does not contain `ID`, then proves the current registry is an append-only extension. For maintenance where `releaseId` is null, `--audit-lineage` validates every transition from absent file through the independently reproduced bootstrap and every later append, then emits a current-equivalent baseline for the maintenance profile. These modes work for squash and merge commits and for a rebased release whose history append was the last release-affecting change. Shallow, missing, multiple-branch, or ambiguous ancestry fails with an instruction to fetch full history or pass an explicit reviewed base ref; neither mode guesses `HEAD^` as the authority.

- [ ] **Step 4: Implement history validation and neutral withdrawal content**

For qbank withdrawals, retain nine fields and fill them with a neutral notice only:

```python
[
    uid,
    '<span class="withdrawn">[WITHDRAWN SAFETY UPDATE]</span> '
    'This card is no longer active. Re-imported under the same UID to remove stale content.',
    "",
    '<div class="withdrawn">Do not use the prior clinical content. '
    'See the release notice and search this UID if manual suspension is needed.</div>',
    "", "", "",
    "Anki safety release notice",
    '<div class="tag">Withdrawn</div>',
]
```

Required tags are `PsychClerkship`, `Status::withdrawn`, and `UID::` followed by the exact stable ID. Do not carry forward old category, answer, rationale, pearl, distractor, evidence, or trap text.

- [ ] **Step 5: Run history and withdrawal suites**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_release_history.py tests/anki/test_withdrawals.py
```

Expected: PASS, including 168 bootstrap identities and the exact `qb_pha_002` GUID assertion.

- [ ] **Step 6: Commit mechanical history**

```bash
git add 13_Faculty_Resources/anki/release_history.json \
  13_Faculty_Resources/_automation/anki tests/anki
git commit -m "feat: bootstrap Anki history and safety withdrawals"
```

### Task 7: Write four packages and inspect actual SQLite collections

**Files:**
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/render.py`
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/package.py`
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/inspect.py`
- Modify: `tests/anki/test_render.py`
- Create: `tests/anki/test_packages.py`

**Interfaces:**
- The Task 4 `render_card`, `build_core_note`, `build_application_note`, and `build_qbank_notes` remain the only active rendering path; add `build_withdrawal_note` as the history-backed neutral adapter without changing active render contracts.
- `write_release(candidate: CandidateRelease, out_dir: Path) -> dict` writes the exact six artifacts and reads governed-input digest plus release ID/date/epoch only from the validated candidate.
- `read_apkg(path) -> PackageSnapshot` inspects `collection.anki2` or `collection.anki21` read-only.
- `canonical_package_fingerprint(snapshot) -> str` excludes nondeterministic row/archive/scheduling metadata.
- `inspect_release(out_dir, receipt) -> InspectionResult` returns the parsed snapshots, receipt, exact note-identity fingerprints, artifact SHA-256 values, and issues after enforcing membership, identity, counts, union, withdrawals, and receipt.

- [ ] **Step 1: Add failing package/inspection tests and withdrawal render regressions**

Cover:

```text
render hash is computed from exactly what faculty sees
Core Basic/Cloze and Application fields/template IDs are fixed
legacy qbank rendering remains byte-equivalent per field/tag to the independent fixture
Tier 2 qbank notes retain visible source, evidence, type, and mechanism metadata
single cloze deletion schedules exactly one card
all fronts/backs are nonempty
required tags exist
no active draft/retired/quarantined content appears
withdrawals are neutral, history-backed, and counted separately
receipt counts/fingerprints match SQLite
every rendered source link equals the URL produced by the approved source resolution
Complete equals Core union Application and contains no qbank model
standalone and Complete share GUID/model/deck/field identities
canonical fingerprint ignores ZIP and database timestamps
actual-SQLite tampering with a v2 model/deck name, ordered field ID/name, template ID/name/ordinal/qfmt/afmt, or CSS changes the fingerprint and fails the fixed contract
legacy-qbank inspection maps absent field/template IDs to null sentinels; adding an ID or changing any model/deck/ordered-field/template/qfmt/afmt/CSS value changes the fingerprint, template-contract hash, and qbank-render approval
two semantically identical builds with different ZIP member timestamps may have different raw SHA-256 values but have the same canonical package fingerprint
history/release matching uses canonical package fingerprints, while each build receipt's raw SHA-256 values match that build's staged files
unsafe ZIP members or multiple collection databases are rejected
```

- [ ] **Step 2: Run focused tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_render.py tests/anki/test_packages.py
```

Expected: FAIL because package/inspection modules and the withdrawal adapter do not exist; the Task 4 active-render tests remain green.

- [ ] **Step 3: Reuse the frozen renderers and implement the withdrawal adapter**

The following is the normative renderer contract already implemented and tested in Task 4. Do not duplicate or alter it here. Use the permanent models/fields from Task 1, render source passage and qbank detail as collapsed secondary sections, put the direct answer first, escape learner content exactly once, sort tags before hashing/writing, and reproduce legacy qbank fields/GUIDs without adding new identity metadata to the legacy model. Add only the Task 6 neutral withdrawal rendering path.

Freeze the active v2 tag contract. `tag_slug()` performs NFKD ASCII folding, lowercase, replaces non-alphanumeric runs with `_`, and trims `_`. Every Core note has exactly `PsychClerkship`, `Status::active`, `Audience::MS3`, `Deck::Core`, `UID::<id>`, `Week::W01` through `Week::W06`, `Domain::<domain_slug>`, `Task::<task>`, `Family::<family>`, `Kind::basic|cloze`, `Risk::Routine|High`, plus one `Facet::<facet>` per sorted facet. Every Application note substitutes `Deck::Application`, uses `Kind::application`, and additionally has `TaskBundle::<bundle>`, `QBank::<qbank_id>`, `Trap::<tag_slug(primaryTrap)>`, and `Reinforces::<core_id>`. No optional secondary tag may impersonate a primary coverage tag. Legacy qbank active tags remain exactly compatible with the frozen exporter; withdrawals carry only `PsychClerkship`, `Status::withdrawn`, and `UID::<id>`.

Use these exact v2 templates and hash the exact packaged qfmt, afmt, and CSS bytes; do not normalize whitespace because whitespace is part of the reviewed template contract:

```html
<!-- Core Basic qfmt -->
<main class="pcl-card pcl-front"><div class="pcl-prompt">{{Front}}</div></main>

<!-- Core Basic afmt -->
<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{Front}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  {{#Explanation}}<section class="pcl-explanation">{{Explanation}}</section>{{/Explanation}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>

<!-- Core Cloze qfmt -->
<main class="pcl-card pcl-front"><div class="pcl-prompt">{{cloze:Text}}</div></main>

<!-- Core Cloze afmt -->
<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{cloze:Text}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  {{#Explanation}}<section class="pcl-explanation">{{Explanation}}</section>{{/Explanation}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>

<!-- Application qfmt -->
<main class="pcl-card pcl-front"><div class="pcl-prompt">{{Question}}</div></main>

<!-- Application afmt -->
<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{Question}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  <section class="pcl-discriminator"><strong>Decisive clue:</strong> {{Discriminator}}</section>
  <section class="pcl-trap"><strong>Major trap:</strong> {{Trap}}</section>
  {{#Detail}}<details><summary>Why the alternatives fail</summary>{{Detail}}</details>{{/Detail}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>
```

Use template name `Card 1` for Core Basic and Application, and `Cloze` for Core Cloze. Use this exact dependency-free CSS for all three v2 models:

```css
.card{box-sizing:border-box;margin:0;padding:24px;background:#fbf8f2;color:#202124;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:20px;line-height:1.5;text-align:left}
.pcl-card{max-width:760px;margin:0 auto}
.pcl-prompt{font-size:1.35rem;font-weight:650;line-height:1.4}
.pcl-question-again{color:#4b5563;font-size:.95rem}
#answer{margin:20px 0;border:0;border-top:1px solid #c8bda9}
.pcl-answer{font-size:1.2rem;font-weight:750}
.pcl-explanation,.pcl-discriminator,.pcl-trap,.pcl-caveat,details{margin-top:14px}
.pcl-caveat{border-left:4px solid #a25b00;padding:10px 12px;background:#fff3df}
.pcl-trap{border-left:4px solid #8f3b3b;padding-left:12px}
details{border-top:1px solid #ded6c8;padding-top:10px}
summary{cursor:pointer;font-weight:650}
blockquote{margin:10px 0;padding-left:12px;border-left:3px solid #b7aa95;color:#4b5563}
.pcl-meta{margin-top:18px;color:#6b7280;font-size:.78rem}
a{color:#795200}
.card.nightMode{background:#1f2328;color:#f1ede5}
.nightMode .pcl-question-again,.nightMode blockquote,.nightMode .pcl-meta{color:#c9c2b7}
.nightMode .pcl-caveat{background:#3a2b18;color:#f5e8d2}
@media(max-width:600px){.card{padding:16px;font-size:18px}.pcl-prompt{font-size:1.2rem}}
```

Define `template_contract_sha256` over canonical JSON containing model/deck IDs and names, ordered field ID/name pairs, template ID/name/ordinal, qfmt, afmt, CSS, and template version. Use UTF-8, lexicographically sorted object keys, no insignificant whitespace, preserved array order, and byte-exact qfmt/afmt/CSS strings. For v2, use the fixed explicit serialized IDs. For legacy qbank, use explicit JSON `null` sentinels when the frozen model omits a field/template ID and reject an unexpected present ID. Task 4 stores the expected hashes in `release_config.json`; recompute them at runtime here without modifying config. A field name/order or qfmt/afmt/CSS change without a new template version and updated approvals fails. Include the computed template-contract hash in every Core/Application and base/Tier-2 qbank rendered approval payload.

- [ ] **Step 4: Write packages with an explicit monotonic epoch**

```python
def write_apkg(decks, path: Path, build_epoch: int) -> None:
    genanki.Package(decks).write_to_file(
        str(path),
        timestamp=float(build_epoch),
    )
```

Candidate membership:

- Core: approved active Core plus history-backed Core withdrawals.
- Application: approved active Application plus history-backed Application withdrawals.
- Complete: exact Core and Application deck objects with identical identities.
- Qbank: approved eligible base/Tier-2 notes plus history-backed qbank withdrawals.
- CSV: active Core/Application only; no withdrawals or qbank; faculty audit/interchange label in metadata.

The receipt records active clinical notes, withdrawal maintenance notes, total notes, and scheduled cards separately for every artifact, plus `governedInputSha256`, release ID/date/epoch, the sorted path-to-hash input ledger, package fingerprints, byte hashes/sizes for the other five files, coverage, quarantine summary, and unique source URLs. It omits volatile Git commit metadata; its canonical receipt-contract projection excludes per-build raw byte hashes, so prepare/release governed contracts match across squash merges even when ZIP metadata makes raw package and receipt bytes differ. Each build's receipt must still match that build's payload bytes. The deployment commit remains available from the host and CI logs. Never label a note count as a card count.

Build the writer in narrow green steps:

- [ ] Write one synthetic Core package and inspect its fixed model/deck/note/card contract.
- [ ] Add Application, then prove standalone identity parity.
- [ ] Add Complete and prove exact Core/Application tuple union in both directions.
- [ ] Add frozen qbank active notes and neutral withdrawals.
- [ ] Add deterministic active-only CSV and its schema/hash checks.
- [ ] Add receipt raw-byte checks plus stable receipt-contract projection.
- [ ] Reject extra/missing artifacts before exposing `write_release`.

- [ ] **Step 5: Inspect actual package databases**

Reject archive traversal; accept exactly one collection database; query `col`, `notes`, and `cards`; split fields on `\x1f`. The canonical package fingerprint includes sorted note/card tuples (GUID, model ID, fields, sorted tags, deck ID, card ordinal) plus a canonical-JSON projection of the stable model/deck contracts actually stored in `col`: IDs and names, ordered field IDs/names, template IDs/names/ordinals/qfmt/afmt, and CSS. Preserve qfmt/afmt/CSS strings byte-for-byte; do not normalize their whitespace. Exclude only row IDs, usn/mod values, note/card/ZIP timestamps, due, interval, repetitions, archive order, and other scheduling metadata. Tamper tests modify each stable SQLite contract field independently and must change the fingerprint or raise a hard issue.

- [ ] **Step 6: Run render/package suites**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_render.py tests/anki/test_packages.py
```

Expected: PASS using synthetic approved fixtures. No production learner filename is written outside the test temporary directory.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/anki tests/anki
git commit -m "feat: render and inspect governed Anki packages"
```

### Task 8: Prove two-release updates on minimum and current supported Anki

**Files:**
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/migration.py`
- Create: `tests/anki/test_migration.py`
- Create: `tests/anki/fixtures/release_n.json`
- Create: `tests/anki/fixtures/release_n_plus_1.json`
- Modify: `13_Faculty_Resources/_automation/anki/run_python.sh`

**Interfaces:**
- Production `pcl_anki.migration.import_package(collection, package_path) -> ImportResult` uses unconditional note/notetype update while preserving scheduling; tests import this function directly and Task 9 reuses it.
- The same test source runs under both `requirements-min.lock` and `requirements-current.lock` selected by `ANKI_LOCK=min|current`.

- [ ] **Step 1: Add failing migration tests**

Test both import orders and two releases:

```text
legacy base note updates in place
legacy Tier 2 note updates in place
qb_pha_002 withdrawal updates in place
qb_pha_002 withdrawal updates a collection seeded from the legacy ALL package
v2 copy edit updates in place
shipped Core withdrawal updates in place with the same GUID and scheduling
shipped Application withdrawal updates in place with the same GUID and scheduling
retired Core and Application notes update in place to neutral same-GUID withdrawals
retired qbank base and Tier 2 notes update in place to neutral frozen-GUID withdrawals
unshipped retired records create no physical notes
locally newer note is overwritten under ALWAYS
note ID and card ID stay constant
reps, interval, and due remain unchanged
standalone then Complete creates no duplicate
Complete then standalone creates no duplicate
a different or new release ID that reuses an existing release epoch is rejected before package generation
an exact idempotent rebuild of the latest release may reuse only its same ID/date/epoch and unchanged governed contracts
```

Use fixed fixture epochs `1784000000` and `1784000100`.

- [ ] **Step 2: Run against the current environment**

```bash
ANKI_LOCK=current bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
```

Expected: FAIL because the compatibility import helper is absent.

- [ ] **Step 3: Implement the cross-version import helper**

Use only fields present in both versions, then set optional fields by descriptor:

```python
options = ImportAnkiPackageOptions(
    update_notes=IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
    update_notetypes=IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
    with_scheduling=False,
)
if "with_deck_configs" in options.DESCRIPTOR.fields_by_name:
    options.with_deck_configs = False

collection.import_anki_package(ImportAnkiPackageRequest(
    package_path=str(package_path),
    options=options,
))
```

Before release N+1 import, modify the local note, increment its `mod`, and set card scheduling to `reps=17`, `ivl=42`, and `due=12345`. Assert the content updates while the IDs and scheduling values remain.

Run the `qb_pha_002` withdrawal case twice: once after importing the standalone legacy qbank fixture and once after importing the legacy ALL fixture. The second case may retain the learner's historical combined deck placement, but it must update the same note/card IDs to neutral content and preserve scheduling.

Generate one synthetic governed Core and one Application note in release N, quarantine both in N+1, and assert the neutral withdrawals update the same note/card IDs while preserving scheduling. This proves all three namespaces, not only qbank, implement the withdrawal contract.

- [ ] **Step 4: Run the minimum/current matrix**

```bash
ANKI_LOCK=min bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
ANKI_LOCK=current bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
```

Expected: PASS under both Anki 23.10.1 and 26.5.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/anki tests/anki
git commit -m "test: prove Anki updates across supported versions"
```

### Task 9: Add candidate orchestration and a self-contained faculty card clinic

**Files:**
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/release.py`
- Create: `13_Faculty_Resources/_automation/anki/pcl_anki/review.py`
- Create: `13_Faculty_Resources/_automation/anki/build_release.py`
- Create: `13_Faculty_Resources/_automation/anki/build_review.py`
- Create: `13_Faculty_Resources/_automation/anki/apply_review_patch.py`
- Create: `13_Faculty_Resources/_automation/anki/history_proposal.schema.json`
- Create: `13_Faculty_Resources/_automation/anki/review_patch.schema.json`
- Create: `tests/anki/test_release.py`
- Create: `tests/anki/test_review.py`

**Interfaces:**
- `build_release.py --profile maintenance|authoring|prepare|release --repo PATH --out PATH --review-out PATH [--candidate-date YYYY-MM-DD] [--build-epoch INTEGER] [--history-baseline PATH] [--prior-release-dir PATH] [--fail-on-hard]`.
- `build_review.py --repo PATH (--candidate PATH | --pilot PATH) --out PATH`; for a history candidate, `PATH` is the mechanical `release_history.proposal.json` plus its sibling inspected candidate context, and the pilot branch is completed and tested in Task 12.
- `apply_review_patch.py --repo PATH --patch PATH [--candidate-dir PATH --history-baseline PATH --prior-release-dir PATH]` validates optimistic hashes and applies one canonical registry patch atomically; all three contextual paths are mandatory for `target_registry=release_history`.
- `capture_governed_inputs(repo, loaded_paths) -> GovernedInputSnapshot` hashes every governed input and returns a canonical aggregate that deliberately excludes `release_history.json`.
- `evaluate_release(inputs, build_epoch, evaluation_date, profile, baseline_history) -> CandidateRelease`.
- `run_candidate_migration(prior_release_dir, candidate_dir, baseline_history, current_history, candidate) -> MigrationResult` re-verifies/selects the actual legacy, predecessor, or candidate-redeploy seed, imports it followed by the candidate, and hashes the stable seed/scenario/result contract.
- `build_review_html(candidate) -> str` embeds all data locally and needs no server/CDN.
- Every authoring run writes a closed `review_candidate.json` inside the exact `--review-out` directory; it contains detected findings, draft/withdrawal previews, issues, computed hashes, and no invented decisions.
- Review UI exports a closed `ReviewPatch`; it never writes canonical files from the browser.

- [ ] **Step 1: Add failing profile and review-tool tests**

Assert:

```text
authoring may render drafts but writes no production filenames
authoring without --fail-on-hard exits zero with release-readiness blockers in its reports and writes only internal-pilot artifacts
authoring with --fail-on-hard exits nonzero when any hard release-readiness issue exists and still writes no production filename
--fail-on-hard is an authoring diagnostic flag and is rejected for maintenance, prepare, or release
maintenance with null release identity and no date/epoch arguments writes no package and exits zero despite expected Phase-2 coverage/approval gaps
maintenance exits nonzero for malformed schema/registry, identity/history corruption, source-map/authority failure, known safety-hold drift, or new/changed unreviewed quarantine
maintenance requires a reviewed history baseline/lineage proof and rejects schema-valid edits, reorderings, or deletions of prior history
maintenance never downgrades an unknown hard issue to an expected Phase-2 blocker; the nonfatal code allowlist is explicit and tested
prepare runs all candidate/package/migration gates, emits a non-applicable mechanical history proposal, and stages nothing
raw history proposals contain no invented reviewer/date and cannot be applied as review patches
a named operator must inspect the exact history proposal in the clinic and export a separately schema-valid review patch with their name/date
release requires the reviewed history patch already applied and emits no new history proposal
release refuses null releaseId/releaseDate/releaseEpoch
prepare/release require a clean tracked worktree
prepare and release compute the same governedInputSha256 when only release_history.json and Git topology differ
changing any governed registry, qbank/source/review/evidence/policy input, template, generator/staging code, schema, lock, or learner Anki page changes governedInputSha256 and blocks release
a synthetic squash/rebase changes HEAD but preserves identical governedInputSha256 and therefore remains releasable
prepare/release derive release epoch/date from release_config and reject CLI overrides
prepare requires a new release ID and releaseEpoch above every baseline release
release accepts either that newly appended exact candidate or an idempotent rebuild of the exact latest baseline release; it rejects same ID with changed digest/content and any epoch reuse by another ID
release evaluates evidence/policy expiry against current UTC date, so a backdated releaseDate cannot bypass expiry
release refuses unapproved/new quarantine and missing exact quotas
candidate manifest lists eligible, newly quarantined, accepted, retired, and withdrawals separately
prepare calls propose_history_append only after actual package inspection
release requires every packaged identity/fingerprint in the committed current-release history entries
every proposed/current-release identity and release record binds governedInputSha256
governed prior history requires actual prior artifacts for migration; first governed launch uses the two frozen legacy qbank fixtures and no fictitious prior v2 deck
candidate migration classifies prior releases from baseline_history, never from the just-appended current release
new releases migrate from the latest baseline predecessor; an idempotent rebuild imports the verified currently deployed same release before the rebuild
candidate-as-seed deployment-race fallback is allowed only when current_history contains the exact reviewed predecessor migration proof and the full release CLI revalidates it
review HTML embeds the exact rendered front/back and governed hash payload
review HTML includes source quote/link/status, qbank item/trap, risk, evidence/policy, and prior approved render
review export cannot change immutable identity or computed hashes
review export requires a nonblank reviewer name and ISO date for an approval decision; generation of the raw history proposal never supplies them
prepare/release require --history-baseline; every prior entry matches the baseline entry in the same position and only appends are permitted
stale patch generatedFromCommit/inputSha256/baseRecordSha256 is rejected
patch target, decision shape, reviewer/date, immutable identity, and every computed hash are revalidated before atomic apply
history patch rejects missing/tampered candidate bytes, baseline, or prior-release seed and recomputes the inspected HistoryAppend exactly
```

- [ ] **Step 2: Run focused tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_release.py tests/anki/test_review.py
```

Expected: FAIL because release/review orchestration does not exist.

- [ ] **Step 3: Implement candidate orchestration**

Execution order is fixed:

```python
if profile in {"prepare", "release"}:
    require_clean_tracked_worktree(repo)
inputs = load_release_inputs(repo)

if profile == "authoring":
    baseline_history = HistoryRegistry(identity_entries=(), releases=())
    evaluation_date = parsed_candidate_date or datetime.now(timezone.utc).date()
    release_epoch = parsed_build_epoch or INTERNAL_REVIEW_EPOCH  # 946684800
else:
    require_file(history_baseline)
    baseline_history = load_and_validate_history_baseline(
        history_baseline, inputs.release_history
    )
    if profile == "maintenance":
        evaluation_date = datetime.now(timezone.utc).date()
        release_epoch = INTERNAL_REVIEW_EPOCH
    else:
        require_no_cli_date_or_epoch_override()
        evaluation_date = datetime.now(timezone.utc).date()
        release_epoch = inputs.release_config["releaseEpoch"]
        require(inputs.release_config["releaseDate"] <= evaluation_date.isoformat())

candidate = evaluate_release(
    inputs,
    build_epoch=release_epoch,
    evaluation_date=evaluation_date,
    profile=profile,
    baseline_history=baseline_history,
)
write_internal_reports(candidate, review_out)
if profile == "authoring":
    require_authoring_only_output_names(out, prefix="internal-pilot-")
    if fail_on_hard:
        raise_on_hard_issues(candidate.issues)
    write_authoring_outputs(candidate, out, prefix="internal-pilot-")
    return
if profile == "maintenance":
    raise_on_maintenance_blockers(candidate.issues)
    return  # no package generation
if profile in {"prepare", "release"}:
    raise_on_hard_issues(candidate)
    receipt = write_release(candidate, out)
    inspection = inspect_release(out, receipt)
    raise_on_hard_issues(inspection.issues)
    migration = run_candidate_migration(
        prior_release_dir,
        out,
        baseline_history,
        inputs.release_history,
        candidate,
    )
    raise_on_hard_issues(migration.issues)

if profile == "prepare":
    proposed = propose_history_append(
        inspection, migration, candidate, inputs.release_history
    )
    write_history_proposal(proposed, inspection, migration, review_out)
elif profile == "release":
    require_candidate_history_already_committed(
        inspection, candidate, baseline_history, inputs.release_history
    )
```

The governed-input digest is the squash-safe release seal. Hash raw bytes for the sorted set of every canonical registry except `release_history.json`; every registry/schema/config file; `question_bank.json` and its schema; the exact manifest, reviewed, evidence, surveillance, and policy inputs; every referenced source Markdown file; the weekly/authority-role files; the selected dependency lock; all Anki Python/shell/template code; the Anki site staging/check code; and the learner Anki page. Compute the aggregate as canonical JSON over `{repo_relative_path: sha256}`. Reject a missing, symlinked-outside-repo, duplicate, dirty, or newly accessed-but-unlogged path. Generated artifacts, review exports, `.git`, `_build`, and `release_history.json` are excluded. History is instead protected by the independent append-only baseline comparison and exact candidate-match check.

`prepare` runs on a clean candidate, takes release ID/date/epoch only from reviewed config, evaluates expiry against the current UTC date, inspects the actual packages, and emits `release_history.proposal.json`: a closed, non-applicable mechanical proposal binding the governed-input aggregate, canonical package fingerprints, deterministic CSV, stable receipt contract, and inspected-context hashes. It contains no reviewer or review date. A named release operator must open that exact proposal in the clinic, inspect its identities, memberships, package fingerprints, receipt contract, and migration proof, then export `release_history.patch.json` with their own name and ISO review date. Only that separately validated review patch may be passed to `apply_review_patch.py`; review the resulting canonical diff and commit it with the candidate. `release` recomputes those stable contracts, then requires the identity entries and release record to match. Raw ZIP/file hashes are verified within each build by its receipt but are not compared across builds. Because Git commit IDs are not part of the governed digest or public receipt, squash, merge-commit, and rebase workflows cannot invalidate an otherwise byte-identical review; any governed byte change still does.

Render the mechanical proposal for named review:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/build_review.py \
  --repo . \
  --candidate _build/anki-review/release_history.proposal.json \
  --out _build/anki-review/release_history_clinic.html
```

After the named operator inspects the exact proposal and exports `release_history.patch.json`, apply that reviewed patch with its inspected context:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/apply_review_patch.py \
  --repo . \
  --patch _build/anki-review/release_history.patch.json \
  --candidate-dir _build/anki-prepare/candidate \
  --history-baseline /tmp/base-release-history.json \
  --prior-release-dir _build/anki-prior-cache/selected
```

For a new release, `prepare` requires the ID to be absent from the baseline and the epoch to exceed its maximum; `release` requires the exact new append in current history. For an ordinary idempotent rebuild, `release` permits the exact latest baseline release ID/date/epoch only when governed digest, memberships, package fingerprints, CSV hash, and receipt contract all match byte-for-byte canonical baseline values; it emits no append. Any other ID/epoch reuse or changed content under an existing ID fails.

Store the single validated epoch and governed-input digest on `CandidateRelease`; package timestamps, proposed history, candidate manifest, and receipt read those values. `maintenance` and no-argument `authoring` use UTC today plus fixed `INTERNAL_REVIEW_EPOCH=946684800`; maintenance never writes a package. `authoring` alone accepts explicit date/epoch arguments for deterministic internal fixtures and labels them non-release.

`maintenance` uses an explicit nonfatal-code allowlist limited to incomplete Phase-2 coverage/render/evidence/policy approvals; every unknown or structural/safety issue is blocking. `authoring` writes only `_build/anki-review/` reports and package files with an `internal-pilot-` prefix inside the explicitly supplied temporary directory. Without `--fail-on-hard`, it returns release-readiness issues in the clinic so unfinished drafts remain reviewable; with the flag, it writes the non-production diagnostic reports and exits nonzero before writing an internal package if any hard issue exists. The flag is invalid outside authoring. `prepare` writes inspected six-file candidates only to the explicit review directory plus a mechanical history proposal; it never stages a site and never creates an applicable review decision. `release` writes only the six allowlisted production names and requires that exact inspected identities/fingerprints are already represented by appended current-release history entries.

For the first governed release, qbank migration seeds from both frozen legacy fixtures and Core/Application have no prior v2 artifacts. A new later release uses the verified currently deployed predecessor; an idempotent rebuild uses the verified currently deployed same release. `run_candidate_migration` receives the verified seed directory, baseline history, current history, and candidate; it selects predecessor/current-race mode relative to the candidate release ID and accepts candidate-as-seed only with the exact recorded migration proof. Generated packages are non-canonical and therefore must never be assumed to exist in a Git base ref. If governed history requires a deployed seed and its artifacts are absent, fail receipt-to-payload byte verification or history fingerprint/CSV/receipt-contract verification, and fail gate 7.

Implement the orchestrator in these test-sized slices:

- [ ] Add the complete governed-input access ledger and one-byte drift tests.
- [ ] Add maintenance issue classification and exact no-argument behavior.
- [ ] Add authoring-only filenames/reports, prohibit production names, and test both ordinary review mode and `--fail-on-hard` diagnostic mode.
- [ ] Add prepare config/clock/epoch/baseline validation.
- [ ] Add package inspection and baseline-only migration wiring.
- [ ] Add stable `HistoryAppend` generation after successful inspection/migration and serialize it only as a closed mechanical `HistoryProposal`.
- [ ] Prove a raw proposal cannot validate or apply as a `ReviewPatch`; require a named clinic export before canonical history can change.
- [ ] Add release matching for a newly appended candidate.
- [ ] Add exact idempotent rebuild matching and reject all partial matches.
- [ ] Add squash/merge/rebase digest-invariance fixtures.

- [ ] **Step 4: Implement the self-contained clinic**

Follow the embedded-payload pattern already used by `build_attest.py`. For every proposal show:

- exact card front and back as Anki renders them;
- for any proposed withdrawal, the exact neutral front/back, frozen template version/hash, affected release, and reason that the named reviewer is authorizing;
- current versus prior approved render, with red/green diff when changed;
- exact source quote, absolute link, manifest path, review status, and hashes;
- qbank stem/answer/trap and item/source hashes when applicable;
- risk facets, evidence record, policy record, due date, and blockers;
- accept/edit/reject/quarantine controls that export a review patch.

The tool must never infer approval from page review, qbank status, or a clicked batch action without displaying every exact rendered note included. For release history, it must display the complete mechanical proposal and inspected proof, preserve every proposed byte, and collect the named operator and review date only when exporting the distinct review patch.

- [ ] **Step 5: Implement closed, optimistic review patches**

`history_proposal.schema.json` requires `schemaVersion: 1`, `proposalType: release_history`, `generatedFromCommit`, `inputSha256`, the exact `HistoryAppend`, and hashes for the candidate manifest, six inspected files, history baseline, selected prior-release seed, migration proof, deterministic CSV, and receipt contract. It has no reviewer, review date, or decision fields, and `additionalProperties: false` applies throughout. `apply_review_patch.py` rejects this schema outright.

`review_patch.schema.json` requires `schemaVersion: 1`, one target registry, `generatedFromCommit`, `inputSha256`, and decisions containing `recordKey`, `baseRecordSha256` (null only for a new record), `proposedRecord`, decision type, reviewer, and review date. For `release_history`, the patch also carries the source proposal hash and must preserve the proposal's exact `HistoryAppend`. `additionalProperties: false` applies throughout.

`apply_review_patch.py` must:

1. Validate the patch schema and target registry allowlist.
2. Require `generatedFromCommit == git rev-parse HEAD`.
3. Recompute the current registry/input hash and each base-record hash.
4. Reject stale, missing, duplicated, cross-registry, or identity-changing decisions.
5. Recompute source/qbank/template/render/evidence/policy hashes; never trust exported computed values.
6. Re-run card, qbank-review, quarantine, or history validation for the target. For history, require candidate/baseline/prior paths, inspect the six candidate files, rerun migration with baseline/current history plus the candidate, recompute `governedInputSha256` and `propose_history_append`, and require byte-for-byte canonical equality with the patch; never trust exported fingerprints or hashes.
7. Reject a missing/extra/tampered candidate file, stale baseline, wrong prior seed, or candidate generated from different governed inputs without writing anything.
8. Write a temporary sibling file, fsync, and `os.replace()` the canonical JSON only when every decision passes.
9. Print the exact changed record keys and require the normal git diff to remain the review surface.

Add tests for stale HEAD, stale input, stale base record, immutable ID/model/deck/field changes, forged hashes, missing reviewer/date, invalid target, duplicate decision, missing/tampered history candidate, wrong history baseline/prior seed, partial failure with no write, and successful atomic apply. Explicitly prove that raw prepare output is rejected by `apply_review_patch.py`, a browser export with blank reviewer/date is rejected, and an exact named clinic export applies only after the candidate, baseline, prior seed, migration, and proposal are recomputed.

- [ ] **Step 6: Run release/review tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_release.py tests/anki/test_review.py
```

Expected: PASS. The real repo in `release` profile exits nonzero and lists its genuine missing approvals/coverage; `authoring` profile produces an internal clinic.

- [ ] **Step 7: Commit the mechanical clinic**

```bash
git add 13_Faculty_Resources/_automation/anki tests/anki
git commit -m "feat: add Anki candidate runner and faculty clinic"
```

- [ ] **Step 8: Review and commit the initial quarantine**

Generate the current-repo clinic and pause for a named faculty disposition of `qb_pha_002`. Apply its export only through `apply_review_patch.py`; it must record stable ID, exact reason, first-seen commit, named owner, decision date, and disposition. If disposition is `withdraw`, the same review must display and record the affected release, frozen withdrawal-template version, and approval hash for the exact neutral front/back. No governed qbank candidate may be labeled release-ready until this record is accepted.

Generate the exact authoring candidate and clinic:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/build_release.py \
  --profile authoring \
  --repo . \
  --out _build/anki-authoring/initial-quarantine \
  --review-out _build/anki-review/initial-quarantine
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/build_review.py \
  --repo . \
  --candidate _build/anki-review/initial-quarantine/review_candidate.json \
  --out _build/anki-review/initial-quarantine/qb_pha_002_clinic.html
```

STOP for review. The named operator must inspect the exact clinic and save its export as `_build/anki-review/initial-quarantine/quarantine.review.patch.json`; do not synthesize that file or its reviewer/date. If no named export exists, Task 9 stops here and Task 10 remains in maintenance mode.

If the named faculty patch exists, apply, verify, and commit it separately:

```bash
test -s _build/anki-review/initial-quarantine/quarantine.review.patch.json
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/apply_review_patch.py \
  --repo . \
  --patch _build/anki-review/initial-quarantine/quarantine.review.patch.json
git diff --check
git diff -- 13_Faculty_Resources/anki/quarantine.json
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_governance.py tests/anki/test_review.py
git add 13_Faculty_Resources/anki/quarantine.json
git commit -m "content: record reviewed initial Anki quarantine"
```

Expected: the patch application recomputes the current finding and exact neutral render, changes only the reviewed quarantine record, and the focused tests pass. A stale, blank-reviewer, edited-render, or non-`qb_pha_002` export fails without writing.

### Task 10: Replace fail-soft staging with explicit maintenance/release site contracts

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_anki.sh`
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Create: `13_Faculty_Resources/_automation/site_build/check_anki_site.py`
- Create: `13_Faculty_Resources/_automation/anki/fetch_prior_release.py`
- Create: `tests/anki/test_site_contract.py`
- Create: `tests/anki/test_prior_release_fetch.py`
- Modify: `09_Exam_Prep/anki_export/anki.md`
- Modify: `13_Faculty_Resources/reviewed.json` only after named review of the maintenance copy

**Interfaces:**
- `build_anki.sh OUT_DIR PROFILE [HISTORY_BASELINE] [PRIOR_RELEASE_DIR]` creates a temp candidate, validates it, and atomically stages only the exact allowlist when `PROFILE=release`.
- `fetch_prior_release.py --repo PATH --history-baseline PATH --candidate-release-id ID --out PATH` explicitly acquires and verifies the production seed when no preverified prior directory is supplied.
- `check_anki_site.py --site PATH --audience ms3 --mode maintenance|release`.
- `check_anki_site.py --site PATH --audience resident`.
- `build_and_check.sh ms3|res` reads `siteMode` from `release_config.json`; no `|| true` remains around Anki work.

- [ ] **Step 1: Add failing staged-site contract tests**

Maintenance MS3 assertions:

```text
content/anki.md exists
page prominently names qb_pha_002 and manual suspend/delete action
page says updates are not automatic
no /anki directory and no .apkg/CSV/receipt link exists
```

Release MS3 assertions:

```text
exact six-file directory set
every file is nonempty
four packages have ZIP signatures
CSV has the audited schema
receipt hashes/sizes/counts match the other five files
page links equal the allowlist
withdrawal UIDs and active/physical counts match receipt
for every active withdrawal, the page has a prominent alert naming its UID, affected release, reason, and manual suspend/delete remediation
no draft/review/quarantine/legacy/unexpected filename is present
```

Resident assertions:

```text
no /anki directory
no content/anki.md
no Anki nav or search item
```

Prior-release acquisition assertions:

```text
first governed release uses only the two frozen legacy fixtures
new governed release downloads the currently deployed predecessor receipt and five payloads
idempotent rebuild downloads the currently deployed same release
when a new-release baseline still names the predecessor but production already serves the exact candidate, a verified current-history migration proof permits candidate-as-seed idempotent redeploy
MS3-first/resident-second parallel builds and a same-commit manual redeploy pass whether production still serves predecessor or already serves the exact candidate
candidate-as-seed race case passes through full build_release.py --profile release and fails if current-history migration proof is removed or changed
HTTPS canonical origin is required in production; redirects, cross-origin responses, missing/extra files, timeouts, and size-limit violations fail
receipt byte hashes/sizes match the downloaded five files
inspected package fingerprints, CSV hash, receipt contract, release ID/date/epoch, and governedInputSha256 match the selected baseline release record
an explicitly supplied local/cache directory is subjected to the same checks
```

- [ ] **Step 2: Run the site tests**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_site_contract.py \
  tests/anki/test_prior_release_fetch.py
```

Expected: FAIL because the current build is fail-soft, stages wildcards, omits CSV/receipt, and leaks Anki into resident.

- [ ] **Step 3: Replace `build_anki.sh` with atomic explicit staging**

Required allowlist:

```bash
ARTIFACTS=(
  psychiatry_clerkship_ms3_core.apkg
  psychiatry_clerkship_ms3_application.apkg
  psychiatry_clerkship_ms3_complete.apkg
  psychiatry_clerkship_qbank.apkg
  psychiatry_clerkship_ms3_cards.csv
  anki_release_receipt.json
)
```

For release mode: generate into `mktemp -d`, inspect, compare exact set, copy to `OUT/anki.next`, then rename atomically to `OUT/anki`. Propagate every error. Never write tracked exports, glob `*.apkg`, fall back to old binaries, or stage into resident.

Read the non-null release ID/date/epoch from `release_config.json` only to preflight and verify the final receipt. Invoke `build_release.py --profile release` with the mandatory history baseline and verified seed directory, but do not pass epoch, date, or Git-commit overrides: the runner derives reviewed identity from config and recomputes `governedInputSha256`. Never substitute wall-clock time or an arbitrary CI timestamp. Require the receipt to match the config identity, governed-input ledger, and committed candidate history membership.

Keep acquisition outside the core release engine but make it an explicit fail-closed staging step. `build_anki.sh` first uses a caller-supplied `PRIOR_RELEASE_DIR`/`PCL_ANKI_PRIOR_RELEASE_DIR` when present and re-verifies it. Otherwise it invokes `fetch_prior_release.py`: the first governed release copies and verifies the two frozen legacy fixtures; a new later release normally downloads the currently deployed predecessor; an idempotent rebuild downloads the currently deployed same release. During the deployment race for a new release, production may already serve the exact candidate even though the supplied baseline still ends at the predecessor. Permit candidate-as-seed only when the current history's exact candidate record matches the download and contains the reviewed predecessor `migrationSeedReleaseId`/`migrationContractSha256`; then run the candidate-to-candidate idempotency import. Any other production release ID fails.

The fetcher reads the canonical HTTPS base URL from reviewed config, downloads the receipt then the five named payloads without cross-origin redirects, enforces time/size limits, verifies current-build byte hashes against the receipt, and independently inspects package fingerprints/CSV/receipt contract against the selected baseline/current release record. It writes atomically to ignored `_build/anki-prior-cache/<release-id>/`, and every reuse re-verifies every check. Any unavailable or mismatched production seed blocks staging. Never look for generated release binaries in Git. Tests run MS3-first/resident-second with production switching between requests and repeat the same commit after deployment.

`build_and_check.sh` creates and validates history context before every maintenance or release gate. GitHub PR CI passes the fetched base ref explicitly; protected-branch CI passes the event's pre-push SHA. On Netlify, use `CACHED_COMMIT_REF` only when it differs from `COMMIT_REF` and the commit is present; otherwise fetch full history and run `--audit-lineage` for maintenance or `--before-release-id "$RELEASE_ID"` for release. It never guesses that `HEAD^` is the authority. The first governance PR uses the independently verified bootstrap path. The resulting baseline path and, for release only, verified seed directory are passed to `build_anki.sh`.

For maintenance mode: remove any fresh build's `OUT/anki`; validate the maintenance page; do not invoke package generation.

- [ ] **Step 4: Correct site build ordering and resident stripping**

MS3 order:

```text
shared governance validation
fresh site build
maintenance validation OR release generation/staging
Anki site contract
LFS preflight
general static QA
search QA
```

The shared governance call uses the `maintenance` profile plus the generated history baseline while `siteMode` is `maintenance`; it hard-fails malformed registries, source-map/authority errors, identity/history corruption, known safety-hold drift, new/changed unreviewed quarantine, and unknown hard codes while allowing only the enumerated Phase-2 incompleteness codes. It uses `release` profile only when `siteMode` is `release`. Add an end-to-end test of the exact no-extra-argument Netlify `build_and_check.sh` command with null release ID/date/epoch, lineage-derived baseline, and no CLI clock arguments.

Resident order:

```text
shared governance validation
create _build/res-ms3-base.XXXXXX with mktemp -d
fresh MS3 base build into that temporary directory
apply the declared maintenance/release Anki contract to the temporary base
derive resident
delete inherited /anki and content/anki.md
omit Anki nav/search
resident Anki absence contract
LFS/static/search QA
remove the temporary base and its adjacent source-map file with a trap
```

Pass the temporary path as `MS3_DIR` to `resident_section.py` and `_build/res` as `OUT_DIR`. Never call `build_deploy.py` with `OUT_DIR=_build/ms3` from the resident case. This preserves the already validated `_build/ms3` tree during CI's sequential MS3/resident build while still making a bad shared release block the resident build.

- [ ] **Step 5: Write truthful Phase 1 maintenance copy**

The learner page must say:

- the deck is being rebuilt under card-level faculty review;
- existing deck updates are not automatic;
- legacy release `legacy-qbank-2026-07-12` contains `qb_pha_002` with outdated clozapine ANC wording; learners should search that UID, suspend or delete it, and not use it until a reviewed replacement is published;
- no pilot or legacy download is offered from the maintenance page;
- this page is re-attested in `13_Faculty_Resources/reviewed.json` only after named faculty review of the exact copy.

Do not mark the page reviewed mechanically. A pending status may block deployment until the named review occurs; that is intentional.

- [ ] **Step 6: Run both build boundaries**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/site_build/check_anki_site.py \
  --site _build/ms3 --audience ms3 --mode maintenance
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/site_build/check_anki_site.py \
  --site _build/res --audience resident
```

Expected: PASS after named review/attestation of maintenance copy; `_build/ms3/anki` is absent and resident has no Anki page/nav/search/artifacts.

- [ ] **Step 7: Commit mechanical integration, then reviewed copy separately**

```bash
git add 13_Faculty_Resources/_automation/site_build \
  13_Faculty_Resources/_automation/anki/fetch_prior_release.py tests/anki
git commit -m "fix: make Anki site staging fail closed"
```

After named review:

```bash
git add 09_Exam_Prep/anki_export/anki.md 13_Faculty_Resources/reviewed.json
git commit -m "docs: publish reviewed Anki maintenance safety notice"
```

### Task 11: Add CI, HTTP download smoke, and deployment documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `tests/anki/build_release_site_fixture.py`
- Create: `tests/smoke/anki-downloads.spec.js`
- Modify: `tests/smoke/playwright.config.js`
- Modify: `tests/smoke/package.json`
- Modify: `tests/smoke/README.md`
- Modify: `09_Exam_Prep/anki_export/README.md`
- Modify: `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`

**Interfaces:**
- CI job `anki-contract` runs the full mechanical suite and Anki min/current migration matrix.
- Playwright projects `anki-ms3` and `anki-res` enforce the real maintenance/resident behavior; `anki-release-fixture` exercises the full release-mode HTTP branch against non-clinical generated packages.
- `playwright.config.js` reads `13_Faculty_Resources/anki/release_config.json` once and passes the declared `siteMode` to the `anki-ms3` test; absence of a receipt in release mode is a failure, not a signal to downgrade to maintenance expectations.
- CI uploads `_build/anki-review/` as an internal review artifact; it does not publish candidate packages.

- [ ] **Step 1: Add failing browser smoke tests**

In maintenance mode, `anki-ms3` asserts the reviewed safety page is HTTP 200 and each of the six production URLs is 404. `anki-res` asserts the page and all six URLs are 404 and no nav item exists.

The `anki-release-fixture` project uses a generated synthetic site with `siteMode=release`. Its governed history includes a same-GUID neutral withdrawal `synthetic_withdrawn_001`, affected release `synthetic-release-n`, and reason `SYNTHETIC_SAFETY_WITHDRAWAL`. Require `anki_release_receipt.json`, fetch all six links, verify HTTP 200/signatures, compare the downloaded SHA-256 bytes to the receipt, and assert the learner page prominently displays that exact UID, affected release, human-readable reason, and manual suspend/delete steps. For every source URL, first assert origin `https://une-ms3-psychiatry.netlify.app`, then preserve its path/query/fragment while replacing only the origin with the project's local `baseURL`; never browse production during local/CI verification. Assert the rewritten fragment resolves to a visible heading. A missing receipt, withdrawal alert field, or fragment is a failure, never a maintenance fallback.

- [ ] **Step 2: Run browser tests against local builds**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  tests/anki/build_release_site_fixture.py --out _build/anki-release-fixture
cd tests/smoke
npm ci
npx playwright install chromium
python3 -m http.server 4200 --directory ../../_build/ms3 >/tmp/pcl-ms3-server.log 2>&1 & P1=$!
python3 -m http.server 4201 --directory ../../_build/res >/tmp/pcl-res-server.log 2>&1 & P2=$!
python3 -m http.server 4202 --directory ../../_build/anki-release-fixture >/tmp/pcl-anki-fixture-server.log 2>&1 & P3=$!
trap 'kill "$P1" "$P2" "$P3" 2>/dev/null || true' EXIT
PCL_ANKI_FIXTURE_BASE_URL=http://127.0.0.1:4202 \
  npx playwright test --project=source-ms3 \
  --project=anki-ms3 --project=anki-res --project=anki-release-fixture
```

Expected: FAIL until projects and site behavior are wired.

- [ ] **Step 3: Wire CI in separate mechanical and site lanes**

Before site builds:

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.11.9"

- name: Install governed Anki environment
  run: bash 13_Faculty_Resources/_automation/anki/run_python.sh -m pip check

- name: Test governed Anki engine
  run: bash 13_Faculty_Resources/_automation/anki/run_python.sh -m pytest -q tests/anki --ignore=tests/anki/test_migration.py
```

Add two migration matrix runs using the min/current lock files. Keep existing site jobs, then explicitly run `source-ms3`, `anki-ms3`, and `anki-res`; the source project is a release gate, not an optional smoke check. Upload internal reports only with a non-public CI artifact action. Do not upload a failed or unreviewed `.apkg` as a deployment artifact.

Build `_build/anki-release-fixture`, serve it on port 4202 alongside MS3/resident, and run `anki-release-fixture` in every PR. The fixture builder creates a temporary Git repository with fully governed neutral release N and its actual prior artifacts, prepares neutral release N+1, applies the re-inspected history patch, then reconstructs the same governed files under squash-, merge-, and rebase-shaped commit graphs. All variants must produce the same `governedInputSha256`; any one-byte governed mutation must fail. Run the release profile with release N's verified artifacts as `--prior-release-dir`. Its learner content is entirely `Condition Alpha`-style synthetic data, but it must traverse the same prepare/history-apply/release protocol, writer, package inspector, actual-prior migration, receipt contract, site checker, staging allowlist, withdrawal alert, and HTTP hash assertions as production.

Before maintenance/prepare/release diagnostics in a pull request, fetch the base ref and run `prepare_history_baseline.py --base-ref "origin/$BASE_REF" --out /tmp/base-release-history.json`. For the first governance PR only, the helper permits a missing base file after independently rebuilding and byte-checking all 168 legacy identities, then emits the closed empty baseline. On a protected-branch push, prefer the event's exact pre-push SHA as `--base-ref`. On Netlify, use its documented `CACHED_COMMIT_REF` only when it differs from `COMMIT_REF` and is available locally; a cold-cache equality is not a baseline. Otherwise fetch full history and use `--audit-lineage` for maintenance or `--before-release-id "$RELEASE_ID"` for release. Pass the output as `--history-baseline`. Any edit, deletion, reordering, identity reassignment, ambiguous/shallow ancestry, or unverified missing-base shortcut fails; only valid appends or an exact idempotent baseline release pass.

- [ ] **Step 4: Reconcile documentation**

Document:

- Phase 1 maintenance versus Phase 2 release mode;
- no fail-soft or old-binary fallback;
- exact generation/staging order;
- Anki 23.10 minimum for supported unconditional withdrawal imports;
- CSV as faculty audit/interchange only;
- Complete as Core + Application only;
- resident exclusion;
- lock regeneration and min/current test commands;
- production release requires a non-null release ID/date/epoch and all 11 gates.
- `.python-version` pins local/Netlify CPython `3.11.9`; both Netlify site settings must also set `PYTHON_VERSION=3.11.9` so the build runner never falls back to the Mac's/current image's unrelated Python.

- [ ] **Step 5: Run CI-equivalent checks locally**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki --ignore=tests/anki/test_migration.py
ANKI_LOCK=min bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
ANKI_LOCK=current bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  tests/anki/build_release_site_fixture.py --out _build/anki-release-fixture
cd tests/smoke
npm ci
npx playwright install chromium
python3 -m http.server 4200 --directory ../../_build/ms3 >/tmp/pcl-ms3-server.log 2>&1 & P1=$!
python3 -m http.server 4201 --directory ../../_build/res >/tmp/pcl-res-server.log 2>&1 & P2=$!
python3 -m http.server 4202 --directory ../../_build/anki-release-fixture >/tmp/pcl-anki-fixture-server.log 2>&1 & P3=$!
trap 'kill "$P1" "$P2" "$P3" 2>/dev/null || true' EXIT
PCL_ANKI_FIXTURE_BASE_URL=http://127.0.0.1:4202 \
  npx playwright test --project=nav-ms3 --project=nav-res --project=source-ms3 \
  --project=anki-ms3 --project=anki-res --project=anki-release-fixture
```

Expected: all mechanical and browser checks PASS. If Playwright hangs under Node 25, rerun the same project list with `/usr/local/bin/node node_modules/@playwright/test/cli.js test --project=nav-ms3 --project=nav-res --project=source-ms3 --project=anki-ms3 --project=anki-res --project=anki-release-fixture`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml tests/anki/build_release_site_fixture.py tests/smoke \
  09_Exam_Prep/anki_export/README.md \
  13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md
git commit -m "ci: gate Anki maintenance and release boundaries"
```

- [ ] **Step 7: Stop for the Netlify Python runtime checkpoint before merge/deploy**

A named operator must verify both Netlify sites—`une-ms3-psychiatry` and `mmc-psychiatry-residents-sanford`—have `PYTHON_VERSION=3.11.9` in their site environment, then run a maintenance-mode deploy preview for each. Require build logs to show CPython 3.11.9, the default production lock with `anki==26.5`, and the maintenance gate passing. Record the actual site identifier, preview URL, UTC timestamp, and operator in the deployment handoff; do not invent them in the repository. Local/CI success does not satisfy this external checkpoint. If either setting or preview is unverified, stop before production integration and report the exact missing evidence.

### Task 12: Author the 36-card internal pilot and stop for faculty review

**Files:**
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/review.py`
- Modify: `13_Faculty_Resources/_automation/anki/build_review.py`
- Create: `_build/anki-review/pilot_36_proposals.json` (generated, ignored)
- Create: `_build/anki-review/pilot_36_clinic.html` (generated, ignored)
- Modify: `13_Faculty_Resources/anki/cards.json` only from a named review export
- Create: `tests/anki/test_pilot.py`

**Interfaces:**
- Pilot IDs use `ms3_w{week:02d}_{domain_code}_001`, one per Week 1-6 × Domain code `dx|pharm|safety|comm|therapy|dispo`.
- `validate_pilot(proposals) -> list[Issue]` requires exactly 36 unique draft proposals and exactly one per Week-by-Domain cell.
- `build_review.py --pilot` creates the clinic but never a production package; after a patch is applied, rerunning it compares every proposal ID and recomputed render/hash with the canonical `cards.json` record and shows whether the exact reviewed record is applied.

Freeze the exact pilot grid:

| Week | Diagnosis | Psychopharmacology | Safety | Communication | Psychotherapy/Formulation | Disposition/Handoff |
|---:|---|---|---|---|---|---|
| 1 | `ms3_w01_dx_001` | `ms3_w01_pharm_001` | `ms3_w01_safety_001` | `ms3_w01_comm_001` | `ms3_w01_therapy_001` | `ms3_w01_dispo_001` |
| 2 | `ms3_w02_dx_001` | `ms3_w02_pharm_001` | `ms3_w02_safety_001` | `ms3_w02_comm_001` | `ms3_w02_therapy_001` | `ms3_w02_dispo_001` |
| 3 | `ms3_w03_dx_001` | `ms3_w03_pharm_001` | `ms3_w03_safety_001` | `ms3_w03_comm_001` | `ms3_w03_therapy_001` | `ms3_w03_dispo_001` |
| 4 | `ms3_w04_dx_001` | `ms3_w04_pharm_001` | `ms3_w04_safety_001` | `ms3_w04_comm_001` | `ms3_w04_therapy_001` | `ms3_w04_dispo_001` |
| 5 | `ms3_w05_dx_001` | `ms3_w05_pharm_001` | `ms3_w05_safety_001` | `ms3_w05_comm_001` | `ms3_w05_therapy_001` | `ms3_w05_dispo_001` |
| 6 | `ms3_w06_dx_001` | `ms3_w06_pharm_001` | `ms3_w06_safety_001` | `ms3_w06_comm_001` | `ms3_w06_therapy_001` | `ms3_w06_dispo_001` |

- [ ] **Step 1: Add failing pilot-shape tests using a generated neutral fixture**

Build a synthetic 36-record set from the non-clinical test factory and assert:

```text
36 unique stable IDs
one proposal in each of the 36 Week-by-Domain cells
six proposals per Week and six per Domain
all are Core basic/cloze, MS3, and draft before faculty review
each source resolves to one reviewed Markdown passage
each front is explicit and at most 35 words
each direct answer is at most 45 words
each explanation is at most two sentences and 60 words
no generic/ordinal prompt, visible answer leak, or unbounded cloze
no LocalPolicy action threshold without a reviewed policy record
High proposals visibly carry evidence blockers until reviewed
```

- [ ] **Step 2: Run the test before the validator exists**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_pilot.py
```

Expected: FAIL because `validate_pilot` is not implemented. The committed unit test must never depend on ignored `_build/` proposal files.

- [ ] **Step 3: Implement and prove the reusable pilot validator**

Implement `validate_pilot()` in `review.py`, then run:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_pilot.py
```

Expected: PASS for the neutral 36-cell fixture and its one-mutation failure cases.

Commit the mechanical validator before authoring clinical proposals:

```bash
git add 13_Faculty_Resources/_automation/anki/pcl_anki/review.py \
  13_Faculty_Resources/_automation/anki/build_review.py tests/anki/test_pilot.py
git commit -m "feat: validate MS3 Anki pilot proposals"
```

- [ ] **Step 4: Draft one source-grounded proposal per cell**

For every cell:

1. Read the existing six-week map and relevant reviewed curriculum page.
2. Select an exact reviewed passage; do not infer beyond it.
3. Write one atomic Core prompt under the approved family/task/risk contract.
4. Prefer ward recognition, supervised action, escalation, monitoring awareness, usable language, therapy matching, or verified handoff.
5. Record `authoringMethod: ai_assisted` and the actual tool/model version used.
6. Leave faculty/human/evidence/policy approval fields absent until a named reviewer supplies them.
7. Store proposals only in `_build/anki-review/pilot_36_proposals.json`.

Do not modify source Markdown, qbank status, reviewed status, or evidence registry to make a proposal eligible.

Draft and immediately validate each cell before moving on:

- [ ] `ms3_w01_dx_001`
- [ ] `ms3_w01_pharm_001`
- [ ] `ms3_w01_safety_001`
- [ ] `ms3_w01_comm_001`
- [ ] `ms3_w01_therapy_001`
- [ ] `ms3_w01_dispo_001`
- [ ] `ms3_w02_dx_001`
- [ ] `ms3_w02_pharm_001`
- [ ] `ms3_w02_safety_001`
- [ ] `ms3_w02_comm_001`
- [ ] `ms3_w02_therapy_001`
- [ ] `ms3_w02_dispo_001`
- [ ] `ms3_w03_dx_001`
- [ ] `ms3_w03_pharm_001`
- [ ] `ms3_w03_safety_001`
- [ ] `ms3_w03_comm_001`
- [ ] `ms3_w03_therapy_001`
- [ ] `ms3_w03_dispo_001`
- [ ] `ms3_w04_dx_001`
- [ ] `ms3_w04_pharm_001`
- [ ] `ms3_w04_safety_001`
- [ ] `ms3_w04_comm_001`
- [ ] `ms3_w04_therapy_001`
- [ ] `ms3_w04_dispo_001`
- [ ] `ms3_w05_dx_001`
- [ ] `ms3_w05_pharm_001`
- [ ] `ms3_w05_safety_001`
- [ ] `ms3_w05_comm_001`
- [ ] `ms3_w05_therapy_001`
- [ ] `ms3_w05_dispo_001`
- [ ] `ms3_w06_dx_001`
- [ ] `ms3_w06_pharm_001`
- [ ] `ms3_w06_safety_001`
- [ ] `ms3_w06_comm_001`
- [ ] `ms3_w06_therapy_001`
- [ ] `ms3_w06_dispo_001`

- [ ] **Step 5: Validate and render the clinic**

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/build_review.py \
  --repo . \
  --pilot _build/anki-review/pilot_36_proposals.json \
  --out _build/anki-review/pilot_36_clinic.html
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_pilot.py
```

Expected: PASS for pilot structure/card/source rules. The clinic clearly labels every missing human/evidence/policy decision and does not claim release readiness.

- [ ] **Step 6: Human editing and faculty review checkpoint**

STOP and present `_build/anki-review/pilot_36_clinic.html` to the user. A named human editor must review each proposal; a named faculty approver must review the exact rendered front/back. High and LocalPolicy cards require their separate named reviews. Apply only the exported patch, recompute hashes, regenerate the clinic, and require a second clean comparison before changing `cards.json` records to `approved`.

If any wording rule changes, update the specification and tests in a dedicated reviewed commit before applying approvals. Never bulk-fill names, dates, or hashes from conversation context.

- [ ] **Step 7: Commit only review-backed canonical records**

The named reviewer must save the clinic export as `_build/anki-review/pilot_36.review.patch.json`. If that exact named export does not exist, stop; do not create or edit it mechanically. If it exists, apply it through the closed patch tool, regenerate the clinic from the unchanged proposals against canonical records, rerun the pilot test, and inspect the only allowed canonical diff:

```bash
test -s _build/anki-review/pilot_36.review.patch.json
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/apply_review_patch.py \
  --repo . \
  --patch _build/anki-review/pilot_36.review.patch.json
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/build_review.py \
  --repo . \
  --pilot _build/anki-review/pilot_36_proposals.json \
  --out _build/anki-review/pilot_36_clinic.html
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_pilot.py tests/anki/test_review.py
git diff --check
git diff -- 13_Faculty_Resources/anki/cards.json
git add 13_Faculty_Resources/anki/cards.json
git commit -m "content: record reviewed MS3 Anki pilot cards"
```

Expected: patch application succeeds only for the exact current source/template/render hashes and named review fields; the regenerated clinic reports exact canonical matches for applied records, and the tests pass. Partial approval is allowed only when every applied record is individually valid and the remaining proposals stay draft; Phase 1 may stop with unapplied proposals and may not claim the 36-card pilot approved.

Generated proposals and HTML remain ignored and uncommitted. Do not change `siteMode`, release ID/date/epoch, learner filenames, or production totals in this task.

## Phase 1 Final Verification

- [ ] Run the full mechanical suite:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki --ignore=tests/anki/test_migration.py
ANKI_LOCK=min bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
ANKI_LOCK=current bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  -m pytest -q tests/anki/test_migration.py
```

Expected: PASS.

- [ ] Run both build boundaries:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: PASS in maintenance mode; no learner Anki binaries are staged; resident has no Anki surface.

- [ ] Run browser smoke:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  tests/anki/build_release_site_fixture.py --out _build/anki-release-fixture
cd tests/smoke
npm ci
npx playwright install chromium
python3 -m http.server 4200 --directory ../../_build/ms3 >/tmp/pcl-ms3-server.log 2>&1 & P1=$!
python3 -m http.server 4201 --directory ../../_build/res >/tmp/pcl-res-server.log 2>&1 & P2=$!
python3 -m http.server 4202 --directory ../../_build/anki-release-fixture >/tmp/pcl-anki-fixture-server.log 2>&1 & P3=$!
trap 'kill "$P1" "$P2" "$P3" 2>/dev/null || true' EXIT
PCL_ANKI_FIXTURE_BASE_URL=http://127.0.0.1:4202 \
  npx playwright test --project=nav-ms3 --project=nav-res --project=source-ms3 \
  --project=anki-ms3 --project=anki-res --project=anki-release-fixture
```

Expected: PASS.

- [ ] Run a strict real-repo diagnostic without suppressing the expected blockers:

```bash
bash 13_Faculty_Resources/_automation/anki/run_python.sh \
  13_Faculty_Resources/_automation/anki/build_release.py \
  --profile authoring \
  --repo . \
  --out /tmp/pcl-anki-release-probe \
  --build-epoch 1784044800 \
  --candidate-date "$(date -u +%F)" \
  --review-out _build/anki-review/release-probe \
  --fail-on-hard
```

Expected: nonzero with explicit Phase 2 blockers such as exact 144/48 coverage, missing rendered qbank approvals, and missing evidence/policy reviews. It must not write the six production artifacts. Record these blockers in the Phase 2 handoff; do not weaken a gate.

- [ ] Verify repository hygiene:

```bash
git status --short
git diff --check
rg -n "TODO|TBD|placeholder|In one line\?|High-yield pearl #[0-9]+" \
  13_Faculty_Resources/anki \
  13_Faculty_Resources/_automation/anki \
  09_Exam_Prep/anki_export/anki.md
```

Expected: only intended review-backed files are tracked; `git diff --check` is clean; no placeholder approval/content text or vague legacy prompts occur in canonical v2 inputs.

## Phase 2 Handoff Contract

The next implementation plan must begin from the actual Phase 1 reports and named review exports. It must:

1. Expand Core from the reviewed pilot to exactly 144 cards under every Week-by-Domain quota.
2. Select and review exactly 48 Application cards under every Week-by-task quota, each reinforcing an approved same-or-earlier-week Core card.
3. Review every eligible base/Tier-2 qbank rendered note; do not infer those approvals from item attestation.
4. Expand reviewed evidence and policy records before approving affected cards.
5. Set a new non-null release ID/date and an epoch greater than `1783902620` and every later history baseline entry.
6. Replace and re-attest the governed learner page with final instructions covering desktop Anki 23.10 minimum, explicit unconditional re-import, same-UID manual suspend/delete fallback, legacy Concepts deck removal, actual active-note/withdrawal/scheduled-card counts, Core/Application/Complete/qbank roles, Week/tag sequencing, CSV audit-only status, and truthful AI-assisted/human-edited/faculty-approved provenance; then set reviewed `siteMode: release` and release ID/date/epoch.
7. Prepare/inspect/migrate, apply the reviewed history append, rebuild in release mode, and pass gates 1-8 before atomically staging the six allowlisted artifacts as gate 9.
8. Pass MS3/resident site and receipt gates 10-11, then verify the live HTTP bytes against the release receipt and confirm resident absence.

Plainly: Phase 1 builds the locked packing line, proves that unsafe old cards can be neutralized without erasing learner scheduling, and gives faculty a usable 36-card clinic. Phase 2 fills that line with the complete reviewed curriculum and is the only phase allowed to turn downloads back on.

Concrete next best option after this plan: execute Tasks 1-4 first as one reviewable mechanical slice. They establish permanent identities and exact source/qbank drift detection before anyone spends time authoring cards.

Innovative follow-up: use the release receipt as a downloadable “shipping seal.” The browser smoke test can hash the exact bytes a learner receives and compare them with the inspected candidate, detecting a stale CDN or swapped binary even when the filename looks correct.
