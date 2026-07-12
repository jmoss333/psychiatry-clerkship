#!/usr/bin/env python3
"""Export website Markdown pages into an organized local PDF library."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import datetime as _dt
import html
import json
from pathlib import Path
import re
import shutil
import unicodedata

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


DEFAULT_MANIFEST = "13_Faculty_Resources/_automation/site_build/site_manifest.json"
DEFAULT_OUT_DIR = "outputs/pdf_library"
REVIEW_STATUS = "needs_faculty_review"


@dataclass(frozen=True)
class WebsiteEntry:
    source_path: str
    site_slug: str
    title: str
    entry_type: str
    order: int


@dataclass(frozen=True)
class PdfRecord:
    section: str
    section_label: str
    title: str
    source_path: str
    site_slug: str
    pdf_path: str
    review_status: str
    generated_on: str


SECTION_LABELS = {
    "01_welcome_orientation": "Welcome and Orientation",
    "02_start_encounter": "Start the Encounter",
    "03_understand_problem": "Understand the Problem",
    "04_assess_safety_acuity": "Assess Safety and Acuity",
    "05_make_plan": "Make a Plan",
    "06_communicate_patients": "Communicate with Patients",
    "07_family_systems": "Work with Family and Systems",
    "08_present_team": "Present and Work with the Team",
    "09_practice_exam_prep": "Practice and Exam Prep",
    "10_evidence_reference": "Evidence and Reference",
    "99_other": "Other Site Content",
}

WELCOME_SLUGS = {
    "welcome.md",
    "orientation.md",
    "core_readings.md",
    "week1.md",
    "week2.md",
    "week3.md",
    "week4.md",
    "week5.md",
    "week6.md",
}

START_ENCOUNTER_SLUGS = {"pg_interview.md"}

UNDERSTAND_SLUGS = {
    "ddx.md",
    "pg_formulation.md",
    "case_formulation.md",
    "medical_workup.md",
}

SAFETY_SLUGS = {
    "pg_suicide.md",
    "suicide.md",
    "violence.md",
    "agitation.md",
    "catatonia.md",
    "toxidromes.md",
    "delirium.md",
    "exp_consult.md",
    "ethics_legal.md",
}

PLAN_SLUGS = {
    "psychopharm_primer.md",
    "med_monitoring.md",
    "protocol_library.md",
    "ect_neuromodulation.md",
    "exp_tx.md",
    "nutrition_metabolic.md",
    "omm_resources.md",
}

COMMUNICATION_SLUGS = {
    "psychotherapy.md",
    "motivational_interviewing.md",
    "brief_psychotherapy.md",
}

FAMILY_SLUGS = {
    "collateral_workflow.md",
    "exp_family.md",
    "family_playbook.md",
    "family_modalities.md",
}

TEAM_SLUGS = {"doc_oral.md", "rounds_questions.md"}

PRACTICE_SLUGS = {
    "shelf.md",
    "rapid_review.md",
    "osce.md",
    "cases.md",
    "landmark_trials.md",
}

EVIDENCE_SLUGS = {
    "reading_map.md",
    "evidence_inpatient.md",
    "book_library.md",
    "podcast_library.md",
}

_HTML_BLOCK_RE = re.compile(r"<(script|style|iframe|video)\b[^>]*>.*?</\1>", re.I | re.S)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD_RE = re.compile(r"(\*\*|__)(.*?)\1")
_ITALIC_RE = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
_CODE_RE = re.compile(r"`([^`]+)`")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_MACHINE_GENERATED_RE = re.compile(r"^Generated:\s+.+$", re.I)
_H1_RE = re.compile(r"^#\s+\S", re.M)
_ORDERED_RE = re.compile(r"^\s*(\d+)[.)]\s+(.+)$")
_BULLET_RE = re.compile(r"^\s*[-*+]\s+(.+)$")
_TABLE_DIVIDER_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")


def load_manifest(repo_root: Path, manifest_path: Path) -> tuple[list[WebsiteEntry], list[WebsiteEntry]]:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    md_entries = [
        WebsiteEntry(source_path=src, site_slug=slug, title=title, entry_type="markdown", order=i + 1)
        for i, (src, slug, title) in enumerate(data.get("md", []))
    ]
    tool_entries = [
        WebsiteEntry(source_path=src, site_slug=slug, title=title, entry_type="interactive_tool", order=i + 1)
        for i, (src, slug, title) in enumerate(data.get("tools", []))
    ]

    missing = [entry.source_path for entry in md_entries + tool_entries if not (repo_root / entry.source_path).exists()]
    if missing:
        raise FileNotFoundError("Website manifest references missing source files: " + ", ".join(missing))
    return md_entries, tool_entries


def section_for_entry(entry: WebsiteEntry) -> str:
    slug = entry.site_slug
    source = entry.source_path

    if slug in WELCOME_SLUGS:
        return "01_welcome_orientation"
    if slug in START_ENCOUNTER_SLUGS:
        return "02_start_encounter"
    if slug in SAFETY_SLUGS:
        return "04_assess_safety_acuity"
    if slug in PLAN_SLUGS:
        return "05_make_plan"
    if slug in COMMUNICATION_SLUGS:
        return "06_communicate_patients"
    if slug in FAMILY_SLUGS:
        return "07_family_systems"
    if slug in TEAM_SLUGS:
        return "08_present_team"
    if slug in PRACTICE_SLUGS:
        return "09_practice_exam_prep"
    if slug in EVIDENCE_SLUGS:
        return "10_evidence_reference"
    if slug in UNDERSTAND_SLUGS or source.startswith("03_Core_Topics/"):
        return "03_understand_problem"
    if source.startswith("04_Acute_and_Safety/"):
        return "04_assess_safety_acuity"
    if source.startswith("05_Psychopharmacology/"):
        return "05_make_plan"
    if "Psychotherapy" in source or "Brief_Psychotherapy" in source:
        return "06_communicate_patients"
    if source.startswith("06_Family_and_Relational/"):
        return "07_family_systems"
    if source.startswith("09_Exam_Prep/") or source.startswith("08_Cases_and_Simulation/"):
        return "09_practice_exam_prep"
    if source.startswith("07_Evidence_and_Reading/") or source.startswith("12_Media/"):
        return "10_evidence_reference"
    return "99_other"


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return text or "untitled"


def normalize_text(value: str) -> str:
    replacements = {
        "\u00a0": " ",
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2022": "-",
        "\u2713": "checked",
        "\u2192": "->",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    return "".join(ch for ch in value if ch == "\n" or ch == "\t" or ord(ch) >= 32)


def inline_markdown_to_text(value: str) -> str:
    text = normalize_text(value)
    text = _IMAGE_RE.sub(lambda m: f"[image: {m.group(1) or 'image'}]", text)
    text = _LINK_RE.sub(lambda m: f"{m.group(1)} ({m.group(2)})", text)
    text = _BOLD_RE.sub(r"\2", text)
    text = _ITALIC_RE.sub(r"\1", text)
    text = _CODE_RE.sub(r"\1", text)
    text = _HTML_TAG_RE.sub("", text)
    return html.escape(text.strip())


def format_library_date(generated_on: str) -> str:
    try:
        value = _dt.date.fromisoformat(generated_on)
    except ValueError as exc:
        raise ValueError(f"generated-on must be an ISO date (YYYY-MM-DD): {generated_on}") from exc
    return f"{value.strftime('%B')} {value.day}, {value.year}"


def markdown_has_h1(markdown: str) -> bool:
    return bool(_H1_RE.search(markdown))


def _is_table_row(line: str) -> bool:
    return line.strip().startswith("|") and line.strip().endswith("|")


def _render_table_like_rows(lines: list[str], styles) -> list:
    rows = []
    for line in lines:
        if _TABLE_DIVIDER_RE.match(line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells:
            rows.append("; ".join(cell for cell in cells if cell))
    if not rows:
        return []
    flowables = [Paragraph(inline_markdown_to_text(rows[0]), styles["TableLine"])]
    for row in rows[1:]:
        flowables.append(Paragraph(inline_markdown_to_text(row), styles["TableLine"]))
    return flowables


def markdown_to_flowables(markdown: str, styles) -> list:
    text = _HTML_BLOCK_RE.sub("", markdown)
    flowables: list = []
    paragraph_lines: list[str] = []
    code_lines: list[str] = []
    table_lines: list[str] = []
    in_code = False

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        body = " ".join(part.strip() for part in paragraph_lines if part.strip())
        paragraph_lines.clear()
        if body:
            flowables.append(Paragraph(inline_markdown_to_text(body), styles["BodyCustom"]))
            flowables.append(Spacer(1, 0.06 * inch))

    def flush_code() -> None:
        if not code_lines:
            return
        body = "\n".join(code_lines).strip()
        code_lines.clear()
        if body:
            flowables.append(Paragraph(inline_markdown_to_text(body).replace("\n", "<br/>"), styles["CodeCustom"]))
            flowables.append(Spacer(1, 0.08 * inch))

    def flush_table() -> None:
        if not table_lines:
            return
        rows = list(table_lines)
        table_lines.clear()
        flowables.extend(_render_table_like_rows(rows, styles))
        flowables.append(Spacer(1, 0.08 * inch))

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            if in_code:
                in_code = False
                flush_code()
            else:
                flush_paragraph()
                flush_table()
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        if _MACHINE_GENERATED_RE.match(stripped):
            flush_paragraph()
            flush_table()
            continue

        if stripped.startswith(">"):
            stripped = stripped[1:].lstrip()
            line = stripped

        heading = _HEADING_RE.match(stripped)
        if heading:
            flush_paragraph()
            flush_table()
            level = min(len(heading.group(1)), 4)
            style_name = "Heading1" if level == 1 else "Heading2" if level == 2 else "Heading3"
            flowables.append(Spacer(1, 0.06 * inch))
            flowables.append(Paragraph(inline_markdown_to_text(heading.group(2)), styles[style_name]))
            continue

        if not stripped:
            flush_paragraph()
            flush_table()
            continue

        if _is_table_row(stripped):
            flush_paragraph()
            table_lines.append(stripped)
            continue

        bullet = _BULLET_RE.match(line)
        ordered = _ORDERED_RE.match(line)
        if bullet or ordered:
            flush_paragraph()
            flush_table()
            text_value = bullet.group(1) if bullet else ordered.group(2)
            bullet_text = "-" if bullet else ordered.group(1) + "."
            flowables.append(Paragraph(inline_markdown_to_text(text_value), styles["BulletCustom"], bulletText=bullet_text))
            continue

        paragraph_lines.append(stripped)

    flush_paragraph()
    flush_table()
    flush_code()
    return flowables


def pdf_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleCentered",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            alignment=TA_CENTER,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#5f5b55"),
            alignment=TA_CENTER,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            leftIndent=18,
            firstLineIndent=-10,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeCustom",
            parent=styles["BodyText"],
            fontName="Courier",
            fontSize=8,
            leading=10,
            backColor=colors.HexColor("#f3f0ea"),
            borderPadding=5,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableLine",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            leftIndent=12,
            borderColor=colors.HexColor("#ddd3c6"),
            borderWidth=0.25,
            borderPadding=4,
            spaceAfter=2,
        )
    )
    for key, size, leading, color in [
        ("Heading1", 15, 18, "#a84830"),
        ("Heading2", 13, 16, "#2a6b5e"),
        ("Heading3", 11, 14, "#3b332c"),
    ]:
        styles[key].fontName = "Helvetica-Bold"
        styles[key].fontSize = size
        styles[key].leading = leading
        styles[key].textColor = colors.HexColor(color)
        styles[key].spaceBefore = 6
        styles[key].spaceAfter = 6
    return styles


def build_pdf(entry: WebsiteEntry, source_path: Path, pdf_path: Path, generated_on: str) -> None:
    styles = pdf_styles()
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    markdown = source_path.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=0.6 * inch,
        leftMargin=0.6 * inch,
        topMargin=0.58 * inch,
        bottomMargin=0.58 * inch,
        title=entry.title,
        author="Psychiatry Clerkship Library",
    )

    meta = (
        f"Website slug: {entry.site_slug} | Source: {entry.source_path} | "
        f"Review status: {REVIEW_STATUS} | Generated: {generated_on}"
    )
    story = [
        Paragraph(inline_markdown_to_text(entry.title), styles["TitleCentered"]),
        Paragraph(html.escape(normalize_text(meta)), styles["Meta"]),
    ]
    story.extend(markdown_to_flowables(markdown, styles))
    story.append(PageBreak())
    story.append(Paragraph("Export Note", styles["Heading2"]))
    story.append(
        Paragraph(
            inline_markdown_to_text(
                "This PDF is generated from the repository Markdown source. "
                "The Markdown file remains the canonical curriculum source, and this PDF requires faculty review before learner-facing distribution."
            ),
            styles["BodyCustom"],
        )
    )

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#5f5b55"))
        canvas.drawString(0.6 * inch, 0.32 * inch, "Psychiatry Clerkship Library")
        canvas.drawRightString(7.9 * inch, 0.32 * inch, f"Page {_doc.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def build_index(records: list[PdfRecord], tool_entries: list[WebsiteEntry], generated_on: str) -> str:
    lines = [
        "# Website PDF Library Index",
        "",
        f"Generated: {generated_on}",
        "",
        "Plain-language summary: this folder is a print/offline version of the website's Markdown curriculum pages. The website and Markdown files remain the source of truth; the PDFs are generated distribution copies.",
        "",
        "## PDF Library",
        "",
        "| Section | Title | PDF | Source | Site slug | Review |",
        "|---|---|---|---|---|---|",
    ]
    for record in records:
        lines.append(
            "| {section} | {title} | {pdf} | {source} | {slug} | {review} |".format(
                section=record.section_label,
                title=record.title.replace("|", "\\|"),
                pdf=record.pdf_path,
                source=record.source_path,
                slug=record.site_slug,
                review=record.review_status,
            )
        )

    lines.extend(["", "## Interactive Tools Not Converted To PDF", ""])
    lines.append(
        "These remain HTML tools because their value is interaction, scoring, local practice history, or timers. They are included here so the PDF library still maps to the whole website manifest."
    )
    lines.extend(["", "| Title | Source | Site slug |", "|---|---|---|"])
    for entry in tool_entries:
        lines.append(f"| {entry.title.replace('|', '\\|')} | {entry.source_path} | {entry.site_slug} |")
    lines.append("")
    return "\n".join(lines)


def export_website_pdf_library(
    repo_root: Path,
    manifest_path: Path,
    out_dir: Path,
    generated_on: str,
    limit: int | None = None,
) -> dict[str, int | str]:
    repo_root = repo_root.resolve()
    manifest_path = manifest_path.resolve()
    out_dir = out_dir.resolve()
    md_entries, tool_entries = load_manifest(repo_root, manifest_path)
    if limit is not None:
        md_entries = md_entries[:limit]

    pdf_root = out_dir / "pdfs"
    if pdf_root.exists():
        shutil.rmtree(pdf_root)

    records: list[PdfRecord] = []
    for entry in md_entries:
        section = section_for_entry(entry)
        pdf_rel = Path("pdfs") / section / f"{entry.order:03d}_{slugify(Path(entry.site_slug).stem)}.pdf"
        pdf_path = out_dir / pdf_rel
        build_pdf(entry, repo_root / entry.source_path, pdf_path, generated_on)
        records.append(
            PdfRecord(
                section=section,
                section_label=SECTION_LABELS[section],
                title=entry.title,
                source_path=entry.source_path,
                site_slug=entry.site_slug,
                pdf_path=pdf_rel.as_posix(),
                review_status=REVIEW_STATUS,
                generated_on=generated_on,
            )
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generated_on": generated_on,
        "source_manifest": str(manifest_path.relative_to(repo_root)) if manifest_path.is_relative_to(repo_root) else str(manifest_path),
        "pdf_count": len(records),
        "interactive_tools_not_converted": len(tool_entries),
        "review_status": REVIEW_STATUS,
        "records": [record.__dict__ for record in records],
        "interactive_tools": [entry.__dict__ for entry in tool_entries],
        "notes": [
            "Markdown remains canonical.",
            "Generated PDFs are distribution artifacts.",
            "Interactive tools stay HTML-only because static PDFs would lose the scoring and practice workflow.",
        ],
    }
    (out_dir / "website_pdf_library_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (out_dir / "index.md").write_text(build_index(records, tool_entries, generated_on), encoding="utf-8")
    return {
        "pdf_count": len(records),
        "interactive_tools_not_converted": len(tool_entries),
        "manifest": str(out_dir / "website_pdf_library_manifest.json"),
        "index": str(out_dir / "index.md"),
    }


def _resolve_cli_paths(repo_root: str, manifest: str, out_dir: str) -> tuple[Path, Path, Path]:
    resolved_repo = Path(repo_root).expanduser().resolve()
    manifest_path = Path(manifest).expanduser()
    if not manifest_path.is_absolute():
        manifest_path = resolved_repo / manifest_path
    out_path = Path(out_dir).expanduser()
    if not out_path.is_absolute():
        out_path = resolved_repo / out_path
    return resolved_repo, manifest_path.resolve(), out_path.resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description="Export website Markdown pages into an organized PDF library.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST, help="Website manifest JSON path.")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Output directory for generated PDFs and indexes.")
    parser.add_argument("--generated-on", default=_dt.date.today().isoformat(), help="ISO date stamped into generated outputs.")
    parser.add_argument("--limit", type=int, default=None, help="Generate only the first N Markdown PDFs, useful for smoke tests.")
    args = parser.parse_args()

    repo_root, manifest_path, out_dir = _resolve_cli_paths(args.repo_root, args.manifest, args.out_dir)
    result = export_website_pdf_library(repo_root, manifest_path, out_dir, args.generated_on, args.limit)
    print(
        "Website PDF library export complete: "
        f"{result['pdf_count']} PDFs | "
        f"{result['interactive_tools_not_converted']} interactive tools indexed | "
        f"index={result['index']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
