# MS3 Adobe Packet Export Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, tested Python exporter that turns the MS3 Student Ready Pack Markdown files into Adobe-friendly CSV/JSON data for InDesign data merge or Adobe Express copy placement.

**Architecture:** Keep the repo as the source of truth. The exporter reads curated Markdown from `14_Tracks/MS3/Student_Ready_Pack/`, converts it into plain-text sections and card records, then writes generated artifacts under `outputs/adobe_packet_exports/`. Adobe consumes those outputs; Adobe files do not become curriculum source.

**Tech Stack:** Python 3 standard library only, plain `assert` test file, CSV, JSON, Markdown source files.

## Global Constraints

- No PHI or patient-identifiable media.
- Repo files remain canonical; Adobe outputs are generated or catalogued artifacts.
- Do not duplicate copyrighted third-party content into Adobe outputs unless licensing permits it.
- Local-policy material should remain visibly marked as local/unverified until attested.
- Clinical education assets need faculty review before learner-facing use.
- Videos require captions/transcripts and accessible embeds.
- Generated CSV/JSON exports are machine output and should not be hand-edited.
- Plain-language code summary: the code reads student curriculum files, cleans them into simple text rows, and writes spreadsheets/manifests that Adobe can merge into polished handouts.

---

## File Structure

- Create `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`
  - Owns Markdown cleanup, section extraction, source registry, row construction, output writing, and CLI.
- Create `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`
  - Plain Python tests using temporary directories and `assert`.
- Create `tools/adobe_packet_export/README.md`
  - Documents how to run the exporter and how to use the generated files in Adobe.
- Modify `.gitignore`
  - Ignore generated Adobe export CSV/JSON files under `outputs/adobe_packet_exports/`.
- Create `13_Faculty_Resources/Handoffs/adobe_ms3_packet_export_handoff.md`
  - Captures the Adobe-side handoff: expected template fields, review status, and guardrails.

---

### Task 1: Markdown Cleanup And Section Splitting

**Files:**
- Create: `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`
- Create: `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`

**Interfaces:**
- Produces: `markdown_to_plain_text(markdown: str) -> str`
- Produces: `split_markdown_sections(markdown: str) -> list[Section]`
- Produces: `Section(heading: str, body: str, order: int)`

- [ ] **Step 1: Write the failing parser tests**

Create `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`:

```python
#!/usr/bin/env python3
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from export_ms3_adobe_packet_data import markdown_to_plain_text, split_markdown_sections


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: FAIL with `ModuleNotFoundError` or import failure because `export_ms3_adobe_packet_data.py` does not exist yet.

- [ ] **Step 3: Implement minimal parser code**

Create `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`:

```python
#!/usr/bin/env python3
"""Export MS3 Student Ready Pack content into Adobe-friendly CSV/JSON files."""
from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class Section:
    heading: str
    body: str
    order: int


_HTML_BLOCK_RE = re.compile(r"<(video|iframe|script|style)\b[^>]*>.*?</\1>", re.I | re.S)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_BOLD_RE = re.compile(r"(\*\*|__)(.*?)\1")
_ITALIC_RE = re.compile(r"(\*|_)(.*?)\1")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_GENERATED_RE = re.compile(r"^Generated:\s+.+$", re.I)
_HR_RE = re.compile(r"^\s*-{3,}\s*$")


def markdown_to_plain_text(markdown: str) -> str:
    """Convert repo Markdown into plain text suitable for Adobe data merge."""
    text = _HTML_BLOCK_RE.sub("", markdown)
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if _GENERATED_RE.match(line):
            continue
        if _HR_RE.match(line):
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            line = heading.group(2)
        line = _LINK_RE.sub(r"\1", line)
        line = _BOLD_RE.sub(r"\2", line)
        line = _ITALIC_RE.sub(r"\2", line)
        line = _HTML_TAG_RE.sub("", line)
        line = line.replace("`", "")
        if line.strip() == "|---|---|":
            continue
        if line.startswith("- "):
            line = "- " + line[2:]
        lines.append(line.strip())

    collapsed: list[str] = []
    previous_blank = False
    for line in lines:
        blank = line == ""
        if blank and previous_blank:
            continue
        collapsed.append(line)
        previous_blank = blank
    return "\n".join(collapsed).strip()


