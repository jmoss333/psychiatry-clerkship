#!/usr/bin/env python3
"""Export MS3 Student Ready Pack content into Adobe-friendly CSV/JSON files."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re


@dataclass(frozen=True)
class Section:
    heading: str
    body: str
    order: int


@dataclass(frozen=True)
class SourceSpec:
    asset_type: str
    packet_group: str
    source_path: str
    template_hint: str


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
