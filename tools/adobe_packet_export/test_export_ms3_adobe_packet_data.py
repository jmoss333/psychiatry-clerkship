#!/usr/bin/env python3
import os
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from export_ms3_adobe_packet_data import (
    build_export_rows,
    default_source_specs,
    markdown_to_plain_text,
    split_markdown_sections,
)


def test_markdown_to_plain_text_removes_embeds_and_simplifies_links():
    src = """# Orientation

Generated: 2026-06-27

<video src="media/day-in-the-life.mp4" controls></video>

Read the [Interview Guide](?page=pg_interview.md) before rounds.

- Ask directly about safety.
- Escalate early.

| Time | Task |
|---|---|
| AM | Rounds |
"""
    out = markdown_to_plain_text(src)

    assert "<video" not in out
    assert "Generated:" not in out
    assert "Interview Guide" in out
    assert "?page=" not in out
    assert "Ask directly about safety." in out
    assert "Time | Task" in out
    assert "AM | Rounds" in out


def test_split_markdown_sections_uses_h2_boundaries():
    src = """# MS3 Packet

Opening paragraph.

## Safety

Tell the resident now.

## Daily Rhythm

Rounds, interviews, notes.
"""
    sections = split_markdown_sections(src)

    assert [s.heading for s in sections] == ["Overview", "Safety", "Daily Rhythm"]
    assert sections[0].order == 1
    assert sections[0].body == "Opening paragraph."
    assert sections[1].body == "Tell the resident now."
    assert sections[2].body == "Rounds, interviews, notes."


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_default_source_specs_include_core_ms3_outputs():
    specs = default_source_specs()
    paths = {spec.source_path for spec in specs}

    assert "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md" in paths
    assert "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md" in paths
    assert "14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md" in paths
    assert {spec.asset_type for spec in specs} >= {"packet", "pocket_card", "osce"}


def test_build_export_rows_returns_packet_sections_and_pocket_cards():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write(
            root / "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
            "# Orientation\n\n## Safety\n\nTell the resident now.\n",
        )
        _write(
            root / "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md",
            "# Interview Guide\n\n## Opening\n\nState role and ask permission.\n",
        )
        for rel in [
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md",
            "14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md",
            "14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md",
            "14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md",
            "14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md",
            "14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
        ]:
            _write(root / rel, "# Stub\n\n## Section\n\nStub body.\n")

        packet_rows, card_rows = build_export_rows(root, generated_on="2026-07-08")

    assert packet_rows[0]["asset_type"] == "packet"
    assert packet_rows[0]["review_status"] == "needs_faculty_review"
    assert packet_rows[0]["generated_on"] == "2026-07-08"
    assert packet_rows[0]["section_heading"] == "Safety"
    assert packet_rows[0]["section_text"] == "Tell the resident now."
    assert any(row["asset_type"] == "osce" for row in packet_rows)
    assert any(row["card_title"] == "Interview Guide" for row in card_rows)
    assert all("source_path" in row for row in packet_rows)


def run_tests():
    tests = [
        test_markdown_to_plain_text_removes_embeds_and_simplifies_links,
        test_split_markdown_sections_uses_h2_boundaries,
        test_default_source_specs_include_core_ms3_outputs,
        test_build_export_rows_returns_packet_sections_and_pocket_cards,
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
