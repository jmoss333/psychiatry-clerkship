# Evidence Registry and Zotero Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first reliable evidence spine: one canonical repository registry containing the existing evidence sources, eight surveillance sources, and all 17 Tier 1 articles; connect the Tier 1 records to Zotero through a read-only local bridge; and generate deterministic Tier 1 views without changing clinical prose, claims, or faculty attestation.

**Architecture:** `evidence_registry.json` owns curriculum meaning, bibliographic identity decisions, intended weeks, and governance. Zotero owns the actual reference items, tags, observed collection membership, and licensed attachments. Standard-library Python performs all CI and build validation offline; a separate explicitly invoked local command compares the registry with Zotero and writes only ignored reports.

**Tech Stack:** Python 3.11 standard library, JSON/JSON Schema Draft 7 documentation, Markdown/CSV generation, Zotero local Web API v3 at `http://127.0.0.1:23119/api`, plain-assert Python tests, optional local `openpyxl>=3.1,<4` for a Tier 1-only compatibility workbook.

## Global Constraints

- Implement only Milestone 1 from `docs/superpowers/specs/2026-07-12-evidence-reliability-zotero-design.md`.
- Do not edit clinical prose, `clinical_claims.json`, `reviewed.json`, `topic_meta.json` review state, or attestation tooling.
- Preserve all 10 existing evidence IDs and all eight surveillance source IDs.
- Represent 17 Tier 1 articles as 16 numbered selections; `14a` and `14b` remain independent evidence records.
- Repository fields define curriculum meaning. Zotero collections and week tags are observed/advisory and must never silently change curriculum weeks.
- The Zotero integration is read-only. Do not call connector write/import/save routes.
- Never commit PDFs, attachment paths, extracted full text, attachment child keys, or live Zotero snapshots.
- CI, Netlify, and normal site builds must not contact Zotero, PubMed, Crossref, Apify, or any other network service.
- Keep the tracked 45-row `Primary_Source_Download_Checklist.xlsx` unchanged in this milestone because 28 non-Tier-1 rows are not yet represented in the registry.
- Generate only the sentinel-bounded Tier 1 section of `Primary_Source_Download_List.md`; preserve the Tier 2–4 tail byte-for-byte.
- Do not use the stash-only builder from object `b20fea8` as authority. It contains heuristic week assignments and non-deterministic timestamps.
- Keep learner builds free of Zotero item keys and internal surveillance configuration by publishing an allow-listed projection.
- Plain-language code summary: the code gives each core article a stable catalog entry, checks that Zotero has the matching item, and rebuilds the article lists from that catalog without copying any PDFs.

---

## File Structure

### Create

- `tools/evidence_registry/__init__.py` — package marker only.
- `tools/evidence_registry/registry.py` — loading, normalization, validation primitives, surveillance/public projections, and deterministic view generation.
- `tools/evidence_registry/validate.py` — offline repository gate; never imports or calls the Zotero client.
- `tools/evidence_registry/zotero_reconcile.py` — read-only local API snapshot, reconciliation, attachment inspection, and reports.
- `tools/evidence_registry/test_registry.py` — plain-assert tests using temporary directories and synthetic fixtures.
- `tools/evidence_registry/zotero_config.json` — exact local library, collection, and expected tag configuration.
- `tools/evidence_registry/README.md` — authority model and local commands.
- `tools/evidence_registry/requirements-local.txt` — optional workbook dependency only.
- `tools/evidence_registry/fixtures/valid_tier1_registry.json` — synthetic 17-record contract fixture.
- `tools/evidence_registry/fixtures/zotero_snapshot_valid.json` — synthetic matching records with empty week collections.
- `tools/evidence_registry/fixtures/zotero_snapshot_identity_drift.json` — stored-key identity conflict.
- `tools/evidence_registry/fixtures/zotero_snapshot_ambiguous.json` — ambiguous fallback candidates.
- `tools/evidence_registry/fixtures/zotero_snapshot_attachment_states.json` — note, URL, HTML, imported/linked PDF, zero-byte, and scanned-PDF cases.
- `07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md` — generated faculty view.

### Modify

- `evidence_registry.schema.json` — versioned nested contract.
- `evidence_registry.json` — canonical 35-source registry: 10 existing + 8 surveillance + 17 Tier 1.
- `07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md` — generated markers around Tier 1 only.
- `07_Evidence_and_Reading/README.md` — correct the stale 15/16-paper wording and point to the registry.
- `.gitignore` — ignore `/outputs/evidence_registry/`.
- `13_Faculty_Resources/_automation/validate_topic_meta.py` — consume the shared canonical ID index and never disable foreign-key checks for an empty registry.
- `13_Faculty_Resources/_automation/site_build/build_deploy.py` — publish an allow-listed registry projection instead of the canonical internal JSON.
- `13_Faculty_Resources/_automation/site_build/build_and_check.sh` — add the offline evidence gate before the existing topic gate.
- `.github/workflows/ci.yml` — add evidence unit and drift checks.
- `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py` — project the existing collector shape from the canonical JSON.
- `13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py` — make registry-load failures hard and update wording.
- `13_Faculty_Resources/_automation/surveillance/bin/build_status.py` — remove the silent empty-cadence fallback.
- Surveillance collector docstrings, `README.md`, `ADR-001-curriculum-surveillance.md`, `finding.schema.json`, `citation_index.json`, relevant Apify examples, and three surveillance workflows — replace stale YAML-authority instructions and remove unnecessary PyYAML installs.

### Delete only after parity passes

- `13_Faculty_Resources/_automation/surveillance/config/source_registry.yaml`.

### Explicitly leave unchanged

- `07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_Checklist.xlsx`.
- `07_Evidence_and_Reading/Landmark_Library/.~lock.Primary_Source_Download_Checklist.xlsx#`.
- All clinical teaching Markdown outside the sentinel-bounded Tier 1 list block.
- `tmp/` and every unrelated working-tree change.

---

### Task 1: Establish the Offline Registry Library and Test Harness

