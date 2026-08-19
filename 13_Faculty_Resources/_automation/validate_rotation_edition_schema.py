#!/usr/bin/env python3
"""Validate synthetic rotation-edition fixtures using the local Draft-07 schema."""

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator
from jsonschema.exceptions import SchemaError


ROOT = Path(__file__).resolve().parents[2]
FIXTURES_RELATIVE = Path("tests/fixtures/rotation-editions")
VALID_FIXTURES = ("valid-ms3.json", "valid-resident.json")
INVALID_FIXTURES = {
    "invalid-extra-property.json": "/config/card",
    "invalid-unsafe-url.json": "/config/localOrientation/resources/0/url",
}


def json_pointer(path) -> str:
    """Format an iterable path as an RFC 6901 JSON Pointer."""
    return "/" + "/".join(
        str(part).replace("~", "~0").replace("/", "~1") for part in path
    )


def load_schema(root: Path) -> dict:
    """Load the repository's local rotation-edition Draft-07 schema."""
    with (root / "rotation_edition.schema.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_document(document: dict, schema: dict) -> list[str]:
    """Return stable JSON pointers for schema violations without echoing values."""
    Draft7Validator.check_schema(schema)
    return sorted({json_pointer(error.absolute_path) for error in Draft7Validator(schema).iter_errors(document)})


def validate_fixtures(root: Path) -> None:
    """Fail closed unless two valid and two intentionally invalid fixtures behave as specified."""
    schema = load_schema(root)
    Draft7Validator.check_schema(schema)
    fixture_root = root / FIXTURES_RELATIVE
    failures = []

    for name in VALID_FIXTURES:
        try:
            document = json.loads((fixture_root / name).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            failures.append((name, "/"))
            continue
        errors = validate_document(document, schema)
        if errors:
            failures.extend((name, pointer) for pointer in errors)

    for name, expected_pointer in INVALID_FIXTURES.items():
        try:
            document = json.loads((fixture_root / name).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            failures.append((name, "/"))
            continue
        errors = validate_document(document, schema)
        if expected_pointer not in errors:
            failures.append((name, expected_pointer))

    if failures:
        raise ValueError("; ".join(f"{name}: {pointer}" for name, pointer in failures))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    args = parser.parse_args()

    try:
        validate_fixtures(args.root)
    except (OSError, json.JSONDecodeError, SchemaError, ValueError) as error:
        print(f"rotation edition schema INVALID — {error}")
        return 1

    print("rotation edition schema OK — 2 valid fixture(s), 2 invalid fixture(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
