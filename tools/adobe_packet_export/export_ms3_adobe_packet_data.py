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
