# Top 10 Faculty and Adobe Polish Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic exporter that packages the approved ten MS3 PDFs for faculty review and creates Adobe/InDesign merge data, traceability records, review documentation, and one combined review PDF.

**Architecture:** Add a focused tool under `tools/faculty_polish_export/`. `package_data.py` owns the immutable selection registry, source validation, section rows, curated copies, CSV/JSON, and generated Markdown; `review_pdf.py` owns ReportLab front matter/dividers and pypdf assembly; `export_top10_faculty_polish.py` coordinates both through a small CLI. Reuse `split_markdown_sections()` from the existing Adobe exporter so editable merge text follows established behavior.

**Tech Stack:** Python 3, standard-library `argparse`, `csv`, `dataclasses`, `json`, `pathlib`, and `shutil`; ReportLab for review pages; pypdf for PDF validation and assembly; direct-run Python tests used by the existing export tools.

## Global Constraints

- Markdown remains the canonical curriculum source.
- Generate artifacts only under `outputs/faculty_polish_top10/` unless an explicit `--out-dir` is supplied for testing.
- Every artifact and package record must remain `needs_faculty_review`.
- Do not rewrite clinical text, invent local policy, add PHI, or include third-party full text.
- The registry must contain exactly ten unique artifacts in stable order.
- Clear only the exporter's own curated `pdfs/` directory before copying.
- A missing Markdown source or source PDF must abort before publishing outputs.
- Generated artifacts remain ignored by Git.

---

## File Structure

- Create `tools/faculty_polish_export/package_data.py`: selection model, ten-item registry, validation, merge-row generation, curated copying, CSV/JSON, and Markdown outputs.
- Create `tools/faculty_polish_export/review_pdf.py`: front matter, divider pages, PDF parsing, and combined review-packet assembly.
- Create `tools/faculty_polish_export/export_top10_faculty_polish.py`: CLI path resolution and end-to-end orchestration.
- Create `tools/faculty_polish_export/test_export_top10_faculty_polish.py`: direct-run unit and integration tests.
- Create `tools/faculty_polish_export/README.md`: commands, output contract, and faculty/Adobe handoff notes.
- Modify `.gitignore`: explicitly ignore `/outputs/faculty_polish_top10/`.

### Task 1: Registry, Validation, and Adobe Merge Rows

**Files:**
- Create: `tools/faculty_polish_export/package_data.py`
- Create: `tools/faculty_polish_export/test_export_top10_faculty_polish.py`

**Interfaces:**
- Consumes: `split_markdown_sections(markdown: str) -> list[Section]` from `tools.adobe_packet_export.export_ms3_adobe_packet_data`.
- Produces: `ArtifactSpec`, `default_artifacts()`, `validate_artifacts(repo_root, artifacts)`, and `build_merge_rows(repo_root, artifacts, generated_on)`.

- [ ] **Step 1: Write failing registry and merge-row tests**

Add a direct-run test harness and tests equivalent to:

```python
def test_registry_has_ten_unique_artifacts_in_stable_order():
    artifacts = default_artifacts()
    assert len(artifacts) == 10
    assert [item.order for item in artifacts] == list(range(1, 11))
    assert len({item.output_filename for item in artifacts}) == 10
    assert artifacts[0].title == "Orientation Packet"
    assert artifacts[-1].title == "Shelf Review Guide"


def test_validate_artifacts_rejects_missing_source_before_output():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        try:
            validate_artifacts(root, default_artifacts())
        except FileNotFoundError as exc:
            assert "canonical source" in str(exc).lower()
        else:
            raise AssertionError("Expected missing-source validation failure")


def test_build_merge_rows_preserves_traceability_and_review_status():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        artifacts = _write_fixture_sources(root)
        rows = build_merge_rows(root, artifacts, "2026-07-11")
    assert rows[0]["artifact_order"] == "1"
    assert rows[0]["artifact_title"] == "Orientation Packet"
    assert rows[0]["section_heading"] == "Review Section"
    assert rows[0]["section_text"] == "Faculty-facing body."
    assert rows[0]["review_status"] == "needs_faculty_review"
    assert rows[0]["generated_on"] == "2026-07-11"
```

