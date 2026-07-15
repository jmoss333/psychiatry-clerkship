# Anki Second Re-review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the offline faculty clinic operational for first-time qbank reviews and rejection, prove exact prior-render evidence, close the candidate schema structurally, and bind policy records to one exact Markdown section.

**Architecture:** Candidate generation will separate mechanically derived qbank proposal bytes from faculty-supplied review fields, while the browser export and Python applicator share the same closed canonical record contract. Reject is a named, stale-checked no-write decision with `proposedRecord: null`. Prior package notes are deterministically reconstructed into exact front/back bytes, and policy anchors reuse the repository's governed Markdown section parser and normalization contract.

**Tech Stack:** Python 3.11, pytest, Draft-07 JSON Schema, repository Anki package inspector, canonical JSON/SHA-256, offline HTML/JavaScript.

## Global Constraints

- Preserve complete-collection migration behavior and every currently passing gate.
- Do not create or modify any clinical, qbank, policy, faculty, quarantine, or Step 8 decision.
- Write and run each failing test before its production change.
- Keep browser payloads base64-safe and canonical patches atomic/stale-checked.
- Keep whole policy files in the governed-input ledger even though approval hashes one normalized section.

---

### Task 1: Structurally close candidate previews and withdrawals

**Files:**
- Modify: `13_Faculty_Resources/_automation/anki/review_candidate.schema.json`
- Test: `tests/anki/test_review.py`

**Interfaces:**
- Consumes: `validate_review_candidate(value)`.
- Produces: typed/required `preview`, `note`, and `withdrawal` schema definitions.

- [ ] **Step 1: Write failing one-field mutation tests**

Create one valid generated preview, delete each required field one at a time, and assert `ReviewPatchError`. Probe `{}` and representative wrong values such as `namespace=123`, `uid=False`, `frontHtml=[]`, `backHtml={}`, noninteger IDs, nonarray fields/tags, nonboolean status, and malformed hashes. Repeat shared-field mutations for withdrawals.

- [ ] **Step 2: Run the schema tests and verify RED**

Run `run_python.sh -m pytest -q tests/anki/test_review.py -k 'required_preview or typed_preview or typed_withdrawal'` and confirm current validation accepts at least one mutation.

- [ ] **Step 3: Replace empty schemas with concrete references/types**

Require immutable identity, exact render bytes, template/render hashes, active/withdrawn state, current status, prior-render state, target registry, record key, base hash, and the canonical/proposal route. Reuse identical concrete types in withdrawals.

- [ ] **Step 4: Run the targeted schema tests and verify GREEN**

Run the same command and require zero failures.

### Task 2: Resolve and hash exact anchored policy sections

