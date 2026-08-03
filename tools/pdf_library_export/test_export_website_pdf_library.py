#!/usr/bin/env python3
import json
import os
import sys
import tempfile
from pathlib import Path

from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from export_website_pdf_library import (
    DEFAULT_MANIFEST,
    REVIEW_STATUS,
    WebsiteEntry,
    _resolve_cli_paths,
    build_pdf,
    export_website_pdf_library,
    format_library_date,
    inline_markdown_to_text,
    load_manifest,
    markdown_has_h1,
    markdown_to_flowables,
    pdf_styles,
    section_for_entry,
    slugify,
)


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


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


def test_markdown_to_flowables_omits_blockquoted_machine_generated_line():
    flowables = markdown_to_flowables(
        "# Guide\n\n> Generated: 2026-06-27\n\nAudience: MS3 students.",
        pdf_styles(),
    )
    text = "\n".join(_paragraph_text(flowables))
    assert "Guide" in text
    assert "Audience: MS3 students." in text
    assert "Generated:" not in text


def test_markdown_to_flowables_omits_nested_blockquoted_machine_generated_line():
    flowables = markdown_to_flowables(
        "# Guide\n\n> > Generated: 2026-06-27\n\nAudience: MS3 students.",
        pdf_styles(),
    )
    text = "\n".join(_paragraph_text(flowables))
    assert "Audience: MS3 students." in text
    assert "Generated:" not in text


def test_markdown_has_h1_detects_only_level_one_heading():
    assert markdown_has_h1("# Primary title\n\n## Section")
    assert not markdown_has_h1("## Section only")


def test_markdown_has_h1_ignores_fenced_code_heading():
    assert not markdown_has_h1("```markdown\n# Example heading\n```\n\n## Real section")


def test_markdown_to_flowables_preserves_machine_generated_line_in_code():
    flowables = markdown_to_flowables(
        "```text\nGenerated: 2026-06-27\n```",
        pdf_styles(),
    )
    text = "\n".join(_paragraph_text(flowables))
    assert "Generated: 2026-06-27" in text


def test_inline_markdown_to_text_simplifies_links_and_unicode():
    text = inline_markdown_to_text("Read **now** - [Guide](?page=x.md) -> done")

    assert "Guide (?page=x.md)" in text
    assert "**" not in text
    assert "- " in text
    assert "-&gt;" in text
    assert "needs_faculty_review" in inline_markdown_to_text("needs_faculty_review")
    assert "13_Faculty_Resources" in inline_markdown_to_text("13_Faculty_Resources")


def test_slugify_returns_ascii_file_safe_text():
    assert slugify("Week 2 - Mood/Psychosis/Pharm") == "week-2-mood-psychosis-pharm"


def test_markdown_to_flowables_strips_wrapped_blockquote_markers():
    flowables = markdown_to_flowables(
        '> "Opening line\n> continued line\n> final line."',
        pdf_styles(),
    )
    paragraphs = [item.getPlainText() for item in flowables if hasattr(item, "getPlainText")]

    assert paragraphs == ['"Opening line continued line final line."']


def test_section_for_entry_matches_website_groups():
    assert section_for_entry(WebsiteEntry("01_Six_Week_Curriculum/Week_1_Foundations/README.md", "week1.md", "Week 1", "markdown", 1)) == "01_welcome_orientation"
    assert section_for_entry(WebsiteEntry("03_Core_Topics/Mood/mood.md", "t_mood.md", "Mood", "markdown", 2)) == "03_understand_problem"
    assert section_for_entry(WebsiteEntry("04_Acute_and_Safety/Catatonia/catatonia.md", "catatonia.md", "Catatonia", "markdown", 3)) == "04_assess_safety_acuity"
    assert section_for_entry(WebsiteEntry("07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md", "rounds_questions.md", "Rounds", "markdown", 4)) == "08_present_team"
    assert section_for_entry(WebsiteEntry("03_Core_Topics/Ethics_Legal/ethics.md", "ethics_legal.md", "Ethics", "markdown", 5)) == "04_assess_safety_acuity"
    assert section_for_entry(WebsiteEntry("03_Core_Topics/Nutrition/nutrition.md", "nutrition_metabolic.md", "Nutrition", "markdown", 6)) == "05_make_plan"
    assert section_for_entry(WebsiteEntry("06_Family_and_Relational/mi.md", "motivational_interviewing.md", "MI", "markdown", 7)) == "06_communicate_patients"


def test_load_manifest_fails_on_missing_source():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        manifest = root / "manifest.json"
        _write(
            manifest,
            json.dumps({"md": [["missing.md", "missing.md", "Missing"]], "tools": []}),
        )

        try:
            load_manifest(root, manifest)
        except FileNotFoundError as exc:
            assert "missing.md" in str(exc)
        else:
            raise AssertionError("missing source did not raise")


