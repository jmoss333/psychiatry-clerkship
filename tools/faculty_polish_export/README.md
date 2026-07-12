# Top 10 Faculty and Adobe Polish Export

This tool packages ten high-value MS3 curriculum PDFs for faculty review and Adobe/InDesign finishing.

Plain-language summary: it collects the ten selected review PDFs, makes one combined faculty packet, and creates editable CSV data for a designer. Curriculum text still belongs in the repository Markdown.

## Run

Use the bundled workspace Python when available:

```bash
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/faculty_polish_export/export_top10_faculty_polish.py \
  --generated-on 2026-07-12
```

Default output: `outputs/faculty_polish_top10/`

## Generated package

- `faculty_review_packet.pdf`: internal review cover, faculty checklist, dividers, and all ten content-only source PDFs.
- `pdfs/`: ten standalone content-only review proofs with stable filenames and dated library footers.
- `top10_adobe_merge.csv`: editable section-level InDesign merge data.
- `top10_manifest.json`: source paths, review status, outputs, and measured page counts.
- `faculty_review_index.md`: review checklist and decisions table.
- `adobe_indesign_handoff.md`: template families, CSV mappings, and finishing checks.
- `README.md`: short package instructions.

## Review gate

Every output remains `needs_faculty_review`. Do not distribute generated PDFs to learners until clinical scope, local policy, PHI, and accessibility checks are complete.

If content changes are needed, edit the canonical Markdown source and rerun the exporter. Do not make Adobe or generated PDF files the only location of a curriculum correction.

## InDesign finishing

The repo currently has no `.indd` or `.idml` template. Use `top10_adobe_merge.csv` and `adobe_indesign_handoff.md` to create or map a template. Visible frames use only the artifact title, section heading, section body, and formatted creation date. Source paths and review state remain internal. An actual Adobe data merge requires Creative Cloud authentication, a reviewed InDesign template, IDML inspection, and explicit approval of the field-mapping JSON.

## Test

```bash
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/faculty_polish_export/test_export_top10_faculty_polish.py
```
