# MS3 and Resident Curriculum Clinical Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a complete, evidence-gated audit of the learner-facing MS3 and resident psychiatry curricula, implement only low-risk corrections, and add tests that prevent corrected claims or governance facts from drifting.

**Architecture:** Freeze the audit corpus from the current MS3 manifest, resident overlay, and runtime datasets; run seven read-only review tracks in parallel; centrally verify and adjudicate candidate findings; then make only `safe to implement` changes through red-green drift guards. Human-facing audit, faculty-attestation, evidence-review, and implemented-correction artifacts remain separate so clinical decisions cannot be confused with completed edits.

**Tech Stack:** Python 3.11 standard library, Markdown, JSON, existing Bash/Node static QA, repository-native validation scripts, authoritative web sources for medical verification.

## Global Constraints

- Do not use model recall as evidence.
- Do not change clinical recommendations, doses, thresholds, treatment sequence, legal guidance, local policy, or attestation status without the disposition gate defined in the approved design.
- Use the current learner-facing corpus, not archived, imported, or historical audit material, unless current runtime code exposes it.
- Preserve unrelated worktree changes and inspect status before every edit batch.
- Every finding needs an exact repository location, risk explanation, exact replacement text, one primary disposition, evidence state, and downstream duplication result.
- Every implemented correction needs a failing test first and fresh final verification.
- MS3 language must emphasize recognition, escalation, and supervised participation; resident language may include action thresholds only when evidence and local-policy boundaries are explicit.

---

## File Structure

### Create

- `13_Faculty_Resources/_automation/build_curriculum_audit_corpus.py` — deterministically composes the approved MS3/resident audit corpus.
- `13_Faculty_Resources/_automation/test_build_curriculum_audit_corpus.py` — verifies corpus completeness, exclusions, uniqueness, and file existence.
- `13_Faculty_Resources/Handoffs/MS3_RESIDENT_AUDIT_CORPUS_2026-07-12.json` — reproducible audit inventory.
- `MS3_RESIDENT_CLINICAL_CURRICULUM_AUDIT_2026-07-12.md` — canonical findings matrix and coverage statement.
- `13_Faculty_Resources/Handoffs/MS3_RESIDENT_IMPLEMENTED_CORRECTIONS_2026-07-12.md` — low-risk changes and verification evidence.
- `13_Faculty_Resources/Handoffs/MS3_RESIDENT_FACULTY_ATTESTATION_2026-07-12.md` — exact clinical decisions awaiting faculty action.
- `13_Faculty_Resources/Handoffs/MS3_RESIDENT_EVIDENCE_REVIEW_PROMPTS_2026-07-12.md` — ready-to-paste OpenEvidence and Claude prompts.
- `13_Faculty_Resources/_automation/clinical_claim_drift_guard.json` — invariants for every implemented correction.
- `13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py` — data-driven regression test.

### Modify only after adjudication

- `question_bank.json` — remove the stale hard-coded attestation-count claim from `_note` without changing any item or status.
- Any additional source or downstream file identified as `safe to implement` in the canonical matrix.
- `13_Faculty_Resources/_automation/site_build/build_and_check.sh` — run the drift guard in both publish gates.

### Read but do not edit without a later faculty decision

- `13_Faculty_Resources/reviewed.json`
- All `status`, `reviewStatus`, `facultyReview`, `attested`, and `retired` fields.
- Resident medication, emergency, medical-legal, and local-policy guidance.

---

### Task 1: Freeze and Test the Audit Corpus

**Files:**

- Create: `13_Faculty_Resources/_automation/test_build_curriculum_audit_corpus.py`
- Create: `13_Faculty_Resources/_automation/build_curriculum_audit_corpus.py`
- Create: `13_Faculty_Resources/Handoffs/MS3_RESIDENT_AUDIT_CORPUS_2026-07-12.json`

**Interfaces:**

- Consumes: `site_manifest.json`, `resident_section.py` source contract, and `reviewed.json`.
- Produces: `build_records() -> list[dict]` and a dated JSON inventory with `source`, `output`, `title`, `audience`, `visibility`, `surface`, `canonicalRole`, `reviewStatus`, `riskClass`, and `downstreamConsumers`.

- [ ] **Step 1: Write the failing corpus test**

Create a standard-library `unittest` that imports `build_records()` and asserts:

