#!/usr/bin/env python3
"""Validate closed v2 rotation-edition fixtures and their semantic contracts."""

import argparse
import base64
import copy
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

from jsonschema import Draft7Validator
from jsonschema.exceptions import SchemaError


ROOT = Path(__file__).resolve().parents[2]
FIXTURES_RELATIVE = Path("tests/fixtures/rotation-editions")
SYNTHETIC_CONTEXT = FIXTURES_RELATIVE / "synthetic-core-index.json"
VALID_FIXTURES = ("valid-ms3.json", "valid-resident.json")
INVALID_FIXTURES = {
    "invalid-extra-property.json": "/config/context",
    "invalid-unsafe-url.json": "/config/localPlan/resources/0/linkKey",
}
KEY = re.compile(r"^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$")
DIGEST = re.compile(r"^sha256-[A-Za-z0-9_-]{43}$")
REVISION = re.compile(r"^[0-9a-f]{40}$")
TIME = re.compile(r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
POSITIVE_DECIMAL = re.compile(r"^[1-9][0-9]*$")
CHANGE_KINDS = (
    "initial", "edition-context", "curriculum-selection", "curriculum-priority",
    "curriculum-reason", "schedule", "arrival", "workflow", "access", "contacts",
    "checklist", "resources",
)


def json_pointer(path) -> str:
    """Format an iterable path as an RFC 6901 JSON Pointer."""
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in path)


def _core_instance_id(value: object, ref: object) -> bool:
    if not isinstance(value, str) or not isinstance(ref, str) or len(value) > 160:
        return False
    prefix = f"core:{ref}:"
    return value.startswith(prefix) and POSITIVE_DECIMAL.fullmatch(value[len(prefix):]) is not None


def _local_instance_id(value: object, kind: str) -> bool:
    if not isinstance(value, str) or len(value) > 160:
        return False
    prefix = f"local:{kind}:"
    return value.startswith(prefix) and POSITIVE_DECIMAL.fullmatch(value[len(prefix):]) is not None


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def canonical_digest(value: object) -> str:
    encoded = hashlib.sha256(canonical_json_bytes(value)).digest()
    return "sha256-" + base64.urlsafe_b64encode(encoded).decode("ascii").rstrip("=")


def edition_fingerprint(location_code: str, audience: str, content_digest: str, reference_set_digest: str) -> str:
    if re.fullmatch(r"[A-Z0-9]{2,8}", location_code) is None or audience not in {"ms3", "resident"}:
        return ""
    if DIGEST.fullmatch(content_digest) is None or DIGEST.fullmatch(reference_set_digest) is None:
        return ""
    raw = hashlib.sha256(canonical_json_bytes({"contentDigest": content_digest, "referenceSetDigest": reference_set_digest})).digest()
    value = int.from_bytes(raw[:4], "big") >> 2
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    suffix = "".join(alphabet[(value >> shift) & 31] for shift in range(25, -1, -5))
    return f"{location_code}-{'MS3' if audience == 'ms3' else 'RES'}-{suffix}"


def load_schema(root: Path) -> dict:
    with (root / "rotation_edition.schema.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def _read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name}: /")
    return value


def load_synthetic_context(root: Path) -> dict:
    """Load explicit isolated core/catalog contexts; never fall back to a production index."""
    source = _read_json(root / SYNTHETIC_CONTEXT)
    if set(source) != {"schemaVersion", "audiences", "catalogRecords"} or source.get("schemaVersion") != 1:
        raise ValueError("synthetic-core-index.json: /")
    audiences = source.get("audiences")
    records = source.get("catalogRecords")
    if not isinstance(audiences, dict) or set(audiences) != {"ms3", "resident"} or not isinstance(records, list):
        raise ValueError("synthetic-core-index.json: /")
    projections = {}
    for audience in ("ms3", "resident"):
        projections[audience] = {
            "audience": audience,
            "revision": "sha256-" + "B" * 43,
            "resolutionRecords": copy.deepcopy(records),
        }
    return {"coreIndexes": copy.deepcopy(audiences), "catalogProjections": projections}


def _real_date(value: object) -> bool:
    if not isinstance(value, str) or re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value) is None:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _time_minutes(value: object) -> int | None:
    if not isinstance(value, str) or TIME.fullmatch(value) is None:
        return None
    return int(value[:2]) * 60 + int(value[3:])


