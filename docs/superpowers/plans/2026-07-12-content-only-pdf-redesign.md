# Content-Only PDF Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate the curriculum PDF library and top-10 faculty set with the repository's current rust/teal design, visible curriculum content only, and a dated library footer on every page.

**Architecture:** Update the existing ReportLab website-PDF renderer rather than introducing a second PDF engine. The renderer will suppress machine generation lines, use the Markdown H1 exactly once, apply refined repo-native styles, and draw a deterministic footer from `--generated-on`; the faculty exporter will continue copying those PDFs while its Adobe handoff distinguishes visible merge fields from internal traceability fields.

**Tech Stack:** Python 3, ReportLab, pypdf, Poppler (`pdftoppm`), existing direct-run Python test harnesses, Adobe InDesign data-merge handoff.

## Global Constraints

- Markdown remains the canonical curriculum source.
- Do not rewrite or clinically edit curriculum content.
- Standalone visible pages may contain only curriculum content, `Created from the Psychiatry Clerkship Library - <Month D, YYYY>`, and `Page N`.
- Keep source paths and `needs_faculty_review` in non-visible manifests and CSV data.
- Preserve the current rust `#A84830`, teal `#2A6B5E`, charcoal, white, and gray visual language.
- Remove duplicate wrapper titles, slug/source/review metadata, source `Generated:` lines, and appended export-note pages.
- Keep the combined faculty review cover, checklist, and dividers as an internal review container.
- Generated outputs remain under ignored `outputs/` directories.
- Do not run an Adobe placeholder merge until Creative Cloud authentication succeeds and the user approves the mapping JSON in a later turn.

---

## File Structure

- Modify `tools/pdf_library_export/export_website_pdf_library.py`: date formatting, machine-line suppression, title fallback, repo-native styles, footer, and first-page accent.
- Modify `tools/pdf_library_export/test_export_website_pdf_library.py`: content-only, date, title, footer, and invalid-date regression coverage.
- Modify `tools/pdf_library_export/README.md`: visible output contract and deterministic date behavior.
- Modify `tools/faculty_polish_export/package_data.py`: content-only Adobe/InDesign field-mapping guidance.
- Modify `tools/faculty_polish_export/test_export_top10_faculty_polish.py`: handoff regression coverage.
- Modify `tools/faculty_polish_export/README.md`: clarify that standalone PDFs are content-only while the combined packet is internal review material.
- Modify `.gitignore`: add `tmp/pdfs/` and `.superpowers/` only if they are not already ignored, preventing visual-verification and companion artifacts from entering commits.

### Task 1: Content Filtering and Deterministic Library Date

**Files:**
- Modify: `tools/pdf_library_export/test_export_website_pdf_library.py`
- Modify: `tools/pdf_library_export/export_website_pdf_library.py`

**Interfaces:**
- Consumes: ISO date string from existing `--generated-on`.
- Produces: `format_library_date(generated_on: str) -> str`, `markdown_has_h1(markdown: str) -> bool`, and filtered flowables from `markdown_to_flowables()`.

- [ ] **Step 1: Write failing date and filtering tests**

Add these imports and tests:

```python
from export_website_pdf_library import (
    format_library_date,
    markdown_has_h1,
    markdown_to_flowables,
    pdf_styles,
)


def _paragraph_text(flowables):
    return [item.getPlainText() for item in flowables if hasattr(item, "getPlainText")]


def test_format_library_date_uses_readable_month_day_year():
    assert format_library_date("2026-07-12") == "July 12, 2026"
    try:
        format_library_date("07/12/2026")
    except ValueError as exc:
        assert "ISO date" in str(exc)
    else:
        raise AssertionError("Expected invalid ISO date to fail")


def test_markdown_to_flowables_omits_machine_generated_line():
    flowables = markdown_to_flowables(
        "# Guide\n\nGenerated: 2026-06-27\n\nAudience: MS3 students.",
        pdf_styles(),
    )
    text = "\n".join(_paragraph_text(flowables))
    assert "Guide" in text
    assert "Audience: MS3 students." in text
    assert "Generated:" not in text


def test_markdown_has_h1_detects_only_level_one_heading():
    assert markdown_has_h1("# Primary title\n\n## Section")
    assert not markdown_has_h1("## Section only")
```

- [ ] **Step 2: Run the PDF-library tests and verify red**

