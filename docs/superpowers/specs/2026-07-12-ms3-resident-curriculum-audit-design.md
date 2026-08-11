# MS3 and Resident Curriculum Clinical Audit Design

**Date:** 2026-07-12  
**Repository:** `jmoss333/psychiatry-clerkship`  
**Status:** Approved design; implementation requires a separate reviewed plan

## Purpose

Audit the complete learner-facing MS3 and resident psychiatry curriculum for clinical accuracy, safety, communication quality, inclusivity, educational sequencing, and evidence provenance. The audit must trace each claim into downstream quizzes, flashcards, cases, summaries, and generated sites. It may implement only low-risk corrections that are clearly supported; it must route clinical judgment and unresolved evidence questions to explicit review queues.

The audit will not use model recall as evidence. A model may identify a candidate concern, but a repository source, current authoritative source, or faculty decision must support every finding and correction.

## Approved Audit Boundary

The audit is surface-complete: it covers what a learner can currently reach and the data or generators that can reproduce those claims.

### MS3 corpus

Include:

- Every Markdown and HTML source registered in `13_Faculty_Resources/_automation/site_build/site_manifest.json`.
- The six weekly curriculum files, MS3 orientation, core reading list, weekly map, pocket guides, expansion modules, OSCEs, synthetic cases, and shelf-preparation pages.
- Claim-bearing runtime data: `topic_meta.json`, `question_bank.json`, `reasoning_cases.json`, `communication_cases.json`, `family_systems_scenarios.json`, `longitudinal_case.json`, `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`, `evidence_registry.json`, `tool_registry.json`, and `13_Faculty_Resources/reviewed.json`.
- Directly loaded audio or transcript metadata when it communicates clinical claims.

### Resident corpus

Include the complete MS3 corpus inherited by the resident build, plus:

- The seven pages under `14_Tracks/Resident/`.
- The three resident interactive tools and their packs under `_prototypes/`.
- `reasoning_cases_resident.json` and resident onboarding media or transcripts.
- `13_Faculty_Resources/_automation/site_build/resident_section.py`, because it defines resident additions, substitutions, navigation, and hidden inherited content.

### Derivative review corpus

Treat generated sites, Anki exports, question-bank practice, landmark self-tests, search summaries, NotebookLM compilations, and PDF/Adobe outputs as downstream copies rather than independent authorities. Check them for duplication and propagation whenever a source finding can affect them.

### Exclusions

Exclude `_source/`, `_more-from-computer.md`, `99_Archive/`, historical audit files, handoff drafts, generated `_build/` output, and old NotebookLM bundles as canonical teaching sources. Include an excluded artifact only when the current build, navigation, runtime, or a learner-facing page links to it. Treat `14_Tracks/Resident_PGY2/` as legacy planning material unless the current resident build consumes it.

## Review Architecture

Run seven independent discovery tracks against the same fixed corpus manifest:

1. Diagnostic accuracy and differential diagnosis.
2. Medication and acute-safety guidance.
3. Suicide, agitation, catatonia, and emergency content.
4. Trauma-informed and relational communication.
5. Developmental, cultural, and accessibility considerations.
6. Educational sequencing for MS3 versus resident learners.
7. Citation quality, currency, and claim provenance.

Each track produces candidate findings only. A central adjudication pass deduplicates overlapping findings, verifies exact repository locations, assigns the disposition gate, and searches downstream surfaces. This separation prevents seven reviewers from silently making inconsistent clinical edits.

## Evidence Policy

### Acceptable support

Use, in descending order of authority:

1. Current regulators, official prescribing information, and controlling legal or institutional policy.
2. Current professional-society or government clinical practice guidelines.
3. Systematic reviews, consensus statements, and primary studies when a guideline does not answer the question.
4. Existing repository sources only after verifying source identity, currency, and applicability.

For a citation to count as verified, confirm title, author or issuing body, year/version, identifier or canonical URL, and that the source actually supports the proposed wording. A resolving DOI, PMID, or URL alone is insufficient.

### Evidence states

- `verified-current`: a current authoritative source directly supports the wording.
- `verified-limited`: the source is real but population, setting, certainty, or applicability limits the claim.
- `unverified`: the cited source has not been checked against the claim.
- `conflicting`: credible sources disagree or local policy determines the answer.
- `missing`: no supporting source is identified.

Every numeric threshold, dose, monitoring interval, legal statement, local-protocol instruction, pregnancy/lactation statement, and emergency action threshold must carry an evidence state.

## Finding Dispositions

Every finding receives exactly one primary disposition.

### Safe to implement

Use only when the correction is low risk and does not require clinical judgment. Examples include:

- Broken internal links, typographical truncation, stale counts, duplicated text, or mislabeled learner level.
- Accessibility or person-first-language corrections that do not change clinical meaning.
- Exact propagation of already attested source wording into a derivative.
- Removal of learner exposure to material already marked draft, pending, or retired when current governance rules clearly prohibit that exposure.

A clinical claim is not safe merely because it sounds familiar or one source supports it.

### Faculty-attestation required

Use when evidence is adequate but the change alters clinical judgment, treatment sequencing, learner authority, local workflow, legal interpretation, or an already attested clinical statement. Provide exact provisional replacement text and a focused yes/no or choose-one faculty decision.

