#!/usr/bin/env python3
"""Behavior tests for the closed v2 rotation-edition schema and semantic gate."""

import copy
import base64
import hashlib
import json
import unittest
from pathlib import Path

import validate_rotation_edition_schema as validator


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests" / "fixtures" / "rotation-editions"
CATALOG_SCHEMA = ROOT / "13_Faculty_Resources" / "Rotation_Curation" / "rotation_edition_catalog.schema.json"
LEGACY_FIELDS = (
    "text", "title", "label", "rationale", "note", "changeNote", "name", "role", "url",
    "orientationDetails", "firstDayArrival", "typicalDay", "attendanceFeedback",
)


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def set_digest(document: dict) -> dict:
    bare = {key: value for key, value in document.items() if key != "digest"}
    encoded = json.dumps(bare, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    document["digest"] = "sha256-" + base64.urlsafe_b64encode(hashlib.sha256(encoded).digest()).decode("ascii").rstrip("=")
    return document


def pointer(path: tuple[str | int, ...]) -> str:
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in path)


def object_paths(value: object, path: tuple[str | int, ...] = ()) -> list[tuple[str | int, ...]]:
    if isinstance(value, dict):
        paths = [path]
        for key, nested in value.items():
            paths.extend(object_paths(nested, (*path, key)))
        return paths
    if isinstance(value, list):
        paths = []
        for index, nested in enumerate(value):
            paths.extend(object_paths(nested, (*path, index)))
        return paths
    return []


def at_path(value: dict, path: tuple[str | int, ...]) -> dict:
    target: object = value
    for part in path:
        target = target[part]  # type: ignore[index]
    assert isinstance(target, dict)
    return target


def full_local_plan() -> dict:
    return {
        "arrival": {"timingCode": "by", "time": "07:45", "placeKey": "place.example@v1", "checkInRoleKey": "choice.role@v1", "linkKey": "link.arrival@v1"},
        "schedule": {"dayStart": "07:45", "dayEnd": "17:00", "endQualifierCode": "about", "events": [
            {"instanceId": "local:schedule:1", "daySetKey": "choice.day-set@v1", "startTime": "08:30", "endTime": "09:30", "activityKey": "choice.activity@v1", "placeKey": "place.example@v1", "priority": "required"},
            {"instanceId": "local:schedule:2", "daySetKey": "choice.day-set@v1", "startTime": "13:00", "activityKey": "choice.activity@v1", "priority": "optional"},
        ]},
        "rounds": {"preparationKey": "choice.rounds-preparation@v1", "participationKey": "choice.rounds-participation@v1", "followUpKey": "choice.rounds-follow-up@v1"},
        "presentation": {"formatKey": "choice.presentation-format@v1", "timingKey": "choice.presentation-timing@v1", "elementKeys": ["choice.presentation-element@v1"]},
        "documentation": {"workflowKey": "choice.documentation-workflow@v1", "timingKey": "choice.documentation-timing@v1", "policyLinkKey": "link.documentation@v1"},
        "attendance": {"eventInstanceIds": ["local:schedule:1"], "absenceRoleKey": "choice.role@v1", "policyLinkKey": "link.attendance@v1"},
        "feedback": {"cadenceKey": "choice.feedback-cadence@v1", "initiatorKey": "choice.feedback-initiator@v1", "settingKey": "choice.feedback-setting@v1"},
        "accessItems": [{"instanceId": "local:access:1", "itemKey": "choice.access-item@v1", "dueKey": "choice.due-point@v1", "linkKey": "link.access@v1"}],
        "contacts": [{"instanceId": "local:contact:1", "roleKey": "choice.role@v1", "linkKey": "link.directory@v1"}],
        "checklistItems": [{"instanceId": "local:checklist:1", "itemKey": "choice.checklist@v1", "priority": "recommended"}],
        "resources": [{"instanceId": "local:resource:1", "linkKey": "link.orientation@v1", "priority": "optional", "week": 1, "reasonKey": "choice.reason@v1"}],
    }


