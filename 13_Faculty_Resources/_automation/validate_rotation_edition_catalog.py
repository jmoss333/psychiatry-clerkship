#!/usr/bin/env python3
"""Validate immutable rotation-edition catalog sources and build safe projections."""
import argparse
import base64
import copy
import hashlib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from jsonschema import Draft7Validator

ROOT = Path(__file__).resolve().parents[2]
CURATION = Path("13_Faculty_Resources/Rotation_Curation")
CATALOG_PATH = CURATION / "rotation_edition_catalog.json"
GOVERNANCE_PATH = CURATION / "rotation_edition_catalog_governance.json"
CATALOG_SCHEMA_PATH = CURATION / "rotation_edition_catalog.schema.json"
GOVERNANCE_SCHEMA_PATH = CURATION / "rotation_edition_catalog_governance.schema.json"
KEY = re.compile(r"^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$")
DIGEST = re.compile(r"^sha256-[A-Za-z0-9_-]{43}$")
TEXT_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>&]")
CHOICE_KINDS = {"reason", "activity", "role", "checklist", "daySet", "roundsPreparation", "roundsParticipation", "roundsFollowUp", "presentationFormat", "presentationTiming", "presentationElement", "documentationWorkflow", "documentationTiming", "feedbackCadence", "feedbackInitiator", "feedbackSetting", "accessItem", "duePoint"}
LOCATION_TYPES = {"inpatient", "outpatient", "consult-liaison", "emergency", "community", "mixed"}
PURPOSE_CODES = {"arrival-map", "orientation", "access-training", "documentation-policy", "attendance-policy", "feedback-policy", "directory", "parking-transit", "official-clinical-policy", "reviewed-operational"}
TEMPLATE_TOKENS = {
    "arrival": ["timing", "time", "place", "role"], "scheduleWindow": ["dayStart", "dayEnd", "endQualifier"],
    "scheduleRangeWithPlace": ["daySet", "startTime", "endTime", "activity", "place", "priority"],
    "scheduleRangeWithoutPlace": ["daySet", "startTime", "endTime", "activity", "priority"],
    "schedulePointWithPlace": ["daySet", "startTime", "activity", "place", "priority"],
    "schedulePointWithoutPlace": ["daySet", "startTime", "activity", "priority"],
    "rounds": ["preparation", "participation", "followUp"], "presentation": ["format", "timing", "elements"],
    "documentation": ["workflow", "timing"], "attendance": ["events", "absenceRole"],
    "feedback": ["cadence", "initiator", "setting"], "access": ["item", "due"], "contact": ["role"],
    "checklist": ["item", "priority"], "resourceWithReason": ["title", "priority", "week", "reason", "hostname"],
    "resourceWithoutReason": ["title", "priority", "week", "hostname"], "changeSummary": ["kinds", "count"],
}


