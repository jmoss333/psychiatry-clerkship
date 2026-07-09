# MS3 Adobe Packet Export

This tool exports MS3 Student Ready Pack Markdown into CSV/JSON files for Adobe InDesign data merge or Adobe Express copy placement.

Plain-language summary: the script turns the repo's student handouts into spreadsheet-like rows. Adobe can then place those rows into polished packet and pocket-card templates without becoming the curriculum source.

## Source Of Truth

The source files remain in:

- `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md`
- `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/`
- `14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md`
- `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md`
- `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md`
- `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md`
- `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md`

## Run

```bash
python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08
```

## Outputs

Generated files are written to `outputs/adobe_packet_exports/`:

- `ms3_packet_sections.csv` - one row per packet/module/OSCE section.
- `ms3_pocket_cards.csv` - one row per condensed pocket-card source file.
- `ms3_adobe_export_manifest.json` - source paths, row counts, and review status.

## Adobe Template Fields

Use these merge fields for a packet template:

- `asset_type`
- `packet_group`
- `source_title`
- `section_order`
- `section_heading`
- `section_text`
- `review_status`
- `generated_on`
- `adobe_template_hint`

Use these merge fields for a pocket-card template:

- `card_title`
- `card_text`
- `review_status`
- `generated_on`
- `adobe_template_hint`

## Review Rule

Every generated row is marked `needs_faculty_review`. A generated Adobe PDF should not be learner-facing until the source content and final layout are reviewed.
