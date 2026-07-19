#!/usr/bin/env python3
"""Produce offline, conservative governance metadata for built tools."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from jsonschema import Draft7Validator


AUTOMATION_DIRECTORY = Path(__file__).resolve().parent
CONTRACT_DIRECTORY = AUTOMATION_DIRECTORY / "contracts" / "clerkshipos-schema-0.2.0"
SCHEMA_PATH = CONTRACT_DIRECTORY / "governance-envelope-v1.schema.json"
MANIFEST_PATH = CONTRACT_DIRECTORY / "manifest.json"
EXPECTED_SCHEMA_SHA256 = "9def8f3edfaa11c549a0bd258eaff048754775675b71e96bf1ffccf15e41f36e"
EXPECTED_CONTRACT_DESCRIPTOR = {
    "name": "GovernanceEnvelopeV1",
    "package": "@clerkshipos/schema",
    "version": "0.2.0",
    "repository": "https://github.com/jmoss333/clerkshipos.git",
    "revision": "f4c29921b0dae325632d1f9d948d651235d9b213",
    "artifactPath": "packages/schema/artifacts/contracts/governance-envelope-v1.schema.json",
    "sha256": EXPECTED_SCHEMA_SHA256,
}
SITE_MANIFEST_RELATIVE = Path("13_Faculty_Resources/_automation/site_build/site_manifest.json")
REVIEWED_RELATIVE = Path("13_Faculty_Resources/reviewed.json")
SITE_EXTRAS = {
    "ms3": (
        ("01_Six_Week_Curriculum/learning-path.html", "learning-path.html"),
        ("_prototypes/orientation-video/orientation-video.html", "orientation-video.html"),
    ),
    "resident": (
        ("01_Six_Week_Curriculum/learning-path.html", "learning-path.html"),
        ("_prototypes/agitation-trainer/rp-agitation.html", "rp-agitation.html"),
        ("_prototypes/brief-psych/rp-brief-psych.html", "rp-brief-psych.html"),
        ("_prototypes/canon-quiz/rp-canon-quiz.html", "rp-canon-quiz.html"),
    ),
}


class GovernanceError(ValueError):
    """Raised when an offline governance input fails closed."""


@dataclass(frozen=True)
class MetadataMarker:
    """One recognized HTML governance metadata marker."""

    kind: str
    fields: dict[str, str]
    audiences: tuple[str, ...]


MARKER_PATTERN = re.compile(
    rb"<!--\s*\[(CLERKSHIP-META v1|RC-META)\]\s*(.*?)-->", re.DOTALL
)
MARKER_START_PATTERN = re.compile(rb"<!--\s*\[(?:CLERKSHIP-META v1|RC-META)\]")
FIELD_PATTERN = re.compile(rb'([A-Za-z][A-Za-z0-9_-]*)="([^"\r\n]*)"')
WHITESPACE_PATTERN = re.compile(rb"\s*")


def parse_audience_list(value: str, relative_path: str) -> tuple[str, ...]:
    """Return the unique, trimmed declared audiences or fail without echoing values."""
    audiences = tuple(part.strip() for part in value.split(","))
    if not audiences or any(not audience for audience in audiences):
        raise GovernanceError(f"{relative_path}: invalid audience field")
    if len(set(audiences)) != len(audiences):
        raise GovernanceError(f"{relative_path}: invalid audience field")
    return audiences


def parse_metadata_marker(source: bytes, relative_path: str) -> MetadataMarker:
    """Parse one preferred or temporary legacy metadata marker from source bytes."""
    matches = list(MARKER_PATTERN.finditer(source))
    if len(list(MARKER_START_PATTERN.finditer(source))) != len(matches):
        raise GovernanceError(f"{relative_path}: malformed metadata marker")
    if not matches:
        raise GovernanceError(f"{relative_path}: metadata marker missing")
    marker_types = {match.group(1) for match in matches}
    if len(marker_types) > 1:
        raise GovernanceError(f"{relative_path}: conflicting metadata markers")
    if len(matches) != 1:
        raise GovernanceError(f"{relative_path}: multiple metadata markers")
    match = matches[0]
    body = match.group(2)
    cursor = 0
    fields = {}
    while cursor < len(body):
        whitespace_end = WHITESPACE_PATTERN.match(body, cursor).end()
        if whitespace_end == len(body):
            break
        if cursor and whitespace_end == cursor:
            raise GovernanceError(f"{relative_path}: malformed metadata")
        field = FIELD_PATTERN.match(body, whitespace_end)
        if field is None:
            raise GovernanceError(f"{relative_path}: malformed metadata")
        key = field.group(1).decode("ascii")
        if key in fields:
            raise GovernanceError(f"{relative_path}: duplicate {key} field")
        try:
            fields[key] = field.group(2).decode("utf-8")
        except UnicodeDecodeError as error:
            raise GovernanceError(f"{relative_path}: malformed metadata") from error
        cursor = field.end()
    for required_field in ("tool", "audience"):
        if not fields.get(required_field):
            raise GovernanceError(f"{relative_path}: missing required {required_field} field")
    audiences = parse_audience_list(fields["audience"], relative_path)
    kind = "preferred" if match.group(1) == b"CLERKSHIP-META v1" else "legacy"
    return MetadataMarker(kind=kind, fields=fields, audiences=audiences)


def load_vendored_contract() -> tuple[dict, dict]:
    """Return the byte-pinned Draft-07 schema and its pinned descriptor."""
    try:
        raw_schema = SCHEMA_PATH.read_bytes()
    except OSError as error:
        raise GovernanceError("governance-envelope-v1.schema.json: unreadable") from error
    if hashlib.sha256(raw_schema).hexdigest() != EXPECTED_SCHEMA_SHA256:
        raise GovernanceError(f"{SCHEMA_PATH.name}: SHA-256 mismatch")
    try:
        schema = json.loads(raw_schema)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GovernanceError("governance-envelope-v1.schema.json: unreadable") from error
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GovernanceError("manifest.json: unreadable") from error
    descriptor = manifest.get("contract")
    if descriptor != EXPECTED_CONTRACT_DESCRIPTOR:
        raise GovernanceError("manifest.json: invalid contract descriptor")
    try:
        Draft7Validator.check_schema(schema)
    except Exception as error:
        raise GovernanceError("governance-envelope-v1.schema.json: invalid Draft-07 schema") from error
    return schema, descriptor


def json_pointer(path) -> str:
    """Format a jsonschema path without exposing the invalid value."""
    return "/" + "/".join(
        str(part).replace("~", "~0").replace("/", "~1") for part in path
    )


def review_status(value: object) -> str:
    """Map source or ledger review terms to the contract's review vocabulary."""
    normalized = str(value or "").strip().lower()
    if normalized == "reviewed":
        return "reviewed"
    if normalized in {"pending", "draft", "flagged", "needs-review"}:
        return "needs-review"
    return "unreviewed"


