# Evidence Reliability and Zotero Integration Design

Date: 2026-07-12
Repo: Psychiatry Clerkship Library
Status: Draft pending written specification review

## Plain-language summary

Create one master evidence catalog inside the repository and connect each primary article to its real Zotero record. The repository remains the authority for curriculum choices, clinical-risk labels, claim-to-source links, and faculty approval. Zotero remains the authority for the reference item, its actual tags and collection membership, and licensed full-text attachments; the repository remains authoritative for the intended curriculum week.

The Tier 1 article list, faculty curriculum map, and download checklist are generated from the catalog instead of being edited separately. High-risk clinical statements receive a narrower claim-to-source record. Faculty approval is bound to a content fingerprint, so an edit automatically returns affected material to pending review. Migration of the full 50-paper landmark spine follows only after Tier 1 and the high-risk gates are stable.

## Selected approach

Use the approved hybrid approach:

- One canonical evidence registry for primary studies, systematic reviews, guidelines, instruments, and other authoritative sources.
- Claim-level traceability only for high-risk clinical statements, rather than for every educational sentence.
- Zotero integration through its local read-only API, with no automatic changes to the Zotero library in the initial scope.
- Hash-bound faculty attestation, with `reviewed.json` as the only review authority.
- Deterministic Tier 1 views first, with the broader landmark library and six-week curriculum migrating only in later reviewed slices.

This avoids the recurring drift of patching several lists while keeping the first implementation substantially smaller than a full knowledge graph.

## Goals

- Reconcile the 17 Tier 1 articles that currently occupy 16 numbered reading selections.
- Give every Tier 1 article a stable evidence ID and a verified bibliographic identity.
- Link every Tier 1 article to one Zotero parent item key and validate its current Tier 1 tags.
- Distinguish metadata presence, abstract verification, attachment presence, and verified full text.
- Generate the Tier 1 article list, faculty curriculum map, and compatibility checklist from the registry.
- Trace high-risk clinical claims to evidence and local-policy records.
- Make clinical review expire automatically when reviewable content or supporting evidence changes.
- Keep licensed article PDFs and extracted full text out of Git.
- Keep CI fully functional when Zotero Desktop is closed or unavailable.

## Non-goals

- Do not make Zotero the curriculum source of truth.
- Do not automatically edit, move, import, or delete Zotero items or collections.
- Do not store Zotero attachment paths, PDF bytes, or extracted article text in tracked files.
- Do not add claim-level records for ordinary explanatory prose in the first release.
- Do not rewrite clinical recommendations as part of the infrastructure work.
- Do not replace faculty judgment with bibliographic or automated clinical review.
- Do not require Zotero Desktop on CI or on the deployed learner sites.
- Do not build a general-purpose literature-review platform.
- Do not populate Zotero week collections or perform any other Zotero write in this scope.
- Do not migrate the entire 50-paper landmark spine or question bank in the first implementation.

## Current baseline

- `evidence_registry.json` contains 10 guideline, standard, instrument, or consensus records and no primary-article spine or Zotero fields. Its existing schema rejects undeclared Zotero and PMID fields.
- `topic_meta.json` contains 65 topic records; structured evidence and risk metadata cover only a minority of them.
- `reviewed.json` contains review dates and reviewers but no content or evidence hashes.
- Review state is duplicated across `reviewed.json`, `topic_meta.json`, and source banners, and those representations can conflict.
- The Tier 1 Markdown list, download workbook, OpenEvidence master index, audio crosswalk, deployed landmark page, and weekly maps are independently maintained.
- The download workbook reports zero marked downloads even though the live Zotero library contains all 17 Tier 1 titles as metadata records.
- Zotero Desktop 9.0.4, local API v3, and the connector are operational.
- Zotero already has a `Psychiatry Clerkship Library` root collection with Week 1 through Week 6 subcollections. The week collections are currently empty; Tier 1 routing is represented by the `Tier 1`, `MS3-required`, and `landmark` tags.
- Seven Tier 1 Zotero records currently have PDF children and ten are metadata-only. This is observed local state, not tracked curriculum metadata.
- Current live examples include CATIE as Zotero item `2TPA9P9D` and Stanley-Brown 2012 as `IDSQYW4X`.

