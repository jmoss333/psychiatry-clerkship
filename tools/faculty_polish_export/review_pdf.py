#!/usr/bin/env python3
"""Build the combined faculty review PDF from curated source PDFs."""
from __future__ import annotations

from collections.abc import Sequence
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from package_data import ArtifactSpec, REVIEW_STATUS


NAVY = colors.HexColor("#123047")
TEAL = colors.HexColor("#167D86")
PALE_TEAL = colors.HexColor("#E9F4F3")
INK = colors.HexColor("#24323A")
MID_GRAY = colors.HexColor("#66757F")
LIGHT_GRAY = colors.HexColor("#E3E8EB")
WHITE = colors.white


def _page_footer(pdf_canvas, document) -> None:
    pdf_canvas.saveState()
    pdf_canvas.setStrokeColor(LIGHT_GRAY)
    pdf_canvas.line(0.7 * inch, 0.55 * inch, 7.8 * inch, 0.55 * inch)
    pdf_canvas.setFont("Helvetica", 8)
    pdf_canvas.setFillColor(MID_GRAY)
    pdf_canvas.drawString(0.7 * inch, 0.35 * inch, "Faculty review draft - not for learner distribution")
    pdf_canvas.drawRightString(7.8 * inch, 0.35 * inch, f"Page {document.page}")
    pdf_canvas.restoreState()


def _cover_page(pdf_canvas, document) -> None:
    width, height = letter
    pdf_canvas.saveState()
    pdf_canvas.setFillColor(NAVY)
    pdf_canvas.rect(0, 0, width, height, fill=1, stroke=0)
    pdf_canvas.setFillColor(TEAL)
    pdf_canvas.rect(0, height - 0.18 * inch, width, 0.18 * inch, fill=1, stroke=0)
    pdf_canvas.restoreState()


def _front_matter_stream(artifacts: Sequence[ArtifactSpec], generated_on: str) -> BytesIO:
    stream = BytesIO()
    document = SimpleDocTemplate(
        stream,
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Top 10 MS3 Faculty Review Packet",
        author="Psychiatry Clerkship Library",
    )
    base = getSampleStyleSheet()
    cover_label = ParagraphStyle(
        "CoverLabel",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#8DD4D2"),
        alignment=TA_CENTER,
        spaceAfter=18,
    )
    cover_title = ParagraphStyle(
        "CoverTitle",
        parent=base["Title"],
        fontName="Helvetica-Bold",
        fontSize=30,
        leading=35,
        textColor=WHITE,
        alignment=TA_CENTER,
        spaceAfter=18,
    )
    cover_body = ParagraphStyle(
        "CoverBody",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=18,
        textColor=colors.HexColor("#D8E3E8"),
        alignment=TA_CENTER,
    )
    heading = ParagraphStyle(
        "ReviewHeading",
        parent=base["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=NAVY,
        spaceAfter=10,
    )
    body = ParagraphStyle(
        "ReviewBody",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=INK,
        spaceAfter=6,
    )
    table_header = ParagraphStyle(
        "TableHeader",
        parent=body,
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=8,
        textColor=WHITE,
        alignment=TA_CENTER,
    )
    table_body = ParagraphStyle(
        "TableBody",
        parent=body,
        fontSize=7,
        leading=8.5,
        spaceAfter=0,
    )

    story = [
        Spacer(1, 1.55 * inch),
        Paragraph("PSYCHIATRY CLERKSHIP LIBRARY", cover_label),
        Paragraph("Top 10 MS3<br/>Faculty Review Packet", cover_title),
        Paragraph("FACULTY REVIEW DRAFT", cover_label),
        Spacer(1, 0.25 * inch),
        Paragraph(
            "Ten high-value curriculum PDFs prepared for clinical review and Adobe/InDesign finishing.",
            cover_body,
        ),
        Spacer(1, 0.45 * inch),
        Paragraph(f"Generated {escape(generated_on)}<br/>Status: {REVIEW_STATUS}", cover_body),
        PageBreak(),
        Paragraph("Faculty review checklist", heading),
        Paragraph(
            "Review each artifact before learner distribution. Correct curriculum text in the canonical Markdown, then regenerate this package. Do not make generated PDFs or Adobe files the only source of a content revision.",
            body,
        ),
        Paragraph(
            "For each artifact confirm: clinical accuracy and MS3 scope; locally specific language; absence of PHI; readable and accessible layout; and a final approve, revise, or defer decision.",
            body,
        ),
        Spacer(1, 0.08 * inch),
    ]

    headers = ["#", "Artifact", "Format", "Clinical", "Policy", "PHI", "Access", "Decision"]
    table_data = [[Paragraph(value, table_header) for value in headers]]
    for item in artifacts:
        table_data.append(
            [
                str(item.order),
                Paragraph(escape(item.title), table_body),
                Paragraph(escape(item.production_format), table_body),
                "[ ]",
                "[ ]",
                "[ ]",
                "[ ]",
                "[ ]",
            ]
        )
    review_table = Table(
        table_data,
        colWidths=[0.28 * inch, 2.05 * inch, 0.83 * inch, 0.6 * inch, 0.55 * inch, 0.42 * inch, 0.52 * inch, 0.65 * inch],
        repeatRows=1,
        hAlign="LEFT",
    )
    review_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 7),
                ("LEADING", (0, 1), (-1, -1), 8.5),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE_TEAL]),
                ("GRID", (0, 0), (-1, -1), 0.35, LIGHT_GRAY),
                ("BOX", (0, 0), (-1, -1), 0.7, NAVY),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.extend([review_table, Spacer(1, 0.12 * inch), Paragraph(f"Package status: {REVIEW_STATUS}", body)])
    document.build(story, onFirstPage=_cover_page, onLaterPages=_page_footer)
    stream.seek(0)
    return stream