def test_export_creates_pdf_manifest_and_index():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        out_dir = Path(tmp) / "out"
        manifest = root / "site_manifest.json"
        _write(root / "01_Six_Week_Curriculum/Week_1_Foundations/README.md", "# Week 1\n\n## Safety\n\n- Call the resident.\n")
        _write(root / "03_Core_Topics/Mood/mood.md", "# Mood\n\n| Topic | Point |\n|---|---|\n| MDD | Ask about safety |\n")
        _write(root / "02_Clinical_Skills/Mental_Status_Exam/mse.html", "<html><body>MSE</body></html>")
        _write(
            manifest,
            json.dumps(
                {
                    "md": [
                        ["01_Six_Week_Curriculum/Week_1_Foundations/README.md", "week1.md", "Week 1"],
                        ["03_Core_Topics/Mood/mood.md", "t_mood.md", "Mood Disorders"],
                    ],
                    "tools": [
                        ["02_Clinical_Skills/Mental_Status_Exam/mse.html", "mse.html", "Mental Status Exam"]
                    ],
                }
            ),
        )

        result = export_website_pdf_library(root, manifest, out_dir, generated_on="2026-07-11")

        assert result["pdf_count"] == 2
        assert result["interactive_tools_not_converted"] == 1
        manifest_json = json.loads((out_dir / "website_pdf_library_manifest.json").read_text(encoding="utf-8"))
        assert manifest_json["review_status"] == REVIEW_STATUS
        assert len(manifest_json["records"]) == 2
        assert len(manifest_json["interactive_tools"]) == 1
        for record in manifest_json["records"]:
            assert (out_dir / record["pdf_path"]).exists()
        index = (out_dir / "index.md").read_text(encoding="utf-8")
        assert "Interactive Tools Not Converted To PDF" in index
        assert "Mental Status Exam" in index

        stale = out_dir / "pdfs" / "stale.pdf"
        _write(stale, "old")
        export_website_pdf_library(root, manifest, out_dir, generated_on="2026-07-11")
        assert not stale.exists()


def test_export_rejects_invalid_date_before_publishing_output():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        out_dir = Path(tmp) / "out"
        manifest = root / "site_manifest.json"
        source = root / "guide.md"
        stale = out_dir / "pdfs" / "stale.pdf"
        _write(source, "# Guide\n")
        _write(manifest, json.dumps({"md": [["guide.md", "guide.md", "Guide"]], "tools": []}))
        _write(stale, "existing output")

        try:
            export_website_pdf_library(root, manifest, out_dir, generated_on="07/12/2026")
        except ValueError as exc:
            assert "ISO date" in str(exc)
        else:
            raise AssertionError("Expected invalid ISO date to fail")

        assert stale.read_text(encoding="utf-8") == "existing output"
        assert not (out_dir / "website_pdf_library_manifest.json").exists()
        assert not (out_dir / "index.md").exists()


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

    assert len(page_text) > 1
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


def test_default_site_manifest_sources_exist_in_repo():
    repo_root = Path(__file__).resolve().parents[2]
    manifest = repo_root / DEFAULT_MANIFEST
    md_entries, tool_entries = load_manifest(repo_root, manifest)

    assert len(md_entries) == 67
    assert len(tool_entries) == 20


def test_resolve_cli_paths_expands_relative_paths():
    repo_root, manifest, out_dir = _resolve_cli_paths("/tmp/repo", "manifest.json", "outputs/pdf_library")

    assert repo_root == Path("/tmp/repo").resolve()
    assert manifest == (Path("/tmp/repo") / "manifest.json").resolve()
    assert out_dir == (Path("/tmp/repo") / "outputs/pdf_library").resolve()


def run_tests():
    tests = [
        test_format_library_date_uses_readable_month_day_year,
        test_markdown_to_flowables_omits_machine_generated_line,
        test_markdown_to_flowables_omits_blockquoted_machine_generated_line,
        test_markdown_to_flowables_omits_nested_blockquoted_machine_generated_line,
        test_markdown_has_h1_detects_only_level_one_heading,
        test_markdown_has_h1_ignores_fenced_code_heading,
        test_markdown_to_flowables_preserves_machine_generated_line_in_code,
        test_inline_markdown_to_text_simplifies_links_and_unicode,
        test_slugify_returns_ascii_file_safe_text,
        test_markdown_to_flowables_strips_wrapped_blockquote_markers,
        test_section_for_entry_matches_website_groups,
        test_load_manifest_fails_on_missing_source,
        test_export_creates_pdf_manifest_and_index,
        test_export_rejects_invalid_date_before_publishing_output,
        test_build_pdf_is_content_only_with_title_once_and_dated_footer,
        test_build_pdf_uses_manifest_title_when_markdown_has_no_h1,
        test_default_site_manifest_sources_exist_in_repo,
        test_resolve_cli_paths_expands_relative_paths,
    ]

    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS: {test.__name__}")
        except Exception as exc:
            failures += 1
            print(f"FAIL: {test.__name__}: {exc}", file=sys.stderr)

    return failures


if __name__ == "__main__":
    sys.exit(run_tests())