def rich_catalog(base: dict) -> dict:
    catalog = copy.deepcopy(base)
    audience = catalog["audience"]
    location = "location.example-unit@v1"
    common = {"audiences": [audience], "verifiedOn": "2026-08-19", "locationKeys": [location]}
    records = catalog["resolutionRecords"]
    choice_kinds = (
        "role", "daySet", "activity", "roundsPreparation", "roundsParticipation", "roundsFollowUp",
        "presentationFormat", "presentationTiming", "presentationElement", "documentationWorkflow",
        "documentationTiming", "feedbackCadence", "feedbackInitiator", "feedbackSetting", "accessItem",
        "duePoint", "checklist", "reason",
    )
    for kind in choice_kinds:
        key = "choice." + "".join(("-" + char.lower()) if char.isupper() else char for char in kind) + "@v1"
        records.append({"key": key, "kind": "choice", "choiceKind": kind, "label": "Example", "fragment": "example", **common})
    for name, purpose in (
        ("arrival", "arrival-map"), ("documentation", "documentation-policy"),
        ("attendance", "attendance-policy"), ("access", "access-training"),
        ("directory", "directory"), ("orientation", "orientation"),
    ):
        records.append({"key": f"link.{name}@v1", "kind": "officialLink", "title": "Example", "url": f"https://example.edu/{name}", "visibleHostname": "example.edu", "purposeCode": purpose, **common})
    records.append({"key": "place.example@v1", "kind": "place", "displayName": "Example place", **common})
    return catalog


class RotationEditionSchemaGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = validator.load_schema(ROOT)
        load_context = getattr(validator, "load_synthetic_context", None)
        if load_context:
            self.synthetic = load_context(ROOT)
        else:
            raw = load_fixture("synthetic-core-index.json")
            self.synthetic = {
                "coreIndexes": raw["audiences"],
                "catalogProjections": {
                    audience: {"audience": audience, "revision": "sha256-" + "B" * 43, "resolutionRecords": copy.deepcopy(raw["catalogRecords"])}
                    for audience in ("ms3", "resident")
                },
            }

    def validate(self, document: dict, *, audience: str | None = None, mode: str = "builder", generation_date: str = "2026-08-19", catalog: dict | None = None) -> list[str]:
        selected = audience or document.get("config", {}).get("audience", "ms3")
        try:
            return validator.validate_document(
                document,
                self.schema,
                core_index=self.synthetic["coreIndexes"].get(selected),
                catalog_projection=catalog or self.synthetic["catalogProjections"].get(selected),
                validation_context={"mode": mode, "generationDate": generation_date if mode == "builder" else ""},
            )
        except TypeError:
            return validator.validate_document(document, self.schema)

    def test_exact_synthetic_ms3_and_resident_fixtures_pass(self) -> None:
        for name in ("valid-ms3.json", "valid-resident.json"):
            with self.subTest(fixture=name):
                self.assertEqual(self.validate(load_fixture(name)), [])

    def test_public_local_plan_schema_is_byte_equal_to_catalog_preset_schema(self) -> None:
        catalog_schema = json.loads(CATALOG_SCHEMA.read_text(encoding="utf-8"))
        public = json.dumps(self.schema["definitions"]["localPlanV2"], sort_keys=True, separators=(",", ":"))
        preset = json.dumps(catalog_schema["definitions"]["localPlanV2"], sort_keys=True, separators=(",", ":"))
        self.assertEqual(public, preset)

    def test_every_object_boundary_is_closed_and_legacy_public_prose_names_are_rejected(self) -> None:
        document = load_fixture("valid-ms3.json")
        document["config"]["localPlan"] = full_local_plan()
        for path in object_paths(document):
            for legacy in LEGACY_FIELDS:
                with self.subTest(path=pointer(path), legacy=legacy):
                    mutated = copy.deepcopy(document)
                    at_path(mutated, path)[legacy] = "synthetic"
                    self.assertIn(pointer(path), self.validate(set_digest(mutated), catalog=rich_catalog(self.synthetic["catalogProjections"]["ms3"])))

    def test_schema_closes_collection_caps_empty_repeatables_and_enums(self) -> None:
        base = load_fixture("valid-ms3.json")
        base["config"]["localPlan"] = full_local_plan()
        cases = []
        for category, maximum in (("accessItems", 12), ("contacts", 8), ("checklistItems", 24), ("resources", 12)):
            cases.append((f"empty {category}", lambda value, key=category: value["config"]["localPlan"].__setitem__(key, [])))
            cases.append((f"over {category}", lambda value, key=category, cap=maximum: value["config"]["localPlan"].__setitem__(key, [copy.deepcopy(value["config"]["localPlan"][key][0]) for _ in range(cap + 1)])))
        cases.extend((
            ("empty path", lambda value: value["config"].__setitem__("pathItems", [])),
            ("too many path items", lambda value: value["config"].__setitem__("pathItems", [copy.deepcopy(value["config"]["pathItems"][0]) for _ in range(97)])),
            ("empty schedule", lambda value: value["config"]["localPlan"]["schedule"].__setitem__("events", [])),
            ("too many schedule events", lambda value: value["config"]["localPlan"]["schedule"].__setitem__("events", [copy.deepcopy(value["config"]["localPlan"]["schedule"]["events"][0]) for _ in range(25)])),
            ("empty presentation elements", lambda value: value["config"]["localPlan"]["presentation"].__setitem__("elementKeys", [])),
            ("too many presentation elements", lambda value: value["config"]["localPlan"]["presentation"].__setitem__("elementKeys", [f"choice.e{i}@v1" for i in range(9)])),
            ("bad priority", lambda value: value["config"]["pathItems"][0].__setitem__("priority", "urgent")),
            ("bad arrival timing", lambda value: value["config"]["localPlan"]["arrival"].__setitem__("timingCode", "around")),
            ("bad day qualifier", lambda value: value["config"]["localPlan"]["schedule"].__setitem__("endQualifierCode", "later")),
            ("bad summary kind", lambda value: value["config"]["changeSummary"].__setitem__("kindCodes", ["authored-note"])),
            ("edition over signed-int cap", lambda value: value["config"].__setitem__("editionNumber", 2147483648)),
        ))
        for label, mutate in cases:
            with self.subTest(case=label):
                candidate = copy.deepcopy(base)
                mutate(candidate)
                self.assertTrue(self.validate(set_digest(candidate), catalog=rich_catalog(self.synthetic["catalogProjections"]["ms3"])), label)

    def test_semantics_reject_invalid_dates_times_paths_ids_tuples_orders_and_references(self) -> None:
        base = load_fixture("valid-ms3.json")
        base["config"]["localPlan"] = full_local_plan()
        catalog = rich_catalog(self.synthetic["catalogProjections"]["ms3"])
        cases = (
            ("impossible date", lambda value: value["config"]["context"].__setitem__("rotationStart", "2026-02-30")),
            ("reversed dates", lambda value: value["config"]["context"].__setitem__("rotationEnd", "2026-08-31")),
            ("future checked date", lambda value: value["config"]["context"].__setitem__("editionCheckedOn", "2026-08-20")),
            ("invalid time", lambda value: value["config"]["localPlan"]["arrival"].__setitem__("time", "24:00")),
            ("reversed day", lambda value: value["config"]["localPlan"]["schedule"].__setitem__("dayEnd", "07:00")),
            ("reversed event", lambda value: value["config"]["localPlan"]["schedule"]["events"][0].__setitem__("endTime", "08:00")),
            ("wrong path", lambda value: value["config"].__setitem__("pathId", "resident-four-week")),
            ("week seven", lambda value: value["config"]["pathItems"][0].__setitem__("week", 7)),
            ("local week seven", lambda value: value["config"]["localPlan"]["resources"][0].__setitem__("week", 7)),
            ("duplicate id union", lambda value: value["config"]["localPlan"]["accessItems"][0].__setitem__("instanceId", "core:library/example:1")),
            ("duplicate schedule tuple", lambda value: value["config"]["localPlan"]["schedule"]["events"].append({**copy.deepcopy(value["config"]["localPlan"]["schedule"]["events"][0]), "instanceId": "local:schedule:3"})),
            ("missing attendance event", lambda value: value["config"]["localPlan"]["attendance"].__setitem__("eventInstanceIds", ["local:schedule:404"])),
            ("noncontiguous order", lambda value: value["config"]["pathItems"][0].__setitem__("order", 2)),
            ("unknown core ref", lambda value: value["config"]["pathItems"][0].__setitem__("ref", "library/missing")),
            ("wrong catalog kind", lambda value: value["config"]["context"].__setitem__("curatorProfileKey", "location.example-unit@v1")),
        )
        for label, mutate in cases:
            with self.subTest(case=label):
                candidate = copy.deepcopy(base)
                mutate(candidate)
                self.assertTrue(self.validate(set_digest(candidate), catalog=catalog), label)

    def test_learner_mode_accepts_a_real_future_checked_date_but_builder_does_not(self) -> None:
        candidate = load_fixture("valid-ms3.json")
        candidate["config"]["context"]["editionCheckedOn"] = "2026-08-20"
        set_digest(candidate)
        self.assertTrue(self.validate(candidate, mode="builder"))
        self.assertEqual(self.validate(candidate, mode="learner"), [])

    def test_current_catalog_revision_drift_does_not_rewrite_or_reject_identity(self) -> None:
        candidate = load_fixture("valid-ms3.json")
        catalog = copy.deepcopy(self.synthetic["catalogProjections"]["ms3"])
        catalog["revision"] = "sha256-" + "C" * 43
        before = copy.deepcopy(candidate)
        self.assertEqual(self.validate(candidate, catalog=catalog), [])
        self.assertEqual(candidate, before)

    def test_resident_uses_only_its_explicit_core_and_catalog_context(self) -> None:
        resident = load_fixture("valid-resident.json")
        wrong_core = copy.deepcopy(self.synthetic["coreIndexes"]["ms3"])
        try:
            errors = validator.validate_document(
                resident, self.schema, core_index=wrong_core,
                catalog_projection=self.synthetic["catalogProjections"]["resident"],
                validation_context={"mode": "builder", "generationDate": "2026-08-19"},
            )
        except TypeError:
            errors = validator.validate_document(resident, self.schema)
        self.assertIn("/config/pathId", errors)

    def test_canonical_config_limit_and_digest_parity_are_enforced(self) -> None:
        candidate = load_fixture("valid-ms3.json")
        core = copy.deepcopy(self.synthetic["coreIndexes"]["ms3"])
        candidate["config"]["pathItems"] = []
        for index in range(96):
            ref = "library/" + str(index).zfill(3) + "x" * 140
            candidate["config"]["pathItems"].append({"instanceId": f"core:{index}:" + "y" * 140, "ref": ref, "week": (index // 16) + 1, "order": (index % 16) + 1, "priority": "required"})
            core["byRef"][ref] = {"ref": ref, "title": "Synthetic"}
        set_digest(candidate)
        try:
            errors = validator.validate_document(candidate, self.schema, core_index=core, catalog_projection=self.synthetic["catalogProjections"]["ms3"], validation_context={"mode": "builder", "generationDate": "2026-08-19"})
        except TypeError:
            errors = validator.validate_document(candidate, self.schema)
        self.assertIn("/config", errors)

        mismatch = load_fixture("valid-ms3.json")
        mismatch["config"]["editionNumber"] = 2
        self.assertIn("/digest", self.validate(mismatch))

    def test_cross_runtime_fingerprint_vector(self) -> None:
        self.assertEqual(
            getattr(validator, "edition_fingerprint", lambda *_: "")(
                "EXU", "ms3",
                "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            ),
            "EXU-MS3-ZBVX4D",
        )

    def test_invalid_fixture_paths_are_stable_and_values_are_not_echoed(self) -> None:
        cases = (
            ("invalid-extra-property.json", "/config/context", "legacy prose"),
            ("invalid-unsafe-url.json", "/config/localPlan/resources/0/linkKey", "http://unsafe.example/resource"),
        )
        for name, expected, secret in cases:
            with self.subTest(fixture=name):
                errors = self.validate(load_fixture(name))
                self.assertIn(expected, errors)
                self.assertNotIn(secret, "\n".join(errors))


if __name__ == "__main__":
    unittest.main()
