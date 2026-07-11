# Top 10 Faculty and Adobe Polish Package Design

Date: 2026-07-11
Repo: Psychiatry Clerkship Library
Status: Draft pending written specification review

## Plain-language summary

Prepare the ten most useful MS3 curriculum PDFs as one organized faculty-review package. Faculty should be able to inspect the current PDFs immediately, while an Adobe/InDesign designer receives editable merge data and clear production instructions. Markdown remains the curriculum source of truth; every generated artifact remains non-canonical and marked for faculty review.

## Goals

- Curate a coherent ten-item set covering the core six-week clerkship workflow.
- Preserve the existing PDFs as visual review proofs.
- Generate editable data for Adobe/InDesign finishing from canonical Markdown sources.
- Give faculty one review checklist and one combined review copy.
- Keep source traceability and review status visible in every generated record.

## Non-goals

- Do not rewrite or clinically revise curriculum content.
- Do not make Adobe files the authoritative source.
- Do not mark any artifact as approved for learners.
- Do not include PHI, copyrighted third-party full text, or invented local policy.
- Do not convert interactive HTML tools into static PDFs.

## Selected artifacts

| Order | Artifact | Existing PDF | Canonical source | Production format |
|---|---|---|---|---|
| 1 | Orientation Packet | `outputs/pdf_library/pdfs/01_welcome_orientation/002_orientation.pdf` | `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md` | Full packet |
| 2 | Interview & MSE Pocket Guide | `outputs/pdf_library/pdfs/02_start_encounter/030_pg-interview.pdf` | `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md` | Pocket card |
| 3 | Formulation & DDx Pocket Guide | `outputs/pdf_library/pdfs/03_understand_problem/031_pg-formulation.pdf` | `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md` | Pocket card |
| 4 | Suicide Risk & Safety Card | `outputs/pdf_library/pdfs/04_assess_safety_acuity/032_pg-suicide.pdf` | `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md` | Pocket card |
| 5 | Six-Week Reading Map | `outputs/pdf_library/pdfs/10_evidence_reference/041_reading-map.pdf` | `14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md` | Full packet |
| 6 | Capacity/Delirium/Catatonia/Withdrawal | `outputs/pdf_library/pdfs/04_assess_safety_acuity/034_exp-consult.pdf` | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md` | Module packet |
| 7 | Documentation & Oral Presentation | `outputs/pdf_library/pdfs/08_present_team/033_doc-oral.pdf` | `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md` | Module packet |
| 8 | Family & Discharge | `outputs/pdf_library/pdfs/07_family_systems/036_exp-family.pdf` | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md` | Module packet |
| 9 | OSCE Stations | `outputs/pdf_library/pdfs/09_practice_exam_prep/038_osce.pdf` | `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md` | OSCE packet |
| 10 | Shelf Review Guide | `outputs/pdf_library/pdfs/09_practice_exam_prep/039_shelf.pdf` | `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md` | Module packet |

## Output structure

Generate the package under the ignored directory `outputs/faculty_polish_top10/`:

```text
outputs/faculty_polish_top10/
├── README.md
├── faculty_review_index.md
├── faculty_review_packet.pdf
├── top10_adobe_merge.csv
├── top10_manifest.json
├── adobe_indesign_handoff.md
└── pdfs/
    ├── 01_orientation_packet.pdf
    ├── 02_interview_mse_pocket_guide.pdf
    ├── 03_formulation_ddx_pocket_guide.pdf
    ├── 04_suicide_risk_safety_card.pdf
    ├── 05_six_week_reading_map.pdf
    ├── 06_acute_consult_module.pdf
    ├── 07_documentation_oral_presentation.pdf
    ├── 08_family_discharge.pdf
    ├── 09_osce_stations.pdf
    └── 10_shelf_review_guide.pdf
```

The exporter must clear its own `pdfs/` directory before copying selected PDFs so removed selections cannot leave stale files.

## Components

### Selection registry

Define the ten selected records in code with stable order, title, source Markdown path, source PDF path, output filename, production format, and review status. Validate that all source paths exist before creating output.

### Curated PDF copies

Copy the current generated PDFs into the curated `pdfs/` directory with stable, human-readable filenames. Copies are review proofs, not new curriculum sources.

### Adobe merge data

Write one CSV row per Markdown section. Each row must include:

- Artifact order and title
- Production format and template hint
- Section order, heading, and body text
- Canonical source path
- Review PDF path
- Generation date
- `needs_faculty_review` status

Markdown parsing should reuse the established Adobe packet-export behavior so headings and section text remain consistent with current outputs.

### Manifest

Write JSON containing the generation date, package review status, selected artifact count, copied PDF count, source paths, generated paths, and guardrails. Each selected artifact must remain traceable from canonical Markdown to review PDF and curated output.

### Faculty review index

Create a concise Markdown table with one row per artifact and checkboxes for:

- Clinical accuracy and MS3 appropriateness
- Local-policy language
- PHI or patient-identifying details
- Accessibility and readability
- Approval, revision requested, or deferred

The index must tell reviewers to correct canonical Markdown rather than editing generated outputs.

### Combined review packet

Create one PDF with:

1. A cover page identifying the package as a faculty review draft.
2. A review checklist and artifact table.
3. The ten selected PDFs appended in order, each preceded by a divider page.

The combined packet is for review convenience only. Standalone PDFs remain available for individual InDesign finishing and distribution after approval.

### Adobe/InDesign handoff

Document the four template families:

- Full packet
- Pocket card
- Module packet
- OSCE packet

Specify the CSV field mappings, required review-status footer, source-of-truth rule, accessibility checks, and regeneration command. Because the repo has no `.indd` or `.idml` template, this package prepares editable merge inputs and review proofs rather than claiming to deliver a finished InDesign template.

## Data flow

```text
Canonical Markdown
        |
        +--> section parser --> Adobe merge CSV
        |
Website PDF library --> selected PDF copies --> combined faculty review PDF
        |
        +--> manifest + review index + InDesign handoff
```

## Error handling

- Abort before publishing the package if any selected Markdown source or PDF is missing.
- Reject duplicate artifact order numbers and output filenames.
- Reject an artifact count other than ten.
- Write generated files only within `outputs/faculty_polish_top10/`.
- Preserve `needs_faculty_review`; no implementation path may silently promote approval status.
- Remove stale curated PDF copies on each successful regeneration.

## Testing and verification

- Unit-test that the registry contains exactly ten unique artifacts in stable order.
- Unit-test missing-source validation, CSV fields, manifest counts, and stale-PDF cleanup.
- Run the exporter with deterministic `--generated-on 2026-07-11`.
- Confirm ten standalone PDFs exist and can be parsed.
- Record the generated front-matter and divider-page count, then confirm the combined packet page count equals those support pages plus all source PDF pages.
- Render at least the cover, checklist, one pocket-card page, and one dense module page to images for visual inspection.
- Confirm generated outputs are ignored by Git and only source code, tests, documentation, and ignore rules appear in status.

## Success criteria

- Faculty can open one combined review PDF and evaluate all ten artifacts.
- A designer can use the merge CSV and handoff without extracting text from PDFs.
- Every output identifies its canonical source and review status.
- Regeneration is deterministic for the same inputs and date.
- No curriculum text is changed as part of package preparation.

## Future extension

Add optional QR-coded review links keyed by manifest artifact ID. Faculty decisions could then be collected in a separate review record and synchronized into the repository's attestation workflow without placing approval state inside Adobe files.