```python
#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "13_Faculty_Resources" / "_automation" / "build_curriculum_audit_corpus.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("audit_corpus", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuditCorpusTests(unittest.TestCase):
    def test_complete_surface_corpus_is_unique_and_exists(self):
        module = load_builder()
        records = module.build_records()
        sources = [item["source"] for item in records]
        self.assertEqual(len(sources), len(set(sources)))
        self.assertEqual(113, len(sources))
        self.assertTrue(all((ROOT / source).exists() for source in sources))

    def test_expected_surface_counts(self):
        records = load_builder().build_records()
        counts = {}
        for item in records:
            counts[item["surface"]] = counts.get(item["surface"], 0) + 1
        self.assertEqual(66, counts["ms3-markdown"])
        self.assertEqual(20, counts["ms3-tool"])
        self.assertEqual(7, counts["resident-markdown"])
        self.assertEqual(3, counts["resident-tool"])
        self.assertEqual(2, counts["resident-pack"])
        self.assertEqual(3, counts["special-build-source"])
        self.assertEqual(12, counts["runtime-data"])

    def test_excluded_trees_are_absent(self):
        records = load_builder().build_records()
        forbidden = ("/_source/", "_more-from-computer", "99_Archive/", "_build/", "notebooklm_upload_")
        for item in records:
            self.assertFalse(any(token in item["source"] for token in forbidden), item["source"])

    def test_required_metadata_is_populated(self):
        required = {
            "source", "output", "title", "audience", "visibility", "surface",
            "canonicalRole", "reviewStatus", "riskClass", "downstreamConsumers",
        }
        for item in load_builder().build_records():
            self.assertTrue(required.issubset(item))
            self.assertTrue(item["source"])
            self.assertIsInstance(item["downstreamConsumers"], list)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_build_curriculum_audit_corpus.py
```

Expected: `ERROR` because `build_curriculum_audit_corpus.py` does not exist.

- [ ] **Step 3: Implement the deterministic builder**

Use this complete implementation. It loads the 66 Markdown and 20 tool rows from `site_manifest.json`; adds the seven `RES_EXTRA` pages, three `PROTO_TOOLS`, two existing `.pack.json` files, three learner-facing sources copied outside the manifest, and 12 runtime records:

```python
#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "site_manifest.json"
REVIEWED_PATH = ROOT / "13_Faculty_Resources" / "reviewed.json"
OUTPUT_PATH = ROOT / "13_Faculty_Resources" / "Handoffs" / "MS3_RESIDENT_AUDIT_CORPUS_2026-07-12.json"

RESIDENT_PAGES = [
    ("14_Tracks/Resident/resident_welcome.md", "welcome.md", "Resident Welcome"),
    ("14_Tracks/Resident/resident_curriculum.md", "rotation.md", "Resident Rotation Plan"),
    ("14_Tracks/Resident/adv_psychopharmacology.md", "adv_psychopharm.md", "Advanced Psychopharmacology"),
    ("14_Tracks/Resident/systems_medlegal.md", "systems_medlegal.md", "Inpatient Systems and Med-Legal"),
    ("14_Tracks/Resident/supervision_teaching.md", "supervision_teaching.md", "Supervision, EPAs, and Teaching"),
    ("14_Tracks/Resident/canon_200.md", "canon_200.md", "Psychiatry Canon"),
    ("14_Tracks/Resident/cl_reference.md", "cl_reference.md", "C-L Emergencies, Tox, and Capacity"),
]

RESIDENT_TOOLS = [
    ("_prototypes/agitation-trainer/rp-agitation.html", "rp-agitation.html", "Agitation Ladder"),
    ("_prototypes/brief-psych/rp-brief-psych.html", "rp-brief-psych.html", "Five Good Minutes"),
    ("_prototypes/canon-quiz/rp-canon-quiz.html", "rp-canon-quiz.html", "Canon Quiz"),
]

RESIDENT_PACKS = [
    ("_prototypes/agitation-trainer/rp-agitation.pack.json", "rp-agitation.pack.json", "Agitation Ladder Pack"),
    ("_prototypes/brief-psych/rp-brief-psych.pack.json", "rp-brief-psych.pack.json", "Five Good Minutes Pack"),
]

SPECIAL_BUILD_SOURCES = [
    ("01_Six_Week_Curriculum/learning-path.html", "learning-path.html", "Learning Path", "both"),
    ("_prototypes/orientation-video/orientation-video.html", "orientation-video.html", "MS3 Orientation Video", "ms3"),
    ("_prototypes/orientation-video/Inpatient_Psych_Orientation.vtt", "Inpatient_Psych_Orientation.vtt", "MS3 Orientation Transcript", "ms3"),
]

RUNTIME_DATA = [
    ("topic_meta.json", "both", ["SPA topic summaries", "topic quizzes", "search"]),
    ("question_bank.json", "both", ["question-bank practice", "Anki export"]),
    ("reasoning_cases.json", "ms3", ["diagnostic-reasoning tool"]),
    ("reasoning_cases_resident.json", "resident", ["resident diagnostic-reasoning tool"]),
    ("communication_cases.json", "both", ["communication-practice tool"]),
    ("family_systems_scenarios.json", "both", ["family-systems tool"]),
    ("longitudinal_case.json", "both", ["one-patient-six-weeks tool"]),
    ("07_Evidence_and_Reading/Landmark_Trials/quizzes.json", "both", ["active recall", "daily review", "shelf mode", "resident canon quiz"]),
    ("07_Evidence_and_Reading/Landmark_Trials/LM_master_index.json", "both", ["landmark audio and source identity"]),
    ("evidence_registry.json", "both", ["topic metadata", "tools", "cases"]),
    ("tool_registry.json", "both", ["tool evidence and review metadata"]),
    ("13_Faculty_Resources/reviewed.json", "both", ["learner review badges", "attestation consistency"]),
]

HIGH_RISK_TOKENS = {
    "acute", "safety", "psychopharm", "medication", "suicide", "violence",
    "agitation", "catatonia", "delirium", "withdrawal", "toxidrome", "capacity",
    "medlegal", "question_bank",
}


def risk_for(source):
    normalized = source.lower().replace("-", "_")
    return "high" if any(token in normalized for token in HIGH_RISK_TOKENS) else "review-needed"


def make_record(source, output, title, audience, visibility, surface, role, reviewed, consumers):
    review = reviewed.get(output, {}) if output else {}
    return {
        "source": source,
        "output": output,
        "title": title,
        "audience": audience,
        "visibility": visibility,
        "surface": surface,
        "canonicalRole": role,
        "reviewStatus": review.get("status", "untracked"),
        "riskClass": risk_for(source),
        "downstreamConsumers": consumers,
    }


def build_records():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    reviewed = json.loads(REVIEWED_PATH.read_text(encoding="utf-8"))
    records = []

    for source, output, title in manifest["md"]:
        records.append(make_record(
            source, output, title, "both", "shipped-ms3-inherited-resident",
            "ms3-markdown", "canonical-source", reviewed,
            ["_build/ms3/content", "_build/res/content", "search-index", "Anki content export"],
        ))
    for source, output, title in manifest["tools"]:
        records.append(make_record(
            source, output, title, "both", "shipped-ms3-inherited-resident",
            "ms3-tool", "canonical-source", reviewed,
            ["_build/ms3/tools", "_build/res/tools", "navigation and direct links"],
        ))
    for source, output, title in RESIDENT_PAGES:
        records.append(make_record(
            source, output, title, "resident", "resident-only",
            "resident-markdown", "canonical-source", reviewed,
            ["_build/res/content", "resident search-index", "resident navigation"],
        ))
    for source, output, title in RESIDENT_TOOLS:
        records.append(make_record(
            source, output, title, "resident", "resident-only",
            "resident-tool", "canonical-source", reviewed,
            ["_build/res/tools", "resident navigation"],
        ))
    for source, output, title in RESIDENT_PACKS:
        records.append(make_record(
            source, output, title, "resident", "resident-tool dependency",
            "resident-pack", "supporting-data", reviewed,
            ["_build/res/tools", output.replace(".pack.json", ".html")],
        ))
    for source, output, title, audience in SPECIAL_BUILD_SOURCES:
        consumers = ["_build/ms3/tools"]
        if audience == "both":
            consumers.append("_build/res/tools")
        records.append(make_record(
            source, output, title, audience, "copied outside site_manifest",
            "special-build-source", "canonical-source", reviewed, consumers,
        ))
    for source, audience, consumers in RUNTIME_DATA:
        records.append(make_record(
            source, source, Path(source).name, audience, "loaded-at-runtime",
            "runtime-data", "structured-claim-surface", reviewed, consumers,
        ))

    return sorted(records, key=lambda item: item["source"])


def main():
    records = build_records()
    payload = {
        "generated": "2026-07-12",
        "scope": "surface-complete MS3 and resident learner corpus",
        "records": records,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(records)} audit corpus records written to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the corpus test and verify GREEN**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_build_curriculum_audit_corpus.py
python3 13_Faculty_Resources/_automation/build_curriculum_audit_corpus.py
```