The fixture helper must create one small Markdown file and one valid one-page PDF per supplied `ArtifactSpec`, using `reportlab.pdfgen.canvas.Canvas` for the PDF.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
python3 tools/faculty_polish_export/test_export_top10_faculty_polish.py
```

Expected: import failure because `package_data.py` does not exist.

- [ ] **Step 3: Implement the immutable registry and merge rows**

Create `ArtifactSpec` with these fields and exact types:

```python
@dataclass(frozen=True)
class ArtifactSpec:
    order: int
    artifact_id: str
    title: str
    canonical_source: str
    source_pdf: str
    output_filename: str
    production_format: str
    template_hint: str
    review_status: str = "needs_faculty_review"
```

Implement `default_artifacts()` with the ten approved records from the design specification, in order. Use template hints `full_packet`, `pocket_card`, `module_packet`, and `osce_packet`.

Implement validation with these exact checks:

```python
def validate_artifacts(repo_root: Path, artifacts: Sequence[ArtifactSpec]) -> None:
    if len(artifacts) != 10:
        raise ValueError(f"Expected exactly 10 artifacts, found {len(artifacts)}")
    if [item.order for item in artifacts] != list(range(1, 11)):
        raise ValueError("Artifact order must be the stable sequence 1 through 10")
    for label, values in {
        "artifact IDs": [item.artifact_id for item in artifacts],
        "output filenames": [item.output_filename for item in artifacts],
    }.items():
        if len(values) != len(set(values)):
            raise ValueError(f"Duplicate {label} are not allowed")
    for item in artifacts:
        if not (repo_root / item.canonical_source).is_file():
            raise FileNotFoundError(f"Missing canonical source: {item.canonical_source}")
        if not (repo_root / item.source_pdf).is_file():
            raise FileNotFoundError(f"Missing source PDF: {item.source_pdf}")
```

Implement `build_merge_rows()` by reading each canonical Markdown file, calling `split_markdown_sections()`, and emitting one dictionary per section with a stable field order:

```python
MERGE_FIELDS = (
    "artifact_order", "artifact_id", "artifact_title", "production_format",
    "adobe_template_hint", "section_order", "section_heading", "section_text",
    "canonical_source", "review_pdf", "generated_on", "review_status",
)
```

- [ ] **Step 4: Run the registry and merge tests**

Run the direct test script. Expected: all Task 1 tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add tools/faculty_polish_export/package_data.py tools/faculty_polish_export/test_export_top10_faculty_polish.py
git commit -m "feat: define top 10 faculty polish package"
```

### Task 2: Curated Copies, Metadata, and Review Documents

**Files:**
- Modify: `tools/faculty_polish_export/package_data.py`
- Modify: `tools/faculty_polish_export/test_export_top10_faculty_polish.py`

**Interfaces:**
- Consumes: the Task 1 `ArtifactSpec` registry and merge rows.
- Produces: `prepare_package_data(repo_root, out_dir, generated_on, artifacts) -> dict[str, object]` plus `README.md`, `faculty_review_index.md`, `top10_adobe_merge.csv`, `top10_manifest.json`, `adobe_indesign_handoff.md`, and ten curated PDFs.

- [ ] **Step 1: Write failing package-data tests**

Add tests that call `prepare_package_data()` in a temporary directory and assert:

```python
assert result["artifact_count"] == 10
assert result["copied_pdf_count"] == 10
assert len(list((out_dir / "pdfs").glob("*.pdf"))) == 10
assert (out_dir / "top10_adobe_merge.csv").is_file()
assert (out_dir / "top10_manifest.json").is_file()
assert (out_dir / "faculty_review_index.md").is_file()
assert (out_dir / "adobe_indesign_handoff.md").is_file()
assert (out_dir / "README.md").is_file()
```

Read the CSV and JSON and assert the CSV has all `MERGE_FIELDS`, the manifest has `artifact_count == 10`, every artifact has `review_status == "needs_faculty_review"`, and every canonical source/review PDF path is present.

Add a stale-copy test that creates `out_dir/pdfs/stale.pdf`, calls `prepare_package_data()`, and asserts `stale.pdf` no longer exists while files outside `out_dir/pdfs/` remain intact.

- [ ] **Step 2: Run the new tests and verify failure**

Expected: failure because `prepare_package_data()` is undefined.

- [ ] **Step 3: Implement package-data generation**

Implement these focused helpers:

```python
def reset_curated_pdf_dir(pdf_dir: Path) -> None:
    if pdf_dir.exists():
        shutil.rmtree(pdf_dir)
    pdf_dir.mkdir(parents=True, exist_ok=True)


def copy_curated_pdfs(repo_root: Path, out_dir: Path, artifacts: Sequence[ArtifactSpec]) -> list[dict[str, str]]:
    pdf_dir = out_dir / "pdfs"
    reset_curated_pdf_dir(pdf_dir)
    records = []
    for item in artifacts:
        destination = pdf_dir / item.output_filename
        shutil.copy2(repo_root / item.source_pdf, destination)
        records.append({
            "artifact_id": item.artifact_id,
            "source_pdf": item.source_pdf,
            "curated_pdf": destination.relative_to(out_dir).as_posix(),
            "review_status": item.review_status,
        })
    return records
```

Write CSV with `csv.DictWriter` and `MERGE_FIELDS`. Write JSON with two-space indentation and trailing newline. Generate the three Markdown documents from registry data. The faculty index must include columns for artifact, source, PDF, clinical/MS3 review, local-policy review, PHI review, accessibility review, and decision. Use unchecked boxes and state that revisions belong in canonical Markdown.

The InDesign handoff must map the CSV fields, describe the four template families, require a visible `review_status` footer, and give the exact regeneration command:

```bash
python3 tools/faculty_polish_export/export_top10_faculty_polish.py --generated-on 2026-07-11
```

- [ ] **Step 4: Run all package-data tests**

Expected: all Task 1 and Task 2 tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add tools/faculty_polish_export/package_data.py tools/faculty_polish_export/test_export_top10_faculty_polish.py
git commit -m "feat: generate faculty review and Adobe data"
```

### Task 3: Combined Faculty Review PDF

**Files:**
- Create: `tools/faculty_polish_export/review_pdf.py`
- Modify: `tools/faculty_polish_export/test_export_top10_faculty_polish.py`

**Interfaces:**
- Consumes: `ArtifactSpec` records, curated PDFs, and generation date.
- Produces: `build_combined_review_pdf(out_dir, artifacts, generated_on) -> dict[str, int | str]` and `faculty_review_packet.pdf`.

- [ ] **Step 1: Write failing PDF assembly tests**

Create ten fixture PDFs with page counts `1..10`, call `build_combined_review_pdf()`, and assert:

```python
result = build_combined_review_pdf(out_dir, artifacts, "2026-07-11")
reader = PdfReader(out_dir / "faculty_review_packet.pdf")
assert result["source_page_count"] == 55
assert result["divider_page_count"] == 10
assert result["front_matter_page_count"] >= 2
assert len(reader.pages) == (
    result["source_page_count"]
    + result["divider_page_count"]
    + result["front_matter_page_count"]
)
assert reader.metadata.title == "Top 10 MS3 Faculty Review Packet"
```

Add a corrupt-PDF test that writes non-PDF bytes to one curated path and asserts `PdfReadError` is raised before the final packet replaces any existing good packet.

- [ ] **Step 2: Run tests and verify failure**

Expected: import failure because `review_pdf.py` does not exist.

- [ ] **Step 3: Implement front matter, dividers, and atomic assembly**

Use ReportLab `SimpleDocTemplate`, `Paragraph`, `Table`, `TableStyle`, `PageBreak`, and restrained navy/teal/gray styles to generate a temporary front-matter PDF containing title, `FACULTY REVIEW DRAFT`, date, package guardrails, checklist, and ten-row artifact table.

Generate each divider as a one-page PDF with artifact number, title, production format, canonical source, and `needs_faculty_review` status. Keep all support PDFs in memory with `io.BytesIO`.

Use `PdfReader` to validate all ten curated PDFs before writing. Assemble with `PdfWriter` in this order:

```python
writer.append(front_matter_reader)
for item in artifacts:
    writer.append(PdfReader(divider_stream_for(item)))
    writer.append(validated_source_readers[item.artifact_id])