## Authority model

| Information | Authority | Reason |
|---|---|---|
| Stable evidence ID, curriculum tier, weeks, topics, teaching role | Repository registry | These are curriculum decisions and must be reviewable in Git. |
| Clinical-risk classification and claim-to-source mapping | Repository registry and claim registry | These determine publishing and faculty-review gates. |
| Faculty review state | `reviewed.json` | One ledger prevents contradictory approval badges. |
| Citation object, creators, journal metadata, tags, and actual collection membership | Zotero | Zotero is the working reference manager and authority for what is currently present there. |
| Intended curriculum week | Repository registry | Empty or incomplete Zotero collections must not change curriculum meaning. |
| Licensed PDF and indexed full text | Zotero attachment storage | Full text must not be accumulated in the repository. |
| DOI and PMID identity confirmation | PubMed/Crossref metadata plus registry validation | A resolving DOI alone does not prove that it names the intended paper. |
| Learner and faculty article views | Generated from the registry | Generated views cannot silently become a competing authority. |

The integration is intentionally not generic two-way synchronization. The repository and Zotero each own different fields.

## Components and file boundaries

### 1. Canonical evidence registry

Extend the existing `evidence_registry.json` and `evidence_registry.schema.json`.

Every record has the following core fields, with type-specific requirements enforced by the schema:

- `id`: stable and independent of display order or an `LM-*`/`SP-*` position.
- `type`: `primary-study`, `systematic-review`, `guideline`, `instrument`, `consensus`, or `other-authoritative`.
- `citation`: title, authors, year, journal or organization, DOI, PMID, and canonical URL.
- `identity`: `verified`, `exception`, or `pending`, with verification source and date.
- `zotero`: local user library type and durable parent item key; required for Tier 1 records and optional for other authoritative sources.
- `requiredAccess`: `metadata`, `abstract`, or `fulltext`; this records curriculum need, not observed local attachment state.
- `curriculum`: tier, required/optional/faculty-only role, week numbers, topic slugs, and paired tools; required for learner-facing evidence.
- `appraisal`: study design, population, comparator, outcomes, and limitations. These fields are required for Tier 1 studies.
- `governance`: review cadence, superseded-by relationship, correction/retraction status, and last evidence review date.

DOI and PMID are external identifiers, not the primary record ID. A corrected citation or version must not force curriculum links to change.

Evidence identity verification and teaching-content attestation are separate. A paper may be bibliographically verified and present in Zotero while every dependent teaching page remains pending faculty review.

### 2. Zotero collection and tag configuration

Create `tools/evidence_registry/zotero_config.json` containing the local user library, root collection key/name, Week 1 through Week 6 collection key/name pairs, and expected Tier 1 tags.

Both key and expected name are recorded. A key/name mismatch is treated as configuration drift rather than silently accepting the wrong collection.

Collection membership is advisory in the first implementation because the existing week collections are empty and the local API is read-only. Tier 1 tags are validated. A future, separately approved Zotero write workflow may populate week collections.

### 3. Zotero bridge

Create `tools/evidence_registry/zotero_reconcile.py` with read-only commands:

- `status`: confirm the local API and connector state.
- `snapshot`: collect top-level item metadata and collection membership into an ignored local snapshot.
- `check`: compare registry citation identity, Zotero item keys, tags, and observed collections against a snapshot.
- `check --attachments`: explicitly inspect child attachment metadata and local PDF validity without copying files or extracting text.
- `report`: write a human-readable reconciliation report under `outputs/evidence_registry/`.

