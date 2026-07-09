# Adobe MS3 Packet Export Handoff

Date: 2026-07-08

## Purpose

Use repo-owned MS3 curriculum content to generate polished Adobe packet and pocket-card outputs without moving curriculum authoring into Adobe.

Plain-language summary: the repo writes clean CSV files, and Adobe uses those rows to make the pages look professional.

## Generated Data

Run:

```bash
python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08
```

Generated files:

- `outputs/adobe_packet_exports/ms3_packet_sections.csv`
- `outputs/adobe_packet_exports/ms3_pocket_cards.csv`
- `outputs/adobe_packet_exports/ms3_adobe_export_manifest.json`

Note: generated CSV/JSON files are machine output and should not be hand-edited.
If any text correction is needed, re-run the repository export flow after source edits.

## Suggested Adobe Templates

### Week Packet Template

Use `ms3_packet_sections.csv`.

Recommended fields:

- Header: `source_title`
- Small label: `packet_group`
- Section label: `section_heading`
- Body text: `section_text`
- Footer: `generated_on` and `review_status`

### Pocket Card Template

Use `ms3_pocket_cards.csv`.

Recommended fields:

- Front title: `card_title`
- Body: `card_text`
- Footer: `review_status`

## Required Review Before Distribution

- Faculty attestation is required before any generated PDF is learner-facing.

- Confirm no PHI or patient-identifying details appear in the final PDF.
- Confirm local-policy language is either removed, locally completed, or visibly marked.
- Confirm clinical claims are appropriate for MS3 learners.
- Confirm the final PDF layout does not hide safety warnings or review status.

## Source-Of-Truth Rule

If text needs revision, edit the Markdown source in `14_Tracks/MS3/Student_Ready_Pack/`, rerun the exporter, then rerun the Adobe merge. Do not edit curriculum text only inside Adobe.
