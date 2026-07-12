#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile

from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from package_data import (
    build_merge_rows,
    default_artifacts,
    validate_artifacts,
)


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


def run_tests() -> int:
    tests = [
        test_registry_has_ten_unique_artifacts_in_stable_order,
        test_validate_artifacts_rejects_missing_source_before_output,
        test_build_merge_rows_preserves_traceability_and_review_status,
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