**Files:**
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/release.py`
- Test: `tests/anki/test_release.py`

**Interfaces:**
- Consumes: `parse_markdown_sections(text)` and `Section.normalized_text`.
- Produces: `load_policy_records(repo, loaded)` where `passageSha256 = sha256(section.normalized_text.encode("utf-8"))` for exactly one matching anchor.

- [ ] **Step 1: Write failing anchor tests**

Use a Markdown document with two sections. Assert valid normalized-section resolution, missing-anchor rejection, duplicate-anchor rejection, passage-text drift rejection, whole-file-hash rejection, and acceptance after surrounding text changes when `passageSha256` remains unchanged. Assert the full path remains in `loaded`.

- [ ] **Step 2: Run policy tests and verify RED**

Run `run_python.sh -m pytest -q tests/anki/test_release.py -k policy_loader` and confirm nonexistent/ambiguous anchors are currently accepted or the valid section hash is rejected.

- [ ] **Step 3: Implement exact section resolution**

Read the path once, parse Markdown sections, require exactly one `section.anchor == record["anchor"]`, compare the normalized section SHA-256, and retain the whole path in the access ledger.

- [ ] **Step 4: Run policy tests and verify GREEN**

Run the same command and require zero failures.

### Task 3: Add operational new-qbank proposals and coherent Reject

**Files:**
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/release.py`
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/review.py`
- Modify: `13_Faculty_Resources/_automation/anki/review_candidate.schema.json`
- Modify: `13_Faculty_Resources/_automation/anki/review_patch.schema.json`
- Test: `tests/anki/test_review.py`

**Interfaces:**
- Produces: closed `proposedRecordTemplate` with mechanically derived qbank fields and no faculty/risk/evidence decision.
- Produces: browser-equivalent materialization of named source/risk/evidence/policy/reviewer fields into a canonical qbank review.
- Produces: Reject decisions with `proposedRecord: null`, live commit/input/base validation, and successful no-write application.

- [ ] **Step 1: Write failing new-record and reject tests**

Generate a real-shaped qbank preview without an existing review; assert `baseRecordSha256 is None`, a complete mechanical template exists, buttons are enabled, and named faculty fields create a schema-valid patch that appends after live recomputation. Test both Accept/Edit, stale-base/input no-write, new-record Reject no-write, existing-record Reject no-write, and mixed accept/reject atomic behavior.

- [ ] **Step 2: Run workflow tests and verify RED**

Run `run_python.sh -m pytest -q tests/anki/test_review.py -k 'new_qbank or reject_semantics or browser_export'` and confirm disabled/missing template and applicator rejection failures.

- [ ] **Step 3: Implement mechanical proposal plus named-field materialization**

Derive qbank ID/identity/page/item hash/template contract/render hash/legacy template from governed inputs. Render blank, explicitly required faculty controls for anchor, risk, and conditional evidence/policy proof. Do not default faculty choices. Export only after required named fields are supplied.

- [ ] **Step 4: Implement Reject as stale-checked no-write**

Permit `proposedRecord: null` only when `decision == "reject"`; validate key/base against the live registry and skip mutation. Return no changed key and do not replace the registry for an all-reject patch.

- [ ] **Step 5: Run workflow tests and verify GREEN**

Run the same targeted command and require exact changed/no-write byte assertions.

### Task 4: Reconstruct prior package renders and display escaped red/green evidence

**Files:**
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/release.py`
- Modify: `13_Faculty_Resources/_automation/anki/pcl_anki/review.py`
- Modify: `13_Faculty_Resources/_automation/anki/review_candidate.schema.json`
- Test: `tests/anki/test_review.py`
- Test: `tests/anki/test_release.py`

**Interfaces:**
- Consumes: exact frozen or supplied predecessor APKG snapshots.
- Produces: `priorApprovedFrontHtml`, `priorApprovedBackHtml`, and explicit status `exact`, `changed_exact_prior`, `never_approved`, or `blocking_prior_evidence_gap`.

- [ ] **Step 1: Write failing prior-render tests**

Resolve a frozen legacy qbank GUID and assert exact prior fields render to nonempty front/back distinct from current. Assert the HTML contains escaped prior/current bytes in red/green panes. For a record claiming a prior hash without reconstructable bytes, assert a blocking evidence-gap class; for no review/no shipped note, assert `never_approved`.

- [ ] **Step 2: Run prior tests and verify RED**

Run `run_python.sh -m pytest -q tests/anki/test_review.py tests/anki/test_release.py -k 'prior_render or red_green_diff'` and confirm current output lacks exact prior panes.

- [ ] **Step 3: Implement deterministic APKG reconstruction**

Bind frozen fixture paths into the governed loader and accept an explicit predecessor directory when supplied. Last-package-wins by GUID, reconstruct qbank faces with the frozen template and stored fields/tags, and attach bytes only when identity/template evidence is exact.

- [ ] **Step 4: Render escaped evidence panes**

Use sandboxed prior/current frames with red/green containers. Treat a claimed prior approval without exact bytes as blocking, and distinguish records that were never approved.

- [ ] **Step 5: Run prior tests and verify GREEN**

Run the same targeted command and require exact escaped bytes/status assertions.

### Task 5: Regression and compatibility verification

**Files:**
- Modify: `.superpowers/sdd/task-9-report.md`

**Interfaces:**
- Produces: one separate fix commit and evidence for third review.

- [ ] Run focused release/review tests.
- [ ] Run the full build-lock `tests/anki` suite.
- [ ] Run relevant current/minimum lock workflow, package, schema, and policy tests.
- [ ] Run compilation, shell syntax, JSON parsing, `git diff --check`, and frozen fixture hash checks.
- [ ] Update the report without claiming the 141-identity release blocker is fixed.
- [ ] Commit separately with a concise review-fix subject.
