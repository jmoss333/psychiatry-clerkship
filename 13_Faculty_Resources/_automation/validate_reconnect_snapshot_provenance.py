#!/usr/bin/env python3
"""Validate pinned ReConnect snapshot provenance without network or repo access.

Two kinds of record:
  exact-copy  a byte-identical snapshot under a `_source/` directory (keyed by snapshotPath)
  derived     a registry re-shaped from a ReConnect dataset at a pinned revision (keyed by
              derivedPath). It needs a fieldMap, and every `reconnectRecord` in that
              registry must point at a pinned `sourceRecords` index (spec AC8, bridge check BR4).

This file runs in the build (build_and_check.sh), so it must never import the dev-only
sync engine (bridge check BR3).
"""

import argparse
import hashlib
import json
import re
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


def resolve_inside(root: Path, relative: str):
    """(path, None) for a regular, non-symlinked file inside root; else (None, diagnostic)."""
    cursor = root
    for part in Path(relative).parts:
        cursor /= part
        if cursor.is_symlink():
            return None, f"{relative}: symbolic links are not allowed"
    try:
        resolved = (root / relative).resolve()
    except (OSError, RuntimeError):
        return None, f"{relative}: UNRESOLVABLE"
    try:
        resolved.relative_to(root)
    except ValueError:
        return None, f"{relative}: path escapes repository root"
    if not resolved.is_file():
        return None, f"{relative}: MISSING"
    return resolved, None


def reconnect_refs(value):
    """Every reconnectRecord string anywhere in a registry, at any depth."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "reconnectRecord" and isinstance(item, str):
                yield item
            else:
                yield from reconnect_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from reconnect_refs(item)


def validate_derived(root: Path, records: list[dict]) -> list[str]:
    diagnostics = []
    pinned_sources = set()
    for record in records:
        relative = record["derivedPath"]
        source = (record["dataset"], record["sourcePath"])
        if source in pinned_sources:
            diagnostics.append(
                f"{relative}: another derived record already pins "
                f"{record['dataset']} from {record['sourcePath']}"
            )
        pinned_sources.add(source)
        pinned = record["sourceRecords"]
        if pinned != sorted(pinned):
            diagnostics.append(f"{relative}: sourceRecords must be sorted ascending")

        registry_path, problem = resolve_inside(root, relative)
        if problem:
            diagnostics.append(problem)
            continue
        registry, error = load_json(registry_path)
        if error:
            diagnostics.append(error.replace(registry_path.name, relative, 1))
            continue
        reference = re.compile(r"^" + re.escape(record["dataset"]) + r"\[(\d+)\]")
        for ref in sorted(set(reconnect_refs(registry))):
            match = reference.match(ref)
            if not match:
                diagnostics.append(
                    f"{relative}: reconnectRecord {ref!r} does not reference "
                    f"{record['dataset']}[N]"
                )
            elif int(match.group(1)) not in pinned:
                diagnostics.append(
                    f"{relative}: reconnectRecord {ref!r} is not pinned in sourceRecords"
                )
    return diagnostics


def validate_root(root: Path) -> tuple[list[str], int, int]:
    """Return deterministic diagnostics and the exact-copy and derived record counts."""
    root = root.resolve()
    schema, schema_error = load_json(SCHEMA)
    if schema_error:
        return [schema_error], 0, 0
    try:
        Draft7Validator.check_schema(schema)
    except SchemaError as error:
        return [
            f"{SCHEMA.name}: INVALID SCHEMA at "
            f"{json_pointer(error.absolute_path)}: {error.message}"
        ], 0, 0

    inventory_path = root / INVENTORY_RELATIVE
    inventory, inventory_error = load_json(inventory_path)
    if inventory_error:
        return [inventory_error], 0, 0

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
        ], 0, 0

    records = inventory["records"]
    keys = [record.get("snapshotPath") or record.get("derivedPath") for record in records]
    diagnostics = []
    if keys != sorted(keys) or len(set(keys)) != len(keys):
        diagnostics.append(
            f"{inventory_path.name}: INVALID: records must be sorted by unique "
            "snapshotPath/derivedPath"
        )

    exact = [record for record in records if "snapshotPath" in record]
    derived = [record for record in records if "snapshotPath" not in record]
    for record in exact:
        relative = record["snapshotPath"]
        if record["sourceSha256"] != record["snapshotSha256"]:
            diagnostics.append(
                f"{relative}: sourceSha256 must equal snapshotSha256 "
                "for relation exact-copy"
            )

        snapshot, problem = resolve_inside(root, relative)
        if problem:
            diagnostics.append(problem)
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

    diagnostics.extend(validate_derived(root, derived))
    return sorted(diagnostics), len(exact), len(derived)


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

    diagnostics, exact, derived = validate_root(args.root)
    if diagnostics:
        print(
            "reconnect snapshot provenance INVALID — "
            f"{len(diagnostics)} issue(s):"
        )
        for diagnostic in diagnostics:
            print("  -", diagnostic)
        return 1

    summary = f"{exact} exact-copy record(s)"
    if derived:
        summary += f", {derived} derived record(s)"
    print(f"reconnect snapshot provenance OK — {summary}, manual review required")
    return 0


if __name__ == "__main__":
    sys.exit(main())
