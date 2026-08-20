#!/usr/bin/env python3
"""Behavioral contracts for the static rotation-edition catalog gate.

Each test names a production break it catches: accepting a mismatched content
digest, leaking a pending record, exposing rejected input, or rewriting a
historical exact key would each make at least one assertion fail.
"""
import copy
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from jsonschema import Draft7Validator

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from validate_rotation_edition_catalog import (  # noqa: E402
    build_audience_projection,
    canonical_digest,
    canonical_json_bytes,
    validate_catalog,
    validate_immutable_against_ref,
)

FIXTURES = ROOT / "tests" / "fixtures" / "rotation-edition-catalog"
TODAY = date(2026, 8, 20)


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def digested_catalog():
    catalog = fixture("valid-catalog.json")
    for record in catalog["records"]:
        bare = copy.deepcopy(record)
        bare.pop("contentDigest")
        record["contentDigest"] = canonical_digest(bare)
    return catalog


def _template_set():
    token_sets = {
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
    return {name: {"text": " ".join("{" + token + "}" for token in tokens), "tokens": tokens}
            for name, tokens in token_sets.items()}


def _append_reviewed(catalog, governance, record):
    bare = copy.deepcopy(record)
    bare.pop("contentDigest", None)
    record = {**bare, "contentDigest": canonical_digest(bare)}
    catalog["records"].append(record)
    catalog["records"].sort(key=lambda value: value["key"])
    governance["dispositions"].append({"key": record["key"], "status": "reviewed",
                                        "changedOn": "2026-08-19", "reviewRef": "SYNTHETIC-TEST-REVIEW"})
    governance["dispositions"].sort(key=lambda value: value["key"])
    return record


def _choice_key(kind):
    return "choice." + re.sub(r"([A-Z])", lambda match: "-" + match.group(1).lower(), kind) + "@v1"


def _preset_catalog(audience="ms3"):
    """Build a synthetic catalog around the exact local plan shared with browser tests."""
    catalog, governance = digested_catalog(), fixture("valid-governance.json")
    next(item for item in governance["dispositions"] if item["key"] == "link.orientation@v1")["status"] = "reviewed"
    for record in catalog["records"]:
        record["audiences"] = [audience]
        _refresh_record(record)
    _append_reviewed(catalog, governance, {
        "key": "place.workroom@v1", "kind": "place", "displayName": "Synthetic workroom",
        "locationKeys": ["location.example-unit@v1"], "audiences": [audience],
        "verifiedOn": "2026-08-19",
    })
    for choice_kind in ("role", "daySet", "activity", "accessItem", "duePoint", "checklist"):
        _append_reviewed(catalog, governance, {
            "key": _choice_key(choice_kind), "kind": "choice", "choiceKind": choice_kind,
            "label": "Synthetic " + choice_kind, "fragment": "synthetic " + choice_kind,
            "locationKeys": ["location.example-unit@v1"], "audiences": [audience],
            "verifiedOn": "2026-08-19",
        })
    _append_reviewed(catalog, governance, {
        "key": "phrase.example@v1", "kind": "phraseSet", "displayName": "Example phrases",
        "templates": _template_set(), "locationKeys": ["location.example-unit@v1"],
        "audiences": [audience], "verifiedOn": "2026-08-19",
    })
    _append_reviewed(catalog, governance, {
        "key": "preset.example@v1", "kind": "localPreset", "displayName": "Example preset",
        "localPlan": fixture("valid-local-preset-plans.json")[audience],
        "locationKeys": ["location.example-unit@v1"], "phraseSetKey": "phrase.example@v1",
        "audiences": [audience], "verifiedOn": "2026-08-19",
    })
    return catalog, governance


def _preset_record(catalog):
    return next(record for record in catalog["records"] if record["key"] == "preset.example@v1")


def _refresh_record(record):
    record["contentDigest"] = canonical_digest({key: value for key, value in record.items() if key != "contentDigest"})


class RotationEditionCatalogTest(unittest.TestCase):
    def setUp(self):
        self.catalog = digested_catalog()
        self.governance = fixture("valid-governance.json")

    def test_canonical_digest_is_compact_sorted_and_base64url(self):
        self.assertEqual(canonical_json_bytes({"b": [2, 1], "a": "x"}), b'{"a":"x","b":[2,1]}')
        self.assertEqual(canonical_digest({"a": "x", "b": [2, 1]}),
                         "sha256-G7FBsL6vTr9CKA0ibRkpaqm83ghSVBk5P6jHBualcUg")

    def test_validation_requires_exact_digest_disposition_scope_and_safe_urls(self):
        validate_catalog(self.catalog, self.governance, today=TODAY)
        cases = []
        wrong_digest = copy.deepcopy(self.catalog)
        wrong_digest["records"][0]["contentDigest"] = "sha256-" + "A" * 43
        cases.append((wrong_digest, self.governance, "/records/0/contentDigest"))
        missing_disposition = copy.deepcopy(self.governance)
        missing_disposition["dispositions"].pop()
        cases.append((self.catalog, missing_disposition, "/dispositions"))
        unsafe_url = copy.deepcopy(self.catalog)
        unsafe_url["records"][1]["url"] = "https://user@example.edu/orientation?token=x"
        unsafe_url["records"][1]["contentDigest"] = canonical_digest({k: v for k, v in unsafe_url["records"][1].items() if k != "contentDigest"})
        cases.append((unsafe_url, self.governance, "/records/1/url"))
        for catalog, governance, pointer in cases:
            with self.subTest(pointer=pointer):
                with self.assertRaisesRegex(ValueError, pointer) as caught:
                    validate_catalog(catalog, governance, today=TODAY)
                self.assertNotIn("token=x", str(caught.exception))

    def test_local_presets_reject_arbitrary_categories_free_text_and_more_than_eight_contacts(self):
        catalog, governance = copy.deepcopy(self.catalog), copy.deepcopy(self.governance)
        _append_reviewed(catalog, governance, {
            "key": "phrase.example@v1", "kind": "phraseSet", "displayName": "Example phrases",
            "templates": _template_set(), "audiences": ["ms3"], "verifiedOn": "2026-08-19",
        })
        _append_reviewed(catalog, governance, {
            "key": "preset.example@v1", "kind": "localPreset", "displayName": "Example preset",
            "localPlan": {"arrival": {"timingCode": "by", "time": "08:00", "placeKey": "place.example-workroom@v1", "checkInRoleKey": "choice.arrival@v1"}},
            "locationKeys": ["location.example-unit@v1"], "phraseSetKey": "phrase.example@v1",
            "audiences": ["ms3"], "verifiedOn": "2026-08-19",
        })
        validate_catalog(catalog, governance, today=TODAY)
        cases = []
        free_text = copy.deepcopy(catalog)
        preset = next(record for record in free_text["records"] if record["key"] == "preset.example@v1")
        preset["localPlan"]["freeText"] = "must never become public copy"
        preset["contentDigest"] = canonical_digest({key: value for key, value in preset.items() if key != "contentDigest"})
        cases.append((free_text, "/localPlan"))
        too_many_contacts = copy.deepcopy(catalog)
        preset = next(record for record in too_many_contacts["records"] if record["key"] == "preset.example@v1")
        preset["localPlan"]["contacts"] = [
            {"instanceId": "local:contact:" + str(index), "roleKey": "choice.arrival@v1"}
            for index in range(1, 10)
        ]
        preset["contentDigest"] = canonical_digest({key: value for key, value in preset.items() if key != "contentDigest"})
        cases.append((too_many_contacts, "/localPlan/contacts"))
        for candidate, pointer in cases:
            with self.subTest(pointer=pointer):
                with self.assertRaisesRegex(ValueError, pointer):
                    validate_catalog(candidate, governance, today=TODAY)

    def test_local_preset_repeatables_must_be_omitted_when_empty_with_exact_private_pointers(self):
        catalog, governance = _preset_catalog()
        validate_catalog(catalog, governance, today=TODAY)
        for category in ("accessItems", "contacts", "checklistItems", "resources"):
            with self.subTest(category=category):
                candidate = copy.deepcopy(catalog)
                preset = _preset_record(candidate)
                preset["localPlan"][category] = []
                _refresh_record(preset)
                expected = f"CATALOG_INVALID /records/{candidate['records'].index(preset)}/localPlan/{category}"
                with self.assertRaises(ValueError) as caught:
                    validate_catalog(candidate, governance, today=TODAY)
                self.assertEqual(str(caught.exception), expected)
                self.assertNotIn("preset.example@v1", str(caught.exception))

    def test_all_shared_python_valid_preset_plans_validate_and_project_for_the_browser(self):
        schema = json.loads((ROOT / "13_Faculty_Resources" / "Rotation_Curation" / "rotation_edition_catalog.schema.json").read_text(encoding="utf-8"))
        for audience in ("ms3", "resident"):
            with self.subTest(audience=audience):
                catalog, governance = _preset_catalog(audience)
                self.assertEqual(list(Draft7Validator(schema).iter_errors(catalog)), [])
                validate_catalog(catalog, governance, today=TODAY)
                projection = build_audience_projection(catalog, governance, audience)
                self.assertIn("preset.example@v1", projection["selectionKeys"])
                self.assertEqual(projection["audience"], audience)

    def test_local_preset_duplicate_schedule_tuple_and_resolved_checklist_total_match_browser(self):
        catalog, governance = _preset_catalog()
        validate_catalog(catalog, governance, today=TODAY)

        duplicate = copy.deepcopy(catalog)
        preset = _preset_record(duplicate)
        second_id = preset["localPlan"]["schedule"]["events"][1]["instanceId"]
        preset["localPlan"]["schedule"]["events"][1] = copy.deepcopy(
            preset["localPlan"]["schedule"]["events"][0]
        )
        preset["localPlan"]["schedule"]["events"][1]["instanceId"] = second_id
        _refresh_record(preset)
        pointer = f"/records/{duplicate['records'].index(preset)}/localPlan/schedule/events/1"
        with self.assertRaises(ValueError) as caught:
            validate_catalog(duplicate, governance, today=TODAY)
        self.assertEqual(str(caught.exception), "CATALOG_INVALID " + pointer)

        over_total = copy.deepcopy(catalog)
        preset = _preset_record(over_total)
        access = preset["localPlan"]["accessItems"][0]
        checklist = preset["localPlan"]["checklistItems"][0]
        preset["localPlan"]["accessItems"] = [
            {**copy.deepcopy(access), "instanceId": f"local:access:{index}"}
            for index in range(1, 13)
        ]
        preset["localPlan"]["checklistItems"] = [
            {**copy.deepcopy(checklist), "instanceId": f"local:checklist:{index}"}
            for index in range(1, 13)
        ]
        _refresh_record(preset)
        pointer = f"/records/{over_total['records'].index(preset)}/localPlan/checklistItems"
        with self.assertRaises(ValueError) as caught:
            validate_catalog(over_total, governance, today=TODAY)
        self.assertEqual(str(caught.exception), "CATALOG_INVALID " + pointer)

    def test_catalog_visible_text_rejects_embedded_raw_keys_without_echoing_them(self):
        catalog, governance = _preset_catalog()
        validate_catalog(catalog, governance, today=TODAY)
        raw_key = "choice.raw-visible@v9"
        cases = [
            ("location display", "location.example-unit@v1", lambda record: record.__setitem__("displayName", "Unit " + raw_key + " name"), "/displayName"),
            ("curator display", "profile.example-attending@v1", lambda record: record.__setitem__("displayName", "Curator " + raw_key + " name"), "/displayName"),
            ("place display", "place.example-workroom@v1", lambda record: record.__setitem__("displayName", "Place " + raw_key + " name"), "/displayName"),
            ("link title", "link.orientation@v1", lambda record: record.__setitem__("title", "Title " + raw_key + " text"), "/title"),
            ("choice label", "choice.arrival@v1", lambda record: record.__setitem__("label", "Label " + raw_key + " text"), "/label"),
            ("choice fragment", "choice.arrival@v1", lambda record: record.__setitem__("fragment", "Fragment " + raw_key + " text"), "/fragment"),
            ("phrase display", "phrase.example@v1", lambda record: record.__setitem__("displayName", "Phrases " + raw_key + " name"), "/displayName"),
            ("preset display", "preset.example@v1", lambda record: record.__setitem__("displayName", "Preset " + raw_key + " name"), "/displayName"),
            ("template output", "phrase.example@v1", lambda record: record["templates"]["arrival"].__setitem__("text", record["templates"]["arrival"]["text"] + " " + raw_key), "/templates/arrival/text"),
        ]
        for name, key, mutate, suffix in cases:
            with self.subTest(source=name):
                candidate = copy.deepcopy(catalog)
                record = next(item for item in candidate["records"] if item["key"] == key)
                mutate(record)
                _refresh_record(record)
                pointer = f"/records/{candidate['records'].index(record)}{suffix}"
                with self.assertRaises(ValueError) as caught:
                    validate_catalog(candidate, governance, today=TODAY)
                self.assertEqual(str(caught.exception), "CATALOG_INVALID " + pointer)
                self.assertNotIn(raw_key, str(caught.exception))

    def test_cross_record_dependencies_must_share_audience_and_location_scope_and_project_together(self):
        catalog, governance = copy.deepcopy(self.catalog), copy.deepcopy(self.governance)
        _append_reviewed(catalog, governance, {
            "key": "choice.resident-role@v1", "kind": "choice", "choiceKind": "role",
            "label": "Resident role", "fragment": "the resident role", "audiences": ["resident"], "verifiedOn": "2026-08-19",
        })
        _append_reviewed(catalog, governance, {
            "key": "profile.cross-scope@v1", "kind": "curatorProfile", "displayName": "Example Attending",
            "roleKey": "choice.resident-role@v1", "locationKeys": ["location.example-unit@v1"],
            "audiences": ["ms3"], "verifiedOn": "2026-08-19",
        })
        with self.assertRaisesRegex(ValueError, "/roleKey"):
            validate_catalog(catalog, governance, today=TODAY)
        profile = next(record for record in catalog["records"] if record["key"] == "profile.cross-scope@v1")
        profile["roleKey"] = "choice.arrival@v1"
        profile["contentDigest"] = canonical_digest({key: value for key, value in profile.items() if key != "contentDigest"})
        _append_reviewed(catalog, governance, {
            "key": "phrase.resident@v1", "kind": "phraseSet", "displayName": "Resident phrases",
            "templates": _template_set(), "audiences": ["resident"], "verifiedOn": "2026-08-19",
        })
        _append_reviewed(catalog, governance, {
            "key": "preset.cross-scope@v1", "kind": "localPreset", "displayName": "Example preset",
            "localPlan": {}, "locationKeys": ["location.example-unit@v1"], "phraseSetKey": "phrase.resident@v1",
            "audiences": ["ms3"], "verifiedOn": "2026-08-19",
        })
        with self.assertRaisesRegex(ValueError, "/phraseSetKey"):
            validate_catalog(catalog, governance, today=TODAY)

    def test_urls_and_phrase_templates_enforce_locked_bounds_and_exact_placeholder_sets(self):
        long_url = copy.deepcopy(self.catalog)
        link = next(record for record in long_url["records"] if record["kind"] == "officialLink")
        link["url"] = "https://example.edu/" + "a" * 3000
        link["contentDigest"] = canonical_digest({key: value for key, value in link.items() if key != "contentDigest"})
        with self.assertRaisesRegex(ValueError, "/url"):
            validate_catalog(long_url, self.governance, today=TODAY)
        catalog, governance = copy.deepcopy(self.catalog), copy.deepcopy(self.governance)
        _append_reviewed(catalog, governance, {
            "key": "phrase.placeholder@v1", "kind": "phraseSet", "displayName": "Example phrases",
            "templates": _template_set(), "audiences": ["ms3"], "verifiedOn": "2026-08-19",
        })
        phrase = next(record for record in catalog["records"] if record["key"] == "phrase.placeholder@v1")
        phrase["templates"]["arrival"]["text"] = "Plain text with no declared substitutions"
        phrase["contentDigest"] = canonical_digest({key: value for key, value in phrase.items() if key != "contentDigest"})
        with self.assertRaisesRegex(ValueError, "/templates/arrival/text"):
            validate_catalog(catalog, governance, today=TODAY)

    def test_draft_schema_closes_local_preset_variants_and_caps_contacts_at_eight(self):
        schema = json.loads((ROOT / "13_Faculty_Resources" / "Rotation_Curation" / "rotation_edition_catalog.schema.json").read_text(encoding="utf-8"))
        preset = {
            "key": "preset.schema@v1", "kind": "localPreset", "contentDigest": "sha256-" + "A" * 43,
            "displayName": "Example preset", "locationKeys": ["location.example-unit@v1"],
            "phraseSetKey": "phrase.example@v1", "audiences": ["ms3"], "verifiedOn": "2026-08-19",
            "localPlan": {"freeText": "not a public field"},
        }
        errors = list(Draft7Validator(schema).iter_errors({"schemaVersion": 1, "records": [preset]}))
        self.assertTrue(errors, "closed local-plan schema must reject arbitrary categories")
        preset["localPlan"] = {"contacts": [
            {"instanceId": "local:contact:" + str(index), "roleKey": "choice.arrival@v1"}
            for index in range(1, 10)
        ]}
        errors = list(Draft7Validator(schema).iter_errors({"schemaVersion": 1, "records": [preset]}))
        self.assertTrue(errors, "contacts cap must be eight")
        for category in ("accessItems", "contacts", "checklistItems", "resources"):
            with self.subTest(category=category):
                preset["localPlan"] = {category: []}
                errors = list(Draft7Validator(schema).iter_errors({"schemaVersion": 1, "records": [preset]}))
                self.assertTrue(errors, f"present empty {category} must be rejected")

    def test_projection_is_closed_stable_and_applies_lifecycle_rules(self):
        validate_catalog(self.catalog, self.governance, today=TODAY)
        projection = build_audience_projection(self.catalog, self.governance, "ms3")
        self.assertEqual(set(projection), {"schemaVersion", "audience", "revision", "projectionDigest",
                                           "rotationEditionV2", "selectionKeys", "resolutionRecords", "blockedKeys"})
        self.assertEqual(projection["selectionKeys"], ["choice.arrival@v1", "location.example-unit@v1"])
        self.assertEqual([record["key"] for record in projection["resolutionRecords"]],
                         ["choice.arrival@v1", "location.example-unit@v1", "profile.example-attending@v1"])
        self.assertEqual(projection["blockedKeys"], ["link.orientation@v1"])
        self.assertNotIn("reviewRef", canonical_json_bytes(projection).decode("utf-8"))
        self.assertEqual(projection["projectionDigest"], canonical_digest({
            key: value for key, value in projection.items() if key != "projectionDigest"
        }))
        self.assertEqual(projection, build_audience_projection(self.catalog, self.governance, "ms3"))

    def test_immutable_history_rejects_edits_or_removal_but_allows_new_version_and_disposition_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "13_Faculty_Resources" / "Rotation_Curation"
            path.mkdir(parents=True)
            prior = copy.deepcopy(self.catalog)
            (path / "rotation_edition_catalog.json").write_text(json.dumps(prior), encoding="utf-8")
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.email=test@example.edu", "-c", "user.name=Test", "commit", "-qm", "prior"], check=True)
            ref = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
            changed = copy.deepcopy(self.catalog)
            changed["records"][0]["label"] = "Changed label"
            changed["records"][0]["contentDigest"] = canonical_digest({k: v for k, v in changed["records"][0].items() if k != "contentDigest"})
            with self.assertRaisesRegex(ValueError, "/records"):
                validate_immutable_against_ref(root, ref, changed)
            removed = copy.deepcopy(self.catalog)
            removed["records"].pop(0)
            with self.assertRaisesRegex(ValueError, "/records"):
                validate_immutable_against_ref(root, ref, removed)
            added = copy.deepcopy(self.catalog)
            new = copy.deepcopy(added["records"][0]); new["key"] = "choice.arrival@v2"
            new["contentDigest"] = canonical_digest({k: v for k, v in new.items() if k != "contentDigest"})
            added["records"].append(new); added["records"].sort(key=lambda item: item["key"])
            validate_immutable_against_ref(root, ref, added)
            with self.assertRaisesRegex(ValueError, "/compare-ref"):
                validate_immutable_against_ref(root, "f" * 40, added)


if __name__ == "__main__":
    unittest.main()