writer.add_metadata({
    "/Title": "Top 10 MS3 Faculty Review Packet",
    "/Subject": "Faculty review draft; not approved for learner distribution",
    "/Author": "Psychiatry Clerkship Library",
})
```

Write to `faculty_review_packet.pdf.tmp`, then replace `faculty_review_packet.pdf` only after `writer.write()` succeeds. Return path and exact page counts.

- [ ] **Step 4: Run all PDF tests**

Expected: all tests pass, including exact total-page accounting and corrupt-PDF protection.

- [ ] **Step 5: Commit Task 3**

```bash
git add tools/faculty_polish_export/review_pdf.py tools/faculty_polish_export/test_export_top10_faculty_polish.py
git commit -m "feat: assemble combined faculty review PDF"
```

### Task 4: CLI, Documentation, Generation, and Verification

**Files:**
- Create: `tools/faculty_polish_export/export_top10_faculty_polish.py`
- Create: `tools/faculty_polish_export/README.md`
- Modify: `tools/faculty_polish_export/test_export_top10_faculty_polish.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `prepare_package_data()` and `build_combined_review_pdf()`.
- Produces: `export_top10_faculty_polish(repo_root, out_dir, generated_on) -> dict[str, object]`, direct CLI, and the complete ignored package.

- [ ] **Step 1: Write failing orchestration and path tests**

Add a test that builds fixture sources, calls `export_top10_faculty_polish()`, and asserts the result contains `artifact_count == 10`, `copied_pdf_count == 10`, valid combined packet counts, and every specified output.

Add path tests:

```python
repo_root, out_dir = resolve_cli_paths(str(Path.home()), "outputs/faculty_polish_top10")
assert repo_root == Path.home().resolve()
assert out_dir == (Path.home() / "outputs/faculty_polish_top10").resolve()

repo_root, out_dir = resolve_cli_paths(str(Path.home()), "~/faculty-polish-test")
assert out_dir == (Path.home() / "faculty-polish-test").resolve()
```

- [ ] **Step 2: Run tests and verify failure**

Expected: import failure because the orchestration module does not exist.

- [ ] **Step 3: Implement CLI orchestration**

Implement:

```python
def export_top10_faculty_polish(repo_root: Path, out_dir: Path, generated_on: str) -> dict[str, object]:
    artifacts = default_artifacts()
    validate_artifacts(repo_root, artifacts)
    package_result = prepare_package_data(repo_root, out_dir, generated_on, artifacts)
    pdf_result = build_combined_review_pdf(out_dir, artifacts, generated_on)
    result = {**package_result, **pdf_result}
    update_manifest_with_pdf_result(out_dir / "top10_manifest.json", pdf_result)
    return result
```

The CLI accepts `--repo-root`, `--out-dir`, and deterministic `--generated-on`, resolves `~`, resolves relative output paths under repo root, prints artifact/PDF/page counts, and returns nonzero on validation or PDF errors.

- [ ] **Step 4: Add tool documentation and ignore rule**

Document purpose, command, output tree, review warning, source-of-truth rule, and InDesign use in `README.md`. Add this exact ignore entry:

```gitignore
/outputs/faculty_polish_top10/
```

- [ ] **Step 5: Run focused automated tests**

Run with the bundled workspace Python if available, otherwise `python3`:

```bash
python3 tools/faculty_polish_export/test_export_top10_faculty_polish.py
```

Expected: every test reports `PASS` and the process exits 0.

- [ ] **Step 6: Generate the real package**

```bash
python3 tools/faculty_polish_export/export_top10_faculty_polish.py --generated-on 2026-07-11
```

Expected: completion message reports 10 artifacts, 10 curated PDFs, and a nonzero combined page count.

- [ ] **Step 7: Verify PDF structure and output traceability**

Use pypdf to assert ten standalone PDFs parse, the manifest counts match disk, the combined packet page count matches its manifest support/source totals, and every artifact remains `needs_faculty_review`.

- [ ] **Step 8: Render representative pages and inspect visually**

Use `pdftoppm` to render:

- Combined packet page 1: cover
- Combined packet page 2: review checklist/table
- The first curated pocket-card page
- A dense page from the acute consult module

Inspect the rendered images for clipping, overlap, missing text, unreadable tables, and review-status visibility. If the review table spans more than one page, render its last page as well.

- [ ] **Step 9: Confirm generated output stays ignored**

```bash
git status --short --ignored outputs/faculty_polish_top10 tools/faculty_polish_export .gitignore
```

Expected: `outputs/faculty_polish_top10/` is ignored; only source files and the intended `.gitignore` change appear as worktree changes.

- [ ] **Step 10: Commit Task 4**

```bash
git add .gitignore tools/faculty_polish_export
git commit -m "feat: export top 10 faculty Adobe review package"
```

## Completion Check

Before reporting completion, rerun the focused test suite and real deterministic export. Report exact test count, standalone PDF count, combined page count, rendered pages inspected, and any unrelated worktree changes that were preserved.