The default commands never modify Zotero or the registry. Initial linkage is an explicit reviewed change to `evidence_registry.json`. Zotero writes remain out of scope because the local API is read-only and connector writes require separate user authorization.

Reconciliation order is deterministic:

1. If a parent item key is stored, fetch that exact item and verify its DOI, PMID, title, first author, and year.
2. For an unlinked record, match exact normalized DOI.
3. Then match exact PMID.
4. Use normalized title plus first author plus year only for a unique bootstrap candidate.
5. Otherwise report `unmatched` or `ambiguous`; never guess.

The registry stores Zotero item keys such as `2TPA9P9D`, not BibTeX citation keys. BibTeX keys may be exported later, but they are a separate identity system.

### 4. Local Zotero snapshot and report

Use ignored paths:

```text
outputs/evidence_registry/
├── current_snapshot.json
├── reconciliation_report.json
├── reconciliation_report.md
└── Primary_Source_Download_Checklist.xlsx
```

Snapshots may contain item and attachment keys, citation metadata, tags, collection membership, content type, file size, and verification timestamps. They must not contain absolute attachment paths or extracted full text.

Observed Zotero state uses the following statuses: `metadata_only`, `pdf_attached`, `pdf_verified`, `pdf_indexed`, `broken_attachment`, `identity_conflict`, `unmapped`, or `api_unavailable`. These statuses remain in ignored local outputs rather than becoming stale tracked registry fields.

`pdf_verified` requires a PDF child attachment, `application/pdf` content type, a nonzero local enclosure, an existing file, and a `%PDF-` file signature. Indexed full text is an additional state, not proof of a valid PDF; a scanned PDF may be valid without indexed text. Parent item keys and attachment child keys remain distinct.

The existing tracked Excel checklist becomes a compatibility artifact during migration. Its durable, diffable replacement is generated CSV/Markdown; the current `.xlsx` is then generated on demand under `outputs/evidence_registry/`.

### 5. High-risk claim registry

Create `clinical_claims.json` and `clinical_claims.schema.json`.

A claim record contains:

- Stable `claimId`.
- Source path, deployed slug, and an invisible source marker using `<!-- clinical-claim: <claimId> -->` immediately before the reviewable statement or paragraph.
- `evidenceIds` and, when applicable, a local-policy record.
- Risk level and one or more domains: `medication`, `acute-safety`, `legal`, `local-policy`, or `diagnostic-threshold`.
- Intended learner scope: MS3 recognition/escalation or resident action guidance.
- Review cadence and evidence-through date.

Phase 1 claim coverage is required for:

- Medication doses, routes, frequencies, contraindications, or monitoring schedules.
- Numerical action or escalation thresholds.
- Suicide, violence, withdrawal, delirium, catatonia, or other acute-safety actions.
- Capacity, involuntary treatment, confidentiality, reporting, and other legal thresholds.
- Institution-specific formulary, order-set, documentation, restraint, or escalation workflows.

The first implementation adds markers only to the seven currently classified high-risk source pages and does not rewrite their clinical prose. The validator requires each marker to occur exactly once and hashes the marked statement or paragraph. A wording change invalidates the claim record and the page attestation until faculty reviews the new wording.

### 6. Hash-bound attestation

Make `reviewed.json` the sole review-state authority and extend each reviewed entry with:

- `status`, `at`, and `by`.
- `contentHash`.
- `claimsHash` and `evidenceHash`.
- `evidenceThrough`.
- `riskLevel` and `localPolicyDependent`.

`contentHash` covers normalized learner-visible Markdown and the page's learner-visible `topic_meta` record. Attestation banners and generated review badges are excluded to avoid a self-referential hash.

`claimsHash` covers the marked high-risk claim blocks and their claim records.

`evidenceHash` covers the sorted evidence records used by the page or its claims. Updating a supporting article, guideline, correction status, or local-policy dependency therefore invalidates review even when page prose is unchanged.