def canonical_json_bytes(value: object) -> bytes:
    """Return compact, sorted, UTF-8 canonical JSON for digest contracts."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def canonical_digest(value: object) -> str:
    return "sha256-" + base64.urlsafe_b64encode(hashlib.sha256(canonical_json_bytes(value)).digest()).decode("ascii").rstrip("=")


def _error(code: str, pointer: str) -> ValueError:
    return ValueError(f"{code} {pointer}")


def _pointer(parts) -> str:
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def _read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise _error("CATALOG_INVALID", "/")
    return value


def load_catalog(root: Path) -> dict:
    return _read_json(root / CATALOG_PATH)


def load_governance(root: Path) -> dict:
    return _read_json(root / GOVERNANCE_PATH)


def _validate_schema(root: Path, document: dict, schema_path: Path, label: str) -> None:
    schema = _read_json(root / schema_path)
    Draft7Validator.check_schema(schema)
    errors = sorted(Draft7Validator(schema).iter_errors(document), key=lambda error: list(error.absolute_path))
    if errors:
        raise _error(label, _pointer(errors[0].absolute_path))


def _real_date(value, pointer: str, today: date) -> None:
    if not isinstance(value, str):
        raise _error("CATALOG_INVALID", pointer)
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise _error("CATALOG_INVALID", pointer) from error
    if parsed > today:
        raise _error("CATALOG_INVALID", pointer)


def _plain_text(value, pointer: str, maximum: int) -> None:
    if not isinstance(value, str) or not value or len(value) > maximum or value != value.strip() or TEXT_CONTROL.search(value):
        raise _error("CATALOG_INVALID", pointer)


def _sorted_unique(values, pointer: str) -> None:
    if not isinstance(values, list) or values != sorted(values) or len(values) != len(set(values)):
        raise _error("CATALOG_INVALID", pointer)


def _record_fields(record: dict, pointer: str) -> None:
    kind = record.get("kind")
    base = {"key", "kind", "contentDigest", "audiences", "verifiedOn"}
    allowed = {
        "trainingLocation": base | {"displayName", "locationCode", "locationTypeCode", "officialHostnames"},
        "curatorProfile": base | {"displayName", "roleKey", "locationKeys"},
        "place": base | {"displayName", "locationKeys"},
        "officialLink": base | {"title", "url", "visibleHostname", "purposeCode", "locationKeys"},
        "phraseSet": base | {"displayName", "templates", "locationKeys"},
        "choice": base | {"choiceKind", "label", "fragment", "locationKeys"},
        "localPreset": base | {"displayName", "localPlan", "locationKeys", "phraseSetKey"},
    }
    required = {
        "trainingLocation": base | {"displayName", "locationCode", "locationTypeCode", "officialHostnames"},
        "curatorProfile": base | {"displayName", "roleKey", "locationKeys"},
        "place": base | {"displayName", "locationKeys"},
        "officialLink": base | {"title", "url", "visibleHostname", "purposeCode", "locationKeys"},
        "phraseSet": base | {"displayName", "templates"},
        "choice": base | {"choiceKind", "label", "fragment"},
        "localPreset": base | {"displayName", "localPlan", "locationKeys", "phraseSetKey"},
    }
    if kind not in allowed or set(record) - allowed[kind] or not required[kind].issubset(record):
        raise _error("CATALOG_INVALID", pointer)


def _validate_record(record: dict, index: int, records_by_key: dict, today: date) -> None:
    pointer = f"/records/{index}"
    if not isinstance(record, dict):
        raise _error("CATALOG_INVALID", pointer)
    _record_fields(record, pointer)
    if not isinstance(record["key"], str) or not KEY.fullmatch(record["key"]):
        raise _error("CATALOG_INVALID", pointer + "/key")
    if not isinstance(record["contentDigest"], str) or not DIGEST.fullmatch(record["contentDigest"]):
        raise _error("CATALOG_INVALID", pointer + "/contentDigest")
    bare = copy.deepcopy(record); bare.pop("contentDigest")
    if canonical_digest(bare) != record["contentDigest"]:
        raise _error("CATALOG_INVALID", pointer + "/contentDigest")
    _sorted_unique(record["audiences"], pointer + "/audiences")
    if set(record["audiences"]) - {"ms3", "resident"} or not record["audiences"]:
        raise _error("CATALOG_INVALID", pointer + "/audiences")
    _real_date(record["verifiedOn"], pointer + "/verifiedOn", today)
    if "displayName" in record: _plain_text(record["displayName"], pointer + "/displayName", 120)
    if "title" in record: _plain_text(record["title"], pointer + "/title", 120)
    if "locationKeys" in record:
        _sorted_unique(record["locationKeys"], pointer + "/locationKeys")
        if not record["locationKeys"] or len(record["locationKeys"]) > 64 or any(not isinstance(key, str) or not KEY.fullmatch(key) for key in record["locationKeys"]):
            raise _error("CATALOG_INVALID", pointer + "/locationKeys")
    if record["kind"] == "trainingLocation":
        if not isinstance(record["locationCode"], str) or re.fullmatch(r"[A-Z0-9]{2,8}", record["locationCode"]) is None:
            raise _error("CATALOG_INVALID", pointer + "/locationCode")
        if record["locationTypeCode"] not in LOCATION_TYPES:
            raise _error("CATALOG_INVALID", pointer + "/locationTypeCode")
        _sorted_unique(record["officialHostnames"], pointer + "/officialHostnames")
        if len(record["officialHostnames"]) > 32 or any(not isinstance(host, str) or host != host.lower() or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", host) for host in record["officialHostnames"]):
            raise _error("CATALOG_INVALID", pointer + "/officialHostnames")
    elif record["kind"] == "choice":
        if record["choiceKind"] not in CHOICE_KINDS: raise _error("CATALOG_INVALID", pointer + "/choiceKind")
        _plain_text(record["label"], pointer + "/label", 80); _plain_text(record["fragment"], pointer + "/fragment", 240)
    elif record["kind"] == "officialLink":
        _plain_text(record["visibleHostname"], pointer + "/visibleHostname", 253)
        if record["purposeCode"] not in PURPOSE_CODES: raise _error("CATALOG_INVALID", pointer + "/purposeCode")
        parsed = urlsplit(record["url"])
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.hostname != record["visibleHostname"] or parsed.hostname != parsed.hostname.lower():
            raise _error("CATALOG_INVALID", pointer + "/url")
    elif record["kind"] == "phraseSet":
        templates = record["templates"]
        if not isinstance(templates, dict) or set(templates) != set(TEMPLATE_TOKENS): raise _error("CATALOG_INVALID", pointer + "/templates")
        for name, tokens in TEMPLATE_TOKENS.items():
            row = templates[name]
            if not isinstance(row, dict) or set(row) != {"text", "tokens"} or row.get("tokens") != tokens:
                raise _error("CATALOG_INVALID", pointer + "/templates/" + name)
            _plain_text(row["text"], pointer + "/templates/" + name + "/text", 512)
            if re.sub(r"\{(?:" + "|".join(re.escape(token) for token in tokens) + r")\}", "", row["text"]).find("{") >= 0:
                raise _error("CATALOG_INVALID", pointer + "/templates/" + name + "/text")


def validate_catalog(catalog: dict, governance: dict, *, today: date) -> None:
    """Reject malformed, unreviewed, mutable, or relationship-invalid source data."""
    if not isinstance(catalog, dict) or not isinstance(governance, dict): raise _error("CATALOG_INVALID", "/")
    records = catalog.get("records")
    dispositions = governance.get("dispositions")
    if catalog.get("schemaVersion") != 1 or not isinstance(records, list) or len(records) > 4096: raise _error("CATALOG_INVALID", "/records")
    if governance.get("schemaVersion") != 1 or not isinstance(governance.get("manifestRevision"), int) or governance["manifestRevision"] < 1 or governance.get("rotationEditionV2") not in {"disabled", "enabled"} or not isinstance(dispositions, list) or len(dispositions) > 16384: raise _error("CATALOG_INVALID", "/")
    keys = [record.get("key") if isinstance(record, dict) else None for record in records]
    if keys != sorted(keys) or len(keys) != len(set(keys)): raise _error("CATALOG_INVALID", "/records")
    records_by_key = {record["key"]: record for record in records if isinstance(record, dict) and isinstance(record.get("key"), str)}
    for index, record in enumerate(records): _validate_record(record, index, records_by_key, today)
    disposition_keys = [item.get("key") if isinstance(item, dict) else None for item in dispositions]
    if disposition_keys != sorted(disposition_keys) or len(disposition_keys) != len(set(disposition_keys)) or set(disposition_keys) != set(records_by_key): raise _error("CATALOG_INVALID", "/dispositions")
    for index, item in enumerate(dispositions):
        pointer = f"/dispositions/{index}"
        if not isinstance(item, dict) or set(item) != {"key", "status", "changedOn", "reviewRef"} or item.get("status") not in {"pending", "reviewed", "deprecated", "blocked"}:
            raise _error("CATALOG_INVALID", pointer)
        _real_date(item["changedOn"], pointer + "/changedOn", today); _plain_text(item["reviewRef"], pointer + "/reviewRef", 160)
    for index, record in enumerate(records):
        pointer = f"/records/{index}"
        if record["kind"] != "trainingLocation":
            for location_key in record.get("locationKeys", []):
                location = records_by_key.get(location_key)
                if location is None or location.get("kind") != "trainingLocation": raise _error("CATALOG_INVALID", pointer + "/locationKeys")
        if record["kind"] == "curatorProfile":
            role = records_by_key.get(record["roleKey"])
            if role is None or role.get("kind") != "choice" or role.get("choiceKind") != "role": raise _error("CATALOG_INVALID", pointer + "/roleKey")
        if record["kind"] == "officialLink":
            for location_key in record["locationKeys"]:
                if record["visibleHostname"] not in records_by_key[location_key].get("officialHostnames", []): raise _error("CATALOG_INVALID", pointer + "/visibleHostname")
        if record["kind"] == "localPreset":
            phrase = records_by_key.get(record["phraseSetKey"])
            if phrase is None or phrase.get("kind") != "phraseSet": raise _error("CATALOG_INVALID", pointer + "/phraseSetKey")


def build_audience_projection(catalog: dict, governance: dict, audience: str) -> dict:
    if audience not in {"ms3", "resident"}: raise _error("CATALOG_INVALID", "/audience")
    status_by_key = {item["key"]: item["status"] for item in governance["dispositions"]}
    relevant = [copy.deepcopy(record) for record in catalog["records"] if audience in record["audiences"]]
    selection = sorted(record["key"] for record in relevant if status_by_key[record["key"]] == "reviewed")
    resolution = sorted((record for record in relevant if status_by_key[record["key"]] in {"reviewed", "deprecated"}), key=lambda record: record["key"])
    blocked = sorted(record["key"] for record in relevant if status_by_key[record["key"]] == "blocked")
    projection = {"schemaVersion": 1, "audience": audience, "revision": canonical_digest({"catalog": catalog, "governance": governance}), "projectionDigest": "", "rotationEditionV2": governance["rotationEditionV2"], "selectionKeys": selection, "resolutionRecords": resolution, "blockedKeys": blocked}
    projection["projectionDigest"] = canonical_digest({key: value for key, value in projection.items() if key != "projectionDigest"})
    if len(canonical_json_bytes(projection)) > 2 * 1024 * 1024: raise _error("CATALOG_INVALID", "/projection")
    return projection


def validate_immutable_against_ref(root: Path, git_ref: str, catalog: dict) -> None:
    if re.fullmatch(r"[0-9a-f]{40}", git_ref) is None: raise _error("CATALOG_INVALID", "/compare-ref")
    result = subprocess.run(["git", "-C", str(root), "show", f"{git_ref}:{CATALOG_PATH.as_posix()}"], capture_output=True, text=True, shell=False)
    if result.returncode != 0:
        return
    try: prior = json.loads(result.stdout)
    except json.JSONDecodeError as error: raise _error("CATALOG_IMMUTABLE", "/records") from error
    prior_records = {record.get("key"): record for record in prior.get("records", []) if isinstance(record, dict)}
    current_records = {record.get("key"): record for record in catalog.get("records", []) if isinstance(record, dict)}
    for key, prior_record in prior_records.items():
        if key not in current_records or canonical_json_bytes(prior_record) != canonical_json_bytes(current_records[key]):
            raise _error("CATALOG_IMMUTABLE", "/records")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--compare-ref")
    args = parser.parse_args()
    try:
        if args.compare_ref is not None and re.fullmatch(r"[0-9a-f]{40}", args.compare_ref) is None: raise _error("CATALOG_INVALID", "/compare-ref")
        catalog, governance = load_catalog(args.root), load_governance(args.root)
        _validate_schema(args.root, catalog, CATALOG_SCHEMA_PATH, "CATALOG_SCHEMA_INVALID")
        _validate_schema(args.root, governance, GOVERNANCE_SCHEMA_PATH, "GOVERNANCE_SCHEMA_INVALID")
        validate_catalog(catalog, governance, today=date.today())
        if args.compare_ref: validate_immutable_against_ref(args.root, args.compare_ref, catalog)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"rotation edition catalog INVALID — {error}")
        return 1
    print("rotation edition catalog OK — production catalog empty and publication disabled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
