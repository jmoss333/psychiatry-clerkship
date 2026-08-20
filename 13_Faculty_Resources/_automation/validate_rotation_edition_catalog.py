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
        if not isinstance(record["url"], str) or not 1 <= len(record["url"]) <= 2048 or parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.hostname != record["visibleHostname"] or parsed.hostname != parsed.hostname.lower():
            raise _error("CATALOG_INVALID", pointer + "/url")
    elif record["kind"] == "phraseSet":
        templates = record["templates"]
        if not isinstance(templates, dict) or set(templates) != set(TEMPLATE_TOKENS): raise _error("CATALOG_INVALID", pointer + "/templates")
        for name, tokens in TEMPLATE_TOKENS.items():
            row = templates[name]
            if not isinstance(row, dict) or set(row) != {"text", "tokens"} or row.get("tokens") != tokens:
                raise _error("CATALOG_INVALID", pointer + "/templates/" + name)
            _plain_text(row["text"], pointer + "/templates/" + name + "/text", 512)
            if len(tokens) > 16 or any(row["text"].count("{" + token + "}") != 1 for token in tokens) or re.sub(r"\{(?:" + "|".join(re.escape(token) for token in tokens) + r")\}", "", row["text"]).find("{") >= 0 or "}" in re.sub(r"\{(?:" + "|".join(re.escape(token) for token in tokens) + r")\}", "", row["text"]):
                raise _error("CATALOG_INVALID", pointer + "/templates/" + name + "/text")


def _time(value, pointer: str) -> int:
    if not isinstance(value, str) or re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", value) is None:
        raise _error("CATALOG_INVALID", pointer)
    return int(value[:2]) * 60 + int(value[3:])


def _identifier(value, pointer: str) -> None:
    if not isinstance(value, str) or not value or len(value) > 160 or re.fullmatch(r"[\x21-\x7e]+", value) is None:
        raise _error("CATALOG_INVALID", pointer)


def _scope_reference(records_by_key, key, pointer, *, audiences, locations, kinds, choice_kinds=None, purposes=None):
    target = records_by_key.get(key)
    if target is None or target.get("kind") not in kinds:
        raise _error("CATALOG_INVALID", pointer)
    if choice_kinds is not None and target.get("choiceKind") not in choice_kinds:
        raise _error("CATALOG_INVALID", pointer)
    if purposes is not None and target.get("purposeCode") not in purposes:
        raise _error("CATALOG_INVALID", pointer)
    if not set(audiences).issubset(set(target.get("audiences", []))):
        raise _error("CATALOG_INVALID", pointer)
    target_locations = target.get("locationKeys")
    if target_locations is not None and not set(locations).issubset(set(target_locations)):
        raise _error("CATALOG_INVALID", pointer)
    return target


def _exact_object(value, required, optional, pointer):
    if not isinstance(value, dict) or not set(required).issubset(value) or set(value) - set(required) - set(optional):
        raise _error("CATALOG_INVALID", pointer)


def _plan_reference(records_by_key, value, pointer, audiences, locations, kinds, choice_kinds=None, purposes=None):
    if not isinstance(value, str) or not KEY.fullmatch(value):
        raise _error("CATALOG_INVALID", pointer)
    return _scope_reference(records_by_key, value, pointer, audiences=audiences, locations=locations,
                            kinds=kinds, choice_kinds=choice_kinds, purposes=purposes)


