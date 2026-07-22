# Shelf/COMAT Psychiatry Question Bank — Dual-Exam Initiative

Original, Shelf-style **and** COMAT-aligned psychiatry question bank for the UNE MS3 (and other
MS3) six-week clerkship. Prepares learners for the **NBME Psychiatry Clinical Science Subject
Exam** and the **NBOME COMAT Clinical Psychiatry** exam, and reinforces humane, relational
psychiatry — not trivia.

**All content here is AI-drafted and pending faculty attestation (Joshua Moss, MD).** Fictional
composites only; no PHI; no reproduction of NBME/NBOME/USMLE/commercial-bank items.

## What this is (and is not)

This is a **parallel, superset-schema artifact set** for ChatGPT Sol/Codex to validate and
integrate. It **does not** modify the live, attested `question_bank.json`, the SPA, the build,
or `reviewed.json`. It is designed so items are **back-portable** into the live bank (the schema
is a strict superset of the repo's item shape) while adding the dual-exam blueprint mappings,
external-evidence references, and richer teaching fields the initiative requires.

See `11_FINAL_REPORT.md` §Integration for why this parallel-artifact posture was chosen and the
key finding that reshapes the expansion strategy.

## Files (read in order)

| # | File | What it is |
|---|---|---|
| 00 | `00_README.md` | This orientation |
| 01 | `01_BLUEPRINT_CROSSWALK.md` | NBME×COMAT crosswalk, official percentages (accessed 2026-07-13), integer quotas for 180/360/480, cross-cutting distributions, anti-inpatient-bias guard |
| 02 | `02_ITEM_SCHEMA.json` | Canonical machine-readable item schema (JSON Schema draft-07; superset of the live bank's) |
| 03 | `03_ITEM_WRITING_REVIEW_RUBRIC.md` | Item-writing standard + evidence standard + 5-pass review workflow |
| 04 | `04_pilot_batch_01.json` | **The 24-item pilot** (machine-readable; the source of truth) |
| 05 | `05_coverage_dashboard.json` | Coverage data: per-category + cross-cutting tallies, pilot vs quotas, per-item cell map |
| 06 | `06_FACULTY_REVIEW_PACKET_pilot01.md` | Human-readable, print-friendly review packet (one section per item, with attest/revise/retire checkboxes) |
| 07 | `07_REFERENCE_LEDGER.md` | Every reference, verification status, access date |
| 08 | `08_CONCEPT_INDEX.md` | Duplicate/concept index — intra-pilot + near-neighbors in the live 192-item bank |
| 09 | `09_ATTESTATION_QUEUE.json` | Faculty-attestation queue, ordered by review priority |
| 10 | `10_CONTINUATION_MANIFEST.md` | Completed vs missing quotas; next uncovered cells; drafter instructions to resume |
| 11 | `11_FINAL_REPORT.md` | Final report + exact next task for Sol/Codex |

## Quick facts

- **Pilot:** 24 items, 2 per category × 12 categories, all `status: draft`.
- **Validation:** passes `02_ITEM_SCHEMA.json` (0 errors); keys balanced A/B/C/D = 6/6/6/6;
  difficulty 5/14/5; 3 two-tier, 2 relational-type items; 5 landmark citations PMID/DOI-verified.
- **Staged sizes:** pilot 24 → V1 180 → comprehensive 360 → expansion 480.

## Guardrails honored

Original items only; every keyed answer verified against a current authoritative source with a
real (never fabricated) citation; safety content models sound risk language without method
detail; demographics only when clinically relevant; osteopathic integration only where genuine.
The live attested bank and `reviewed.json` were not touched.
