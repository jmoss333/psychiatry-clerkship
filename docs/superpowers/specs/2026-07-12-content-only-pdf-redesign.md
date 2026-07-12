# Content-Only PDF Redesign

Date: 2026-07-12
Repo: Psychiatry Clerkship Library
Status: Draft pending written specification review

## Plain-language summary

Redesign the generated curriculum PDFs using the repository's existing rust, teal, white, charcoal, and gray visual language. Each standalone PDF should show the curriculum content once, a dated library footer, and page numbers. Production details such as source paths, site slugs, review status, duplicate wrapper titles, and export-note pages must not appear in the visible handout.

Markdown remains the curriculum source of truth. Adobe/InDesign remains an optional finishing layer, not the only place where curriculum text or design rules live.

## Goals

- Make all 65 standalone website PDFs look more polished while remaining recognizably part of the current repository.
- Keep visible pages limited to curriculum content, one library creation date, and page numbers.
- Remove duplicate and production-only material without changing clinical wording.
- Regenerate the curated top-10 standalone PDFs from the improved library.
- Preserve deterministic generation, source traceability, and faculty-review state in non-visible manifests and CSV data.
- Prepare a clean Adobe/InDesign field contract for later finishing after Adobe authentication is restored.

## Non-goals

- Do not rewrite, summarize, or clinically edit curriculum content.
- Do not create a new logo, color system, illustration set, or unrelated brand identity.
- Do not make Adobe files canonical.
- Do not expose source paths, review status, or internal workflow notes in learner-facing standalone PDFs.
- Do not remove internal review metadata from JSON manifests or Adobe merge data.
- Do not convert interactive HTML tools into PDFs.

## Scope

The redesign applies to:

- The 65 standalone PDFs under `outputs/pdf_library/pdfs/`.
- The 10 standalone curated copies under `outputs/faculty_polish_top10/pdfs/`.
- The source pages embedded inside `outputs/faculty_polish_top10/faculty_review_packet.pdf`.

The combined `faculty_review_packet.pdf` remains an internal review container. Its faculty cover, checklist, and dividers remain because they support review rather than learner distribution. The embedded source pages use the new content-only design.

## Visible content rule

Every standalone PDF may visibly contain only:

1. Curriculum content rendered from canonical Markdown.
2. The footer text `Created from the Psychiatry Clerkship Library - <Month D, YYYY>`.
3. `Page N`.

The renderer must remove these visible elements:

- Manifest/website wrapper title when the Markdown already contains an H1.
- Website slug.
- Canonical source path.
- Review status.
- Machine-oriented generation metadata.
- Any Markdown line matching `Generated: <value>`.
- The appended `Export Note` page.

If a Markdown source lacks an H1, the renderer may use the manifest title once as the document title. PDF document properties may retain title and author metadata because those properties are not visible page content.

## Date rule

- The CLI `--generated-on` ISO date remains the deterministic source value.
- Visible output formats that value as `Month D, YYYY`; for example, `2026-07-12` becomes `July 12, 2026`.
- The footer appears on every page.
- The date is the date the PDF was created from the library, not the date the underlying clinical content was authored or reviewed.
- Invalid ISO dates fail generation with a clear error rather than silently producing inconsistent text.

## Visual system

### Page frame

- US Letter portrait.
- White background.
- Left and right margins: approximately 0.7 inch.
- Top margin: approximately 0.65 inch.
- Bottom content margin: approximately 0.72 inch to protect the footer.
- Thin rust accent rule at the top of the first page only.

### Typography and color

- Document H1: Helvetica Bold, approximately 19-20 pt, rust `#A84830`.
- H2: Helvetica Bold, approximately 14 pt, teal `#2A6B5E`, with a subtle pale-teal rule below.
- H3: Helvetica Bold, approximately 11-12 pt, charcoal `#3B332C`.
- Body: Helvetica, approximately 10-10.5 pt with 13.5-14 pt leading, charcoal/black.
- Footer: Helvetica, approximately 7.5-8 pt, gray `#68757B`.