**Files:**
- Create: `tools/evidence_registry/__init__.py`
- Create: `tools/evidence_registry/registry.py`
- Create: `tools/evidence_registry/validate.py`
- Create: `tools/evidence_registry/test_registry.py`
- Create: `tools/evidence_registry/fixtures/valid_tier1_registry.json`

**Interfaces:**
- Produces: `ValidationIssue(path: str, message: str, severity: str = "error")`
- Produces: `load_evidence_registry(path: Path) -> dict`
- Produces: `index_sources(registry: dict) -> dict[str, dict]`
- Produces: `normalize_doi(value: str | None) -> str`
- Produces: `normalize_pmid(value: str | int | None) -> str`
- Produces: `normalize_title(value: str | None) -> str`
- Produces: `tier1_sources(registry: dict) -> list[dict]`
- Produces: `tier1_sort_key(source: dict) -> tuple[int, str]`
- Produces: `validate_registry(registry: dict) -> list[ValidationIssue]`
- Produces: `collect_evidence_references(repo_root: Path) -> list[tuple[str, str]]`
- Produces: `build_public_projection(registry: dict) -> dict`

- [ ] **Step 1: Write failing normalization, uniqueness, Tier 1 ordering, and public-projection tests**

Create `tools/evidence_registry/test_registry.py` with a tiny runner that calls every `test_*` function and exits nonzero on the first assertion. Include these exact behaviors:

```python
def test_identifier_normalization():
    assert normalize_doi("https://doi.org/10.1056/NEJMoa051688.") == "10.1056/nejmoa051688"
    assert normalize_pmid("PMID: 16172203") == "16172203"
    assert normalize_pmid(None) == ""
    assert normalize_title("Effectiveness—of  Antipsychotic Drugs.") == "effectiveness of antipsychotic drugs"


def test_tier1_sort_keeps_14a_before_14b():
    rows = [
        {"curriculum": {"tier": 1, "selection": "14b"}},
        {"curriculum": {"tier": 1, "selection": "2"}},
        {"curriculum": {"tier": 1, "selection": "14a"}},
    ]
    assert [r["curriculum"]["selection"] for r in sorted(rows, key=tier1_sort_key)] == ["2", "14a", "14b"]


def test_validation_rejects_duplicate_external_identity_and_zotero_key():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    duplicate = copy.deepcopy(registry["sources"][0])
    duplicate["id"] = "different-id"
    registry["sources"].append(duplicate)
    messages = "\n".join(issue.message for issue in validate_registry(registry))
    assert "duplicate DOI" in messages
    assert "duplicate PMID" in messages
    assert "duplicate Zotero item key" in messages


def test_public_projection_strips_internal_fields():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    public = build_public_projection(registry)
    encoded = json.dumps(public)
    assert '"sources"' in encoded
    assert '"zotero"' not in encoded
    assert '"surveillance"' not in encoded
    assert '"appraisal"' not in encoded
    assert "KL5HP3MU" not in encoded
```

- [ ] **Step 2: Run the test and verify the failure**

Run:

```bash
python3 tools/evidence_registry/test_registry.py
```

Expected: FAIL with `ModuleNotFoundError` because `registry.py` does not exist.

- [ ] **Step 3: Implement the focused standard-library core**

Implement the listed interfaces in `registry.py`. Use these constants and rules rather than registry array order or network data:

```python
SCHEMA_VERSION = 2
SOURCE_TYPES = {
    "primary-study", "systematic-review", "guideline",
    "instrument", "consensus", "other-authoritative",
}
IDENTITY_STATES = {"verified", "exception", "pending"}
ACCESS_LEVELS = {"metadata", "abstract", "fulltext"}
TIER1_SELECTIONS = {
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14a", "14b", "15", "16"
}
FORBIDDEN_TRACKED_KEYS = {
    "attachmentKey", "attachmentPath", "filePath", "fullText",
    "indexedText", "observedAccessStatus",
}
PUBLIC_SOURCE_FIELDS = {"id", "type", "citation", "requiredAccess", "curriculum"}
PUBLIC_CITATION_FIELDS = {"title", "authors", "organization", "year", "journal", "volume", "pages", "doi", "pmid", "url"}
PUBLIC_CURRICULUM_FIELDS = {"tier", "role", "weekNumbers", "topicSlugs", "pairedTools"}
```

`validate_registry()` must aggregate all issues and check:

1. `schemaVersion == 2`, `sources` is non-empty, and every source has `id`, `type`, `citation`, `identity`, `requiredAccess`, and `governance`.
2. Stable IDs match `^[a-z0-9][a-z0-9-]*$` and are unique.
3. Normalized non-empty DOI, PMID, and Zotero parent item keys are unique.
4. Zotero keys match `^[A-Z0-9]{8}$`; BibTeX keys are not accepted in the item-key field.
5. Forbidden attachment/path/text keys are absent recursively.
6. Tier 1 has exactly the `TIER1_SELECTIONS` set, 17 records, and 16 roots after stripping `a`/`b` from selection 14.
7. Every Tier 1 record has a Zotero parent key, verified identity, `requiredAccess: "fulltext"`, a five-field appraisal, curriculum role, `teachingRole`, week list, mapping status, and governance record.
8. Missing PMID is allowed only when a verified DOI is present; Stanley/Brown and Wampold exercise this path.
9. `build_public_projection()` recursively copies only the allow-listed source, citation, and curriculum subfields and never mutates the canonical object. Faculty mapping notes/status, Zotero keys/tags, appraisals, surveillance configuration, and governance internals remain excluded.

`collect_evidence_references()` must enumerate `evidenceIds` from `topic_meta.json`, `tool_registry.json`, `communication_cases.json`, `reasoning_cases.json`, `reasoning_cases_resident.json`, and `family_systems_scenarios.json`, returning `(source_path, evidence_id)` pairs.

- [ ] **Step 4: Add the offline CLI**

`validate.py` must accept:

```text
python3 tools/evidence_registry/validate.py [--repo-root PATH] [--check-generated]
```

