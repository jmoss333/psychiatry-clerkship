#!/usr/bin/env python3
"""Run the repository evidence contract and foreign-key checks offline."""

from __future__ import annotations

import argparse
import datetime
import difflib
import json
from pathlib import Path

try:
    from . import registry as registry_library
except ImportError:  # Direct invocation: python3 tools/evidence_registry/validate.py
    import registry as registry_library


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="repository root containing evidence_registry.json",
    )
    parser.add_argument(
        "--check-generated",
        action="store_true",
        help="also compare tracked generated views with deterministic outputs",
    )
    parser.add_argument(
        "--compare-legacy-surveillance",
        type=Path,
        metavar="PATH",
        help="one-time exact comparison with the retired YAML surveillance registry",
    )
    return parser


def _json_compatible(value):
    """Normalize PyYAML's implicit date scalar to the canonical JSON value."""

    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_compatible(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_json_compatible(child) for child in value]
    return value


def _compare_legacy_surveillance(registry: dict, legacy_path: Path) -> bool:
    try:
        import yaml  # type: ignore[import-not-found]  # Explicit one-time branch only.
    except ImportError as exc:
        print(f"error: cannot compare legacy surveillance without PyYAML: {exc}")
        return False

    try:
        with Path(legacy_path).expanduser().open(encoding="utf-8") as handle:
            legacy = _json_compatible(yaml.safe_load(handle))
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"error: could not load legacy surveillance registry: {exc}")
        return False

    canonical = registry_library.build_surveillance_projection(registry)
    if legacy == canonical:
        print("legacy surveillance projection matches canonical registry")
        return True

    legacy_json = json.dumps(legacy, indent=2, sort_keys=True).splitlines()
    canonical_json = json.dumps(canonical, indent=2, sort_keys=True).splitlines()
    print(
        "\n".join(
            difflib.unified_diff(
                legacy_json,
                canonical_json,
                fromfile="legacy surveillance",
                tofile="canonical surveillance",
                lineterm="",
            )
        )
    )
    return False


def _check_generated_views(repo_root: Path) -> list[registry_library.ValidationIssue]:
    generator = getattr(registry_library, "generated_outputs", None)
    if generator is None:
        return [
            registry_library.ValidationIssue(
                "generated",
                "generated view checking is unavailable until the generator is installed",
            )
        ]

    try:
        expected_outputs = generator(repo_root)
    except Exception as exc:  # Surface a deterministic generator failure as a gate issue.
        return [
            registry_library.ValidationIssue(
                "generated", f"could not compute generated views: {exc}"
            )
        ]

    issues: list[registry_library.ValidationIssue] = []
    for output_path, expected_text in expected_outputs.items():
        path = Path(output_path)
        if not path.is_absolute():
            path = repo_root / path
        display_path = path.relative_to(repo_root).as_posix()
        if not path.exists():
            issues.append(
                registry_library.ValidationIssue(
                    display_path, "generated view is missing"
                )
            )
            continue
        if path.read_text(encoding="utf-8") != expected_text:
            issues.append(
                registry_library.ValidationIssue(
                    display_path,
                    "generated view is stale; regenerate the evidence views",
                )
            )
    return issues


def _print_issues(issues: list[registry_library.ValidationIssue]) -> None:
    for issue in issues:
        print(f"{issue.severity}: {issue.path}: {issue.message}")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    repo_root = args.repo_root.expanduser().resolve()
    registry_path = repo_root / "evidence_registry.json"

    try:
        registry = registry_library.load_evidence_registry(registry_path)
    except (OSError, ValueError) as exc:
        _print_issues(
            [
                registry_library.ValidationIssue(
                    "evidence_registry.json", f"could not load registry: {exc}"
                )
            ]
        )
        return 1

    issues = registry_library.validate_registry(registry)

    try:
        source_index = registry_library.index_sources(registry)
    except ValueError as exc:
        issues.append(registry_library.ValidationIssue("sources", str(exc)))
        source_index = {}

    try:
        references = registry_library.collect_evidence_references(repo_root)
    except (OSError, ValueError) as exc:
        issues.append(
            registry_library.ValidationIssue(
                "evidence references", f"could not collect foreign keys: {exc}"
            )
        )
        references = []

    for source_path, evidence_id in references:
        if evidence_id not in source_index:
            issues.append(
                registry_library.ValidationIssue(
                    source_path, f"unknown evidence id: {evidence_id}"
                )
            )

    if args.check_generated:
        issues.extend(_check_generated_views(repo_root))

    comparison_matches = True
    if args.compare_legacy_surveillance is not None:
        comparison_matches = _compare_legacy_surveillance(
            registry, args.compare_legacy_surveillance
        )

    _print_issues(issues)
    if any(issue.severity == "error" for issue in issues) or not comparison_matches:
        return 1

    tier1 = registry_library.tier1_sources(registry)
    selections = {
        source.get("curriculum", {}).get("selection")
        for source in tier1
        if isinstance(source.get("curriculum"), dict)
    }
    selection_roots = {
        "14" if selection in {"14a", "14b"} else selection
        for selection in selections
    }
    print(
        "evidence registry OK — "
        f"{len(registry.get('sources', []))} sources, "
        f"{len(tier1)} Tier 1 articles, "
        f"{len(selection_roots)} numbered selections"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