### Evidence review required

Use when the source is missing, outdated, misidentified, indirect, internally inconsistent, or contested. Provide exact provisional replacement text, but label it as non-implementable until the evidence question is resolved. After evidence review, the item may move to faculty attestation or safe implementation.

## Canonical Findings Matrix

The human-readable canonical matrix will live at:

`MS3_RESIDENT_CLINICAL_CURRICULUM_AUDIT_2026-07-12.md`

Each issue will include:

- Stable finding ID and severity.
- Review track and learner audience (`MS3`, `resident`, or `both`).
- Exact source path and line or JSON pointer.
- Exact quotation or precise element identity.
- Clinical or educational risk.
- Exact proposed replacement text.
- Primary disposition.
- Evidence state and authoritative-source identity or explicit source-needed note.
- Faculty-confirmation question when applicable.
- Downstream matches in quizzes, flashcards, cases, summaries, metadata, tools, and generated outputs.
- Implementation status and verification test, when changed.

Findings must distinguish a wrong claim from an overconfident claim, a learner-level mismatch, a local-policy dependency, an accessibility problem, and a provenance failure.

## Deliverables

1. `MS3_RESIDENT_CLINICAL_CURRICULUM_AUDIT_2026-07-12.md` — scope record, canonical findings matrix, coverage summary, and limitations.
2. `13_Faculty_Resources/Handoffs/MS3_RESIDENT_IMPLEMENTED_CORRECTIONS_2026-07-12.md` — file-by-file low-risk changes, rationale, evidence, and verification.
3. `13_Faculty_Resources/Handoffs/MS3_RESIDENT_FACULTY_ATTESTATION_2026-07-12.md` — concise checklist with exact old/new text and decision boxes.
4. `13_Faculty_Resources/Handoffs/MS3_RESIDENT_EVIDENCE_REVIEW_PROMPTS_2026-07-12.md` — ready-to-paste OpenEvidence and Claude prompts grouped by clinical question, population, learner level, and required source hierarchy.
5. `13_Faculty_Resources/_automation/clinical_claim_drift_guard.json` and `test_clinical_claim_drift_guard.py` — machine-readable invariants and regression tests for implemented corrections.
6. `13_Faculty_Resources/Handoffs/MS3_RESIDENT_AUDIT_CORPUS_2026-07-12.json` — reproducible corpus inventory with source, audience, visibility, review status, risk class, and downstream consumers.

## Downstream Duplication Method

For every finding:

1. Search the repository for distinctive phrases, numbers, drug names, thresholds, citations, and source slugs.
2. Inspect structured consumers explicitly: `topic_meta.json`, question banks, landmark quizzes, reasoning/communication/family cases, longitudinal cases, Anki generation, search generation, and resident overlay code.
3. Classify each match as canonical source, manual duplicate, generated derivative, or unrelated context.
4. Correct only safe manual duplicates. Regenerate derivatives from corrected sources where the generator is authoritative.
5. Add a regression invariant for every implemented correction so the deprecated wording or unsafe exposure cannot silently return.

## Test-First Correction Workflow

For each low-risk correction:

1. Add the smallest drift-guard assertion that fails against the current repository state.
2. Run it and confirm the expected failure.
3. Make the minimal source or governance change.
4. Run the targeted test and confirm it passes.
5. Run relevant existing validators, build/static checks, and smoke checks.
6. Record both the correction and verification result in the implemented-corrections handoff.

Tests must not encode unapproved clinical recommendations. Faculty-attestation and evidence-review items remain documentation-only until their gate is satisfied.

## Verification

Minimum final verification:

- Clinical drift-guard tests.
- Topic metadata validation.
- Attestation consistency validation.
- Question-bank structural and duplication checks.
- Longitudinal-case validation.
- MS3 and resident build/static checks.
- Anki/export tests when affected.
- Browser smoke tests for changed interactive or navigation behavior.
- Citation identity and currency checks for every implemented clinical wording change.
- A final clean-worktree/diff review that separates this task's edits from any unrelated user changes.

If a broad check fails for an unrelated baseline reason, report it separately and do not represent targeted success as a clean global result.

## Safety and Completion Rules

- Do not alter clinical text solely to improve style.
- Do not invent local hospital policy, legal requirements, or dosing protocols.
- Do not change `reviewed`, `attested`, or equivalent status merely because a reviewer believes content is correct.
- Do not expose draft or retired assessment content without explicitly documenting and testing the governance decision.
- Do not claim the audit is complete unless every included corpus item is assigned to at least one review track and every candidate finding is adjudicated.
- Do not claim a correction is verified without fresh command output and a directly supporting source.

## Plain-Language Summary

The audit follows the material learners can actually open, checks the original teaching pages and every copied version, and separates obvious maintenance fixes from decisions that belong to a psychiatrist or an updated evidence search. High-risk statements get an evidence receipt; uncertain clinical language is queued, not silently rewritten.

## Next Best Option

After the audit, convert accepted findings into a content-hashed evidence receipt system so a clinically meaningful edit automatically reopens review instead of inheriting an old attestation date.