Expected: four tests pass; the builder reports `113 audit corpus records written`.

- [ ] **Step 5: Commit the corpus inventory**

```bash
git add 13_Faculty_Resources/_automation/build_curriculum_audit_corpus.py 13_Faculty_Resources/_automation/test_build_curriculum_audit_corpus.py 13_Faculty_Resources/Handoffs/MS3_RESIDENT_AUDIT_CORPUS_2026-07-12.json
git commit -m "audit: freeze MS3 and resident curriculum corpus"
```

---

### Task 2: Capture the Baseline and Dispatch the Seven Read-Only Review Tracks

**Files:**

- Read: every source in `MS3_RESIDENT_AUDIT_CORPUS_2026-07-12.json`
- Do not edit curriculum files in this task.

**Interfaces:**

- Consumes: the frozen corpus JSON.
- Produces: candidate finding records returned to the coordinator; candidates are not accepted findings.

- [ ] **Step 1: Capture fresh baseline evidence**

Run and retain exact exit codes and summaries:

```bash
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
python3 -c 'import json; from collections import Counter; d=json.load(open("question_bank.json")); print(len(d["items"]), Counter(x["status"] for x in d["items"]), sum(bool(x.get("retired")) for x in d["items"]))'
```

Expected current counts: 192 qbank items, 143 `attested`, 49 `draft`, and 3 with `retired: true`. Treat count drift as evidence to investigate, not a reason to rewrite status.

- [ ] **Step 2: Dispatch three independent review agents and keep provenance review local**

Run concurrently:

- Agent A: tracks 1 and 6 — diagnostic accuracy/differential diagnosis plus MS3-versus-resident sequencing.
- Agent B: tracks 2 and 3 — medication/acute safety plus suicide, agitation, catatonia, delirium, withdrawal, toxidromes, and emergencies.
- Agent C: tracks 4 and 5 — trauma-informed/relational communication plus developmental, cultural, disability, language, and accessibility considerations. Follow media references to verify caption/transcript availability; do not infer clinical accuracy from untranscribed audio or video.
- Coordinator: track 7 — citation identity, currency, evidence applicability, review-state consistency, and parallel-authority drift.

Every reviewer must inspect all assigned corpus records, search downstream structured data, make no edits, and return candidate records with this exact shape:

```json
{
  "candidateId": "TRACK-NNN",
  "track": "1-7",
  "audience": "MS3|resident|both",
  "severity": "P0|P1|P2",
  "source": "repository/path",
  "locator": "line range, heading, JSON pointer, or HTML element",
  "quote": "exact repository text",
  "risk": "clinical or educational risk",
  "replacement": "exact proposed replacement text",
  "suggestedDisposition": "safe to implement|faculty-attestation required|evidence review required",
  "evidenceQuestion": "specific fact requiring verification",
  "downstreamMatches": ["path and locator"],
  "notes": "limits, competing interpretation, or no additional note"
}
```

- [ ] **Step 3: Require explicit coverage attestations from reviewers**

Each reviewer must return:

- Count of corpus records assigned and inspected.
- List of records not inspectable and why.
- Candidate finding count.
- Statement that model recall was not treated as evidence.

The coordinator rejects any candidate without exact repository text and location.

---

### Task 3: Verify Evidence and Adjudicate Candidate Findings

**Files:**

- Read: candidate records, `evidence_registry.json`, surveillance registries, repository citations, and current authoritative sources.
- Do not edit learner-facing clinical text in this task.

**Interfaces:**

- Consumes: candidate records from Task 2.
- Produces: deduplicated accepted findings with one primary disposition and documented source identity.

- [ ] **Step 1: Deduplicate by claim, not just file**

Merge candidates when they address the same proposition across a source and its copies. Preserve every repository locator under `downstreamMatches`. Do not merge superficially similar issues when the patient population, learner authority, or setting differs.

- [ ] **Step 2: Verify every clinical or regulatory proposition**

For each candidate, record:

```text
Issuing body or authors:
Exact title:
Version/year:
Canonical URL, DOI, or PMID:
Population and setting:
Exact proposition supported:
Important limitation:
Checked on: 2026-07-12
Evidence state: verified-current | verified-limited | unverified | conflicting | missing
```

Use current official regulators, prescribing information, government or professional-society guidelines, and primary publications. A live URL or resolving DOI is not sufficient; title/author/year and claim support must match.

- [ ] **Step 3: Assign the exclusive primary disposition**

- `safe to implement`: mechanical, accessibility, duplication, stale nonclinical metadata, or exact propagation of already attested wording.
- `faculty-attestation required`: evidence is adequate, but the proposed text changes clinical judgment, sequencing, learner authority, legal/local workflow, or attested clinical content.
- `evidence review required`: support is missing, outdated, indirect, misidentified, conflicting, or setting-limited.

If evidence is unresolved, use `evidence review required` even when faculty review will later be needed.

- [ ] **Step 4: Re-scan downstream surfaces**

For every accepted finding, search distinctive wording, numbers, citations, drug names, and slugs across:

```text
topic_meta.json
question_bank.json
07_Evidence_and_Reading/Landmark_Trials/quizzes.json
reasoning_cases.json
reasoning_cases_resident.json
communication_cases.json
family_systems_scenarios.json
longitudinal_case.json
09_Exam_Prep/anki_export/
00_START_HERE/COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md
13_Faculty_Resources/_automation/site_build/
tools/pdf_library_export/
tools/adobe_packet_export/
tools/faculty_polish_export/
```

Classify each match as canonical source, manual duplicate, generated derivative, unrelated context, or inaccessible media.

---

### Task 4: Write the Canonical Audit and Review Queues

**Files:**

- Create: `MS3_RESIDENT_CLINICAL_CURRICULUM_AUDIT_2026-07-12.md`
- Create: `13_Faculty_Resources/Handoffs/MS3_RESIDENT_FACULTY_ATTESTATION_2026-07-12.md`
- Create: `13_Faculty_Resources/Handoffs/MS3_RESIDENT_EVIDENCE_REVIEW_PROMPTS_2026-07-12.md`
- Create: `13_Faculty_Resources/Handoffs/MS3_RESIDENT_IMPLEMENTED_CORRECTIONS_2026-07-12.md`

**Interfaces:**

- Consumes: adjudicated findings from Task 3.
- Produces: the five user-requested deliverable lanes, with implemented corrections initially recorded as pending execution.

- [ ] **Step 1: Write the canonical audit**

Use this structure:

```markdown
# MS3 and Resident Clinical Curriculum Audit — 2026-07-12

## Executive verdict
## Scope and coverage
## Baseline validation results
## Canonical findings matrix
## Findings by review track
## Downstream duplication map
## Implemented low-risk corrections
## Faculty-attestation queue
## Evidence-review queue
## Limitations
```

The matrix columns are:

```text
ID | Priority | Audience | Track | Source and locator | Exact text | Risk | Exact replacement | Disposition | Evidence state | Downstream matches | Status
```

Do not mark a finding implemented until its red-green cycle and verification are complete.

- [ ] **Step 2: Write the faculty checklist**

Each entry must contain the finding ID, source, exact old text, exact proposed text, source identity, learner-level rationale, downstream impacts, and these checkboxes:

```markdown
- [ ] Approve exact replacement
- [ ] Approve with edits: ____________________
- [ ] Reject; retain current text
- [ ] Local policy must be supplied before decision
```

- [ ] **Step 3: Write evidence-review prompts**

Provide 5–10 ready-to-paste prompts, grouping related findings where one search can answer them. Every prompt must instruct OpenEvidence or Claude to:

- Use current authoritative sources and provide direct links/identifiers.
- Separate adult inpatient, emergency, outpatient, pregnancy/lactation, pediatric, and geriatric populations.
- Distinguish MS3 recognition/escalation from resident supervised action.
- Quote the minimal source passage supporting or contradicting the proposed replacement.
- Report conflicts, evidence certainty, regulatory date, and local-policy dependence.
- Return a claim-by-claim table mapped to audit finding IDs.

- [ ] **Step 4: Write the implemented-corrections ledger before editing**

Record the already established safe correction as:

```markdown
### SAFE-001 — Remove stale hard-coded qbank attestation count

- Source: `question_bank.json#/_note`
- Current problem: the note says all 144 items are attested, while item-level status currently records 143 attested and 49 draft items.
- Replacement: state that item-level `status` is authoritative and that counts must not be inferred from `_note`.
- Clinical meaning changed: no.
- Attestation fields changed: no.
- Test: `qbank-note-uses-item-status-authority`.
- Status: approved for red-green implementation.
```

Add other corrections only when the canonical matrix classifies them `safe to implement`.

- [ ] **Step 5: Commit the audit and queues before curriculum edits**

```bash
git add MS3_RESIDENT_CLINICAL_CURRICULUM_AUDIT_2026-07-12.md 13_Faculty_Resources/Handoffs/MS3_RESIDENT_FACULTY_ATTESTATION_2026-07-12.md 13_Faculty_Resources/Handoffs/MS3_RESIDENT_EVIDENCE_REVIEW_PROMPTS_2026-07-12.md 13_Faculty_Resources/Handoffs/MS3_RESIDENT_IMPLEMENTED_CORRECTIONS_2026-07-12.md
git commit -m "audit: document MS3 and resident clinical findings"
```

---

### Task 5: Add Drift Guards and Implement Only Safe Corrections

**Files:**

- Create: `13_Faculty_Resources/_automation/clinical_claim_drift_guard.json`
- Create: `13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py`
- Modify: `question_bank.json#/_note`
- Modify: only additional files explicitly labeled `safe to implement` in the canonical matrix.

**Interfaces:**

- Consumes: implemented-corrections ledger.
- Produces: executable repository invariants and minimal low-risk changes.

- [ ] **Step 1: Create the first failing invariant**

Create:

```json
{
  "version": 1,
  "guards": [
    {
      "id": "qbank-note-uses-item-status-authority",
      "path": "question_bank.json",
      "kind": "json-string",
      "pointer": "/_note",
      "mustContain": [
        "Item-level status is authoritative",
        "do not infer current counts from this note"
      ],
      "mustNotContain": [
        "All 144 items attested"
      ]
    }
  ]
}
```

For every additional accepted safe correction, add one guard using `json-string` or `text-file`, with exact required and prohibited text. Never encode an unattested clinical recommendation as a required string.

- [ ] **Step 2: Create the drift-guard test**

```python
#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUARDS = ROOT / "13_Faculty_Resources" / "_automation" / "clinical_claim_drift_guard.json"


def json_pointer(value, pointer):
    current = value
    for raw in pointer.lstrip("/").split("/") if pointer else []:
        key = raw.replace("~1", "/").replace("~0", "~")
        current = current[int(key)] if isinstance(current, list) else current[key]
    return current


def main():
    config = json.loads(GUARDS.read_text(encoding="utf-8"))
    assert config.get("version") == 1
    guards = config.get("guards")
    assert isinstance(guards, list) and guards, "at least one drift guard is required"
    ids = [guard["id"] for guard in guards]
    assert len(ids) == len(set(ids)), "drift guard ids must be unique"

    failures = []
    for guard in guards:
        path = ROOT / guard["path"]
        assert path.exists(), f"{guard['id']}: missing {guard['path']}"
        if guard["kind"] == "json-string":
            value = json_pointer(json.loads(path.read_text(encoding="utf-8")), guard["pointer"])
            assert isinstance(value, str), f"{guard['id']}: pointer must resolve to a string"
        elif guard["kind"] == "text-file":
            value = path.read_text(encoding="utf-8")
        else:
            raise AssertionError(f"{guard['id']}: unknown kind {guard['kind']}")
        for expected in guard.get("mustContain", []):
            if expected not in value:
                failures.append(f"{guard['id']}: missing required text {expected!r}")
        for prohibited in guard.get("mustNotContain", []):
            if prohibited in value:
                failures.append(f"{guard['id']}: prohibited text remains {prohibited!r}")

    assert not failures, "\n".join(failures)
    print(f"clinical claim drift guard: OK — {len(guards)} invariant(s)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the drift guard and verify RED**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py
```

Expected: failure reporting the missing item-status-authority wording and the prohibited stale attestation count.

- [ ] **Step 4: Make the minimal qbank note correction**

Replace the sentence:

```text
All 144 items attested by Dr. Moss 2026-07-05 via qbank-attest.html.
```

with:

```text
Item-level status is authoritative; do not infer current counts from this note.
```

Do not change any qbank item, `status`, `retired`, correct answer, rationale, or evidence field.

Apply additional matrix-approved safe corrections one at a time, adding and failing their guard before each source edit.