def attestation_status(value: object) -> str:
    """Map only explicit attestation terms to faculty-attested."""
    normalized = str(value or "").strip().lower()
    if normalized in {"attested", "faculty-attested"}:
        return "faculty-attested"
    if normalized in {"reviewed", "pending", "draft", "flagged", "needs-review"}:
        return "needs-attestation"
    return "unattested"


def _conservative_field(
    marker: MetadataMarker,
    relative_path: str,
    field: str,
    default: object,
    allowed: set[object],
) -> object:
    if field not in marker.fields:
        return default
    value: object = marker.fields[field].strip().lower()
    if field == "clinicalClaim":
        if value == "true":
            value = True
        elif value == "false":
            value = False
    if value not in allowed:
        raise GovernanceError(f"{relative_path}: invalid {field} field")
    return value


def validate_envelope(envelope: dict, relative_path: str) -> None:
    """Validate one normalized envelope using only the verified local schema."""
    schema, _descriptor = load_vendored_contract()
    errors = sorted(
        Draft7Validator(schema).iter_errors(envelope),
        key=lambda error: (json_pointer(error.absolute_path), error.message),
    )
    if errors:
        raise GovernanceError(
            f"{relative_path}: schema validation failed at {json_pointer(errors[0].absolute_path)}"
        )