def _catalog_semantics(config: dict, projection: object, errors: set[str]) -> None:
    if not isinstance(projection, dict) or projection.get("audience") != config["audience"] or DIGEST.fullmatch(str(projection.get("revision", ""))) is None:
        errors.add("/config")
        return
    records = projection.get("resolutionRecords")
    if not isinstance(records, list):
        errors.add("/config")
        return
    by_key = {record.get("key"): record for record in records if isinstance(record, dict) and isinstance(record.get("key"), str)}
    location_key = config["context"]["trainingLocationKey"]
    audience = config["audience"]

    def need(key: object, pointer: str, kind: str, *, choice_kinds: set[str] | None = None, purposes: set[str] | None = None) -> dict | None:
        record = by_key.get(key) if isinstance(key, str) else None
        if not isinstance(record, dict) or record.get("kind") != kind or audience not in record.get("audiences", []):
            errors.add(pointer)
            return None
        if record.get("kind") == "trainingLocation":
            if record.get("key") != location_key:
                errors.add(pointer)
                return None
        elif "locationKeys" in record and location_key not in record.get("locationKeys", []):
            errors.add(pointer)
            return None
        if choice_kinds is not None and record.get("choiceKind") not in choice_kinds:
            errors.add(pointer)
            return None
        if purposes is not None and record.get("purposeCode") not in purposes:
            errors.add(pointer)
            return None
        return record

    location = need(location_key, "/config/context/trainingLocationKey", "trainingLocation")
    if location is not None and re.fullmatch(r"[A-Z0-9]{2,8}", str(location.get("locationCode", ""))) is None:
        errors.add("/config/context/trainingLocationKey")
    curator = need(config["context"]["curatorProfileKey"], "/config/context/curatorProfileKey", "curatorProfile")
    if curator is not None:
        need(curator.get("roleKey"), "/config/context/curatorProfileKey", "choice", choice_kinds={"role"})
    need(config["phraseSetKey"], "/config/phraseSetKey", "phraseSet")
    for index, item in enumerate(config["pathItems"]):
        if "reasonKey" in item:
            need(item["reasonKey"], f"/config/pathItems/{index}/reasonKey", "choice", choice_kinds={"reason"})
    plan = config["localPlan"]
    if "arrival" in plan:
        item = plan["arrival"]
        need(item["placeKey"], "/config/localPlan/arrival/placeKey", "place")
        need(item["checkInRoleKey"], "/config/localPlan/arrival/checkInRoleKey", "choice", choice_kinds={"role"})
        if "linkKey" in item: need(item["linkKey"], "/config/localPlan/arrival/linkKey", "officialLink", purposes={"arrival-map"})
    if "schedule" in plan:
        for index, item in enumerate(plan["schedule"]["events"]):
            need(item["daySetKey"], f"/config/localPlan/schedule/events/{index}/daySetKey", "choice", choice_kinds={"daySet"})
            need(item["activityKey"], f"/config/localPlan/schedule/events/{index}/activityKey", "choice", choice_kinds={"activity"})
            if "placeKey" in item: need(item["placeKey"], f"/config/localPlan/schedule/events/{index}/placeKey", "place")
    mappings = (
        ("rounds", ("preparationKey", "roundsPreparation"), ("participationKey", "roundsParticipation"), ("followUpKey", "roundsFollowUp")),
        ("presentation", ("formatKey", "presentationFormat"), ("timingKey", "presentationTiming")),
        ("documentation", ("workflowKey", "documentationWorkflow"), ("timingKey", "documentationTiming")),
        ("feedback", ("cadenceKey", "feedbackCadence"), ("initiatorKey", "feedbackInitiator"), ("settingKey", "feedbackSetting")),
    )
    for category, *fields in mappings:
        if category in plan:
            for field, choice_kind in fields:
                need(plan[category][field], f"/config/localPlan/{category}/{field}", "choice", choice_kinds={choice_kind})
    if "presentation" in plan:
        for index, key in enumerate(plan["presentation"]["elementKeys"]):
            need(key, f"/config/localPlan/presentation/elementKeys/{index}", "choice", choice_kinds={"presentationElement"})
    if "documentation" in plan and "policyLinkKey" in plan["documentation"]:
        need(plan["documentation"]["policyLinkKey"], "/config/localPlan/documentation/policyLinkKey", "officialLink", purposes={"documentation-policy"})
    if "attendance" in plan:
        need(plan["attendance"]["absenceRoleKey"], "/config/localPlan/attendance/absenceRoleKey", "choice", choice_kinds={"role"})
        if "policyLinkKey" in plan["attendance"]: need(plan["attendance"]["policyLinkKey"], "/config/localPlan/attendance/policyLinkKey", "officialLink", purposes={"attendance-policy"})
    for index, item in enumerate(plan.get("accessItems", [])):
        need(item["itemKey"], f"/config/localPlan/accessItems/{index}/itemKey", "choice", choice_kinds={"accessItem"})
        need(item["dueKey"], f"/config/localPlan/accessItems/{index}/dueKey", "choice", choice_kinds={"duePoint"})
        if "linkKey" in item: need(item["linkKey"], f"/config/localPlan/accessItems/{index}/linkKey", "officialLink", purposes={"access-training", "parking-transit", "reviewed-operational"})
    for index, item in enumerate(plan.get("contacts", [])):
        need(item["roleKey"], f"/config/localPlan/contacts/{index}/roleKey", "choice", choice_kinds={"role"})
        if "linkKey" in item: need(item["linkKey"], f"/config/localPlan/contacts/{index}/linkKey", "officialLink", purposes={"directory"})
    for index, item in enumerate(plan.get("checklistItems", [])):
        need(item["itemKey"], f"/config/localPlan/checklistItems/{index}/itemKey", "choice", choice_kinds={"checklist"})
    for index, item in enumerate(plan.get("resources", [])):
        need(item["linkKey"], f"/config/localPlan/resources/{index}/linkKey", "officialLink")
        if "reasonKey" in item: need(item["reasonKey"], f"/config/localPlan/resources/{index}/reasonKey", "choice", choice_kinds={"reason"})


