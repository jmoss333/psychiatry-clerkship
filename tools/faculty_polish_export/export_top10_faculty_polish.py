#!/usr/bin/env python3
"""Export the approved top 10 faculty review and Adobe polish package."""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import sys

from package_data import default_artifacts, prepare_package_data, validate_artifacts
from review_pdf import build_combined_review_pdf


def update_manifest_with_pdf_result(manifest_path: Path, pdf_result: dict[str, int | str]) -> None:
    """Record measured review-packet page counts in the package manifest."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["pdf_metrics"] = {
        "front_matter_page_count": pdf_result["front_matter_page_count"],
        "divider_page_count": pdf_result["divider_page_count"],
        "source_page_count": pdf_result["source_page_count"],
        "combined_page_count": pdf_result["combined_page_count"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def export_top10_faculty_polish(
    repo_root: Path,
    out_dir: Path,
    generated_on: str,
) -> dict[str, object]:
    """Generate all curated data, documents, and the combined review PDF."""
    artifacts = default_artifacts()
    validate_artifacts(repo_root, artifacts)
    package_result = prepare_package_data(repo_root, out_dir, generated_on, artifacts)
    pdf_result = build_combined_review_pdf(out_dir, artifacts, generated_on)
    update_manifest_with_pdf_result(out_dir / "top10_manifest.json", pdf_result)
    return {**package_result, **pdf_result}


def resolve_cli_paths(repo_root_arg: str, out_dir_arg: str) -> tuple[Path, Path]:
    """Expand user paths and resolve relative output paths under the repo root."""
    repo_root = Path(repo_root_arg).expanduser().resolve()
    raw_out_dir = Path(out_dir_arg).expanduser()
    out_dir = raw_out_dir.resolve() if raw_out_dir.is_absolute() else (repo_root / raw_out_dir).resolve()
    return repo_root, out_dir


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export the top 10 MS3 faculty and Adobe polish package.")
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[2]),
        help="Path to the Psychiatry Clerkship Library repository.",
    )
    parser.add_argument(
        "--out-dir",
        default="outputs/faculty_polish_top10",
        help="Generated package directory, relative to repo root unless absolute.",
    )
    parser.add_argument(
        "--generated-on",
        default=dt.date.today().isoformat(),
        help="ISO date stamped into generated artifacts.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    repo_root, out_dir = resolve_cli_paths(args.repo_root, args.out_dir)
    try:
        result = export_top10_faculty_polish(repo_root, out_dir, args.generated_on)
    except Exception as exc:
        print(f"Top 10 faculty polish export failed: {exc}", file=sys.stderr)
        return 1
    print(
        "Top 10 faculty polish export complete: "
        f"{result['artifact_count']} artifacts | "
        f"{result['copied_pdf_count']} curated PDFs | "
        f"{result['combined_page_count']} combined pages | "
        f"output={result['out_dir']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