def normalize_tool(
    source: bytes,
    relative_path: str,
    built_slug: str,
    marker: MetadataMarker,
    *,
    revision: str,
    ledger_status: object = None,
) -> dict:
    """Normalize one tool source into a conservative GovernanceEnvelopeV1 item."""
    marker_status = marker.fields.get("status")
    source_status = marker_status if marker_status is not None else ledger_status
    attestation_value = marker.fields.get(
        "attestationStatus", marker.fields.get("attestation", marker_status)
    )
    authorship_kind = marker.fields.get("authorship", "").strip().lower()
    if authorship_kind not in {
        "human-authored",
        "ai-assisted",
        "ai-drafted",
        "mixed",
    }:
        authorship_kind = "unknown"
    contributor_ids = ["provenance-unrecorded"]
    slug = Path(built_slug).name
    if slug != built_slug or not slug.endswith(".html"):
        raise GovernanceError(f"{relative_path}: invalid built slug")
    envelope = {
        "schemaVersion": 1,
        "id": f"tools/{slug[:-len('.html')]}",
        "type": "tool",
        "profile": "clerkship-curriculum",
        "audiences": list(marker.audiences),
        "source": {
            "repository": "jmoss333/psychiatry-clerkship",
            "path": relative_path,
            "revision": revision,
            "sha256": hashlib.sha256(source).hexdigest(),
        },
        "lifecycle": _conservative_field(
            marker, relative_path, "lifecycle", "active", {"active"}
        ),
        "reviewStatus": review_status(source_status),
        "authorship": {"kind": authorship_kind, "contributorIds": contributor_ids},
        "attestationStatus": attestation_status(attestation_value),
        "safetySeverity": _conservative_field(
            marker, relative_path, "safetySeverity", "high", {"high", "critical"}
        ),
        "reviewCategory": _conservative_field(
            marker, relative_path, "reviewCategory", "clinical", {"clinical"}
        ),
        "clinicalClaim": _conservative_field(
            marker, relative_path, "clinicalClaim", True, {True}
        ),
        "patientDataPolicy": _conservative_field(
            marker,
            relative_path,
            "patientDataPolicy",
            "synthetic-only",
            {"none", "synthetic-only"},
        ),
    }
    validate_envelope(envelope, relative_path)
    return envelope


def _load_json(path: Path, relative_path: str) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GovernanceError(f"{relative_path}: unreadable JSON") from error