def _semantic_errors(document: dict, core_index: object, catalog_projection: object, validation_context: object) -> set[str]:
    errors: set[str] = set()
    config = document["config"]
    context = config["context"]
    audience = config["audience"]
    maximum_week = 6 if audience == "ms3" else 4
    expected_path = "ms3-six-week" if audience == "ms3" else "resident-four-week"

    if not isinstance(validation_context, dict) or set(validation_context) != {"mode", "generationDate"}:
        errors.add("/validationContext")
    else:
        mode = validation_context.get("mode")
        generation = validation_context.get("generationDate")
        if mode == "builder":
            if not _real_date(generation): errors.add("/validationContext/generationDate")
            elif _real_date(context["editionCheckedOn"]) and context["editionCheckedOn"] > generation: errors.add("/config/context/editionCheckedOn")
        elif mode == "learner":
            if generation != "": errors.add("/validationContext/generationDate")
        else:
            errors.add("/validationContext/mode")

    for field in ("rotationStart", "rotationEnd", "editionCheckedOn"):
        if not _real_date(context[field]): errors.add(f"/config/context/{field}")
    if _real_date(context["rotationStart"]) and _real_date(context["rotationEnd"]) and context["rotationEnd"] < context["rotationStart"]:
        errors.add("/config/context/rotationEnd")

    if not isinstance(core_index, dict) or core_index.get("audience") != audience:
        errors.add("/config/pathId")
    else:
        path = core_index.get("path")
        weeks = core_index.get("weeks")
        by_ref = core_index.get("byRef")
        if not isinstance(path, dict) or path.get("id") != expected_path or path.get("weekCount") != maximum_week or not isinstance(weeks, list) or len(weeks) != maximum_week or any(not isinstance(week, dict) or week.get("n") != index + 1 for index, week in enumerate(weeks)):
            errors.add("/config/pathId")
        if not isinstance(by_ref, dict):
            errors.add("/config/pathItems")
        else:
            for index, item in enumerate(config["pathItems"]):
                target = by_ref.get(item["ref"])
                if not isinstance(target, dict) or target.get("ref") != item["ref"]:
                    errors.add(f"/config/pathItems/{index}/ref")

    ids: set[str] = set()
    orders: dict[int, set[int]] = {}
    last = (0, 0)
    for index, item in enumerate(config["pathItems"]):
        if not _core_instance_id(item["instanceId"], item["ref"]): errors.add(f"/config/pathItems/{index}/instanceId")
        if item["instanceId"] in ids: errors.add(f"/config/pathItems/{index}/instanceId")
        ids.add(item["instanceId"])
        if not 1 <= item["week"] <= maximum_week: errors.add(f"/config/pathItems/{index}/week")
        current = (item["week"], item["order"])
        if current <= last: errors.add("/config/pathItems")
        last = current
        orders.setdefault(item["week"], set()).add(item["order"])
    for values in orders.values():
        if values != set(range(1, len(values) + 1)): errors.add("/config/pathItems")

    plan = config["localPlan"]
    if "arrival" in plan and _time_minutes(plan["arrival"]["time"]) is None: errors.add("/config/localPlan/arrival/time")
    schedule_ids: set[str] = set()
    tuples: set[tuple] = set()
    if "schedule" in plan:
        schedule = plan["schedule"]
        start, end = _time_minutes(schedule["dayStart"]), _time_minutes(schedule["dayEnd"])
        if start is None: errors.add("/config/localPlan/schedule/dayStart")
        if end is None or (start is not None and end <= start): errors.add("/config/localPlan/schedule/dayEnd")
        for index, item in enumerate(schedule["events"]):
            if not _local_instance_id(item["instanceId"], "schedule"): errors.add(f"/config/localPlan/schedule/events/{index}/instanceId")
            item_start = _time_minutes(item["startTime"])
            if item_start is None: errors.add(f"/config/localPlan/schedule/events/{index}/startTime")
            if "endTime" in item:
                item_end = _time_minutes(item["endTime"])
                if item_end is None or (item_start is not None and item_end <= item_start): errors.add(f"/config/localPlan/schedule/events/{index}/endTime")
            row_tuple = (item["daySetKey"], item["startTime"], item.get("endTime", ""), item["activityKey"], item.get("placeKey", ""))
            if row_tuple in tuples: errors.add(f"/config/localPlan/schedule/events/{index}")
            tuples.add(row_tuple)
            schedule_ids.add(item["instanceId"])
    if "attendance" in plan:
        for index, instance_id in enumerate(plan["attendance"]["eventInstanceIds"]):
            if not _local_instance_id(instance_id, "schedule") or instance_id not in schedule_ids: errors.add(f"/config/localPlan/attendance/eventInstanceIds/{index}")
    for category in ("schedule", "accessItems", "contacts", "checklistItems", "resources"):
        rows = plan.get(category, {}).get("events", []) if category == "schedule" else plan.get(category, [])
        for index, item in enumerate(rows):
            instance_id = item["instanceId"]
            kind = {"schedule": "schedule", "accessItems": "access", "contacts": "contact", "checklistItems": "checklist", "resources": "resource"}[category]
            if not _local_instance_id(instance_id, kind): errors.add(f"/config/localPlan/{'schedule/events' if category == 'schedule' else category}/{index}/instanceId")
            if instance_id in ids: errors.add(f"/config/localPlan/{'schedule/events' if category == 'schedule' else category}/{index}/instanceId")
            ids.add(instance_id)
    if len(plan.get("checklistItems", [])) + len(plan.get("accessItems", [])) + (1 if "arrival" in plan else 0) > 24:
        errors.add("/config/localPlan/checklistItems")

    codes = config["changeSummary"]["kindCodes"]
    indices = [CHANGE_KINDS.index(code) for code in codes]
    if indices != sorted(set(indices)): errors.add("/config/changeSummary/kindCodes")
    if config["editionNumber"] == 1:
        if codes != ["initial"] or config["changeSummary"]["changedItemCount"] != 0: errors.add("/config/changeSummary")
    elif "initial" in codes or config["changeSummary"]["changedItemCount"] < 1:
        errors.add("/config/changeSummary")

    try:
        if len(canonical_json_bytes(config)) > 12 * 1024: errors.add("/config")
        actual = canonical_digest({"format": document["format"], "schemaVersion": document["schemaVersion"], "config": config})
        if document["digest"] != actual: errors.add("/digest")
    except (TypeError, ValueError, UnicodeEncodeError):
        errors.add("/config")
    _catalog_semantics(config, catalog_projection, errors)
    return errors