Remove the manual `CHANGED` list from `build_attest.py`. Both the local attestation generator and `faculty-console/netlify/functions/attest.mjs` compute and preserve the new hashes; otherwise the hosted console would discard them. The attestation UI labels any mismatch as `stale` and rejects a save if content changed after the review payload was loaded.

`topic_meta.facultyReview` and source review banners cease to be independently editable state. They are removed or generated from `reviewed.json` during build.

### 7. Validation and generated views

Create focused tooling under `tools/evidence_registry/`:

- `registry.py`: shared loading, normalization, marker extraction, hashing, and Tier 1 view generation.
- `validate.py`: the single evidence, claim, and high-risk attestation gate.
- `zotero_reconcile.py`: read-only local Zotero comparison and reporting.
- `test_registry.py`: fixture-based unit and integration tests.
- `README.md`: authority rules and local workflow.

The validator checks:

- Schema validity and unique stable IDs.
- DOI/PMID normalization and duplicate identity.
- Title, first-author, year, and journal agreement with authoritative metadata.
- Valid Zotero item-key shape and unique item linkage.
- Valid current Tier 1 tags; week collection membership is reported but not required in the first implementation.
- Tier 1 completeness: exactly 17 article records representing 16 numbered selections.
- Required appraisal fields for Tier 1.
- Claim text presence and evidence references.
- High-risk page metadata, policy classification, and matching review hashes.
- Exact equality between each high-risk page's `topic_meta.evidenceIds` and the union of its claim evidence IDs.

The first generator produces or updates:

- `07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md`.
- `07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md`.
- The ignored Excel checklist and Zotero reconciliation report.

Tracked generated text carries a generated-file notice and is checked in CI with a `--check` mode. The 50-paper master index, audio crosswalk, deployed landmark page, weekly learner map, and article-card UI remain unchanged in this first implementation; they migrate in a later, separately reviewed slice.

### 8. Surveillance authority

The existing surveillance `source_registry.yaml` cannot continue to call itself a separate source of truth. Add optional surveillance configuration to evidence-registry records, update `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py` to read that projection from `evidence_registry.json`, and retire `13_Faculty_Resources/_automation/surveillance/config/source_registry.yaml` after parity tests pass. `citation_index.json` remains as the broader page-dependency index.

## Tracked file boundary

Milestones 1 and 2 are limited to these tracked surfaces:

- Modify `evidence_registry.json` and `evidence_registry.schema.json`.
- Create `clinical_claims.json` and `clinical_claims.schema.json`.
- Create `tools/evidence_registry/registry.py`, `validate.py`, `zotero_reconcile.py`, `test_registry.py`, `zotero_config.json`, and `README.md` plus synthetic fixtures.
- Add invisible claim markers, without clinical prose changes, to:
  - `04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md`.
  - `04_Acute_and_Safety/Agitation_and_Restraint/agitation_restraint_inpatient_teaching.md`.
  - `04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md`.
  - `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md`.
  - `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md`.
  - `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md`.
  - `04_Acute_and_Safety/Violence_Risk/violence_risk_inpatient_teaching.md`.
- Modify `topic_meta.json` only to remove duplicate `facultyReview` state and make high-risk `evidenceIds` the validated union of claim sources.
- Modify `13_Faculty_Resources/reviewed.json`, `_automation/build_attest.py`, `faculty-console/netlify/functions/attest.mjs`, and the minimal faculty-console status display required for hash-bound review.
- Modify `13_Faculty_Resources/_automation/validate_topic_meta.py`, `site_build/build_and_check.sh`, and `.github/workflows/ci.yml` to call the shared gate rather than reimplementing it.
- Modify surveillance loading only as needed to remove dual source authority after parity tests.
- Modify `.gitignore` for `outputs/evidence_registry/`.
- Generate only the Tier 1 list and faculty curriculum map in this implementation boundary.

## Future extension: article card and evidence receipt