It loads the canonical registry, calls `validate_registry()`, verifies every collected foreign key, optionally checks generated views, prints every issue, and exits 1 on any error. It must never import `zotero_reconcile.py`.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
python3 tools/evidence_registry/test_registry.py
```

Expected: `test_registry: OK`.

- [ ] **Step 6: Commit the testable core**

```bash
git add tools/evidence_registry/__init__.py tools/evidence_registry/registry.py tools/evidence_registry/validate.py tools/evidence_registry/test_registry.py tools/evidence_registry/fixtures/valid_tier1_registry.json
git commit -m "test: establish evidence registry contract"
```

---

### Task 2: Replace the Flat Schema and Preserve the Existing 10 Sources

**Files:**
- Modify: `evidence_registry.schema.json`
- Modify: `evidence_registry.json`
- Modify: `tools/evidence_registry/test_registry.py`

**Interfaces:**
- Consumes: `validate_registry(registry) -> list[ValidationIssue]`
- Preserves: all current IDs referenced by curriculum/tool/case records.

- [ ] **Step 1: Add a failing migration-compatibility test**

Assert that the canonical registry retains this exact existing ID set:

```python
EXISTING_IDS = {
    "cssrs-columbia-lighthouse", "va-dod-suicide-cpg-2024",
    "joint-commission-suicide-prevention", "nice-violence-aggression-ng10",
    "apa-violence-risk-assessment-2011", "asam-alcohol-withdrawal-2020",
    "bap-catatonia-2023", "nice-delirium-cg103",
    "project-beta-deescalation-2012", "project-beta-psychopharm-agitation-2012",
}
assert EXISTING_IDS <= set(index_sources(load_evidence_registry(REGISTRY_PATH)))
```

- [ ] **Step 2: Run it and verify it fails against the old contract**

Run `python3 tools/evidence_registry/test_registry.py`.

Expected: FAIL because the canonical file has no `schemaVersion: 2` and uses the old flat fields.

- [ ] **Step 3: Replace the schema with the nested Draft 7 contract**

Keep top-level `sources`, add `schemaVersion`, `owner`, `updated`, and top-level `surveillance`. Define `additionalProperties: false` at every tracked object. Required source objects use:

```json
{
  "id": "stable-kebab-id",
  "type": "guideline",
  "citation": {
    "title": "Display title",
    "authors": [],
    "organization": "Authoritative organization",
    "year": 2024,
    "journal": "",
    "volume": "",
    "pages": "",
    "doi": "",
    "pmid": "",
    "url": "https://authoritative.example/"
  },
  "identity": {
    "status": "pending",
    "source": "legacy-migration",
    "verifiedAt": "",
    "note": "Faculty review status was preserved; bibliographic identity was not inferred."
  },
  "requiredAccess": "metadata",
  "governance": {
    "evidenceLevel": "clinical practice guideline",
    "facultyReviewStatus": "reviewed",
    "lastReviewed": "2026-07-07",
    "reviewCadence": "annual",
    "supersededBy": [],
    "correctionStatus": "none-known",
    "localPolicyDependent": true,
    "relatedTopicTags": [],
    "clerkshipRelevance": "Preserved legacy wording.",
    "shelfComatRelevance": "High",
    "clinicalWorkflowRelevance": "High"
  }
}
```

`curriculum`, `appraisal`, `zotero`, and per-source `surveillance` remain optional generally but become required by the offline validator for Tier 1 or monitored sources as appropriate.

Define `citation.authors` as structured objects, not display strings:

```json
"authors": [
  {"family": "Lieberman", "given": "Jeffrey A."}
]
```

Each author object permits only `family` and `given`; `family` is required. Organization-authored guidance may use an empty authors array plus non-empty `organization`. Tier 1 records require at least one structured author, a full authoritative journal name, and the publication year.

- [ ] **Step 4: Migrate the 10 sources without inventing identity verification**

Move every existing field into the nested shape. Preserve titles, organizations, URLs, dates, relevance text, risk dependence, tags, review cadence, and faculty-review status byte-for-byte in meaning. Set `identity.status` to `pending` unless DOI/PMID/title identity is independently documented; never convert `facultyReviewStatus: reviewed` into bibliographic verification.

- [ ] **Step 5: Run the registry and existing foreign-key checks**

Run:

```bash
python3 tools/evidence_registry/test_registry.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
```

Expected: registry unit tests pass; topic validator ends with `topic_meta.json OK — 65 topics, contract satisfied.`

- [ ] **Step 6: Commit the compatibility-preserving migration**

```bash
git add evidence_registry.json evidence_registry.schema.json tools/evidence_registry/test_registry.py
git commit -m "refactor: version the evidence registry schema"
```

---

### Task 3: Add the 17 Tier 1 Articles With Verified Zotero Parent Keys

**Files:**
- Modify: `evidence_registry.json`
- Modify: `tools/evidence_registry/test_registry.py`

**Interfaces:**
- Produces: 17 Tier 1 records using the exact seed table in Appendix A.
- Produces: explicit `curriculum.mappingStatus` values: `mapped`, `needs-faculty-confirmation`, or `citation-conflict`.

- [ ] **Step 1: Add failing canonical-count and identity tests**

```python
def test_canonical_tier1_contract():
    registry = load_evidence_registry(REGISTRY_PATH)
    rows = tier1_sources(registry)
    assert len(rows) == 17
    assert {r["curriculum"]["selection"] for r in rows} == TIER1_SELECTIONS
    assert len({r["zotero"]["itemKey"] for r in rows}) == 17
    assert all(r["identity"]["status"] == "verified" for r in rows)
    assert all("expectedTags" not in r["zotero"] for r in rows)