def validate_document(document: dict, schema: dict, *, core_index: object = None, catalog_projection: object = None, validation_context: object = None) -> list[str]:
    """Return stable pointers for schema and semantic violations without echoing values."""
    Draft7Validator.check_schema(schema)
    schema_errors = sorted({json_pointer(error.absolute_path) for error in Draft7Validator(schema).iter_errors(document)})
    if schema_errors:
        return schema_errors
    if core_index is None or catalog_projection is None or validation_context is None:
        return ["/validationContext"]
    return sorted(_semantic_errors(document, core_index, catalog_projection, validation_context))


def validate_fixtures(root: Path) -> None:
    schema = load_schema(root)
    Draft7Validator.check_schema(schema)
    synthetic = load_synthetic_context(root)
    fixture_root = root / FIXTURES_RELATIVE
    failures = []
    for name in VALID_FIXTURES:
        try:
            document = _read_json(fixture_root / name)
            audience = document.get("config", {}).get("audience")
            errors = validate_document(
                document, schema,
                core_index=synthetic["coreIndexes"].get(audience),
                catalog_projection=synthetic["catalogProjections"].get(audience),
                validation_context={"mode": "builder", "generationDate": "2026-08-19"},
            )
        except (OSError, json.JSONDecodeError, ValueError):
            errors = ["/"]
        failures.extend((name, pointer) for pointer in errors)
    for name, expected_pointer in INVALID_FIXTURES.items():
        try:
            document = _read_json(fixture_root / name)
            audience = document.get("config", {}).get("audience")
            errors = validate_document(
                document, schema,
                core_index=synthetic["coreIndexes"].get(audience),
                catalog_projection=synthetic["catalogProjections"].get(audience),
                validation_context={"mode": "builder", "generationDate": "2026-08-19"},
            )
        except (OSError, json.JSONDecodeError, ValueError):
            errors = ["/"]
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
    print("rotation edition schema OK — 2 valid v2 fixture(s), 2 invalid v2 fixture(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
