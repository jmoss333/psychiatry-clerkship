#!/usr/bin/env python3
"""Behavior tests for the offline tool-governance producer."""

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import validate_tool_governance as governance


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Path(__file__).with_name("validate_tool_governance.py")


def write_synthetic_repository(root: Path) -> None:
    manifest = {
        "tools": [
            ["synthetic/base.html", "base.html", "Synthetic title excluded from output"],
        ]
    }
    manifest_path = root / "13_Faculty_Resources/_automation/site_build/site_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    reviewed = root / "13_Faculty_Resources/reviewed.json"
    reviewed.parent.mkdir(parents=True, exist_ok=True)
    reviewed.write_text(json.dumps({"base.html": {"status": "reviewed"}}), encoding="utf-8")
    sources = {
        "synthetic/base.html": b'<!-- [CLERKSHIP-META v1] tool="synthetic-base" audience="alpha" -->\n',
        "01_Six_Week_Curriculum/learning-path.html": b'<!-- [RC-META] tool="synthetic-path" audience="alpha" -->\n',
        "_prototypes/orientation-video/orientation-video.html": b'<!-- [RC-META] tool="synthetic-video" audience="alpha" -->\n',
        "_prototypes/agitation-trainer/rp-agitation.html": b'<!-- [RC-META] tool="synthetic-a" audience="alpha" -->\n',
        "_prototypes/brief-psych/rp-brief-psych.html": b'<!-- [RC-META] tool="synthetic-b" audience="alpha" -->\n',
        "_prototypes/canon-quiz/rp-canon-quiz.html": b'<!-- [RC-META] tool="synthetic-c" audience="alpha" -->\n',
    }
    for relative, value in sources.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)


def run_validator(root: Path, *arguments: str, forbid_socket: bool = False) -> subprocess.CompletedProcess[str]:
    if forbid_socket:
        command = [
            sys.executable,
            "-c",
            (
                "import runpy, socket, sys; "
                "socket.socket = lambda *args, **kwargs: "
                "(_ for _ in ()).throw(AssertionError('socket opened')); "
                "validator, root, *arguments = sys.argv[1:]; "
                "sys.argv = [validator, '--root', root, *arguments]; "
                "runpy.run_path(validator, run_name='__main__')"
            ),
            str(VALIDATOR),
            str(root),
            *arguments,
        ]
    else:
        command = [sys.executable, str(VALIDATOR), "--root", str(root), *arguments]
    return subprocess.run(command, check=False, capture_output=True, text=True)


class VendoredContractTests(unittest.TestCase):
    def test_vendored_contract_is_byte_pinned_and_draft07_valid(self) -> None:
        schema, descriptor = governance.load_vendored_contract()

        self.assertEqual(schema["$schema"], "http://json-schema.org/draft-07/schema#")
        self.assertEqual(descriptor["package"], "@clerkshipos/schema")
        self.assertEqual(descriptor["version"], "0.2.0")
        self.assertEqual(
            descriptor["sha256"],
            "9def8f3edfaa11c549a0bd258eaff048754775675b71e96bf1ffccf15e41f36e",
        )

    def test_vendored_manifest_must_keep_the_pinned_contract_identity(self) -> None:
        manifest = json.loads(governance.MANIFEST_PATH.read_text(encoding="utf-8"))
        manifest["contract"]["package"] = "synthetic/incorrect-package"
        with tempfile.TemporaryDirectory() as temporary:
            replacement = Path(temporary) / "manifest.json"
            replacement.write_text(json.dumps(manifest), encoding="utf-8")
            with patch.object(governance, "MANIFEST_PATH", replacement):
                with self.assertRaisesRegex(
                    governance.GovernanceError,
                    r"manifest.json: invalid contract descriptor",
                ):
                    governance.load_vendored_contract()


