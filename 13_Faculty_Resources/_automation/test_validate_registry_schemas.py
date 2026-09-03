#!/usr/bin/env python3
"""Behavior tests for the nine-registry Draft-07 schema gate."""

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
    ("curriculum.json", "curriculum.schema.json"),
    ("evidence_annotations.json", "evidence_annotations.schema.json"),
    ("instrument_rights.json", "instrument_rights.schema.json"),
    ("decisions.json", "decisions.schema.json"),
)


def run_validator(
    root: Path, *, forbid_urlopen: bool = False
) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, str(VALIDATOR), "--root", str(root)]
    if forbid_urlopen:
        command = [
            sys.executable,
            "-c",
            (
                "import runpy, sys, urllib.request; "
                "urllib.request.urlopen = lambda *args, **kwargs: "
                "(_ for _ in ()).throw(AssertionError('urlopen called')); "
                "validator, root = sys.argv[1:]; "
                "sys.argv = [validator, '--root', root]; "
                "runpy.run_path(validator, run_name='__main__')"
            ),
            str(VALIDATOR),
            str(root),
        ]
    return subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )


def audience_path_document(document: dict) -> dict:
    """Convert the legacy fixture into the required two-audience path shape."""
    if "learningPaths" in document:
        return document
    weeks = document.pop("weeks")
    for week in weeks:
        week["focusCategories"] = ["safety"]
    document["learningPaths"] = {
        "ms3": {"id": "ms3-six-week", "weeks": weeks},
        "resident": {
            "id": "resident-four-week",
            "weeks": [
                {"n": n, "title": f"R{n}", "theme": f"RT{n}",
                 "focusCategories": ["safety"], "items": []}
                for n in range(1, 5)
            ],
        },
    }
    return document