Run:

```bash
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/pdf_library_export/test_export_website_pdf_library.py
```

Expected: import failures for the two new functions or assertion failure because `Generated:` remains visible.

- [ ] **Step 3: Implement strict date formatting and H1 detection**

Add near the other text helpers:

```python
_MACHINE_GENERATED_RE = re.compile(r"^Generated:\s+.+$", re.I)
_H1_RE = re.compile(r"^#\s+\S", re.M)


def format_library_date(generated_on: str) -> str:
    try:
        value = _dt.date.fromisoformat(generated_on)
    except ValueError as exc:
        raise ValueError(f"generated-on must be an ISO date (YYYY-MM-DD): {generated_on}") from exc
    return f"{value.strftime('%B')} {value.day}, {value.year}"


def markdown_has_h1(markdown: str) -> bool:
    return bool(_H1_RE.search(markdown))
```

In `markdown_to_flowables()`, after fenced-code handling and before heading detection, flush any active paragraph and skip exact machine-generation lines:

```python
if _MACHINE_GENERATED_RE.match(stripped):
    flush_paragraph()
    flush_table()
    continue
```

Do not suppress the same text inside fenced code blocks.

- [ ] **Step 4: Run the PDF-library tests and verify green**

Expected: all existing and new tests pass without warnings.

- [ ] **Step 5: Commit Task 1**

```bash
git add tools/pdf_library_export/export_website_pdf_library.py \
  tools/pdf_library_export/test_export_website_pdf_library.py
git commit -m "fix: filter PDF production metadata"
```

### Task 2: Repo-Native Layout and Content-Only Pages

**Files:**
- Modify: `tools/pdf_library_export/test_export_website_pdf_library.py`
- Modify: `tools/pdf_library_export/export_website_pdf_library.py`

**Interfaces:**
- Consumes: `format_library_date()`, `markdown_has_h1()`, existing `WebsiteEntry`, and Markdown flowables.
- Produces: `build_pdf()` output with one title, no visible production metadata or export note, and a stable dated footer on each page.

- [ ] **Step 1: Write a failing rendered-PDF regression test**

Import `build_pdf` and `PdfReader`, then add:

```python
from pypdf import PdfReader
from export_website_pdf_library import build_pdf


def test_build_pdf_is_content_only_with_title_once_and_dated_footer():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "guide.md"
        output = root / "guide.pdf"
        body = "\n\n".join(["Curriculum paragraph for students."] * 180)
        _write(
            source,
            "# Clinical Guide\n\nGenerated: 2026-06-27\n\n" + body,
        )
        entry = WebsiteEntry("guide.md", "guide.md", "Wrapper Guide", "markdown", 1)
        build_pdf(entry, source, output, generated_on="2026-07-12")
        reader = PdfReader(output)
        page_text = [page.extract_text() or "" for page in reader.pages]
        all_text = "\n".join(page_text)

    assert len(reader.pages) > 1
    assert all_text.count("Clinical Guide") == 1
    assert "Wrapper Guide" not in all_text
    assert "Website slug" not in all_text
    assert "Source:" not in all_text
    assert "Review status" not in all_text
    assert "Generated:" not in all_text
    assert "Export Note" not in all_text
    assert all(
        "Created from the Psychiatry Clerkship Library - July 12, 2026" in text
        for text in page_text
    )
    assert all(f"Page {index}" in text for index, text in enumerate(page_text, start=1))
```

Add a second test with Markdown containing only `## Section` and assert the manifest title appears exactly once as the fallback H1.

```python
def test_build_pdf_uses_manifest_title_when_markdown_has_no_h1():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "section-only.md"
        output = root / "section-only.pdf"
        _write(source, "## Section\n\nCurriculum content.")
        entry = WebsiteEntry("section-only.md", "section-only.md", "Fallback Title", "markdown", 1)
        build_pdf(entry, source, output, generated_on="2026-07-12")
        text = "\n".join(page.extract_text() or "" for page in PdfReader(output).pages)

    assert text.count("Fallback Title") == 1
    assert "Section" in text
```

- [ ] **Step 2: Run the PDF-library tests and verify red**

Expected: failures showing wrapper title, metadata line, source `Generated:` line, export note, and old footer.

- [ ] **Step 3: Refine the repo-native style sheet**

Update `pdf_styles()`:

```python
styles["Heading1"].fontName = "Helvetica-Bold"
styles["Heading1"].fontSize = 20
styles["Heading1"].leading = 24
styles["Heading1"].textColor = colors.HexColor("#A84830")
styles["Heading1"].spaceAfter = 12

styles["Heading2"].fontName = "Helvetica-Bold"
styles["Heading2"].fontSize = 14
styles["Heading2"].leading = 18
styles["Heading2"].textColor = colors.HexColor("#2A6B5E")

styles["BodyCustom"].fontSize = 10.5
styles["BodyCustom"].leading = 14
styles["BodyCustom"].textColor = colors.HexColor("#292F32")
styles["BulletCustom"].fontSize = 10.5
styles["BulletCustom"].leading = 14
```

Remove unused `TitleCentered` and `Meta` styles. Import `HRFlowable` and append a pale-teal rule after each H2:

```python
if level == 2:
    flowables.append(
        HRFlowable(
            width="100%",
            thickness=0.45,
            color=colors.HexColor("#D7E5E2"),
            spaceBefore=0,
            spaceAfter=4,
        )
    )
```

Add `TableHeaderLine` with teal background/white text and use it for the first non-divider table row; keep readable stacked rows for remaining data:

```python
styles.add(
    ParagraphStyle(
        name="TableHeaderLine",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        backColor=colors.HexColor("#2A6B5E"),
        borderPadding=5,
        spaceAfter=2,
    )
)
```

- [ ] **Step 4: Replace wrapper content with Markdown content and dated footer**

In `build_pdf()`:

```python
display_date = format_library_date(generated_on)
story = markdown_to_flowables(markdown, styles)
if not markdown_has_h1(markdown):
    story.insert(0, Paragraph(inline_markdown_to_text(entry.title), styles["Heading1"]))
```

Delete the wrapper title, `meta` paragraph, `PageBreak`, `Export Note`, and export-note paragraph.

Use approximately 0.7-inch side margins, 0.65-inch top margin, and 0.72-inch bottom margin. Define one page callback:

```python
def draw_page(canvas, document, first_page=False):
    width, height = letter
    canvas.saveState()
    if first_page:
        canvas.setFillColor(colors.HexColor("#A84830"))
        canvas.rect(0, height - 0.08 * inch, width, 0.08 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#D9DFDF"))
    canvas.line(0.7 * inch, 0.55 * inch, 7.8 * inch, 0.55 * inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#68757B"))
    canvas.drawString(
        0.7 * inch,
        0.34 * inch,
        f"Created from the Psychiatry Clerkship Library - {display_date}",
    )
    canvas.drawRightString(7.8 * inch, 0.34 * inch, f"Page {document.page}")
    canvas.restoreState()
```

Build with `onFirstPage=lambda canvas, doc: draw_page(canvas, doc, True)` and `onLaterPages=draw_page`.

- [ ] **Step 5: Run all PDF-library tests**

Expected: every test passes and the rendered-PDF regression confirms content-only output on multiple pages.

- [ ] **Step 6: Commit Task 2**

```bash
git add tools/pdf_library_export/export_website_pdf_library.py \
  tools/pdf_library_export/test_export_website_pdf_library.py
git commit -m "feat: apply repo-native content-only PDF design"
```

### Task 3: Faculty Package and Adobe Handoff Alignment

**Files:**
- Modify: `tools/faculty_polish_export/test_export_top10_faculty_polish.py`
- Modify: `tools/faculty_polish_export/package_data.py`
- Modify: `tools/pdf_library_export/README.md`
- Modify: `tools/faculty_polish_export/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: regenerated content-only library PDFs and existing top-10 registry.
- Produces: unchanged traceability data, content-only curated copies, and Adobe guidance that maps only visible content/date fields.

- [ ] **Step 1: Write a failing Adobe-handoff test**

Extend `test_prepare_package_data_writes_curated_and_adobe_outputs()`:

```python
handoff = (out_dir / "adobe_indesign_handoff.md").read_text(encoding="utf-8")
assert "Visible template fields" in handoff
assert "artifact_title" in handoff
assert "section_heading" in handoff
assert "section_text" in handoff
assert "formatted creation date" in handoff
assert "Do not map `canonical_source`" in handoff
assert "Do not map `review_status`" in handoff
```

- [ ] **Step 2: Run the faculty-polish tests and verify red**

Expected: failure because the current handoff maps canonical source and review status into visible footers.

- [ ] **Step 3: Update the generated Adobe handoff**

Change `_adobe_handoff()` so its mapping section states:

```markdown
## Visible template fields

