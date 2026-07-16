#!/usr/bin/env python3
"""Validate the six root registries against their Draft-07 JSON Schemas."""

import argparse
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator
    from jsonschema.exceptions import SchemaError
    from referencing.exceptions import Unresolvable
except ImportError:  # pragma: no cover - exercised only before dependency installation
    Draft7Validator = None
    SchemaError = Exception
    Unresolvable = Exception


PAIRS = (
    ("topic_meta.json", "topic_meta.schema.json"),
    ("question_bank.json", "question_bank.schema.json"),
    ("communication_cases.json", "communication_cases.schema.json"),
    ("family_systems_scenarios.json", "family_systems_scenarios.schema.json"),
    ("evidence_registry.json", "evidence_registry.schema.json"),
    ("tool_registry.json", "tool_registry.schema.json"),
)


def json_pointer(path) -> str:
    """Format an iterable path as an RFC 6901-style JSON Pointer."""
    parts = (str(part).replace("~", "~0").replace("/", "~1") for part in path)
    return "/" + "/".join(parts)


def load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle), None
    except FileNotFoundError:
        return None, f"{path.name}: MISSING"
    except json.JSONDecodeError as error:
        return None, f"{path.name}: INVALID JSON at line {error.lineno}, column {error.colno}: {error.msg}"
    except UnicodeDecodeError as error:
        return None, f"{path.name}: INVALID JSON at byte {error.start}: invalid UTF-8"
    except OSError as error:
        return None, f"{path.name}: UNREADABLE: {error}"


def validate_root(root: Path) -> tuple[list[str], bool]:
    """Return deterministic diagnostics for the six fixed registry/schema pairs."""
    diagnostics = []
    has_errors = False
    for document_name, schema_name in PAIRS:
        schema, schema_error = load_json(root / schema_name)
        if schema_error:
            diagnostics.append(schema_error)
            has_errors = True
            continue

        try:
            Draft7Validator.check_schema(schema)
        except SchemaError as error:
            diagnostics.append(
                f"{schema_name}: INVALID SCHEMA at {json_pointer(error.absolute_path)}: {error.message}"
            )
            has_errors = True
            continue

        document, document_error = load_json(root / document_name)
        if document_error:
            diagnostics.append(document_error)
            has_errors = True
            continue

        try:
            errors = sorted(
                Draft7Validator(schema).iter_errors(document),
                key=lambda error: (
                    json_pointer(error.absolute_path),
                    error.message,
                    json_pointer(error.absolute_schema_path),
                ),
            )
        except Unresolvable as error:
            diagnostics.append(f"{schema_name}: INVALID SCHEMA at /$ref: {error}")
            has_errors = True
            continue
        if errors:
            has_errors = True
            diagnostics.extend(
                f"{document_name}: INVALID at {json_pointer(error.absolute_path)}: {error.message}"
                for error in errors
            )
        else:
            diagnostics.append(f"{document_name}: OK ({schema_name})")
    return diagnostics, has_errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="repository root containing the six fixed registry/schema pairs",
    )
    args = parser.parse_args()

    if Draft7Validator is None:
        print("jsonschema is required; install dependencies with: python3 -m pip install -r requirements.txt")
        return 2

    diagnostics, has_errors = validate_root(args.root)
    for diagnostic in diagnostics:
        print(diagnostic)
    return 1 if has_errors else 0


if __name__ == "__main__":
    sys.exit(main())