class MetadataMarkerTests(unittest.TestCase):
    def test_preferred_and_legacy_markers_parse_from_synthetic_bytes(self) -> None:
        preferred = governance.parse_metadata_marker(
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="alpha, beta" -->',
            "synthetic/preferred.html",
        )
        legacy = governance.parse_metadata_marker(
            b'<!-- [RC-META] tool="synthetic-legacy" audience="alpha" -->',
            "synthetic/legacy.html",
        )

        self.assertEqual(preferred.kind, "preferred")
        self.assertEqual(preferred.fields["tool"], "synthetic-tool")
        self.assertEqual(legacy.kind, "legacy")
        self.assertEqual(legacy.fields["audience"], "alpha")

    def test_conflicting_preferred_and_legacy_markers_fail_closed(self) -> None:
        source = (
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="alpha" -->\n'
            b'<!-- [RC-META] tool="synthetic-tool" audience="alpha" -->'
        )

        with self.assertRaisesRegex(
            governance.GovernanceError,
            r"synthetic/dual.html: conflicting metadata markers",
        ):
            governance.parse_metadata_marker(source, "synthetic/dual.html")

    def test_duplicate_malformed_and_required_metadata_fail_closed(self) -> None:
        cases = {
            "duplicate": (
                b'<!-- [RC-META] tool="synthetic-a" tool="synthetic-b" audience="alpha" -->',
                "tool",
            ),
            "trailing": (
                b'<!-- [RC-META] tool="synthetic" audience="alpha" unexpected -->',
                "metadata",
            ),
            "missing-tool": (b'<!-- [RC-META] audience="alpha" -->', "tool"),
            "empty-audience": (
                b'<!-- [RC-META] tool="synthetic" audience="" -->',
                "audience",
            ),
            "duplicate-audience": (
                b'<!-- [RC-META] tool="synthetic" audience="alpha, alpha" -->',
                "audience",
            ),
        }
        for label, (source, field_name) in cases.items():
            with self.subTest(label=label):
                with self.assertRaisesRegex(
                    governance.GovernanceError,
                    rf"synthetic/{label}.html: .*{field_name}",
                ) as raised:
                    governance.parse_metadata_marker(source, f"synthetic/{label}.html")
                self.assertNotIn("synthetic-a", str(raised.exception))
                self.assertNotIn("unexpected", str(raised.exception))


class NormalizationTests(unittest.TestCase):
    def test_reviewed_metadata_stays_unattested_and_unknown_authorship(self) -> None:
        source = (
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="alpha, beta" '
            b'status="reviewed" summary="Synthetic AI-drafted wording only" -->\n'
        )
        marker = governance.parse_metadata_marker(source, "synthetic/source.html")

        envelope = governance.normalize_tool(
            source,
            "synthetic/source.html",
            "synthetic-output.html",
            marker,
            revision="a" * 40,
            ledger_status="reviewed",
        )

        self.assertEqual(envelope["id"], "tools/synthetic-output")
        self.assertEqual(envelope["audiences"], ["alpha", "beta"])
        self.assertEqual(envelope["reviewStatus"], "reviewed")
        self.assertEqual(envelope["attestationStatus"], "needs-attestation")
        self.assertEqual(
            envelope["authorship"],
            {"kind": "unknown", "contributorIds": ["provenance-unrecorded"]},
        )
        self.assertEqual(envelope["source"]["sha256"], hashlib.sha256(source).hexdigest())
        serialized = json.dumps(envelope, sort_keys=True)
        self.assertNotIn("Synthetic", serialized)
        self.assertNotIn("AI-drafted wording", serialized)

    def test_explicit_attested_metadata_is_faculty_attested(self) -> None:
        source = (
            b'<!-- [RC-META] tool="synthetic-tool" audience="alpha" status="attested" -->\n'
        )
        marker = governance.parse_metadata_marker(source, "synthetic/attested.html")

        envelope = governance.normalize_tool(
            source,
            "synthetic/attested.html",
            "synthetic-attested.html",
            marker,
            revision="b" * 40,
            ledger_status="reviewed",
        )

        self.assertEqual(envelope["attestationStatus"], "faculty-attested")

    def test_unsafe_policy_and_malformed_source_path_fail_schema_validation(self) -> None:
        source = b'<!-- [RC-META] tool="synthetic-tool" audience="alpha" -->\n'
        marker = governance.parse_metadata_marker(source, "synthetic/source.html")
        envelope = governance.normalize_tool(
            source,
            "synthetic/source.html",
            "synthetic-output.html",
            marker,
            revision="c" * 40,
        )
        cases = {
            "policy": ("patientDataPolicy", "unsafe", "/patientDataPolicy"),
            "path": ("source.path", "../synthetic.html", "/source/path"),
        }
        for label, (field, value, pointer) in cases.items():
            with self.subTest(label=label):
                candidate = json.loads(json.dumps(envelope))
                if field == "source.path":
                    candidate["source"]["path"] = value
                else:
                    candidate[field] = value
                with self.assertRaisesRegex(
                    governance.GovernanceError,
                    rf"synthetic/source.html: schema validation failed at {pointer}",
                ):
                    governance.validate_envelope(candidate, "synthetic/source.html")

    def test_nested_built_slug_is_rejected_before_id_normalization(self) -> None:
        source = b'<!-- [RC-META] tool="synthetic-tool" audience="alpha" -->\n'
        marker = governance.parse_metadata_marker(source, "synthetic/source.html")

        with self.assertRaisesRegex(
            governance.GovernanceError, r"synthetic/source.html: invalid built slug"
        ):
            governance.normalize_tool(
                source,
                "synthetic/source.html",
                "nested/synthetic-output.html",
                marker,
                revision="d" * 40,
            )


