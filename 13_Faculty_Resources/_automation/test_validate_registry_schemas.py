#!/usr/bin/env python3
"""Behavior tests for the six-registry Draft-07 schema gate."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from validate_registry_schemas import json_pointer


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Path(__file__).with_name("validate_registry_schemas.py")
PAIRS = (
    ("topic_meta.json", "topic_meta.schema.json"),
    ("question_bank.json", "question_bank.schema.json"),
    ("communication_cases.json", "communication_cases.schema.json"),
    ("family_systems_scenarios.json", "family_systems_scenarios.schema.json"),
    ("evidence_registry.json", "evidence_registry.schema.json"),
    ("tool_registry.json", "tool_registry.schema.json"),
)


def run_validator(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), "--root", str(root)],
        check=False,
        capture_output=True,
        text=True,
    )


class RegistrySchemaGateTests(unittest.TestCase):
    def make_registry_copy(self) -> tempfile.TemporaryDirectory[str]:
        temporary = tempfile.TemporaryDirectory()
        destination = Path(temporary.name)
        for document, schema in PAIRS:
            shutil.copy2(ROOT / document, destination / document)
            shutil.copy2(ROOT / schema, destination / schema)
        return temporary

    def test_all_six_current_document_schema_pairs_pass(self) -> None:
        result = run_validator(ROOT)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for document, schema in PAIRS:
            self.assertIn(f"{document}: OK", result.stdout)
            self.assertIn(schema, result.stdout)

    def test_synthetic_invalid_mutation_of_each_document_fails(self) -> None:
        for document, _ in PAIRS:
            with self.subTest(document=document), self.make_registry_copy() as temporary:
                root = Path(temporary)
                (root / document).write_text("null\n", encoding="utf-8")

                result = run_validator(root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"{document}: INVALID at /", result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_invalid_schema_fails_without_a_traceback(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps({"$schema": "http://json-schema.org/draft-07/schema#", "type": "not-a-type"}),
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("question_bank.schema.json: INVALID SCHEMA at /type", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_malformed_json_fails_without_a_traceback(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "tool_registry.json").write_text("{not json}\n", encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tool_registry.json: INVALID JSON", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_invalid_value_containing_ok_marker_exits_nonzero(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.json").write_text('"bad: OK ("\n', encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("question_bank.json: INVALID at /", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_invalid_utf8_fails_without_a_traceback(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "tool_registry.json").write_bytes(b"\xff\n")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tool_registry.json: INVALID JSON", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_unresolvable_schema_reference_fails_without_a_traceback(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps({"$schema": "http://json-schema.org/draft-07/schema#", "$ref": "missing.json#"}),
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("question_bank.schema.json: INVALID SCHEMA at /$ref:", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_json_pointer_escapes_nested_slashes_and_tildes(self) -> None:
        self.assertEqual(json_pointer(["nested/key", "tilde~key"]), "/nested~1key/tilde~0key")

    def test_errors_have_deterministic_order_and_pointer_format(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.json").write_text("null\n", encoding="utf-8")
            (root / "tool_registry.json").write_text("null\n", encoding="utf-8")

            first = run_validator(root)
            second = run_validator(root)

        self.assertNotEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        self.assertIn("question_bank.json: INVALID at /", first.stdout)
        self.assertIn("tool_registry.json: INVALID at /", first.stdout)
        self.assertLess(first.stdout.index("question_bank.json: INVALID at /"),
                        first.stdout.index("tool_registry.json: INVALID at /"))


if __name__ == "__main__":
    unittest.main()