def _safe_source_path(root: Path, relative_path: object) -> tuple[str, Path]:
    if not isinstance(relative_path, str):
        raise GovernanceError("site_manifest.json: invalid source path")
    path = PurePosixPath(relative_path)
    if (
        not relative_path
        or path.is_absolute()
        or "\\" in relative_path
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise GovernanceError("site_manifest.json: invalid source path")
    candidate = root.joinpath(*path.parts)
    cursor = root
    for part in path.parts:
        cursor /= part
        if cursor.is_symlink():
            raise GovernanceError(f"{relative_path}: symbolic links are not allowed")
    try:
        resolved = candidate.resolve()
        resolved.relative_to(root)
    except (OSError, RuntimeError, ValueError) as error:
        raise GovernanceError(f"{relative_path}: path escapes repository root") from error
    if not resolved.is_file():
        raise GovernanceError(f"{relative_path}: missing source")
    return relative_path, resolved


def _tool_entries(root: Path, site: str) -> list[tuple[str, str]]:
    if site not in SITE_EXTRAS:
        raise GovernanceError("site: unsupported value")
    manifest = _load_json(root / SITE_MANIFEST_RELATIVE, SITE_MANIFEST_RELATIVE.as_posix())
    if not isinstance(manifest, dict) or not isinstance(manifest.get("tools"), list):
        raise GovernanceError("site_manifest.json: invalid tools field")
    entries = []
    for item in manifest["tools"]:
        if not isinstance(item, list) or len(item) != 3:
            raise GovernanceError("site_manifest.json: invalid tools field")
        source_path, built_slug, _title = item
        if not isinstance(built_slug, str) or Path(built_slug).name != built_slug:
            raise GovernanceError("site_manifest.json: invalid built slug")
        entries.append((source_path, built_slug))
    entries.extend(SITE_EXTRAS[site])
    slugs = [slug for _source, slug in entries]
    if len(set(slugs)) != len(slugs):
        raise GovernanceError("site_manifest.json: duplicate built slug")
    return entries


def current_revision(root: Path) -> str:
    """Return the checked-out full revision without contacting a remote."""
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    revision = completed.stdout.strip()
    if completed.returncode or re.fullmatch(r"[0-9a-f]{40}", revision) is None:
        raise GovernanceError("repository: unable to determine revision")
    return revision


def canonical_json_bytes(document: dict) -> bytes:
    """Serialize generated governance output with stable formatting and no timestamps."""
    return (json.dumps(document, indent=2, sort_keys=True) + "\n").encode("utf-8")


def build_governance_document(
    root: Path, site: str, *, revision: str | None = None
) -> tuple[dict, list[str]]:
    """Build one site inventory entirely from local tracked inputs."""
    root = Path(root).resolve()
    _schema, descriptor = load_vendored_contract()
    ledger = _load_json(root / REVIEWED_RELATIVE, REVIEWED_RELATIVE.as_posix())
    if not isinstance(ledger, dict):
        raise GovernanceError("reviewed.json: invalid ledger")
    revision = revision or current_revision(root)
    items = []
    legacy_paths = []
    for source_relative, built_slug in _tool_entries(root, site):
        relative_path, source_path = _safe_source_path(root, source_relative)
        try:
            source = source_path.read_bytes()
        except OSError as error:
            raise GovernanceError(f"{relative_path}: unreadable source") from error
        marker = parse_metadata_marker(source, relative_path)
        if marker.kind == "legacy":
            legacy_paths.append(relative_path)
        ledger_entry = ledger.get(built_slug, {})
        ledger_status = ledger_entry.get("status") if isinstance(ledger_entry, dict) else None
        items.append(
            normalize_tool(
                source,
                relative_path,
                built_slug,
                marker,
                revision=revision,
                ledger_status=ledger_status,
            )
        )
    items.sort(key=lambda item: item["id"])
    ids = [item["id"] for item in items]
    if len(set(ids)) != len(ids):
        raise GovernanceError("tool-governance.json: duplicate item id")
    warnings = []
    if legacy_paths:
        warnings.append("legacy metadata warning: " + ", ".join(sorted(legacy_paths)))
    return {"schemaVersion": 1, "contract": descriptor, "items": items}, warnings


def validate_repository(root: Path, *, revision: str | None = None) -> tuple[list[str], dict[str, dict]]:
    """Validate both current source inventories and return their generated documents."""
    root = Path(root).resolve()
    resolved_revision = revision or current_revision(root)
    documents = {}
    legacy_paths = set()
    for site in ("ms3", "resident"):
        document, warnings = build_governance_document(
            root, site, revision=resolved_revision
        )
        documents[site] = document
        for warning in warnings:
            legacy_paths.update(warning.removeprefix("legacy metadata warning: ").split(", "))
    diagnostics = []
    if legacy_paths:
        diagnostics.append("legacy metadata warning: " + ", ".join(sorted(legacy_paths)))
    return diagnostics, documents


def write_atomic_json(output_path: Path, document: dict) -> None:
    """Write a fully validated generated document with one atomic replacement."""
    if set(document) != {"schemaVersion", "contract", "items"}:
        raise GovernanceError("tool-governance.json: invalid document fields")
    if document["schemaVersion"] != 1:
        raise GovernanceError("tool-governance.json: invalid schemaVersion")
    if document["contract"] != EXPECTED_CONTRACT_DESCRIPTOR:
        raise GovernanceError("tool-governance.json: invalid contract descriptor")
    if not isinstance(document["items"], list):
        raise GovernanceError("tool-governance.json: invalid items field")
    item_ids = []
    for item in document["items"]:
        if not isinstance(item, dict):
            raise GovernanceError("tool-governance.json: invalid item")
        validate_envelope(item, "tool-governance.json")
        item_ids.append(item["id"])
    if len(set(item_ids)) != len(item_ids) or item_ids != sorted(item_ids):
        raise GovernanceError("tool-governance.json: invalid item ids")
    output_path = Path(output_path)
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=output_path.parent, prefix=f".{output_path.name}.", delete=False
        ) as handle:
            temporary_path = Path(handle.name)
            handle.write(canonical_json_bytes(document))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, output_path)
    except OSError as error:
        try:
            temporary_path.unlink(missing_ok=True)
        except UnboundLocalError:
            pass
        raise GovernanceError("tool-governance.json: unable to write output") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=AUTOMATION_DIRECTORY.parents[1])
    parser.add_argument("--site", choices=("ms3", "resident"))
    parser.add_argument("--revision", help="injected 40-character source revision")
    parser.add_argument("--output", type=Path, help="explicit output path for one site document")
    args = parser.parse_args()
    if args.revision and re.fullmatch(r"[0-9a-f]{40}", args.revision) is None:
        print("tool governance INVALID — repository: invalid revision")
        return 2
    if args.output and args.site is None:
        print("tool governance INVALID — --output requires --site")
        return 2
    try:
        if args.site:
            document, diagnostics = build_governance_document(
                args.root, args.site, revision=args.revision
            )
            documents = {args.site: document}
        else:
            diagnostics, documents = validate_repository(args.root, revision=args.revision)
        for diagnostic in diagnostics:
            print(diagnostic)
        if args.output:
            write_atomic_json(args.output, documents[args.site])
        summary = ", ".join(
            f"{site}: {len(documents[site]['items'])} item(s)" for site in sorted(documents)
        )
        print(f"tool governance OK — {summary}")
        return 0
    except GovernanceError as error:
        print(f"tool governance INVALID — {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