def split_markdown_sections(markdown: str) -> list[Section]:
    """Split Markdown into an overview plus H2 sections after plain-text cleanup."""
    current_heading = "Overview"
    current_lines: list[str] = []
    raw_sections: list[tuple[str, str]] = []

    for line in markdown.splitlines():
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            body = markdown_to_plain_text("\n".join(current_lines))
            if body:
                raw_sections.append((current_heading, body))
            current_heading = line[3:].strip()
            current_lines = []
            continue
        current_lines.append(line)

    body = markdown_to_plain_text("\n".join(current_lines))
    if body:
        raw_sections.append((current_heading, body))

    return [Section(heading=heading, body=body, order=i + 1) for i, (heading, body) in enumerate(raw_sections)]
```

- [ ] **Step 4: Run tests to verify parser passes**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add tools/adobe_packet_export/export_ms3_adobe_packet_data.py tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
git commit -m "feat: add MS3 Adobe export markdown parser"
```

---

### Task 2: Source Registry And Row Construction

**Files:**
- Modify: `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`
- Modify: `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`

**Interfaces:**
- Consumes: `split_markdown_sections(markdown: str) -> list[Section]`
- Produces: `SourceSpec(asset_type: str, packet_group: str, source_path: str, template_hint: str)`
- Produces: `default_source_specs() -> list[SourceSpec]`
- Produces: `build_export_rows(repo_root: Path, generated_on: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]`

- [ ] **Step 1: Add failing tests for source registry and row construction**

Append these tests to `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`:

```python
import tempfile
from pathlib import Path

from export_ms3_adobe_packet_data import build_export_rows, default_source_specs


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: FAIL with missing `build_export_rows` or `default_source_specs`.

- [ ] **Step 3: Implement source registry and row construction**

Add these imports and data structures to `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`:

```python
from pathlib import Path
```

Add below `Section`:

```python
@dataclass(frozen=True)
class SourceSpec:
    asset_type: str
    packet_group: str
    source_path: str
    template_hint: str
```

Add these functions after `split_markdown_sections`:

```python
def default_source_specs() -> list[SourceSpec]:
    """Return the MS3 source files that feed the first Adobe export."""
    return [
        SourceSpec(
            asset_type="packet",
            packet_group="Week 1 Foundations",
            source_path="14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
            template_hint="week_packet",
        ),
        SourceSpec(
            asset_type="pocket_card",
            packet_group="Pocket Cards",
            source_path="14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md",
            template_hint="folded_pocket_card",
        ),
        SourceSpec(
            asset_type="pocket_card",
            packet_group="Pocket Cards",
            source_path="14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md",
            template_hint="folded_pocket_card",
        ),
        SourceSpec(
            asset_type="pocket_card",
            packet_group="Pocket Cards",
            source_path="14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md",
            template_hint="folded_pocket_card",
        ),
        SourceSpec(
            asset_type="packet",
            packet_group="Six Week Map",
            source_path="14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md",
            template_hint="week_packet",
        ),
        SourceSpec(
            asset_type="packet",
            packet_group="Acute Consult Module",
            source_path="14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md",
            template_hint="module_packet",
        ),
        SourceSpec(
            asset_type="packet",
            packet_group="Documentation And Presenting",
            source_path="14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md",
            template_hint="module_packet",
        ),
        SourceSpec(
            asset_type="osce",
            packet_group="OSCE Stations",
            source_path="14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md",
            template_hint="osce_station_packet",
        ),
        SourceSpec(
            asset_type="packet",
            packet_group="Shelf Review",
            source_path="14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
            template_hint="module_packet",
        ),
    ]