```

- [ ] **Step 2: Run the test and verify the 17-record failure**

Run `python3 tools/evidence_registry/test_registry.py`.

Expected: FAIL because no Tier 1 records exist yet.

- [ ] **Step 3: Add the exact bibliographic/linkage seeds**

For each Appendix A row, add a record with normalized DOI, PMID when available, the authoritative full title and journal name, structured authors, verified title/first-author/year identity, `requiredAccess: "fulltext"`, `zotero.libraryType: "user"`, `zotero.libraryId: 0`, and the exact parent `itemKey`. Copy the current Tier 1 table's `Why` wording into `curriculum.teachingRole`; initialize `topicSlugs` and `pairedTools` as reviewed arrays rather than deriving them from title keywords. The three expected tags belong only in `zotero_config.json`, not in every evidence record. Use `data.creators` semantics in later reconciliation; do not store `meta.creatorSummary`.

All 17 keep `curriculum.role: "required"` because the current Tier 1 list says every trainee reads them. Week mappings come only from tracked curriculum files:

- Mapped: Engel/Rosenhan/Appelbaum → Week 1; CATIE/STAR*D/Bush → Week 2; Stanley/Wampold/Linehan → Week 3; Brown/Pharoah → Week 4; Franklin/Volkow → Week 5; Felitti → Week 6.
- `needs-faculty-confirmation`: TADS, Caspi, and Border. Zotero/stash suggestions are advisory and cannot silently become repository curriculum decisions.
- `citation-conflict`: Brown/Birley/Wing 1972 remains the Tier 1/Zotero identity, while the mapping note records that the Week 4 page names Brown 1962. Do not rewrite either source in this milestone.

- [ ] **Step 4: Populate appraisal fields from the linked source, with a faculty gate**

Every Tier 1 record must contain non-empty `studyDesign`, `population`, `comparator`, `outcomes`, and `limitations`, plus `reviewStatus`. Draft these only from the article abstract/full text already accessible through the linked Zotero record or authoritative DOI/PubMed metadata. Use `"Not applicable — conceptual/review article"` when a field truly does not apply; never invent a sample or comparator. If a required field cannot be established from a verified source, emit a hard `appraisal-incomplete` error and stop rather than inserting `unknown`, a guess, or placeholder prose.

Set `appraisal.reviewStatus: "pending-faculty-review"` until Joshua Moss, MD reviews the 17-record diff. Identity verification may pass while appraisal review remains pending; these are deliberately separate states.

- [ ] **Step 5: Run the offline gate and inspect all warnings**

Run:

```bash
python3 tools/evidence_registry/validate.py
```

Expected final summary: `evidence registry OK — 27 sources, 17 Tier 1 articles, 16 numbered selections`, with explicit non-fatal mapping warnings for TADS, Caspi, Border, and Brown 1962/1972.

- [ ] **Step 6: Obtain and record the faculty appraisal review**

Review all five appraisal fields for each article. After approval, change only `appraisal.reviewStatus` and `appraisal.reviewedAt`; do not modify clinical teaching pages. Re-run the offline gate.

- [ ] **Step 7: Commit the Tier 1 spine**

```bash
git add evidence_registry.json tools/evidence_registry/test_registry.py
git commit -m "feat: add the Tier 1 evidence spine"
```

---

### Task 4: Generate Only the Tier 1 Views Deterministically

**Files:**
- Modify: `tools/evidence_registry/registry.py`
- Modify: `tools/evidence_registry/test_registry.py`
- Modify: `07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md`
- Create: `07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md`
- Modify: `07_Evidence_and_Reading/README.md`

**Interfaces:**
- Produces: `render_tier1_download_block(records: list[dict]) -> str`
- Produces: `render_tier1_curriculum_map(records: list[dict]) -> str`
- Produces: `replace_generated_block(text: str, start: str, end: str, replacement: str) -> str`
- Produces: `generated_outputs(repo_root: Path) -> dict[Path, str]`
- Produces: CLI `python3 tools/evidence_registry/registry.py generate [--check]`

- [ ] **Step 1: Add failing preservation and determinism tests**

```python
def test_tier1_replacement_preserves_manual_tail():
    original = "head\n<!-- evidence-registry:tier1:start -->\nold\n<!-- evidence-registry:tier1:end -->\nTAIL\n"
    updated = replace_generated_block(original, TIER1_START, TIER1_END, "new\n")
    assert updated.endswith("TAIL\n")
    assert "old" not in updated
    assert "new" in updated


def test_generated_views_have_no_timestamp_or_live_access_state():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    text = render_tier1_curriculum_map(tier1_sources(registry))
    assert "Generated:" not in text
    assert "pdf_attached" not in text
    assert "metadata_only" not in text
    assert "14a" in text and "14b" in text
```

- [ ] **Step 2: Run tests and verify missing renderer failures**

Run `python3 tools/evidence_registry/test_registry.py`.

Expected: FAIL because the renderer interfaces do not exist.

- [ ] **Step 3: Implement bounded generation**

Add these markers around only the current Tier 1 section:

```markdown
<!-- evidence-registry:tier1:start -->
<!-- Generated from evidence_registry.json by tools/evidence_registry/registry.py. Do not hand-edit this block. -->
...
<!-- evidence-registry:tier1:end -->
```

The download table columns are `Selection`, `Citation`, `Title`, `Read for`, and `Required access`. It shows DOI/PubMed links from the registry but never observed PDF state.

The faculty map columns are `Selection`, `Evidence ID`, `Week`, `Role`, `Mapping status`, `Teaching role`, and `Zotero parent key`. This file is faculty-facing and may include the parent item key, but not attachment child keys or paths. Display the Brown conflict and the three pending week decisions explicitly.

`generate --check` computes outputs in memory and exits 1 with exact regeneration paths; it never writes. Plain `generate` writes only the bounded Tier 1 block and the faculty map.

- [ ] **Step 4: Generate once, then prove check mode is clean**

Run:

```bash
python3 tools/evidence_registry/registry.py generate
python3 tools/evidence_registry/registry.py generate --check
```

Expected: first command writes two tracked views; second prints `generated evidence views are current` and exits 0.

- [ ] **Step 5: Prove the manual tail and workbook are unchanged**

Run:

```bash
git diff -- 07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_Checklist.xlsx
git diff -- 07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md
```

Expected: no workbook diff; Markdown diff is confined to the Tier 1 markers/block and the stale 15/16 wording correction.

- [ ] **Step 6: Commit the generated views**

```bash
git add tools/evidence_registry/registry.py tools/evidence_registry/test_registry.py 07_Evidence_and_Reading/README.md 07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md 07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md
git commit -m "feat: generate Tier 1 evidence views"
```

---

### Task 5: Build the Read-Only Zotero Reconciliation Bridge

**Files:**
- Create: `tools/evidence_registry/zotero_reconcile.py`
- Create: `tools/evidence_registry/zotero_config.json`
- Create: `tools/evidence_registry/fixtures/zotero_snapshot_valid.json`
- Create: `tools/evidence_registry/fixtures/zotero_snapshot_identity_drift.json`
- Create: `tools/evidence_registry/fixtures/zotero_snapshot_ambiguous.json`
- Create: `tools/evidence_registry/fixtures/zotero_snapshot_attachment_states.json`
- Modify: `tools/evidence_registry/test_registry.py`

**Interfaces:**
- Produces: `api_get(path: str, base_url: str, timeout: float = 5.0) -> object`
- Produces: `fetch_all(path: str, base_url: str) -> list[dict]`
- Produces: `snapshot_library(config: dict) -> dict`
- Produces: `sanitize_snapshot(snapshot: dict) -> dict`
- Produces: `creator_family(creators: list[dict]) -> str`
- Produces: `publication_year(value: str | int | None) -> str`
- Produces: `reconcile_registry(registry: dict, snapshot: dict, config: dict) -> ReconciliationResult`
- Produces: `inspect_attachment_children(parent_key: str, children: list[dict], explicit: bool) -> dict`
- Produces subcommands: `status`, `snapshot`, `check`, `check --attachments`, and `report`.

- [ ] **Step 1: Write failing fixture tests for identity, ambiguity, tags, collections, and attachments**

Cover these exact cases:

```python
def test_matching_key_and_tags_pass_with_empty_week_collections():
    result = reconcile_registry(REGISTRY, VALID_SNAPSHOT, CONFIG)
    assert result.errors == []
    assert any(w.code == "week-collection-advisory" for w in result.warnings)