- Document title: `artifact_title`
- Section heading: `section_heading`
- Body: `section_text`
- Footer date: formatted creation date derived from `generated_on`

Do not map `canonical_source`, `review_status`, `artifact_id`, or `review_pdf` into visible frames. They remain internal traceability data.
```

Retain the warning that an actual Adobe merge requires authentication, a template, IDML inspection, and user-approved mapping JSON.

- [ ] **Step 4: Update tool documentation and ignore transient design files**

Document the content-only visible contract, footer, deterministic date, and internal review-container exception in both READMEs. Add these rules only if absent:

```gitignore
/.superpowers/
/tmp/pdfs/
```

- [ ] **Step 5: Run all three focused test suites**

```bash
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/pdf_library_export/test_export_website_pdf_library.py
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/faculty_polish_export/test_export_top10_faculty_polish.py
```

Expected: all tests pass with no warnings.

- [ ] **Step 6: Commit Task 3**

```bash
git add .gitignore \
  tools/pdf_library_export/README.md \
  tools/faculty_polish_export/README.md \
  tools/faculty_polish_export/package_data.py \
  tools/faculty_polish_export/test_export_top10_faculty_polish.py
git commit -m "docs: align Adobe handoff with content-only PDFs"
```

### Task 4: Regenerate and Visually Verify the Real Library

**Files:**
- Generated only: `outputs/pdf_library/`
- Generated only: `outputs/faculty_polish_top10/`

**Interfaces:**
- Consumes: committed renderer and handoff code.
- Produces: 65 improved library PDFs, 10 curated copies, combined internal review packet, and verified manifests.

- [ ] **Step 1: Regenerate both deterministic output sets**

```bash
/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/pdf_library_export/export_website_pdf_library.py --generated-on 2026-07-12

/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/faculty_polish_export/export_top10_faculty_polish.py --generated-on 2026-07-12
```

Expected: 65 library PDFs, 19 interactive tools indexed, 10 curated PDFs, and a nonzero combined page count.

- [ ] **Step 2: Independently verify content and structure**

Use pypdf to assert:

- Every one of the 65 PDFs parses and has at least one page.
- No standalone PDF contains `Website slug:`, `Review status:`, or `Export Note`.
- Every page contains the July 12, 2026 library footer and its correct page number.
- The top-10 manifest still contains canonical source paths and `needs_faculty_review`.
- Ten curated copies exist and match the manifest.
- The combined packet page count equals front matter + dividers + embedded source pages.

- [ ] **Step 3: Render representative pages**

Render with `pdftoppm` into `tmp/pdfs/content_only_verification/`:

- Orientation: first and final page.
- Interview/MSE pocket guide: first and middle page.
- Acute consult module: dense middle page.
- OSCE stations: a page containing structured prompts.
- Shelf review: a table/list-heavy page.

- [ ] **Step 4: Inspect visual quality**

Check each PNG for title duplication, metadata leakage, clipped footer text, heading collisions, unreadable tables, broken bullets, black glyph boxes, excess blank pages, and hidden safety warnings. If any defect appears, add a failing regression test before changing the renderer.

- [ ] **Step 5: Confirm Git boundaries**

```bash
git status --short --ignored outputs/pdf_library outputs/faculty_polish_top10 tmp/pdfs .superpowers
```

Expected: both output trees, visual-verification files, and companion files are ignored; no generated PDF is staged.

- [ ] **Step 6: Retry the Adobe initialization checkpoint**

Call `adobe_mandatory_init` for `adobe-create-pdfs-from-data` version `1.0.1`.

- If reauthentication is still required, report that the local PDFs and handoff are complete but actual InDesign conversion remains blocked.
- If authentication succeeds, inspect a representative PDF before conversion. Do not call `prepare_indd_merge_template` until a mapping JSON has been generated, displayed, and approved by the user in a later turn.

## Completion Check

Before reporting completion, rerun all three focused test suites and both deterministic exports. Report exact test counts, PDF counts, combined page count, representative pages inspected, content-only extraction checks, Adobe authentication state, and the fact that generated artifacts remain ignored.