def _validate_local_plan(plan, pointer, records_by_key, audiences, locations):
    """Validate the locked v2 local-plan subset embedded in immutable presets."""
    categories = {"arrival", "schedule", "rounds", "presentation", "documentation", "attendance", "feedback", "accessItems", "contacts", "checklistItems", "resources"}
    if not isinstance(plan, dict) or set(plan) - categories:
        raise _error("CATALOG_INVALID", pointer)
    ids = set()
    schedule_ids = set()
    if "arrival" in plan:
        value = plan["arrival"]; item_pointer = pointer + "/arrival"
        _exact_object(value, {"timingCode", "time", "placeKey", "checkInRoleKey"}, {"linkKey"}, item_pointer)
        if value["timingCode"] not in {"at", "by"}: raise _error("CATALOG_INVALID", item_pointer + "/timingCode")
        _time(value["time"], item_pointer + "/time")
        _plan_reference(records_by_key, value["placeKey"], item_pointer + "/placeKey", audiences, locations, {"place"})
        _plan_reference(records_by_key, value["checkInRoleKey"], item_pointer + "/checkInRoleKey", audiences, locations, {"choice"}, {"role"})
        if "linkKey" in value: _plan_reference(records_by_key, value["linkKey"], item_pointer + "/linkKey", audiences, locations, {"officialLink"}, purposes={"arrival-map"})
    if "schedule" in plan:
        value = plan["schedule"]; item_pointer = pointer + "/schedule"
        _exact_object(value, {"dayStart", "dayEnd", "endQualifierCode", "events"}, set(), item_pointer)
        if _time(value["dayStart"], item_pointer + "/dayStart") >= _time(value["dayEnd"], item_pointer + "/dayEnd") or value["endQualifierCode"] not in {"at", "about", "no-later-than"}:
            raise _error("CATALOG_INVALID", item_pointer)
        if not isinstance(value["events"], list) or not 1 <= len(value["events"]) <= 24: raise _error("CATALOG_INVALID", item_pointer + "/events")
        for index, event in enumerate(value["events"]):
            event_pointer = item_pointer + "/events/" + str(index)
            _exact_object(event, {"instanceId", "daySetKey", "startTime", "activityKey", "priority"}, {"endTime", "placeKey"}, event_pointer)
            _identifier(event["instanceId"], event_pointer + "/instanceId")
            if event["instanceId"] in ids: raise _error("CATALOG_INVALID", event_pointer + "/instanceId")
            ids.add(event["instanceId"]); schedule_ids.add(event["instanceId"])
            start = _time(event["startTime"], event_pointer + "/startTime")
            if "endTime" in event and _time(event["endTime"], event_pointer + "/endTime") <= start: raise _error("CATALOG_INVALID", event_pointer + "/endTime")
            if event["priority"] not in {"required", "recommended", "optional"}: raise _error("CATALOG_INVALID", event_pointer + "/priority")
            _plan_reference(records_by_key, event["daySetKey"], event_pointer + "/daySetKey", audiences, locations, {"choice"}, {"daySet"})
            _plan_reference(records_by_key, event["activityKey"], event_pointer + "/activityKey", audiences, locations, {"choice"}, {"activity"})
            if "placeKey" in event: _plan_reference(records_by_key, event["placeKey"], event_pointer + "/placeKey", audiences, locations, {"place"})
    simple = {
        "rounds": ({"preparationKey", "participationKey", "followUpKey"}, {"preparationKey": ("choice", {"roundsPreparation"}), "participationKey": ("choice", {"roundsParticipation"}), "followUpKey": ("choice", {"roundsFollowUp"})}),
        "documentation": ({"workflowKey", "timingKey"}, {"workflowKey": ("choice", {"documentationWorkflow"}), "timingKey": ("choice", {"documentationTiming"})}),
        "feedback": ({"cadenceKey", "initiatorKey", "settingKey"}, {"cadenceKey": ("choice", {"feedbackCadence"}), "initiatorKey": ("choice", {"feedbackInitiator"}), "settingKey": ("choice", {"feedbackSetting"})}),
    }
    for category, (required, fields) in simple.items():
        if category not in plan: continue
        value = plan[category]; item_pointer = pointer + "/" + category
        optional = {"policyLinkKey"} if category == "documentation" else set()
        _exact_object(value, required, optional, item_pointer)
        for field, (kind, choice_kind) in fields.items(): _plan_reference(records_by_key, value[field], item_pointer + "/" + field, audiences, locations, {kind}, choice_kind)
        if "policyLinkKey" in value: _plan_reference(records_by_key, value["policyLinkKey"], item_pointer + "/policyLinkKey", audiences, locations, {"officialLink"}, purposes={"documentation-policy"})
    if "presentation" in plan:
        value = plan["presentation"]; item_pointer = pointer + "/presentation"
        _exact_object(value, {"formatKey", "timingKey", "elementKeys"}, set(), item_pointer)
        _plan_reference(records_by_key, value["formatKey"], item_pointer + "/formatKey", audiences, locations, {"choice"}, {"presentationFormat"})
        _plan_reference(records_by_key, value["timingKey"], item_pointer + "/timingKey", audiences, locations, {"choice"}, {"presentationTiming"})
        if not isinstance(value["elementKeys"], list) or not 1 <= len(value["elementKeys"]) <= 8 or len(value["elementKeys"]) != len(set(value["elementKeys"])): raise _error("CATALOG_INVALID", item_pointer + "/elementKeys")
        for index, key in enumerate(value["elementKeys"]): _plan_reference(records_by_key, key, item_pointer + "/elementKeys/" + str(index), audiences, locations, {"choice"}, {"presentationElement"})
    if "attendance" in plan:
        value = plan["attendance"]; item_pointer = pointer + "/attendance"
        _exact_object(value, {"eventInstanceIds", "absenceRoleKey"}, {"policyLinkKey"}, item_pointer)
        if not isinstance(value["eventInstanceIds"], list) or not 1 <= len(value["eventInstanceIds"]) <= 24 or len(value["eventInstanceIds"]) != len(set(value["eventInstanceIds"])) or not set(value["eventInstanceIds"]).issubset(schedule_ids): raise _error("CATALOG_INVALID", item_pointer + "/eventInstanceIds")
        _plan_reference(records_by_key, value["absenceRoleKey"], item_pointer + "/absenceRoleKey", audiences, locations, {"choice"}, {"role"})
        if "policyLinkKey" in value: _plan_reference(records_by_key, value["policyLinkKey"], item_pointer + "/policyLinkKey", audiences, locations, {"officialLink"}, purposes={"attendance-policy"})
    arrays = {
        "accessItems": (12, {"instanceId", "itemKey", "dueKey"}, {"linkKey"}),
        "contacts": (8, {"instanceId", "roleKey"}, {"linkKey"}),
        "checklistItems": (24, {"instanceId", "itemKey", "priority"}, set()),
        "resources": (12, {"instanceId", "linkKey", "priority", "week"}, {"reasonKey"}),
    }
    for category, (maximum, required, optional) in arrays.items():
        if category not in plan: continue
        values = plan[category]; item_pointer = pointer + "/" + category
        if not isinstance(values, list) or len(values) > maximum: raise _error("CATALOG_INVALID", item_pointer)
        for index, value in enumerate(values):
            row_pointer = item_pointer + "/" + str(index); _exact_object(value, required, optional, row_pointer)
            _identifier(value["instanceId"], row_pointer + "/instanceId")
            if value["instanceId"] in ids: raise _error("CATALOG_INVALID", row_pointer + "/instanceId")
            ids.add(value["instanceId"])
            if category == "accessItems":
                _plan_reference(records_by_key, value["itemKey"], row_pointer + "/itemKey", audiences, locations, {"choice"}, {"accessItem"})
                _plan_reference(records_by_key, value["dueKey"], row_pointer + "/dueKey", audiences, locations, {"choice"}, {"duePoint"})
                if "linkKey" in value: _plan_reference(records_by_key, value["linkKey"], row_pointer + "/linkKey", audiences, locations, {"officialLink"}, purposes={"access-training", "parking-transit", "reviewed-operational"})
            elif category == "contacts":
                _plan_reference(records_by_key, value["roleKey"], row_pointer + "/roleKey", audiences, locations, {"choice"}, {"role"})
                if "linkKey" in value: _plan_reference(records_by_key, value["linkKey"], row_pointer + "/linkKey", audiences, locations, {"officialLink"}, purposes={"directory"})
            elif category == "checklistItems":
                if value["priority"] not in {"required", "recommended", "optional"}: raise _error("CATALOG_INVALID", row_pointer + "/priority")
                _plan_reference(records_by_key, value["itemKey"], row_pointer + "/itemKey", audiences, locations, {"choice"}, {"checklist"})
            else:
                if value["priority"] not in {"required", "recommended", "optional"} or not isinstance(value["week"], int) or value["week"] < 1 or value["week"] > (4 if "resident" in audiences else 6): raise _error("CATALOG_INVALID", row_pointer)
                _plan_reference(records_by_key, value["linkKey"], row_pointer + "/linkKey", audiences, locations, {"officialLink"})
                if "reasonKey" in value: _plan_reference(records_by_key, value["reasonKey"], row_pointer + "/reasonKey", audiences, locations, {"choice"}, {"reason"})