Each generated article card includes:

- Citation and evidence ID.
- Study design, population, comparator, and principal endpoint.
- Plain-language result and why it matters.
- Key limitation and a `Do not overgeneralize` note.
- Current-guidance pairing when the landmark alone is not sufficient for current practice.
- Curriculum week, reading role, clinical-transfer question, and assessment link.
- Identity and access verification levels with dates.
- Faculty-only Zotero item key and optional `zotero://select/library/items/<itemKey>` link.

Learner pages show DOI/PubMed links, not local Zotero links or attachment locations.

## Future extension: six-week curriculum rule

- Faculty selects one required primary article per week.
- Each week may add at most one optional deepening article.
- The remaining Tier 1 records are case-triggered, resident, or faculty resources.
- Every required article has one focused `Read for...` question, one bedside-transfer task, one limitations warning, and one assessment item.
- A landmark article is paired with current authoritative guidance when the teaching point involves present-day diagnosis, treatment, monitoring, legal practice, or safety procedures.

## Data flow

```text
PubMed/Crossref identity metadata
              |
              v
    evidence_registry.json <------ reviewed Zotero item linkage
              |                              ^
              |                              |
              |                    Zotero local read-only API
              |                    items / collections / attachments
              v
      clinical_claims.json
              |
              +------> attestation hashes ------> reviewed.json
              |
              +------> generated Tier 1 views / faculty map / reconciliation report
              |
              +------> CI validation and surveillance
```

## Failure behavior

| Condition | Behavior |
|---|---|
| Zotero is closed, sandboxed, or unavailable | Local sync exits with an actionable error and writes nothing. CI and site builds continue using tracked registry data and offline fixtures. |
| Registry points to a missing Zotero item key | Tier 1 article: reconciliation error. Optional future article: warning. Nothing is deleted or relinked automatically. |
| DOI/PMID maps to more than one item | Hard ambiguity error; faculty or evidence steward selects the item explicitly. |
| Title/author/year disagrees with DOI/PMID metadata | Hard identity failure for required articles; generated learner view is blocked. |
| Attachment is absent | Observed status remains `metadata_only`; it is never called downloaded or full-text verified. |
| Attachment check was not explicitly requested | Existing access state is preserved; absence of a check cannot downgrade a record. |
| Attachment path or PDF is invalid | Report `attachment-invalid`; do not expose the path or copy the file. |
| Week collection is empty or membership differs | Report advisory collection drift. Do not fail CI and do not write Zotero; registry week mappings and Tier 1 tags remain authoritative for this slice. |
| High-risk claim text changes | Claim validation and content hash fail; page becomes pending review. |
| Supporting evidence record changes | Evidence hash fails; affected page becomes pending review. |
| High-risk page lacks evidence/local-policy classification | Hard CI failure and learner-facing pending-review state. |
| Optional general page lacks claim records | No failure; claim mapping is intentionally risk-scoped. |
| Generated article view differs from registry output | CI fails with regeneration instructions. |

## Testing and verification

### Offline unit and fixture tests

- Schema-valid and invalid evidence records.
- DOI/PMID normalization and duplicate detection.
- Stored-item verification followed by DOI-first, PMID-second, and title/author/year fallback matching for unlinked records.
- Ambiguous and unmatched Zotero records.
- Stored item-key identity drift.
- Collection key/name drift.
- Empty week collections with matching Tier 1 tags.
- Imported PDF, linked PDF, linked URL, and HTML-snapshot attachment distinctions.
- Missing and zero-byte attachments, plus valid scanned PDFs without indexed text.
- Access-state transitions that never infer full text from metadata or indexed text alone.
- Snapshot sanitization: no absolute paths or extracted text.
- Tier 1 count and 14a/14b representation.
- High-risk claim marker uniqueness and marked-block validation.
- Deterministic content and evidence hashes.
- Review invalidation after page, topic metadata, claim, or evidence changes.
- Generated-view `--check` drift detection.
- Surveillance projection parity between the current YAML and evidence-registry records before YAML retirement.