- [ ] **Step 5: Run the drift guard and verify GREEN**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py
```

Expected: `clinical claim drift guard: OK — N invariant(s)` where `N` equals the final implemented-correction count.

- [ ] **Step 6: Update the implemented-corrections ledger**

For each correction, record the red failure, changed file, exact replacement, green result, downstream action, and whether a build/export was regenerated.

- [ ] **Step 7: Commit the safe corrections and guards**

```bash
git add 13_Faculty_Resources/_automation/clinical_claim_drift_guard.json 13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py question_bank.json 13_Faculty_Resources/Handoffs/MS3_RESIDENT_IMPLEMENTED_CORRECTIONS_2026-07-12.md
git commit -m "fix: apply audited low-risk curriculum corrections"
```

---

### Task 6: Make the Drift Guard a Publish Gate

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`

**Interfaces:**

- Consumes: `test_clinical_claim_drift_guard.py`.
- Produces: both MS3 and resident builds fail when an implemented correction drifts.

- [ ] **Step 1: Verify the existing publish gate does not call the drift guard**

Run:

```bash
rg -n "test_clinical_claim_drift_guard" 13_Faculty_Resources/_automation/site_build/build_and_check.sh
```

Expected: no matches.

- [ ] **Step 2: Add the drift guard after existing metadata validators**

The pre-case validation block must become:

```bash
python3 "$LIB/13_Faculty_Resources/_automation/validate_topic_meta.py"
python3 "$LIB/13_Faculty_Resources/_automation/validate_attestation_consistency.py"
python3 "$LIB/13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py"
```

- [ ] **Step 3: Verify the guard is wired once**

Run:

```bash
rg -n "test_clinical_claim_drift_guard" 13_Faculty_Resources/_automation/site_build/build_and_check.sh
```

Expected: exactly one match.

- [ ] **Step 4: Commit the publish-gate integration**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_and_check.sh
git commit -m "test: gate builds on audited claim invariants"
```

---

### Task 7: Run Full Verification and Close the Audit

**Files:**

- Verify all files created or modified above.
- Update final status fields only inside the audit and implemented-corrections documents.

**Interfaces:**

- Consumes: completed audit artifacts, safe changes, and drift guards.
- Produces: fresh verification evidence and an honest final status.

- [ ] **Step 1: Run focused Python checks**

```bash
python3 13_Faculty_Resources/_automation/test_build_curriculum_audit_corpus.py
python3 13_Faculty_Resources/_automation/test_clinical_claim_drift_guard.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/test_longitudinal_case.py
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
```

Expected: all commands exit 0. Record exact counts; do not summarize partial success as global success.

- [ ] **Step 2: Run both build/static gates**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both end with `build_and_check: <site> OK`. If Git LFS, Node runtime, or a pre-existing baseline issue fails, preserve the full error and separate it from targeted check results.

- [ ] **Step 3: Inspect the final diff and requirement coverage**

Run:

```bash
git diff --check 3272745..HEAD
git diff --stat 3272745..HEAD
git status --short --branch
```

Review every changed line and confirm:

- No clinical-judgment item was implemented.
- No attestation or review status was changed.
- Every implemented correction has a guard and ledger entry.
- Every accepted finding has exact replacement text and downstream matches.
- All seven review tracks have a coverage statement.
- The faculty checklist and evidence prompts reference canonical finding IDs.

- [ ] **Step 4: Update final audit statuses**

Change only audit-document status text from `approved for red-green implementation` or `pending execution` to the verified result shown by the commands. Leave faculty and evidence queues open.

- [ ] **Step 5: Commit verification-record updates**

```bash
git add MS3_RESIDENT_CLINICAL_CURRICULUM_AUDIT_2026-07-12.md 13_Faculty_Resources/Handoffs/MS3_RESIDENT_IMPLEMENTED_CORRECTIONS_2026-07-12.md
git commit -m "docs: record curriculum audit verification"
```

---

## Plan Self-Review Checklist

- Every approved deliverable has a producing task.
- All seven requested review tracks are assigned.
- Audit discovery is read-only and separated from implementation.
- Clinical and local-policy changes cannot enter the safe correction lane.
- A known low-risk stale-count correction has exact red-green steps.
- Additional safe corrections must be named in the canonical matrix before edits.
- Drift guards run in both publish lanes.
- Final completion requires focused validators, both builds, diff inspection, and exact coverage accounting.