def _record_reference_keys(value):
    """Collect exact catalog references from a closed record without treating text as data."""
    found = set()
    if isinstance(value, dict):
        for field, child in value.items():
            if field == "key":
                continue
            if field.endswith("Key") and isinstance(child, str) and KEY.fullmatch(child):
                found.add(child)
            elif field.endswith("Keys") and isinstance(child, list):
                found.update(item for item in child if isinstance(item, str) and KEY.fullmatch(item))
            else:
                found.update(_record_reference_keys(child))
    elif isinstance(value, list):
        for child in value:
            found.update(_record_reference_keys(child))
    return found


def _validate_reference_cycles(records_by_key):
    edges = {key: _record_reference_keys(record) & set(records_by_key) for key, record in records_by_key.items()}
    visiting, visited = set(), set()
    def visit(key):
        if key in visiting: raise _error("CATALOG_INVALID", "/records")
        if key in visited: return
        visiting.add(key)
        for child in edges[key]: visit(child)
        visiting.remove(key); visited.add(key)
    for key in edges: visit(key)


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
                _scope_reference(records_by_key, location_key, pointer + "/locationKeys", audiences=record["audiences"], locations=[], kinds={"trainingLocation"})
        if record["kind"] == "curatorProfile":
            _scope_reference(records_by_key, record["roleKey"], pointer + "/roleKey", audiences=record["audiences"], locations=record["locationKeys"], kinds={"choice"}, choice_kinds={"role"})
        if record["kind"] == "officialLink":
            for location_key in record["locationKeys"]:
                if record["visibleHostname"] not in records_by_key[location_key].get("officialHostnames", []): raise _error("CATALOG_INVALID", pointer + "/visibleHostname")
        if record["kind"] == "localPreset":
            _scope_reference(records_by_key, record["phraseSetKey"], pointer + "/phraseSetKey", audiences=record["audiences"], locations=record["locationKeys"], kinds={"phraseSet"})
            _validate_local_plan(record["localPlan"], pointer + "/localPlan", records_by_key, record["audiences"], record["locationKeys"])
    _validate_reference_cycles(records_by_key)