### Live local verification

- Confirm Zotero status and the expected root/week collections.
- Resolve all 17 Tier 1 records to unique Zotero item keys.
- Run attachment inspection only when explicitly requested.
- Confirm the seven observed PDF-bearing Tier 1 records and ten metadata-only records are reported without exposing paths or full text.
- Open representative faculty Zotero deep links locally.

### Repository verification

- Run `python3 tools/evidence_registry/validate.py` and `validate_topic_meta.py`.
- Run MS3 and resident `build_and_check.sh` gates.
- Run the citation-surveillance self-test and bibliographic-identity fixture tests.
- Confirm ignored Zotero outputs do not appear in Git status.
- Confirm no licensed PDF or extracted article text is added to Git.

## Rollout sequence

### Milestone 1: Registry and Zotero foundation

- Add schemas and the evidence automation folder.
- Migrate the 10 existing registry records without changing their clinical meaning.
- Add and verify the 17 Tier 1 article records.
- Add Zotero collection configuration and read-only snapshot/check/report commands.
- Generate the faculty reconciliation report and compatibility checklist.
- Prove surveillance projection parity before retiring its separate source registry.

### Milestone 2: High-risk claims and attestation

- Add risk/local-policy metadata and seed high-risk claims.
- Add content/evidence hashing to the attestation workflow.
- Reconcile contradictory review representations.
- Gate the seven current high-risk pages. Question-bank claim tracing is a later assessment-reliability slice.

### Milestone 3: Generated curriculum views

- Migrate the remaining landmark lists, crosswalks, weekly article sections, and evidence receipts in a separate implementation specification.
- Select and attest the six required weekly articles.
- Extend deterministic drift checks from the Tier 1 views to the remaining generated views.
- Extend surveillance to bibliographic identity, corrections, and retractions.

## Acceptance criteria

- One registry record exists for each Tier 1 article, with 17 records representing 16 numbered selections.
- Every Tier 1 record has verified title, first author, year, journal, DOI/PMID or an explicit documented exception.
- Every Tier 1 record is linked to exactly one live Zotero parent item key and has the expected Tier 1 tags; collection drift is reported separately.
- Full-text status is never inferred from metadata or collection membership.
- The Tier 1 article list, faculty curriculum map, and compatibility checklist are reproducible from the registry.
- No label-to-DOI identity mismatches remain in registry-generated Tier 1 content.
- Every high-risk claim has evidence IDs, learner scope, policy classification, and exactly one valid source marker.
- Every published high-risk page has matching content, claims, and evidence hashes in `reviewed.json`.
- Zotero unavailability cannot fail normal CI or the deployed site build.
- No Zotero attachment path, PDF, or extracted full text is tracked.

## Ownership and cadence

- Evidence steward: citation identity, Zotero linkage, collection/access reconciliation, and correction/retraction review.
- Technical maintainer: schemas, sync/report tooling, generators, hashes, CI, and dashboard outputs.
- Joshua Moss, MD: clinical interpretation, risk scope, local-policy decisions, required-reading selection, and faculty attestation.
- Resident or learner reviewer: clarity, workload, clinical-transfer questions, and assessment usability.

Run Zotero reconciliation when articles are added or access changes, citation surveillance weekly, guideline surveillance monthly, P0 review within 72 hours, P1 review within two weeks, and a complete Tier 1 curriculum review annually.

## Concrete first implementation slice

Implement only Milestone 1 first: schemas, 17 Tier 1 records, read-only Zotero snapshot/check/report, collection mapping, identity validation, and generated Tier 1 list, faculty map, and compatibility checklist. Do not change clinical prose, clinical claims, or attestation state until that slice passes review. This produces a useful, testable Zotero-linked evidence spine without mixing infrastructure changes with clinical-content decisions.