def _title_from_markdown(markdown: str, fallback: str) -> str:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def build_export_rows(repo_root: Path, generated_on: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Build packet section rows and condensed pocket-card rows from source Markdown."""
    packet_rows: list[dict[str, str]] = []
    card_rows: list[dict[str, str]] = []

    for spec in default_source_specs():
        path = repo_root / spec.source_path
        if not path.exists():
            raise FileNotFoundError(f"Required MS3 source file is missing: {spec.source_path}")
        markdown = path.read_text(encoding="utf-8")
        title = _title_from_markdown(markdown, fallback=Path(spec.source_path).stem.replace("_", " ").title())
        sections = split_markdown_sections(markdown)

        for section in sections:
            packet_rows.append(
                {
                    "asset_type": spec.asset_type,
                    "packet_group": spec.packet_group,
                    "source_path": spec.source_path,
                    "source_title": title,
                    "section_order": str(section.order),
                    "section_heading": section.heading,
                    "section_text": section.body,
                    "review_status": "needs_faculty_review",
                    "generated_on": generated_on,
                    "adobe_template_hint": spec.template_hint,
                }
            )

        if spec.asset_type == "pocket_card":
            card_text = "\n\n".join(f"{section.heading}\n{section.body}" for section in sections)
            card_rows.append(
                {
                    "asset_type": spec.asset_type,
                    "packet_group": spec.packet_group,
                    "source_path": spec.source_path,
                    "card_title": title,
                    "card_text": _truncate(card_text, 3600),
                    "review_status": "needs_faculty_review",
                    "generated_on": generated_on,
                    "adobe_template_hint": spec.template_hint,
                }
            )

    return packet_rows, card_rows
```

- [ ] **Step 4: Run tests to verify rows pass**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add tools/adobe_packet_export/export_ms3_adobe_packet_data.py tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
git commit -m "feat: build MS3 Adobe export rows"
```

---

### Task 3: CSV, JSON Manifest, And CLI

**Files:**
- Modify: `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`
- Modify: `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`

**Interfaces:**
- Consumes: `build_export_rows(repo_root: Path, generated_on: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]`
- Produces: `write_csv(path: Path, rows: list[dict[str, str]]) -> None`
- Produces: `write_manifest(path: Path, packet_rows: list[dict[str, str]], card_rows: list[dict[str, str]], generated_on: str) -> None`
- Produces: `export_ms3_adobe_packet_data(repo_root: Path, out_dir: Path, generated_on: str) -> dict[str, int | str]`

- [ ] **Step 1: Add failing output tests**

Append these tests to `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py`:

```python
import csv
import json

from export_ms3_adobe_packet_data import export_ms3_adobe_packet_data


def test_export_writes_csv_and_manifest_outputs():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        out_dir = Path(tmp) / "out"
        for rel in [
            "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md",
            "14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md",
            "14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md",
            "14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md",
            "14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md",
            "14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
        ]:
            _write(root / rel, "# Sample Source\n\n## Section One\n\nBody text.\n")

        result = export_ms3_adobe_packet_data(root, out_dir, generated_on="2026-07-08")

        packet_csv = out_dir / "ms3_packet_sections.csv"
        cards_csv = out_dir / "ms3_pocket_cards.csv"
        manifest_json = out_dir / "ms3_adobe_export_manifest.json"

        assert result["packet_rows"] == 9
        assert result["card_rows"] == 3
        assert packet_csv.exists()
        assert cards_csv.exists()
        assert manifest_json.exists()

        with packet_csv.open(encoding="utf-8", newline="") as fh:
            packet_rows = list(csv.DictReader(fh))
        assert packet_rows[0]["source_title"] == "Sample Source"
        assert packet_rows[0]["section_heading"] == "Section One"

        manifest = json.loads(manifest_json.read_text(encoding="utf-8"))
        assert manifest["generated_on"] == "2026-07-08"
        assert manifest["packet_rows"] == 9
        assert manifest["card_rows"] == 3
        assert manifest["review_status"] == "needs_faculty_review"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: FAIL with missing `export_ms3_adobe_packet_data`.

- [ ] **Step 3: Implement writers and CLI**

Add imports to `tools/adobe_packet_export/export_ms3_adobe_packet_data.py`:

```python
import argparse
import csv
import datetime as _dt
import json
```

Add these functions after `build_export_rows`:

```python
def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    """Write rows to CSV with stable column order from the first row."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_manifest(
    path: Path,
    packet_rows: list[dict[str, str]],
    card_rows: list[dict[str, str]],
    generated_on: str,
) -> None:
    """Write a small manifest so Adobe outputs can be traced back to repo sources."""
    source_paths = sorted({row["source_path"] for row in packet_rows + card_rows})
    manifest = {
        "generated_on": generated_on,
        "review_status": "needs_faculty_review",
        "packet_rows": len(packet_rows),
        "card_rows": len(card_rows),
        "source_paths": source_paths,
        "outputs": {
            "packet_sections_csv": "ms3_packet_sections.csv",
            "pocket_cards_csv": "ms3_pocket_cards.csv",
        },
        "guardrails": [
            "No PHI or patient-identifiable media.",
            "Repo Markdown remains canonical.",
            "Adobe outputs require faculty review before learner-facing use.",
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def export_ms3_adobe_packet_data(repo_root: Path, out_dir: Path, generated_on: str) -> dict[str, int | str]:
    """Export MS3 packet rows, pocket-card rows, and traceability manifest."""
    packet_rows, card_rows = build_export_rows(repo_root, generated_on)
    write_csv(out_dir / "ms3_packet_sections.csv", packet_rows)
    write_csv(out_dir / "ms3_pocket_cards.csv", card_rows)
    write_manifest(out_dir / "ms3_adobe_export_manifest.json", packet_rows, card_rows, generated_on)
    return {
        "out_dir": str(out_dir),
        "packet_rows": len(packet_rows),
        "card_rows": len(card_rows),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export MS3 Student Ready Pack data for Adobe templates.")
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[2]),
        help="Path to the Psychiatry Clerkship Library repo root.",
    )
    parser.add_argument(
        "--out-dir",
        default="outputs/adobe_packet_exports",
        help="Output directory for generated CSV/JSON files.",
    )
    parser.add_argument(
        "--generated-on",
        default=_dt.date.today().isoformat(),
        help="ISO date stamped into generated rows.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    repo_root = Path(args.repo_root).resolve()
    out_dir = (repo_root / args.out_dir).resolve() if not Path(args.out_dir).is_absolute() else Path(args.out_dir)
    result = export_ms3_adobe_packet_data(repo_root, out_dir, args.generated_on)
    print(
        "MS3 Adobe export complete: "
        f"{result['packet_rows']} packet rows, {result['card_rows']} pocket-card rows -> {result['out_dir']}"
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify output generation passes**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: PASS with no output.

- [ ] **Step 5: Run exporter against the real repo**

Run:

```bash
python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08
```

Expected: output similar to:

```text
MS3 Adobe export complete: 100+ packet rows, 3 pocket-card rows -> /Users/jm/Psychiatry-Clerkship-Library/outputs/adobe_packet_exports
```

The exact packet-row count may differ when source Markdown changes. It must be greater than `25`, and pocket-card rows must be exactly `3`.

- [ ] **Step 6: Commit**

```bash
git add tools/adobe_packet_export/export_ms3_adobe_packet_data.py tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
git commit -m "feat: export MS3 packet data for Adobe"
```

---

### Task 4: Documentation And Generated Artifact Hygiene

**Files:**
- Create: `tools/adobe_packet_export/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: CLI command `python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on YYYY-MM-DD`
- Produces: documented output files under `outputs/adobe_packet_exports/`

- [ ] **Step 1: Write exporter README**

Create `tools/adobe_packet_export/README.md`:

```markdown
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
```

- [ ] **Step 2: Ignore generated Adobe data exports**

Append to `.gitignore`:

```gitignore

# ---- Generated Adobe packet export data ----
/outputs/adobe_packet_exports/*.csv
/outputs/adobe_packet_exports/*.json
```

- [ ] **Step 3: Run tests after docs and ignore updates**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: PASS with no output.

- [ ] **Step 4: Confirm generated exports are ignored**

Run:

```bash
python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08
git status --short outputs/adobe_packet_exports
```

Expected:

```text
```

No generated CSV/JSON files should appear in `git status`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore tools/adobe_packet_export/README.md
git commit -m "docs: document MS3 Adobe packet exporter"
```

---

### Task 5: Adobe Handoff Note

**Files:**
- Create: `13_Faculty_Resources/Handoffs/adobe_ms3_packet_export_handoff.md`

**Interfaces:**
- Consumes: `outputs/adobe_packet_exports/ms3_packet_sections.csv`
- Consumes: `outputs/adobe_packet_exports/ms3_pocket_cards.csv`
- Consumes: `outputs/adobe_packet_exports/ms3_adobe_export_manifest.json`
- Produces: human-readable handoff for Adobe/InDesign template work

- [ ] **Step 1: Write Adobe-side handoff**

Create `13_Faculty_Resources/Handoffs/adobe_ms3_packet_export_handoff.md`:

```markdown
# Adobe MS3 Packet Export Handoff

Date: 2026-07-08

## Purpose

Use repo-owned MS3 curriculum content to generate polished Adobe packet and pocket-card outputs without moving curriculum authoring into Adobe.

Plain-language summary: the repo writes clean CSV files, and Adobe uses those rows to make the pages look professional.

## Generated Data

Run:

```bash
python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08
```

Generated files:

- `outputs/adobe_packet_exports/ms3_packet_sections.csv`
- `outputs/adobe_packet_exports/ms3_pocket_cards.csv`
- `outputs/adobe_packet_exports/ms3_adobe_export_manifest.json`

## Suggested Adobe Templates

### Week Packet Template

Use `ms3_packet_sections.csv`.

Recommended fields:

- Header: `source_title`
- Small label: `packet_group`
- Section label: `section_heading`
- Body text: `section_text`
- Footer: `generated_on` and `review_status`

### Pocket Card Template

Use `ms3_pocket_cards.csv`.

Recommended fields:

- Front title: `card_title`
- Body: `card_text`
- Footer: `review_status`

## Required Review Before Distribution

- Confirm no PHI or patient-identifying details appear in the final PDF.
- Confirm local-policy language is either removed, locally completed, or visibly marked.
- Confirm clinical claims are appropriate for MS3 learners.
- Confirm the final PDF layout does not hide safety warnings or review status.

## Source-Of-Truth Rule

If text needs revision, edit the Markdown source in `14_Tracks/MS3/Student_Ready_Pack/`, rerun the exporter, then rerun the Adobe merge. Do not edit curriculum text only inside Adobe.
```

- [ ] **Step 2: Verify handoff references existing source paths**

Run:

```bash
test -f tools/adobe_packet_export/export_ms3_adobe_packet_data.py
test -d 14_Tracks/MS3/Student_Ready_Pack
test -f 13_Faculty_Resources/Handoffs/adobe_ms3_packet_export_handoff.md
```

Expected: all commands exit `0`.

- [ ] **Step 3: Commit**

```bash
git add 13_Faculty_Resources/Handoffs/adobe_ms3_packet_export_handoff.md
git commit -m "docs: add Adobe MS3 packet handoff"
```

---

### Task 6: End-To-End Verification

**Files:**
- Verify only; no planned source edits.

**Interfaces:**
- Consumes: all files created in Tasks 1-5
- Produces: evidence that the exporter works on current repo content

- [ ] **Step 1: Run unit tests**

Run:

```bash
python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
```

Expected: PASS with no output.

- [ ] **Step 2: Run real export**

Run:

```bash
python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08
```

Expected: exporter prints a completion summary with packet rows greater than `25` and pocket-card rows equal to `3`.

- [ ] **Step 3: Inspect generated manifest**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path
p = Path("outputs/adobe_packet_exports/ms3_adobe_export_manifest.json")
d = json.loads(p.read_text(encoding="utf-8"))
assert d["review_status"] == "needs_faculty_review"
assert d["packet_rows"] > 25
assert d["card_rows"] == 3
assert "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md" in d["source_paths"]
print("manifest OK:", d["packet_rows"], "packet rows,", d["card_rows"], "card rows")
PY
```

Expected:

```text
manifest OK: <N> packet rows, 3 card rows
```

- [ ] **Step 4: Confirm generated files are not staged**

Run:

```bash
git status --short outputs/adobe_packet_exports
```

Expected:

```text
```

- [ ] **Step 5: Commit verification-only changes if documentation was adjusted during verification**

If verification required correcting docs, run:

```bash
git add tools/adobe_packet_export/README.md 13_Faculty_Resources/Handoffs/adobe_ms3_packet_export_handoff.md
git commit -m "docs: clarify Adobe packet export verification"
```

If no source files changed during verification, do not create a commit.

---

## Completion Criteria

- `python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py` passes.
- `python3 tools/adobe_packet_export/export_ms3_adobe_packet_data.py --generated-on 2026-07-08` writes the three expected generated files.
- Manifest reports `review_status` as `needs_faculty_review`.
- Manifest reports more than `25` packet rows and exactly `3` pocket-card rows.
- Generated files under `outputs/adobe_packet_exports/` are ignored by git.
- Documentation explains that Markdown remains canonical and Adobe is only the production layer.
