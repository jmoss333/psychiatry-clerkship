#!/usr/bin/env python3
"""Behavior tests for the offline Draft-07 rotation-edition schema gate."""

import copy
import json
import unittest
from pathlib import Path

from validate_rotation_edition_schema import load_schema, validate_document


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests" / "fixtures" / "rotation-editions"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def pointer(path: tuple[str | int, ...]) -> str:
    return "/" + "/".join(
        str(part).replace("~", "~0").replace("/", "~1") for part in path
    )


def object_paths(value: object, path: tuple[str | int, ...] = ()) -> list[tuple[str | int, ...]]:
    """Return every object instance boundary in a fixture document."""
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


class RotationEditionSchemaGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = load_schema(ROOT)

    def test_synthetic_ms3_and_resident_fixtures_pass(self) -> None:
        for name in ("valid-ms3.json", "valid-resident.json"):
            with self.subTest(fixture=name):
                self.assertEqual(validate_document(load_fixture(name), self.schema), [])

    def test_ms3_accepts_only_its_path_and_weeks_one_through_six(self) -> None:
        document = load_fixture("valid-ms3.json")
        document["config"]["pathId"] = "resident-four-week"
        self.assertIn("/config", validate_document(document, self.schema))

        document = load_fixture("valid-ms3.json")
        document["config"]["pathItems"][0]["week"] = 7
        self.assertIn("/config", validate_document(document, self.schema))

        document = load_fixture("valid-ms3.json")
        document["config"]["localOrientation"]["resources"][0]["week"] = 7
        self.assertIn("/config", validate_document(document, self.schema))

    def test_resident_accepts_only_its_path_and_weeks_one_through_four(self) -> None:
        document = load_fixture("valid-resident.json")
        document["config"]["pathId"] = "ms3-six-week"
        self.assertIn("/config", validate_document(document, self.schema))

        document = load_fixture("valid-resident.json")
        document["config"]["pathItems"][0]["week"] = 5
        self.assertIn("/config", validate_document(document, self.schema))

        document = load_fixture("valid-resident.json")
        document["config"]["localOrientation"]["resources"][0]["week"] = 5
        self.assertIn("/config", validate_document(document, self.schema))

    def test_extra_property_is_rejected_at_every_current_object_boundary(self) -> None:
        for name in ("valid-ms3.json", "valid-resident.json"):
            original = load_fixture(name)
            for path in object_paths(original):
                with self.subTest(fixture=name, path=pointer(path)):
                    mutated = copy.deepcopy(original)
                    at_path(mutated, path)["unexpectedProperty"] = "synthetic"
                    errors = validate_document(mutated, self.schema)
                    self.assertIn(pointer(path), errors)
                    self.assertNotIn("synthetic", "\n".join(errors))

    def test_invalid_fixtures_report_only_the_expected_pointer(self) -> None:
        cases = (
            ("invalid-extra-property.json", "/config/card", "unexpectedNested"),
            (
                "invalid-unsafe-url.json",
                "/config/localOrientation/resources/0/url",
                "http://unsafe.example/resource",
            ),
        )
        for name, expected_pointer, rejected_value in cases:
            with self.subTest(fixture=name):
                errors = validate_document(load_fixture(name), self.schema)
                self.assertIn(expected_pointer, errors)
                self.assertNotIn(rejected_value, "\n".join(errors))


if __name__ == "__main__":
    unittest.main()