The palette stays close to the current PDFs. The improvement comes from spacing, hierarchy, and removal of clutter rather than a new visual identity.

### Content components

- Bullets and numbered lists retain stable indentation and line wrapping.
- Blockquotes render as content without visible Markdown `>` markers.
- Code/preformatted blocks retain a restrained pale-gray background.
- Markdown tables retain a robust printable treatment: teal header emphasis, light row separation, and automatic page splitting. If a table is too wide for reliable columns, it falls back to the existing stacked row treatment rather than shrinking text below readable size.
- Links render with readable labels and destinations; no internal tool tokens appear.
- Safety warnings and emphasized content must not be hidden by decorative styling.

### Footer

- A thin light-gray rule separates content from the footer.
- Left: `Created from the Psychiatry Clerkship Library - July 12, 2026`.
- Right: `Page N`.
- Footer position and dimensions remain stable across all pages.

## Rendering flow

```text
Canonical Markdown
        |
        +--> remove machine Generated lines
        +--> parse headings, paragraphs, lists, quotes, code, and tables
        +--> apply repo-native ReportLab styles
        +--> add dated footer and page number
        |
        +--> 65 content-only standalone PDFs
                    |
                    +--> 10 curated copies
                    +--> combined internal faculty review packet
                    +--> optional Adobe/InDesign finishing
```

## Adobe/InDesign boundary

Adobe initialization currently requires Creative Cloud reauthentication. Local source-driven PDF redesign can proceed independently. Actual Adobe template conversion or data merge resumes only after reauthentication.

For a later InDesign merge:

- Visible mapped fields: `artifact_title`, `section_heading`, `section_text`, and formatted creation date.
- Internal CSV fields such as `canonical_source`, `review_status`, `artifact_id`, and `review_pdf` remain available for traceability but are not mapped into visible frames.
- A single repo-native template should be created or converted from a representative one-page layout.
- The Adobe skill's required mapping JSON must be shown to and approved by the user in a separate turn before placeholders are applied.

## Error handling

- Fail before publishing if `--generated-on` is not a valid ISO date.
- Fail if any manifest Markdown source is missing.
- Preserve the current stale-PDF cleanup within the exporter's own output directory.
- Do not edit canonical Markdown merely to hide a `Generated:` line; suppress it during rendering.
- Do not remove traceability or review status from manifests.
- Do not begin an Adobe merge while authentication, template URL, or mapping approval is missing.

## Testing and verification

- Add a regression test proving visible PDFs do not contain `Website slug`, `Source:`, `Review status`, or `Export Note`.
- Add a regression test proving the Markdown H1 appears exactly once.
- Add a regression test proving source `Generated:` lines are omitted.
- Test ISO-to-human-readable date formatting and invalid-date failure.
- Test the footer text and page number on multipage output using text extraction.
- Preserve the existing blockquote, Unicode, manifest, grouping, stale-output, and path-resolution tests.
- Regenerate all 65 PDFs and the top-10 package with `--generated-on 2026-07-12`.
- Parse every PDF and confirm no file is blank or corrupt.
- Render and inspect representative first, middle, and final pages from orientation, pocket guide, acute consult, OSCE, and shelf-review artifacts.
- Inspect wide tables, long headings, code blocks, bullets, and page transitions for clipping or overlap.
- Confirm generated outputs remain ignored by Git.

## Success criteria

- Standalone PDFs visibly contain only curriculum content, the dated library footer, and page numbers.
- The visual style remains recognizably consistent with the current repository.
- No duplicate title or production-only export page remains.
- All 65 library PDFs and 10 curated PDFs regenerate successfully.
- Internal manifests retain source paths and `needs_faculty_review` state.
- Representative rendered pages show no clipping, overlap, unreadable tables, or broken glyphs.

## Innovative follow-up

After the shared template is stable, add format presets such as `standard-handout`, `pocket-card`, and `faculty-review`. Each preset would use the same canonical content and palette while changing only page geometry and density, allowing Adobe/InDesign or the local exporter to produce purpose-specific variants without duplicating curriculum text.
