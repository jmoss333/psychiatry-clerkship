#!/usr/bin/env python3
"""Validate pinned ReConnect snapshot provenance without network or repo access."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator
    from jsonschema.exceptions import SchemaError
except ImportError:  # pragma: no cover - exercised only before dependency installation
    Draft7Validator = None
    SchemaError = Exception


ROOT = Path(__file__).resolve().parents[2]
INVENTORY_RELATIVE = Path(
    "13_Faculty_Resources/_automation/provenance/"
    "reconnect_snapshot_provenance.json"
)
SCHEMA = (
    Path(__file__).resolve().parent
    / "provenance"
    / "reconnect_snapshot_provenance.schema.json"
)


def json_pointer(path) -> str:
    """Format an iterable path as an RFC 6901 JSON Pointer."""
    parts = (str(part).replace("~", "~0").replace("/", "~1") for part in path)
    return "/" + "/".join(parts)


def load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle), None
    except FileNotFoundError:
        return None, f"{path.name}: MISSING"
    except json.JSONDecodeError as error:
        return (
            None,
            f"{path.name}: INVALID JSON at line {error.lineno}, "
            f"column {error.colno}: {error.msg}",
        )
    except UnicodeDecodeError as error:
        return None, f"{path.name}: INVALID JSON at byte {error.start}: invalid UTF-8"
    except OSError as error:
        return None, f"{path.name}: UNREADABLE: {error}"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_root(root: Path) -> tuple[list[str], int]:
    """Return deterministic diagnostics and the number of valid records."""
    root = root.resolve()
    schema, schema_error = load_json(SCHEMA)
    if schema_error:
        return [schema_error], 0
    try:
        Draft7Validator.check_schema(schema)
    except SchemaError as error:
        return [
            f"{SCHEMA.name}: INVALID SCHEMA at "
            f"{json_pointer(error.absolute_path)}: {error.message}"
        ], 0

    inventory_path = root / INVENTORY_RELATIVE
    inventory, inventory_error = load_json(inventory_path)
    if inventory_error:
        return [inventory_error], 0

    schema_errors = sorted(
        Draft7Validator(schema).iter_errors(inventory),
        key=lambda error: (
            json_pointer(error.absolute_path),
            error.message,
            json_pointer(error.absolute_schema_path),
        ),
    )
    if schema_errors:
        return [
            f"{inventory_path.name}: INVALID at "
            f"{json_pointer(error.absolute_path)}: {error.message}"
            for error in schema_errors
        ], 0

    records = inventory["records"]
    snapshot_paths = [record["snapshotPath"] for record in records]
    diagnostics = []
    if snapshot_paths != sorted(snapshot_paths) or len(set(snapshot_paths)) != len(
        snapshot_paths
    ):
        diagnostics.append(
            f"{inventory_path.name}: INVALID: records must be sorted by unique snapshotPath"
        )

    for record in records:
        relative = record["snapshotPath"]
        if record["sourceSha256"] != record["snapshotSha256"]:
            diagnostics.append(
                f"{relative}: sourceSha256 must equal snapshotSha256 "
                "for relation exact-copy"
            )

        candidate = root / relative
        cursor = root
        symlinked = False
        for part in Path(relative).parts:
            cursor /= part
            if cursor.is_symlink():
                symlinked = True
                break
        if symlinked:
            diagnostics.append(f"{relative}: symbolic links are not allowed")
            continue
        try:
            snapshot = candidate.resolve()
        except (OSError, RuntimeError):
            diagnostics.append(f"{relative}: UNRESOLVABLE")
            continue
        try:
            snapshot.relative_to(root)
        except ValueError:
            diagnostics.append(f"{relative}: path escapes repository root")
            continue
        if not snapshot.is_file():
            diagnostics.append(f"{relative}: MISSING")
            continue
        try:
            actual = file_sha256(snapshot)
        except OSError:
            diagnostics.append(f"{relative}: UNREADABLE")
            continue
        expected = record["snapshotSha256"]
        if actual != expected:
            diagnostics.append(
                f"{relative}: SHA-256 mismatch (expected {expected}, actual {actual})"
            )

    return sorted(diagnostics), len(records)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="clerkship repository root containing the pinned snapshots",
    )
    args = parser.parse_args()

    if Draft7Validator is None:
        print(
            "jsonschema is required; install dependencies with: "
            "python3 -m pip install -r requirements.txt"
        )
        return 2

    diagnostics, count = validate_root(args.root)
    if diagnostics:
        print(
            "reconnect snapshot provenance INVALID — "
            f"{len(diagnostics)} issue(s):"
        )
        for diagnostic in diagnostics:
            print("  -", diagnostic)
        return 1

    print(
        "reconnect snapshot provenance OK — "
        f"{count} exact-copy record(s), manual review required"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
