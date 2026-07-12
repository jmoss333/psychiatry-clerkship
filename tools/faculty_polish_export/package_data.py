#!/usr/bin/env python3
"""Prepare data and curated files for the top 10 faculty polish package."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from collections.abc import Sequence
import csv
import json
import shutil
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


def reset_curated_pdf_dir(pdf_dir: Path) -> None:
    """Clear only the exporter's curated PDF directory."""
    if pdf_dir.exists():
        shutil.rmtree(pdf_dir)
    pdf_dir.mkdir(parents=True, exist_ok=True)


def copy_curated_pdfs(
    repo_root: Path,
    out_dir: Path,
    artifacts: Sequence[ArtifactSpec],
) -> list[dict[str, str]]:
    """Copy selected review PDFs to stable, human-readable filenames."""
    pdf_dir = out_dir / "pdfs"
    reset_curated_pdf_dir(pdf_dir)
    records: list[dict[str, str]] = []
    for item in artifacts:
        destination = pdf_dir / item.output_filename
        shutil.copy2(repo_root / item.source_pdf, destination)
        records.append(
            {
                "artifact_id": item.artifact_id,
                "source_pdf": item.source_pdf,
                "curated_pdf": destination.relative_to(out_dir).as_posix(),
                "review_status": item.review_status,
            }
        )
    return records


