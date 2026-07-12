#!/usr/bin/env python3
"""Prepare data and curated files for the top 10 faculty polish package."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from collections.abc import Sequence
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.adobe_packet_export.export_ms3_adobe_packet_data import split_markdown_sections


REVIEW_STATUS = "needs_faculty_review"
MERGE_FIELDS = (
    "artifact_order",
    "artifact_id",
    "artifact_title",
    "production_format",
    "adobe_template_hint",
    "section_order",
    "section_heading",
    "section_text",
    "canonical_source",
    "review_pdf",
    "generated_on",
    "review_status",
)


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
    review_status: str = REVIEW_STATUS


def default_artifacts() -> list[ArtifactSpec]:
    """Return the approved top 10 artifacts in stable review order."""
    return [
        ArtifactSpec(
            1,
            "orientation_packet",
            "Orientation Packet",
            "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
            "outputs/pdf_library/pdfs/01_welcome_orientation/002_orientation.pdf",
            "01_orientation_packet.pdf",
            "Full packet",
            "full_packet",
        ),
        ArtifactSpec(
            2,
            "interview_mse_pocket_guide",
            "Interview & MSE Pocket Guide",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md",
            "outputs/pdf_library/pdfs/02_start_encounter/030_pg-interview.pdf",
            "02_interview_mse_pocket_guide.pdf",
            "Pocket card",
            "pocket_card",
        ),
        ArtifactSpec(
            3,
            "formulation_ddx_pocket_guide",
            "Formulation & DDx Pocket Guide",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md",
            "outputs/pdf_library/pdfs/03_understand_problem/031_pg-formulation.pdf",
            "03_formulation_ddx_pocket_guide.pdf",
            "Pocket card",
            "pocket_card",
        ),
        ArtifactSpec(
            4,
            "suicide_risk_safety_card",
            "Suicide Risk & Safety Card",
            "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md",
            "outputs/pdf_library/pdfs/04_assess_safety_acuity/032_pg-suicide.pdf",
            "04_suicide_risk_safety_card.pdf",
            "Pocket card",
            "pocket_card",
        ),
        ArtifactSpec(
            5,
            "six_week_reading_map",
            "Six-Week Reading Map",
            "14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md",
            "outputs/pdf_library/pdfs/10_evidence_reference/041_reading-map.pdf",
            "05_six_week_reading_map.pdf",
            "Full packet",
            "full_packet",
        ),
        ArtifactSpec(
            6,
            "acute_consult_module",
            "Capacity/Delirium/Catatonia/Withdrawal",
            "14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md",
            "outputs/pdf_library/pdfs/04_assess_safety_acuity/034_exp-consult.pdf",
            "06_acute_consult_module.pdf",
            "Module packet",
            "module_packet",
        ),
        ArtifactSpec(
            7,
            "documentation_oral_presentation",
            "Documentation & Oral Presentation",
            "14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md",
            "outputs/pdf_library/pdfs/08_present_team/033_doc-oral.pdf",
            "07_documentation_oral_presentation.pdf",
            "Module packet",
            "module_packet",
        ),
        ArtifactSpec(
            8,
            "family_discharge",
            "Family & Discharge",
            "14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md",
            "outputs/pdf_library/pdfs/07_family_systems/036_exp-family.pdf",
            "08_family_discharge.pdf",
            "Module packet",
            "module_packet",
        ),
        ArtifactSpec(
            9,
            "osce_stations",
            "OSCE Stations",
            "14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md",
            "outputs/pdf_library/pdfs/09_practice_exam_prep/038_osce.pdf",
            "09_osce_stations.pdf",
            "OSCE packet",
            "osce_packet",
        ),
        ArtifactSpec(
            10,
            "shelf_review_guide",
            "Shelf Review Guide",
            "14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
            "outputs/pdf_library/pdfs/09_practice_exam_prep/039_shelf.pdf",
            "10_shelf_review_guide.pdf",
            "Module packet",
            "module_packet",
        ),
    ]


def validate_artifacts(repo_root: Path, artifacts: Sequence[ArtifactSpec]) -> None:
    """Validate registry shape and all required source files before export."""
    if len(artifacts) != 10:
        raise ValueError(f"Expected exactly 10 artifacts, found {len(artifacts)}")
    if [item.order for item in artifacts] != list(range(1, 11)):
        raise ValueError("Artifact order must be the stable sequence 1 through 10")

    unique_values = {
        "artifact IDs": [item.artifact_id for item in artifacts],
        "output filenames": [item.output_filename for item in artifacts],
    }
    for label, values in unique_values.items():
        if len(values) != len(set(values)):
            raise ValueError(f"Duplicate {label} are not allowed")

    for item in artifacts:
        if not (repo_root / item.canonical_source).is_file():
            raise FileNotFoundError(f"Missing canonical source: {item.canonical_source}")
        if not (repo_root / item.source_pdf).is_file():
            raise FileNotFoundError(f"Missing source PDF: {item.source_pdf}")


def build_merge_rows(
    repo_root: Path,
    artifacts: Sequence[ArtifactSpec],
    generated_on: str,
) -> list[dict[str, str]]:
    """Build section-level rows for Adobe/InDesign data merge."""
    rows: list[dict[str, str]] = []
    for item in artifacts:
        markdown = (repo_root / item.canonical_source).read_text(encoding="utf-8")
        for section in split_markdown_sections(markdown):
            rows.append(
                {
                    "artifact_order": str(item.order),
                    "artifact_id": item.artifact_id,
                    "artifact_title": item.title,
                    "production_format": item.production_format,
                    "adobe_template_hint": item.template_hint,
                    "section_order": str(section.order),
                    "section_heading": section.heading,
                    "section_text": section.body,
                    "canonical_source": item.canonical_source,
                    "review_pdf": f"pdfs/{item.output_filename}",
                    "generated_on": generated_on,
                    "review_status": item.review_status,
                }
            )
    return rows