def _divider_stream(item: ArtifactSpec) -> BytesIO:
    stream = BytesIO()
    pdf = canvas.Canvas(stream, pagesize=letter)
    width, height = letter
    pdf.setTitle(f"Divider {item.order}: {item.title}")
    pdf.setFillColor(NAVY)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(TEAL)
    pdf.rect(0, height - 0.18 * inch, width, 0.18 * inch, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#8DD4D2"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(0.8 * inch, height - 1.15 * inch, f"ARTIFACT {item.order:02d} OF 10")

    title_style = ParagraphStyle(
        "DividerTitle",
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=33,
        textColor=WHITE,
        spaceAfter=12,
    )
    detail_style = ParagraphStyle(
        "DividerDetail",
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#D8E3E8"),
    )
    title = Paragraph(escape(item.title), title_style)
    title.wrapOn(pdf, 6.7 * inch, 2.0 * inch)
    title.drawOn(pdf, 0.8 * inch, height - 3.35 * inch)
    detail = Paragraph(
        f"{escape(item.production_format)}<br/><br/>Canonical source:<br/>{escape(item.canonical_source)}",
        detail_style,
    )
    detail.wrapOn(pdf, 6.7 * inch, 2.0 * inch)
    detail.drawOn(pdf, 0.8 * inch, height - 5.4 * inch)

    pdf.setFillColor(TEAL)
    pdf.roundRect(0.8 * inch, 0.78 * inch, 2.45 * inch, 0.42 * inch, 0.06 * inch, fill=1, stroke=0)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(2.025 * inch, 0.93 * inch, REVIEW_STATUS.upper())
    pdf.save()
    stream.seek(0)
    return stream


def build_combined_review_pdf(
    out_dir: Path,
    artifacts: Sequence[ArtifactSpec],
    generated_on: str,
) -> dict[str, int | str]:
    """Validate and assemble front matter, dividers, and curated PDFs atomically."""
    source_readers: dict[str, PdfReader] = {}
    source_page_count = 0
    for item in artifacts:
        reader = PdfReader(out_dir / "pdfs" / item.output_filename)
        source_readers[item.artifact_id] = reader
        source_page_count += len(reader.pages)

    front_stream = _front_matter_stream(artifacts, generated_on)
    front_reader = PdfReader(front_stream)
    divider_streams = [_divider_stream(item) for item in artifacts]
    divider_readers = [PdfReader(stream) for stream in divider_streams]

    writer = PdfWriter()
    writer.append(front_reader)
    for item, divider_reader in zip(artifacts, divider_readers):
        writer.append(divider_reader)
        writer.append(source_readers[item.artifact_id])
    writer.add_metadata(
        {
            "/Title": "Top 10 MS3 Faculty Review Packet",
            "/Subject": "Faculty review draft; not approved for learner distribution",
            "/Author": "Psychiatry Clerkship Library",
        }
    )

    output_path = out_dir / "faculty_review_packet.pdf"
    temporary_path = out_dir / "faculty_review_packet.pdf.tmp"
    try:
        with temporary_path.open("wb") as fh:
            writer.write(fh)
        temporary_path.replace(output_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    finally:
        writer.close()

    return {
        "combined_review_pdf": str(output_path),
        "front_matter_page_count": len(front_reader.pages),
        "divider_page_count": sum(len(reader.pages) for reader in divider_readers),
        "source_page_count": source_page_count,
        "combined_page_count": len(front_reader.pages) + len(divider_readers) + source_page_count,
    }
