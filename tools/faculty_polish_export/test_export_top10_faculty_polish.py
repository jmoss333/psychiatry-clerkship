#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import logging
import os
from pathlib import Path
import sys
import tempfile

from reportlab.pdfgen import canvas
from pypdf import PdfReader
from pypdf.errors import PdfReadError

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from package_data import (
    MERGE_FIELDS,
    build_merge_rows,
    default_artifacts,
    prepare_package_data,
    validate_artifacts,
)
from review_pdf import build_combined_review_pdf


def _write_fixture_sources(root: Path):
    artifacts = default_artifacts()
    for item in artifacts:
        markdown_path = root / item.canonical_source
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(
            f"# {item.title}\n\n## Review Section\n\nFaculty-facing body.\n",
            encoding="utf-8",
        )

        pdf_path = root / item.source_pdf
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        pdf = canvas.Canvas(str(pdf_path))
        pdf.drawString(72, 720, item.title)
        pdf.save()
    return artifacts


def test_registry_has_ten_unique_artifacts_in_stable_order():
    artifacts = default_artifacts()

    assert len(artifacts) == 10
    assert [item.order for item in artifacts] == list(range(1, 11))
    assert len({item.artifact_id for item in artifacts}) == 10
    assert len({item.output_filename for item in artifacts}) == 10
    assert artifacts[0].title == "Orientation Packet"
    assert artifacts[-1].title == "Shelf Review Guide"
    assert all(item.review_status == "needs_faculty_review" for item in artifacts)


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

    assert len(rows) == 10
    assert rows[0]["artifact_order"] == "1"
    assert rows[0]["artifact_title"] == "Orientation Packet"
    assert rows[0]["section_heading"] == "Review Section"
    assert rows[0]["section_text"] == "Faculty-facing body."
    assert rows[0]["canonical_source"] == artifacts[0].canonical_source
    assert rows[0]["review_pdf"] == f"pdfs/{artifacts[0].output_filename}"
    assert rows[0]["review_status"] == "needs_faculty_review"
    assert rows[0]["generated_on"] == "2026-07-11"


def test_prepare_package_data_writes_curated_and_adobe_outputs():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        out_dir = Path(tmp) / "out"
        artifacts = _write_fixture_sources(root)

        result = prepare_package_data(root, out_dir, "2026-07-11", artifacts)

        assert result["artifact_count"] == 10
        assert result["copied_pdf_count"] == 10
        assert len(list((out_dir / "pdfs").glob("*.pdf"))) == 10
        for filename in [
            "README.md",
            "faculty_review_index.md",
            "top10_adobe_merge.csv",
            "top10_manifest.json",
            "adobe_indesign_handoff.md",
        ]:
            assert (out_dir / filename).is_file()

        with (out_dir / "top10_adobe_merge.csv").open(encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))
        assert tuple(rows[0].keys()) == MERGE_FIELDS
        assert len(rows) == 10
        assert all(row["review_status"] == "needs_faculty_review" for row in rows)

        manifest = json.loads((out_dir / "top10_manifest.json").read_text(encoding="utf-8"))
        assert manifest["artifact_count"] == 10
        assert manifest["copied_pdf_count"] == 10
        assert len(manifest["artifacts"]) == 10
        assert all(item["review_status"] == "needs_faculty_review" for item in manifest["artifacts"])
        assert manifest["artifacts"][0]["canonical_source"] == artifacts[0].canonical_source
        assert manifest["artifacts"][0]["curated_pdf"] == f"pdfs/{artifacts[0].output_filename}"

        review_index = (out_dir / "faculty_review_index.md").read_text(encoding="utf-8")
        assert "correct the canonical Markdown" in review_index
        assert "Clinical / MS3" in review_index
        handoff = (out_dir / "adobe_indesign_handoff.md").read_text(encoding="utf-8")
        assert "review_status" in handoff
        assert "full_packet" in handoff


def test_prepare_package_data_clears_only_stale_curated_pdfs():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        out_dir = Path(tmp) / "out"
        artifacts = _write_fixture_sources(root)
        stale_pdf = out_dir / "pdfs" / "stale.pdf"
        stale_pdf.parent.mkdir(parents=True, exist_ok=True)
        stale_pdf.write_bytes(b"stale")
        neighbor = out_dir / "keep-me.txt"
        neighbor.write_text("preserve", encoding="utf-8")

        prepare_package_data(root, out_dir, "2026-07-11", artifacts)

        assert not stale_pdf.exists()
        assert neighbor.read_text(encoding="utf-8") == "preserve"


def _write_curated_pdfs_with_page_counts(out_dir: Path, artifacts) -> int:
    pdf_dir = out_dir / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    total_pages = 0
    for page_count, item in enumerate(artifacts, start=1):
        pdf_path = pdf_dir / item.output_filename
        pdf = canvas.Canvas(str(pdf_path))
        for page_number in range(1, page_count + 1):
            pdf.drawString(72, 720, f"{item.title} - page {page_number}")
            pdf.showPage()
        pdf.save()
        total_pages += page_count
    return total_pages


def test_build_combined_review_pdf_accounts_for_every_page():
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp) / "out"
        artifacts = default_artifacts()
        source_page_count = _write_curated_pdfs_with_page_counts(out_dir, artifacts)

        result = build_combined_review_pdf(out_dir, artifacts, "2026-07-11")
        reader = PdfReader(out_dir / "faculty_review_packet.pdf")

        assert source_page_count == 55
        assert result["source_page_count"] == 55
        assert result["divider_page_count"] == 10
        assert result["front_matter_page_count"] >= 2
        assert len(reader.pages) == (
            result["source_page_count"]
            + result["divider_page_count"]
            + result["front_matter_page_count"]
        )
        assert reader.metadata.title == "Top 10 MS3 Faculty Review Packet"


def test_build_combined_review_pdf_preserves_existing_packet_on_corrupt_input():
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp) / "out"
        artifacts = default_artifacts()
        _write_curated_pdfs_with_page_counts(out_dir, artifacts)
        existing = out_dir / "faculty_review_packet.pdf"
        pdf = canvas.Canvas(str(existing))
        pdf.drawString(72, 720, "Existing good packet")
        pdf.save()
        existing_bytes = existing.read_bytes()
        (out_dir / "pdfs" / artifacts[4].output_filename).write_bytes(b"not a PDF")

        pypdf_logger = logging.getLogger("pypdf")
        previous_level = pypdf_logger.level
        pypdf_logger.setLevel(logging.CRITICAL)
        try:
            try:
                build_combined_review_pdf(out_dir, artifacts, "2026-07-11")
            except PdfReadError:
                pass
            else:
                raise AssertionError("Expected corrupt PDF input to fail")
        finally:
            pypdf_logger.setLevel(previous_level)

        assert existing.read_bytes() == existing_bytes


def run_tests() -> int:
    tests = [
        test_registry_has_ten_unique_artifacts_in_stable_order,
        test_validate_artifacts_rejects_missing_source_before_output,
        test_build_merge_rows_preserves_traceability_and_review_status,
        test_prepare_package_data_writes_curated_and_adobe_outputs,
        test_prepare_package_data_clears_only_stale_curated_pdfs,
        test_build_combined_review_pdf_accounts_for_every_page,
        test_build_combined_review_pdf_preserves_existing_packet_on_corrupt_input,
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