def test_stored_key_identity_drift_is_hard_error():
    result = reconcile_registry(REGISTRY, IDENTITY_DRIFT, CONFIG)
    assert "identity-conflict" in {e.code for e in result.errors}


def test_fallback_never_guesses_between_two_title_candidates():
    result = reconcile_registry(UNLINKED_REGISTRY, AMBIGUOUS_SNAPSHOT, CONFIG)
    assert "ambiguous" in {e.code for e in result.errors}


def test_note_child_does_not_count_as_pdf():
    status = inspect_attachment_children("KL5HP3MU", NOTE_ONLY_CHILDREN, explicit=True)
    assert status["state"] == "metadata_only"


def test_config_is_the_only_expected_tag_authority():
    assert set(CONFIG["expectedTier1Tags"]) == {"Tier 1", "MS3-required", "landmark"}
    assert all("expectedTags" not in row.get("zotero", {}) for row in tier1_sources(REGISTRY))


def test_sanitization_rejects_paths_and_extracted_text():
    try:
        sanitize_snapshot({"filePath": "/Users/example/paper.pdf", "fullText": "licensed text"})
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe snapshot fields must be rejected")
```

Also cover imported PDF, linked PDF, linked URL, HTML snapshot, zero-byte PDF, a valid scanned PDF without indexed text, and preservation of the prior observed status when attachment inspection was not requested. Use plain assertions; do not add pytest as a dependency.

- [ ] **Step 2: Run tests and verify the missing bridge failure**

Run `python3 tools/evidence_registry/test_registry.py`.

Expected: FAIL because `zotero_reconcile.py` does not exist.

- [ ] **Step 3: Add exact read-only configuration**

Create `zotero_config.json` with:

```json
{
  "baseUrl": "http://127.0.0.1:23119",
  "apiVersion": "3",
  "library": {"type": "user", "id": 0},
  "rootCollection": {"key": "ZD6GBSYZ", "name": "Psychiatry Clerkship Library"},
  "weekCollections": [
    {"week": 1, "key": "5KLVFZDV", "name": "Week 1 - Foundations"},
    {"week": 2, "key": "DS6JSHHX", "name": "Week 2 - Mood Psychosis Pharm"},
    {"week": 3, "key": "HIKYWT9S", "name": "Week 3 - Psychotherapy Personality"},
    {"week": 4, "key": "K78U3AD4", "name": "Week 4 - Family Systems EE"},
    {"week": 5, "key": "F7SMP42D", "name": "Week 5 - Acute Emergency"},
    {"week": 6, "key": "LUUFRIE9", "name": "Week 6 - Integration Exam"}
  ],
  "expectedTier1Tags": ["Tier 1", "MS3-required", "landmark"]
}
```

- [ ] **Step 4: Implement safe API reads and deterministic reconciliation**

Use only these routes:

```text
GET /api/
GET /connector/ping
GET /api/users/0/collections
GET /api/users/0/items/top?limit=100&start=<offset>
GET /api/users/0/items/<parentKey>/children   # only with --attachments
GET /api/users/0/items/<attachmentKey>/file/view/url   # only with --attachments
```

Add `Zotero-API-Version: 3`. Paginate until a page contains fewer than 100 items. Parse creators from `data.creators`; parse PMID from `data.archiveLocation` in the form `PMID:<number>`.

Reconciliation order is stored parent key → DOI → PMID → unique normalized title/first-author/year. Every stored-key match verifies DOI, PMID when present, title, first author, year, and journal. A stored-key mismatch is an error, not permission to relink. Collection key/name mismatch is a configuration error. Empty week collections are warnings. Missing required Tier 1 tags are errors; extra tags are allowed.

Attachment inspection runs only when the caller explicitly supplies `--attachments`. `numChildren` is never proof of a PDF. Report `pdf_attached` from an attachment child; report `pdf_verified` only after file existence, nonzero size, and `%PDF-` signature checks; report `pdf_indexed` separately when indexed-text metadata exists. A scanned PDF may be verified without being indexed. Skipping an attachment check must preserve the previous observed state rather than downgrade it. Return only state, content type, byte count, and timestamps—never the file URL/path.

- [ ] **Step 5: Run all offline fixtures with Zotero closed or irrelevant**

Run:

```bash
python3 tools/evidence_registry/test_registry.py
python3 tools/evidence_registry/zotero_reconcile.py check --snapshot tools/evidence_registry/fixtures/zotero_snapshot_valid.json
```

Expected: unit tests pass; fixture check reports 17 matched records, zero errors, and advisory empty week collections.

- [ ] **Step 6: Commit the read-only bridge**

```bash
git add tools/evidence_registry/zotero_reconcile.py tools/evidence_registry/zotero_config.json tools/evidence_registry/fixtures tools/evidence_registry/test_registry.py
git commit -m "feat: add read-only Zotero reconciliation"
```

---

### Task 6: Add Ignored Local Reports and Perform the Live Zotero Check

**Files:**
- Modify: `.gitignore`
- Create: `tools/evidence_registry/README.md`
- Create: `tools/evidence_registry/requirements-local.txt`
- Modify: `tools/evidence_registry/zotero_reconcile.py`
- Outputs, ignored: `outputs/evidence_registry/*`

**Interfaces:**
- Produces: `write_reports(result, output_dir, include_xlsx=False) -> list[Path]`
- Produces: local JSON, Markdown, CSV, and optional Tier 1-only XLSX.

- [ ] **Step 1: Add an ignored-output and sanitization test**

Write a report into a temporary directory. Assert JSON/Markdown/CSV contain stable evidence IDs and parent item keys but contain none of `/Users/`, `file://`, `attachmentKey`, `fullText`, or licensed text. Add a stubbed connection-refused test proving `status` exits with the actionable state `api_unavailable`, writes no snapshot/report, and has no effect on `validate.py` or generated-view checks.

- [ ] **Step 2: Implement reports and local-only workbook support**

Add `/outputs/evidence_registry/` to `.gitignore`.

`report` writes:

```text
outputs/evidence_registry/current_snapshot.json
outputs/evidence_registry/reconciliation_report.json
outputs/evidence_registry/reconciliation_report.md
outputs/evidence_registry/Tier1_Primary_Source_Download_Checklist.csv
```

`report --xlsx` additionally writes `Tier1_Primary_Source_Download_Checklist.xlsx`. Import `openpyxl` only inside the XLSX function and emit this exact actionable error if absent: `XLSX output requires: python3 -m pip install -r tools/evidence_registry/requirements-local.txt`. Never call XLSX generation from CI.

`requirements-local.txt` contains exactly:

```text
openpyxl>=3.1,<4
```

- [ ] **Step 3: Document the authority and privacy boundary**

README commands must distinguish:

```bash
python3 tools/evidence_registry/validate.py --check-generated       # offline CI/build gate
python3 tools/evidence_registry/zotero_reconcile.py status          # local read-only probe
python3 tools/evidence_registry/zotero_reconcile.py snapshot        # ignored metadata snapshot
python3 tools/evidence_registry/zotero_reconcile.py check           # identity/tags/collections
python3 tools/evidence_registry/zotero_reconcile.py check --attachments
python3 tools/evidence_registry/zotero_reconcile.py report --xlsx
```

State that `zotero://select/library/items/<parentKey>` is faculty-local, item keys differ from BibTeX keys, and no report is curriculum authority.

- [ ] **Step 4: Run the live read-only acceptance check**

Run locally with Zotero Desktop open:

```bash
python3 tools/evidence_registry/zotero_reconcile.py status
python3 tools/evidence_registry/zotero_reconcile.py snapshot
python3 tools/evidence_registry/zotero_reconcile.py check
python3 tools/evidence_registry/zotero_reconcile.py check --attachments
python3 tools/evidence_registry/zotero_reconcile.py report --xlsx
```

Expected live result:

- Zotero 9.0.4 / local API v3 / connector reachable.
- 17 of 17 parent items match the Appendix A keys and bibliographic identity.
- All 17 have `Tier 1`, `MS3-required`, and `landmark` tags.
- Week collections are empty and reported only as advisory drift.
- Seven records report a PDF child: CATIE, STAR*D, Pharoah, TADS, Felitti, Border, and Volkow.
- Ten records remain metadata-only unless explicit attachment verification shows otherwise.

- [ ] **Step 5: Prove local artifacts stay out of Git**

Run `git status --short`.

Expected: no `outputs/evidence_registry/` paths and no PDF/full-text files.

- [ ] **Step 6: Commit the local workflow, not its output**

```bash
git add .gitignore tools/evidence_registry/README.md tools/evidence_registry/requirements-local.txt tools/evidence_registry/zotero_reconcile.py tools/evidence_registry/test_registry.py
git commit -m "docs: add the local Zotero evidence workflow"
```

---

### Task 7: Merge Surveillance Authority Into the Canonical Registry

**Files:**
- Modify: `evidence_registry.json`
- Modify: `evidence_registry.schema.json`
- Modify: `tools/evidence_registry/registry.py`
- Modify: `tools/evidence_registry/test_registry.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/build_status.py`
- Modify: surveillance documentation/workflow comments listed in File Structure.
- Delete after parity: `13_Faculty_Resources/_automation/surveillance/config/source_registry.yaml`

**Interfaces:**
- Produces: `build_surveillance_projection(registry: dict) -> dict`
- Preserves: `load_registry() -> dict` for every existing surveillance consumer.
- Extends: `validate.py --compare-legacy-surveillance PATH` for a one-time, explicitly invoked PyYAML parity check; normal validation remains standard-library only.

- [ ] **Step 1: Add failing projection tests**

Permanent tests assert that the projection has exact source IDs:

```python
SURVEILLANCE_IDS = {
    "fda-drug-safety", "clozapine-rems", "spravato-rems",
    "apa-practice-guidelines", "dsm-5-tr", "uspstf-mental-health",
    "samhsa-guidelines", "aacap-parameters",
}
projection = build_surveillance_projection(load_evidence_registry(REGISTRY_PATH))
assert {s["id"] for s in projection["sources"]} == SURVEILLANCE_IDS
assert projection["link_monitor"]["cadence"] == "weekly"
assert projection["resource_intake"]["max_candidates_per_run"] == 25
```

- [ ] **Step 2: Add the eight monitored sources and global operational settings**

Add eight `other-authoritative` sources with the exact legacy IDs, names, URLs, and nested `surveillance` values. Set `identity.status: "exception"` with the note `authoritative monitoring endpoint; bibliographic article identity not applicable` where appropriate.

Move YAML `defaults`, `link_monitor`, and `resource_intake` into the top-level canonical `surveillance` object. Keep the legacy snake-case projection keys because existing collectors consume them.

The canonical registry now contains exactly 35 sources: 10 existing + 17 Tier 1 + 8 monitored.

- [ ] **Step 3: Prove one-time exact parity before deletion**

Add `--compare-legacy-surveillance PATH` to `validate.py`. Import `yaml` only inside that flag's branch, load the legacy file, compare it with `build_surveillance_projection(load_evidence_registry(...))`, and use `difflib.unified_diff()` over sorted, indented JSON when they differ. Normal validation and CI must never import PyYAML.

Run:

```bash
python3 tools/evidence_registry/validate.py --compare-legacy-surveillance 13_Faculty_Resources/_automation/surveillance/config/source_registry.yaml
```

Expected: `legacy surveillance projection matches canonical registry` and exit 0 for `defaults`, eight `sources`, `link_monitor`, and `resource_intake`. If it differs, print the field-level diff and stop. Do not delete the YAML until equality passes.

- [ ] **Step 4: Cut existing consumers over without changing their interface**

In `lib_surveillance.py`, set the canonical registry path to the repository root and implement:

```python
def load_registry(path=EVIDENCE_REGISTRY):
    sys.path.insert(0, os.path.join(LIB_ROOT, "tools", "evidence_registry"))
    from registry import build_surveillance_projection, load_evidence_registry
    return build_surveillance_projection(load_evidence_registry(Path(path)))
```

Use a clean path/import arrangement with `Path`; do not hard-code `/Users/...`.

Change `run_citation_check.py` and `build_status.py` so canonical load failures exit nonzero instead of silently skipping sources or freshness. Preserve collector output schemas and all history/baseline IDs.

- [ ] **Step 5: Delete the legacy YAML and remove PyYAML-only workflow installs**

Delete `source_registry.yaml` only now. Remove `pip install --quiet pyyaml` from the citation, guideline, and resource-intake workflows. Update every stale “YAML single source of truth” path/comment in the surveillance README, ADR, collector docstrings, schema notes, citation index note, and Apify examples.

- [ ] **Step 6: Run offline surveillance verification**

Run:

```bash
python3 tools/evidence_registry/test_registry.py
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
```

Expected: registry tests pass; citation self-test reports two DOI examples, two PMID examples, stable fingerprints, and canonical-registry projection success.

- [ ] **Step 7: Commit the authority cutover**

```bash
git add evidence_registry.json evidence_registry.schema.json tools/evidence_registry/registry.py tools/evidence_registry/test_registry.py 13_Faculty_Resources/_automation/surveillance .github/workflows/surveillance-citations.yml .github/workflows/surveillance-guideline.yml .github/workflows/surveillance-resource-intake.yml
git commit -m "refactor: make the evidence registry surveillance authority"
```

---

### Task 8: Publish a Safe Projection and Wire the Offline Gates Into CI

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/validate_topic_meta.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `tools/evidence_registry/test_registry.py`

**Interfaces:**
- Consumes: `build_public_projection(registry) -> dict`
- Consumes: `index_sources(registry) -> dict[str, dict]`
- Adds no network or new CI dependency.

- [ ] **Step 1: Add a failing built-output privacy test**

Build the public projection into a temporary directory and assert:

```python
encoded = json.dumps(build_public_projection(load_evidence_registry(REGISTRY_PATH)))
for forbidden in ("itemKey", "expectedTags", "surveillance", "appraisal", "attachment"):
    assert forbidden not in encoded
assert '"sources"' in encoded
assert '"id"' in encoded
```

- [ ] **Step 2: Replace the raw registry copy in `build_deploy.py`**

At the current registry-copy block, add the repository-relative tools directory to `sys.path`, import `build_public_projection` and `load_evidence_registry`, and write the allow-listed object with sorted keys and a trailing newline:

```python
_evidence_tools = os.path.join(LIB, "tools", "evidence_registry")
if _evidence_tools not in sys.path:
    sys.path.insert(0, _evidence_tools)
from registry import build_public_projection, load_evidence_registry

_canonical_evidence = load_evidence_registry(Path(LIB) / "evidence_registry.json")
with open(os.path.join(OUT, "evidence_registry.json"), "w", encoding="utf-8") as _fh:
    json.dump(build_public_projection(_canonical_evidence), _fh, indent=2, sort_keys=True)
    _fh.write("\n")
```

Import `Path` from `pathlib` if the build file does not already do so. Continue copying all other registries as before. Never copy the internal file directly.

- [ ] **Step 3: Make `validate_topic_meta.py` use the shared ID index**

Replace its local registry parsing/duplicate logic with repository-relative imports of `load_evidence_registry()` and `index_sources()`. Treat an empty registry as an error; always validate every evidence foreign key. Preserve the existing validator's output text and checks outside the evidence-loading block.

- [ ] **Step 4: Add check-only gates**

Immediately before the current topic validator in `build_and_check.sh`:

```bash
python3 "$LIB/tools/evidence_registry/validate.py" --repo-root "$LIB" --check-generated
```

In `.github/workflows/ci.yml`, after the media guard and before topic validation:

```yaml
- name: Unit — evidence registry
  run: python3 tools/evidence_registry/test_registry.py

- name: Validate — evidence registry and generated views
  run: python3 tools/evidence_registry/validate.py --check-generated

- name: Unit — citation surveillance
  run: python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
```

- [ ] **Step 5: Run targeted gates**

Run:

```bash
python3 tools/evidence_registry/test_registry.py
python3 tools/evidence_registry/validate.py --check-generated
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
python3 13_Faculty_Resources/_automation/site_build/test_media_guard.py
```

Expected: all exit 0; evidence summary reports 35 sources/17 articles/16 selections; topic metadata reports 65 topics.

- [ ] **Step 6: Commit CI/build integration**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/validate_topic_meta.py 13_Faculty_Resources/_automation/site_build/build_and_check.sh .github/workflows/ci.yml tools/evidence_registry/test_registry.py
git commit -m "ci: gate evidence identity and generated views"
```

---

### Task 9: Run the Full Milestone 1 Acceptance Gate

**Files:**
- Verify all Milestone 1 files.
- Do not add generated Zotero outputs.

- [ ] **Step 1: Run the full offline evidence suite**

```bash
python3 tools/evidence_registry/test_registry.py
python3 tools/evidence_registry/validate.py --check-generated
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
```

Expected: zero failures; no network access.

- [ ] **Step 2: Run both publish gates**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected final lines: `build_and_check: ms3 OK` and `build_and_check: res OK`.

- [ ] **Step 3: Inspect the built public projection**

Confirm both `_build/ms3/evidence_registry.json` and `_build/res/evidence_registry.json` contain stable IDs and citations but no Zotero keys, expected tags, appraisal, surveillance settings, attachment data, or paths.

- [ ] **Step 4: Re-run the live read-only Zotero check**

```bash
python3 tools/evidence_registry/zotero_reconcile.py status
python3 tools/evidence_registry/zotero_reconcile.py check
python3 tools/evidence_registry/zotero_reconcile.py report
```

Expected: 17/17 matched, all required tags present, empty week collections advisory only, seven PDF children reported without paths. If Zotero is unavailable, record the local check as blocked; offline acceptance remains valid.

- [ ] **Step 5: Audit the Git boundary**

Run:

```bash
git status --short
git diff --check
git diff --name-only
```

Confirm:

- no `outputs/evidence_registry/` files;
- no PDFs, full text, attachment keys/paths, or unrelated `tmp/` changes;
- no diff to the tracked 45-row workbook;
- no clinical prose, claim, review, or attestation files;
- generated Tier 1 files pass `--check`.

- [ ] **Step 6: Produce the milestone review handoff**

Report separately:

1. Offline gate results.
2. Live Zotero result and its timestamp.
3. Seven PDF-child versus ten metadata-only counts, explicitly noting that a child is not full-text verification unless `--attachments` passed.
4. Brown 1962/1972 decision and any pending week assignments.
5. Exact deferred scope: high-risk claims, review hashes, question-bank traceability, full 50-paper migration, article cards, and Zotero writes.

---

## Appendix A: Exact Tier 1 Identity and Zotero Seed Table

| Selection | Stable evidence ID | Year / first author | DOI | PMID | Zotero parent key | Current tracked week |
|---|---|---|---|---|---|---|
| 1 | `engel-1977-biopsychosocial-model` | Engel 1977 | `10.1126/science.847460` | `847460` | `KL5HP3MU` | 1 |
| 2 | `rosenhan-1973-sane-places` | Rosenhan 1973 | `10.1126/science.179.4070.250` | `4683124` | `TSN2F24F` | 1 |
| 3 | `appelbaum-grisso-1988-capacity` | Appelbaum 1988 | `10.1056/NEJM198812223192504` | `3200278` | `S6MZZGRA` | 1 |
| 4 | `stanley-brown-2012-safety-planning` | Stanley 2012 | `10.1016/j.cbpra.2011.01.001` | — | `IDSQYW4X` | 3 |
| 5 | `lieberman-2005-catie` | Lieberman 2005 | `10.1056/NEJMoa051688` | `16172203` | `2TPA9P9D` | 2 |
| 6 | `rush-2006-stard` | Rush 2006 | `10.1176/ajp.2006.163.11.1905` | `17074942` | `LGJ9CSR3` | 2 |
| 7 | `brown-1972-expressed-emotion` | Brown 1972 | `10.1192/bjp.121.3.241` | `5073778` | `E8BCCFSN` | 4; conflict note required |
| 8 | `bush-1996-catatonia-rating-scale` | Bush 1996 | `10.1111/j.1600-0447.1996.tb09814.x` | `8686483` | `5DH2GK2V` | 2 |
| 9 | `wampold-1997-bona-fide-psychotherapies` | Wampold 1997 | `10.1037/0033-2909.122.3.203` | — | `PDWXBEMZ` | 3 |
| 10 | `linehan-1991-dbt` | Linehan 1991 | `10.1001/archpsyc.1991.01810360024003` | `1845222` | `SHMA7MDE` | 3 |
| 11 | `pharoah-2010-family-intervention` | Pharoah 2010 | `10.1002/14651858.CD000088.pub2` | `21154340` | `P4M5H9VM` | 4 |
| 12 | `march-2004-tads` | March 2004 | `10.1001/jama.292.7.807` | `15315995` | `6DTR4GC8` | needs faculty confirmation |
| 13 | `felitti-1998-ace` | Felitti 1998 | `10.1016/s0749-3797(98)00017-8` | `9635069` | `ZT9DMH79` | 6 |
| 14a | `caspi-2003-5htt-stress` | Caspi 2003 | `10.1126/science.1083968` | `12869766` | `ZTWERT6K` | needs faculty confirmation |
| 14b | `border-2019-candidate-gene` | Border 2019 | `10.1176/appi.ajp.2018.18070881` | `30845820` | `XRADQ2TY` | needs faculty confirmation |
| 15 | `franklin-2017-suicide-risk-meta-analysis` | Franklin 2017 | `10.1037/bul0000084` | `27841450` | `FP88WVWT` | 5 |
| 16 | `volkow-2016-addiction-brain-disease` | Volkow 2016 | `10.1056/NEJMra1511480` | `26816013` | `9FCMTHM2` | 5 |

All 17 currently have the Zotero tags `Tier 1`, `MS3-required`, and `landmark`; actual collection membership is empty and advisory.

## Execution Review Gates

- Gate A, after Task 3: faculty reviews appraisal fields, the Brown citation conflict, and the three unmapped week records.
- Gate B, after Task 6: evidence steward reviews the live reconciliation report; no Zotero write is authorized.
- Gate C, after Task 7: surveillance parity must be exact before YAML deletion.
- Gate D, after Task 9: targeted and full build evidence is reported separately from any unrelated baseline failure.