def build_audience_projection(catalog: dict, governance: dict, audience: str) -> dict:
    if audience not in {"ms3", "resident"}: raise _error("CATALOG_INVALID", "/audience")
    status_by_key = {item["key"]: item["status"] for item in governance["dispositions"]}
    relevant = [copy.deepcopy(record) for record in catalog["records"] if audience in record["audiences"]]
    selection = sorted(record["key"] for record in relevant if status_by_key[record["key"]] == "reviewed")
    resolution = sorted((record for record in relevant if status_by_key[record["key"]] in {"reviewed", "deprecated"}), key=lambda record: record["key"])
    blocked = sorted(record["key"] for record in relevant if status_by_key[record["key"]] == "blocked")
    resolution_keys = {record["key"] for record in resolution}
    for record in resolution:
        if not _record_reference_keys(record).issubset(resolution_keys):
            raise _error("CATALOG_INVALID", "/projection")
    projection = {"schemaVersion": 1, "audience": audience, "revision": canonical_digest({"catalog": catalog, "governance": governance}), "projectionDigest": "", "rotationEditionV2": governance["rotationEditionV2"], "selectionKeys": selection, "resolutionRecords": resolution, "blockedKeys": blocked}
    projection["projectionDigest"] = canonical_digest({key: value for key, value in projection.items() if key != "projectionDigest"})
    if len(canonical_json_bytes(projection)) > 2 * 1024 * 1024: raise _error("CATALOG_INVALID", "/projection")
    return projection


def validate_immutable_against_ref(root: Path, git_ref: str, catalog: dict) -> None:
    if re.fullmatch(r"[0-9a-f]{40}", git_ref) is None: raise _error("CATALOG_INVALID", "/compare-ref")
    commit = subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", f"{git_ref}^{{commit}}"], capture_output=True, text=True, shell=False)
    if commit.returncode != 0:
        raise _error("CATALOG_IMMUTABLE", "/compare-ref")
    listed = subprocess.run(["git", "-C", str(root), "ls-tree", "-r", "--name-only", git_ref, "--", CATALOG_PATH.as_posix()], capture_output=True, text=True, shell=False)
    if listed.returncode != 0:
        raise _error("CATALOG_IMMUTABLE", "/compare-ref")
    if CATALOG_PATH.as_posix() not in listed.stdout.splitlines():
        return
    result = subprocess.run(["git", "-C", str(root), "show", f"{git_ref}:{CATALOG_PATH.as_posix()}"], capture_output=True, text=True, shell=False)
    if result.returncode != 0:
        raise _error("CATALOG_IMMUTABLE", "/compare-ref")
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