class RepositoryProducerTests(unittest.TestCase):
    def test_builds_minimal_sorted_documents_from_manifest_and_existing_extras(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)

            first, warnings = governance.build_governance_document(
                root, "ms3", revision="d" * 40
            )
            second, repeated_warnings = governance.build_governance_document(
                root, "ms3", revision="d" * 40
            )

        self.assertEqual(set(first), {"schemaVersion", "contract", "items"})
        self.assertEqual(
            [item["id"] for item in first["items"]],
            ["tools/base", "tools/learning-path", "tools/orientation-video"],
        )
        self.assertEqual(
            governance.canonical_json_bytes(first), governance.canonical_json_bytes(second)
        )
        self.assertEqual(warnings, repeated_warnings)
        self.assertEqual(
            warnings,
            [
                "legacy metadata warning: 01_Six_Week_Curriculum/learning-path.html, "
                "_prototypes/orientation-video/orientation-video.html"
            ],
        )
        serialized = governance.canonical_json_bytes(first).decode("utf-8")
        self.assertNotIn("Synthetic title", serialized)
        self.assertNotIn("synthetic-base", serialized)

    def test_current_ms3_and_resident_source_inventories_validate_offline(self) -> None:
        diagnostics, documents = governance.validate_repository(ROOT)

        self.assertEqual(len(documents["ms3"]["items"]), 22)
        self.assertEqual(len(documents["resident"]["items"]), 24)
        self.assertEqual(len(diagnostics), 1)
        self.assertTrue(diagnostics[0].startswith("legacy metadata warning: "))

    def test_cli_default_root_validates_the_repository(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR)], check=False, capture_output=True, text=True
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("tool governance OK", result.stdout)

    def test_atomic_output_rejects_an_unpinned_contract_descriptor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            document = governance.build_governance_document(
                root, "ms3", revision="e" * 40
            )[0]
            document["contract"]["version"] = "synthetic-invalid"
            output = root / "tool-governance.json"
            output.write_bytes(b"stable-output\n")

            with self.assertRaisesRegex(
                governance.GovernanceError,
                r"tool-governance.json: invalid contract descriptor",
            ):
                governance.write_atomic_json(output, document)

            self.assertEqual(output.read_bytes(), b"stable-output\n")

    def test_cli_is_offline_and_writes_only_requested_complete_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            output = root / "tool-governance.json"
            revision = "e" * 40

            validation = run_validator(root, "--revision", revision, forbid_socket=True)
            written = run_validator(
                root, "--site", "ms3", "--revision", revision, "--output", str(output)
            )
            expected = governance.build_governance_document(
                root, "ms3", revision=revision
            )[0]
            written_document = (
                json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
            )

            (root / "synthetic/base.html").write_bytes(
                b'<!-- [RC-META] tool="synthetic" -->\n'
            )
            output.write_bytes(b"stable-output\n")
            failed_first = run_validator(
                root, "--site", "ms3", "--revision", revision, "--output", str(output)
            )
            failed_second = run_validator(
                root, "--site", "ms3", "--revision", revision, "--output", str(output)
            )
            preserved_output = output.read_bytes()

        self.assertEqual(validation.returncode, 0, validation.stdout + validation.stderr)
        self.assertNotIn("socket opened", validation.stdout + validation.stderr)
        self.assertFalse("tool-governance.json" in validation.stdout)
        self.assertEqual(written.returncode, 0, written.stdout + written.stderr)
        self.assertEqual(written_document, expected)
        self.assertNotEqual(failed_first.returncode, 0)
        self.assertEqual(failed_first.stdout, failed_second.stdout)
        self.assertEqual(preserved_output, b"stable-output\n")


if __name__ == "__main__":
    unittest.main()