def _write_merge_csv(path: Path, rows: Sequence[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=MERGE_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def _faculty_review_index(artifacts: Sequence[ArtifactSpec], generated_on: str) -> str:
    lines = [
        "# Top 10 Faculty Review Index",
        "",
        f"Generated: {generated_on}",
        "",
        "> Status: `needs_faculty_review`. These artifacts are not approved for learner distribution.",
        "",
        "Review the PDFs for layout and content. If revision is needed, correct the canonical Markdown and regenerate the package; do not edit generated copies as the curriculum source.",
        "",
        "| # | Artifact | Canonical source | Review PDF | Clinical / MS3 | Local policy | PHI | Accessibility | Decision |",
        "|---:|---|---|---|---|---|---|---|---|",
    ]
    for item in artifacts:
        lines.append(
            f"| {item.order} | {item.title} | `{item.canonical_source}` | "
            f"[`{item.output_filename}`](pdfs/{item.output_filename}) | [ ] | [ ] | [ ] | [ ] | "
            "[ ] Approve / [ ] Revise / [ ] Defer |"
        )
    lines.extend(
        [
            "",
            "## Review prompts",
            "",
            "- Clinical / MS3: accurate, appropriately scoped, and clear for third-year learners.",
            "- Local policy: locally specific statements are verified, removed, or visibly marked.",
            "- PHI: no patient-identifying information is present.",
            "- Accessibility: headings, reading order, contrast, tables, and warnings remain legible.",
            "- Decision: record approval only after all four checks are complete.",
            "",
        ]
    )
    return "\n".join(lines)


def _adobe_handoff(generated_on: str) -> str:
    return f"""# Adobe/InDesign Handoff

Generated: {generated_on}
Status: `needs_faculty_review`

## Plain-language purpose

The curated PDFs are visual review proofs. `top10_adobe_merge.csv` contains editable section text for InDesign. Curriculum corrections belong in the canonical Markdown, followed by regeneration.

## Template families

| `adobe_template_hint` | Use |
|---|---|
| `full_packet` | Orientation and six-week reading map |
| `pocket_card` | Interview/MSE, formulation/DDx, and suicide safety cards |
| `module_packet` | Acute consult, documentation, family/discharge, and shelf review |
| `osce_packet` | Student prompts, examiner material, and feedback sections |

## Visible template fields

- Document title: `artifact_title`
- Section heading: `section_heading`
- Body: `section_text`
- Footer date: formatted creation date derived from `generated_on`

Do not map `canonical_source`, `artifact_id`, or `review_pdf` into visible frames.
Do not map `review_status` into visible frames. These fields remain internal traceability data.

Do not distribute a learner-facing PDF while its internal record remains `needs_faculty_review`.

## Regenerate

```bash
python3 tools/faculty_polish_export/export_top10_faculty_polish.py --generated-on {generated_on}
```

## Production checks

- Preserve headings and safety warnings when text reflows.
- Confirm tables, links, and page references remain understandable.
- Set accessible reading order, document language, bookmarks, and alt text where applicable.
- Confirm there is no PHI or unverified local-policy language.
- Before an Adobe merge, authenticate Creative Cloud, inspect the template IDML, and obtain explicit approval of the mapping JSON.
"""


def _package_readme(generated_on: str) -> str:
    return f"""# Top 10 Faculty and Adobe Polish Package

Generated: {generated_on}
Status: `needs_faculty_review`

This generated folder collects ten high-value MS3 curriculum PDFs for faculty review and Adobe/InDesign finishing. Markdown files in the repository remain canonical. The standalone PDFs contain curriculum content, the library creation date, and page numbers; the combined packet adds internal review cover pages and dividers.

## Start here

1. Open `faculty_review_packet.pdf` for the combined review copy.
2. Record decisions in `faculty_review_index.md` or the institution's review system.
3. Use `top10_adobe_merge.csv` with `adobe_indesign_handoff.md` for layout finishing.
4. Make curriculum corrections in canonical Markdown and regenerate.

The standalone review proofs are under `pdfs/`. Do not distribute these files to learners until faculty review is complete.
"""


def _manifest(
    artifacts: Sequence[ArtifactSpec],
    copied_records: Sequence[dict[str, str]],
    merge_row_count: int,
    generated_on: str,
) -> dict[str, object]:
    copied_by_id = {record["artifact_id"]: record for record in copied_records}
    artifact_records = []
    for item in artifacts:
        copied = copied_by_id[item.artifact_id]
        artifact_records.append(
            {
                "order": item.order,
                "artifact_id": item.artifact_id,
                "title": item.title,
                "production_format": item.production_format,
                "adobe_template_hint": item.template_hint,
                "canonical_source": item.canonical_source,
                "source_pdf": copied["source_pdf"],
                "curated_pdf": copied["curated_pdf"],
                "review_status": item.review_status,
            }
        )
    return {
        "generated_on": generated_on,
        "review_status": REVIEW_STATUS,
        "artifact_count": len(artifacts),
        "copied_pdf_count": len(copied_records),
        "merge_row_count": merge_row_count,
        "artifacts": artifact_records,
        "outputs": {
            "readme": "README.md",
            "faculty_review_index": "faculty_review_index.md",
            "combined_review_pdf": "faculty_review_packet.pdf",
            "adobe_merge_csv": "top10_adobe_merge.csv",
            "adobe_indesign_handoff": "adobe_indesign_handoff.md",
        },
        "guardrails": [
            "No PHI or patient-identifiable information.",
            "Repository Markdown remains canonical.",
            "Generated outputs require faculty review before learner-facing use.",
            "Local-policy language requires local verification.",
        ],
    }


def prepare_package_data(
    repo_root: Path,
    out_dir: Path,
    generated_on: str,
    artifacts: Sequence[ArtifactSpec],
) -> dict[str, object]:
    """Create curated copies, editable merge data, and review documentation."""
    validate_artifacts(repo_root, artifacts)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = build_merge_rows(repo_root, artifacts, generated_on)
    copied_records = copy_curated_pdfs(repo_root, out_dir, artifacts)

    _write_merge_csv(out_dir / "top10_adobe_merge.csv", rows)
    (out_dir / "faculty_review_index.md").write_text(
        _faculty_review_index(artifacts, generated_on), encoding="utf-8"
    )
    (out_dir / "adobe_indesign_handoff.md").write_text(_adobe_handoff(generated_on), encoding="utf-8")
    (out_dir / "README.md").write_text(_package_readme(generated_on), encoding="utf-8")

    manifest = _manifest(artifacts, copied_records, len(rows), generated_on)
    (out_dir / "top10_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "out_dir": str(out_dir),
        "artifact_count": len(artifacts),
        "copied_pdf_count": len(copied_records),
        "merge_row_count": len(rows),
    }
