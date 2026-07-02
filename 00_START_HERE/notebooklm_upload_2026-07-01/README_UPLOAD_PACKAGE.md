# NotebookLM Upload Package - Psychiatry Clerkship Library

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

This folder contains the curated NotebookLM source set for `/Users/jm/Psychiatry-Clerkship-Library`.

## Why this is curated instead of raw-folder upload

Google's current NotebookLM FAQ lists 50 sources per notebook on the standard tier and a per-source cap of 500,000 words or 200 MB. The clerkship library has 1001 non-system files, including 503 PDFs and 100 audio files. Uploading every raw file would exceed ordinary source limits and produce worse retrieval.

This package preserves the clinical content in fewer, coherent sources:

- master NotebookLM briefing,
- MS3 curriculum bundles,
- clinical skills/core topic/acute safety bundles,
- evidence and faculty bundles,
- extracted Office text where safe,
- PDF/audio/tool indexes rather than raw duplication,
- complete manifest and exclusion summary,
- prompting plan.

Known PHI-risk audit artifacts, pointer files, and case-specific filenames are excluded from content bundles.

## Recommended upload order

1. `00_MASTER_COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md`
2. `18_NOTEBOOKLM_PROMPTING_PLAN.md`
3. `01_MS3_CORE_PACK.md`
4. `02_CLINICAL_SKILLS_AND_DOCUMENTATION.md`
5. `03_CORE_TOPICS.md`
6. `04_ACUTE_SAFETY_AND_CONSULTS.md`
7. `05_PSYCHOPHARMACOLOGY_AND_PROTOCOLS.md`
8. `06_FAMILY_RELATIONAL_DISCHARGE.md`
9. `07_EVIDENCE_LANDMARKS_ROUNDS.md`
10. `08_CASES_OSCE_SHELF_EXAM.md`
11. `09_FACULTY_QA_ATTESTATION_AND_ROADMAP.md`
12. `12_ROOT_STRATEGY_AUDIT_QA_OPENEVIDENCE.md`
13. Remaining manifest/index/Office-extract sources as useful.

Plain-English note: upload the master and prompting plan first, then the clinical bundles. The indexes tell NotebookLM what else exists without forcing it to ingest hundreds of PDFs and audio files.

Joshua Moss, MD | Psychiatrist
