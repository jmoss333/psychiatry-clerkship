# Website PDF Library Export

This tool exports the Markdown pages that ship in the MS3 website manifest into an organized local PDF library.

Plain-language summary: the script prints the website curriculum into PDFs, grouped the same way a learner experiences the site. The Markdown files stay the curriculum source of truth; the PDFs are generated handouts for offline review, printing, or Adobe finishing.

## Source Of Truth

The exporter reads:

- `13_Faculty_Resources/_automation/site_build/site_manifest.json`
- the Markdown source files referenced by that manifest

Interactive HTML tools are indexed but not converted to PDF, because static PDFs would remove scoring, timers, local practice history, and other interactive behavior.

## Run

```bash
python3 tools/pdf_library_export/export_website_pdf_library.py --generated-on 2026-07-12
```

Generated files are written to `outputs/pdf_library/`:

- `pdfs/` - organized generated PDFs.
- `index.md` - human-readable library table.
- `website_pdf_library_manifest.json` - machine-readable trace from PDF back to repo source and website slug.

## Visible PDF Contract

Standalone PDFs use the repository's rust and teal visual language. Visible pages contain only:

- curriculum content rendered from canonical Markdown;
- `Created from the Psychiatry Clerkship Library - <Month D, YYYY>` in the footer; and
- the page number.

The exporter omits wrapper titles, source paths, site slugs, review status, legacy `Generated:` lines, and export-note pages. Internal source and review traceability remain in the JSON manifest and library index. `--generated-on` must be an ISO date (`YYYY-MM-DD`) and deterministically supplies the visible footer date.

## Review Rule

Every generated PDF remains marked `needs_faculty_review` in the non-visible manifest. A generated PDF should not be learner-facing until the source content and final output are reviewed.