class RegistrySchemaGateTests(unittest.TestCase):
    def make_registry_copy(self) -> tempfile.TemporaryDirectory[str]:
        temporary = tempfile.TemporaryDirectory()
        destination = Path(temporary.name)
        for document, schema in PAIRS:
            shutil.copy2(ROOT / document, destination / document)
            shutil.copy2(ROOT / schema, destination / schema)
        return temporary

    def test_all_eight_current_document_schema_pairs_pass(self) -> None:
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
        self.assertIn(
            "question_bank.schema.json: INVALID SCHEMA at /$ref: "
            "non-local $ref is not permitted",
            result.stdout,
        )
        self.assertNotIn("Traceback", result.stderr)

    def test_local_reference_to_a_non_schema_target_fails_without_a_traceback(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "x-extension": {"value": "not a schema"},
                        "$ref": "#/x-extension/value",
                    }
                ),
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "question_bank.schema.json: INVALID SCHEMA at /$ref: "
            "local $ref target is not a valid Draft-07 schema",
            result.stdout,
        )
        self.assertNotIn("not a schema", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_absolute_schema_reference_is_rejected_without_opening_a_url(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps({"$schema": "http://json-schema.org/draft-07/schema#", "$ref": "https://example.invalid/schema"}),
                encoding="utf-8",
            )

            result = run_validator(root, forbid_urlopen=True)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "question_bank.schema.json: INVALID SCHEMA at /$ref: "
            "non-local $ref is not permitted",
            result.stdout,
        )
        self.assertNotIn("urlopen called", result.stdout + result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_nested_validation_error_uses_an_escaped_cli_pointer(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "type": "object",
                        "properties": {
                            "nested/key": {
                                "type": "object",
                                "properties": {"tilde~key": {"type": "integer"}},
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            (root / "question_bank.json").write_text(
                json.dumps({"nested/key": {"tilde~key": "invalid"}}),
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "question_bank.json: INVALID at /nested~1key/tilde~0key:", result.stdout
        )
        self.assertNotIn("Traceback", result.stderr)

    def test_nested_unresolved_local_reference_reports_its_schema_pointer(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "definitions": {
                            "nested/key~": {"$ref": "#/definitions/missing"}
                        },
                    }
                ),
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "question_bank.schema.json: INVALID SCHEMA at "
            "/definitions/nested~1key~0/$ref:",
            result.stdout,
        )
        self.assertNotIn("Traceback", result.stderr)

    def test_nested_id_is_rejected_at_its_escaped_schema_pointer(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "definitions": {
                            "nested/id~": {
                                "$id": "nested-resource.json",
                                "type": "object",
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "question_bank.schema.json: INVALID SCHEMA at "
            "/definitions/nested~1id~0/$id: nested resource scopes are unsupported",
            result.stdout,
        )
        self.assertNotIn("Traceback", result.stderr)

    def test_root_id_with_canonical_local_fragment_remains_valid_offline(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            (root / "question_bank.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "$id": "https://example.invalid/question-bank.schema.json",
                        "definitions": {"canonical": {"type": "object"}},
                        "$ref": "#/definitions/canonical",
                    }
                ),
                encoding="utf-8",
            )
            (root / "question_bank.json").write_text("{}\n", encoding="utf-8")

            result = run_validator(root, forbid_urlopen=True)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("question_bank.json: OK (question_bank.schema.json)", result.stdout)
        self.assertNotIn("urlopen called", result.stdout + result.stderr)

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

    def test_question_bank_id_prefix_must_match_category(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = json.loads(
                (root / "question_bank.json").read_text(encoding="utf-8")
            )
            item = next(i for i in document["items"] if i["id"] == "qb_cdev_001")
            item["id"] = "qb_chd_003"
            (root / "question_bank.json").write_text(
                json.dumps(document), encoding="utf-8"
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("question_bank.json: INVALID at /items/", result.stdout)
        self.assertIn("qb_chd_003", result.stdout)
        self.assertIn("canonical prefix", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_question_bank_grandfathered_legacy_ids_still_pass(self) -> None:
        # qb_chd_001/002 and qb_oth_001/002 predate the cdev/otherdx conventions
        # and are permanent identities (SRS cards + cw_qb_v1 key on them).
        result = run_validator(ROOT)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("question_bank.json: OK", result.stdout)

    def test_curriculum_rejects_an_unknown_root_property(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = json.loads((root / "curriculum.json").read_text(encoding="utf-8"))
            document["unreviewedRoot"] = True
            (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("curriculum.json: INVALID at /", result.stdout)
        self.assertIn("unreviewedRoot", result.stdout)

    def test_curriculum_accepts_exact_audience_paths(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = audience_path_document(json.loads(
                (root / "curriculum.json").read_text(encoding="utf-8")))
            (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")
            result = run_validator(root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_curriculum_rejects_wrong_path_count_id_and_focus_category(self) -> None:
        mutations = {
            "resident-count": lambda d: d["learningPaths"]["resident"]["weeks"].append(
                {"n": 5, "title": "R5", "theme": "RT5",
                 "focusCategories": ["safety"], "items": []}),
            "ms3-id": lambda d: d["learningPaths"]["ms3"].update({"id": "wrong"}),
            "focus": lambda d: d["learningPaths"]["resident"]["weeks"][0].update(
                {"focusCategories": ["not-a-blueprint"]}),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), self.make_registry_copy() as temporary:
                root = Path(temporary)
                document = audience_path_document(json.loads(
                    (root / "curriculum.json").read_text(encoding="utf-8")))
                mutate(document)
                (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")
                result = run_validator(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Traceback", result.stderr)

    def test_curriculum_rejects_a_missing_required_root_property(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = json.loads((root / "curriculum.json").read_text(encoding="utf-8"))
            del document["synonyms"]
            (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("curriculum.json: INVALID at /", result.stdout)
        self.assertIn("synonyms", result.stdout)

    def test_curriculum_rejects_malformed_synonyms(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = json.loads((root / "curriculum.json").read_text(encoding="utf-8"))
            document["synonyms"] = {"withdrawal": ["detox"]}
            (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("curriculum.json: INVALID at /synonyms/withdrawal", result.stdout)

    def test_curriculum_rejects_an_invalid_library_accent(self) -> None:
        with self.make_registry_copy() as temporary:
            root = Path(temporary)
            document = json.loads((root / "curriculum.json").read_text(encoding="utf-8"))
            document["libraryColumns"][0]["accent"] = "unreviewed"
            (root / "curriculum.json").write_text(json.dumps(document), encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("curriculum.json: INVALID at /libraryColumns/0/accent", result.stdout)


if __name__ == "__main__":
    unittest.main()
