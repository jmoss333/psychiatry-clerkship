#!/usr/bin/env python3
"""Behavior tests for the offline tool-governance producer."""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import validate_tool_governance as governance


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Path(__file__).with_name("validate_tool_governance.py")
SCHEMA_SOURCE = ROOT / "13_Faculty_Resources" / "reviewed.schema.json"
EXPECTED_LEGACY_MARKER_SOURCES = {
    "03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html",
    "04_Acute_and_Safety/Catatonia/bfcrs.html",
    "04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html",
    "04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html",
    "04_Acute_and_Safety/Violence_Risk/violence-risk-one-pager.html",
}


def reviewed_ledger_entry() -> dict:
    return {
        "status": "reviewed",
        "risk": {"kind": "general", "level": "low"},
        "at": "2026-07-26",
        "by": "Synthetic Reviewer, MD",
    }


def pending_ledger_entry() -> dict:
    return {
        "status": "pending",
        "risk": {"kind": "clinical", "level": "high"},
        "reason": "Synthetic review is pending",
        "at": "2026-07-26",
        "by": "Pending faculty review",
    }


def synthetic_ledger_for_site_entries(root: Path) -> dict:
    """A schema-valid, all-reviewed ledger covering every real tool slug.

    The checked-in production reviewed.json has not been migrated to the
    Task 1 risk schema yet (that migration is a separate, faculty-gated
    step — see .superpowers/sdd/2026-07-26-risk-aware-publishing-warnings/).
    Tests that exercise the real repository's tool sources/markers patch
    load_validated_ledger with this synthetic stand-in so they stay
    decoupled from that pending migration without ever reading or writing
    the real reviewed.json.
    """
    entry = reviewed_ledger_entry()
    slugs = set()
    for site in ("ms3", "resident"):
        slugs.update(slug for _source, slug in governance._tool_entries(root, site))
    return {slug: entry for slug in slugs}


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
    shutil.copyfile(SCHEMA_SOURCE, reviewed.with_name("reviewed.schema.json"))
    ledger_entry = reviewed_ledger_entry()
    reviewed.write_text(
        json.dumps(
            {
                slug: ledger_entry
                for slug in (
                    "base.html",
                    "learning-path.html",
                    "orientation-video.html",
                    "rp-agitation.html",
                    "rp-brief-psych.html",
                    "rp-canon-quiz.html",
                )
            }
        ),
        encoding="utf-8",
    )
    sources = {
        "synthetic/base.html": b'<!-- [CLERKSHIP-META v1] tool="synthetic-base" audience="trainee" -->\n',
        "01_Six_Week_Curriculum/learning-path.html": b'<!-- [RC-META] tool="synthetic-path" audience="trainee" -->\n',
        "_prototypes/orientation-video/orientation-video.html": b'<!-- [RC-META] tool="synthetic-video" audience="trainee" -->\n',
        "_prototypes/agitation-trainer/rp-agitation.html": b'<!-- [RC-META] tool="synthetic-a" audience="trainee" -->\n',
        "_prototypes/brief-psych/rp-brief-psych.html": b'<!-- [RC-META] tool="synthetic-b" audience="trainee" -->\n',
        "_prototypes/canon-quiz/rp-canon-quiz.html": b'<!-- [RC-META] tool="synthetic-c" audience="trainee" -->\n',
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

    def test_missing_contract_files_raise_stable_governance_errors(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            missing = Path(temporary) / "missing-contract-file.json"
            cases = (
                ("SCHEMA_PATH", "governance-envelope-v1.schema.json: unreadable"),
                ("MANIFEST_PATH", "manifest.json: unreadable"),
            )
            for attribute, expected in cases:
                with self.subTest(attribute=attribute), patch.object(
                    governance, attribute, missing
                ):
                    try:
                        governance.load_vendored_contract()
                    except Exception as error:
                        raised = error
                    else:
                        raised = None
                    self.assertIsInstance(raised, governance.GovernanceError)
                    self.assertEqual(str(raised), expected)
                    self.assertNotIn(str(missing), str(raised))


class MetadataMarkerTests(unittest.TestCase):
    def test_preferred_and_legacy_markers_parse_from_synthetic_bytes(self) -> None:
        preferred = governance.parse_metadata_marker(
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="ms3, resident" -->',
            "synthetic/preferred.html",
        )
        legacy = governance.parse_metadata_marker(
            b'<!-- [RC-META] tool="synthetic-legacy" audience="trainee" -->',
            "synthetic/legacy.html",
        )

        self.assertEqual(preferred.kind, "preferred")
        self.assertEqual(preferred.fields["tool"], "synthetic-tool")
        self.assertEqual(legacy.kind, "legacy")
        self.assertEqual(legacy.fields["audience"], "trainee")

    def test_conflicting_preferred_and_legacy_markers_fail_closed(self) -> None:
        source = (
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="trainee" -->\n'
            b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" -->'
        )

        with self.assertRaisesRegex(
            governance.GovernanceError,
            r"synthetic/dual.html: conflicting metadata markers",
        ):
            governance.parse_metadata_marker(source, "synthetic/dual.html")

    def test_unclosed_recognized_marker_start_fails_closed_without_source_text(self) -> None:
        source = (
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="trainee" -->\n'
            b'<!-- [RC-META] tool="sensitive-synthetic" audience="trainee"'
        )

        with self.assertRaisesRegex(
            governance.GovernanceError,
            r"synthetic/unclosed.html: malformed metadata marker",
        ) as raised:
            governance.parse_metadata_marker(source, "synthetic/unclosed.html")
        self.assertNotIn("sensitive-synthetic", str(raised.exception))

    def test_duplicate_malformed_and_required_metadata_fail_closed(self) -> None:
        cases = {
            "duplicate": (
                b'<!-- [RC-META] tool="synthetic-a" tool="synthetic-b" audience="trainee" -->',
                "tool",
            ),
            "trailing": (
                b'<!-- [RC-META] tool="synthetic" audience="trainee" unexpected -->',
                "metadata",
            ),
            "missing-tool": (b'<!-- [RC-META] audience="trainee" -->', "tool"),
            "empty-audience": (
                b'<!-- [RC-META] tool="synthetic" audience="" -->',
                "audience",
            ),
            "duplicate-audience": (
                b'<!-- [RC-META] tool="synthetic" audience="trainee, trainee" -->',
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
    def test_ledger_owns_review_attestation_category_and_severity(self) -> None:
        # The marker claims a rosier status/category/severity than the ledger
        # records; the envelope must reflect the ledger, not the marker.
        source = (
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="trainee" '
            b'status="reviewed" reviewCategory="clinical" safetySeverity="critical" -->\n'
        )
        marker = governance.parse_metadata_marker(source, "synthetic/source.html")

        pending = governance.normalize_tool(
            source,
            "synthetic/source.html",
            "synthetic-output.html",
            marker,
            revision="a" * 40,
            ledger_entry={
                "status": "pending",
                "risk": {"kind": "local-policy", "level": "high"},
                "reason": "Synthetic review is pending",
                "at": "2026-07-26",
                "by": "Pending faculty review",
            },
        )
        reviewed = governance.normalize_tool(
            source,
            "synthetic/source.html",
            "synthetic-output.html",
            marker,
            revision="a" * 40,
            ledger_entry={
                "status": "reviewed",
                "risk": {"kind": "general", "level": "low"},
                "at": "2026-07-26",
                "by": "Synthetic Reviewer, MD",
            },
        )

        self.assertEqual(pending["reviewStatus"], "needs-review")
        self.assertEqual(pending["attestationStatus"], "needs-attestation")
        self.assertEqual(pending["reviewCategory"], "local-policy")
        self.assertEqual(pending["safetySeverity"], "high")
        self.assertEqual(reviewed["reviewStatus"], "reviewed")
        self.assertEqual(reviewed["attestationStatus"], "faculty-attested")
        self.assertEqual(reviewed["reviewCategory"], "general")
        self.assertEqual(reviewed["safetySeverity"], "low")

    def test_reviewed_ledger_attests_independently_of_marker_and_authorship(self) -> None:
        source = (
            b'<!-- [CLERKSHIP-META v1] tool="synthetic-tool" audience="ms3, resident" '
            b'status="reviewed" summary="Synthetic AI-drafted wording only" -->\n'
        )
        marker = governance.parse_metadata_marker(source, "synthetic/source.html")

        envelope = governance.normalize_tool(
            source,
            "synthetic/source.html",
            "synthetic-output.html",
            marker,
            revision="a" * 40,
            ledger_entry=reviewed_ledger_entry(),
        )

        self.assertEqual(envelope["id"], "tools/synthetic-output")
        self.assertEqual(envelope["audiences"], ["ms3", "resident"])
        self.assertEqual(envelope["reviewStatus"], "reviewed")
        self.assertEqual(envelope["attestationStatus"], "faculty-attested")
        self.assertEqual(
            envelope["authorship"],
            {"kind": "unknown", "contributorIds": ["provenance-unrecorded"]},
        )
        self.assertEqual(envelope["source"]["sha256"], hashlib.sha256(source).hexdigest())
        serialized = json.dumps(envelope, sort_keys=True)
        self.assertNotIn("Synthetic", serialized)
        self.assertNotIn("AI-drafted wording", serialized)

    def test_explicit_metadata_attestation_claims_cannot_override_the_ledger(self) -> None:
        claims = (
            ("status", "attested"),
            ("status", "faculty-attested"),
            ("attestation", "attested"),
            ("attestationStatus", "faculty-attested"),
        )
        for field, value in claims:
            with self.subTest(field=field, value=value):
                source = (
                    b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" '
                    + field.encode("ascii")
                    + b'="'
                    + value.encode("ascii")
                    + b'" -->\n'
                )
                marker = governance.parse_metadata_marker(source, "synthetic/attested.html")

                envelope = governance.normalize_tool(
                    source,
                    "synthetic/attested.html",
                    "synthetic-attested.html",
                    marker,
                    revision="b" * 40,
                    ledger_entry=reviewed_ledger_entry(),
                )

                self.assertEqual(envelope["attestationStatus"], "faculty-attested")

    def test_draft_pending_attestation_maps_to_pending_review_and_attestation(self) -> None:
        source = (
            b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" '
            b'status="draft-pending-attestation" -->\n'
        )
        marker = governance.parse_metadata_marker(source, "synthetic/draft.html")

        envelope = governance.normalize_tool(
            source,
            "synthetic/draft.html",
            "synthetic-draft.html",
            marker,
            revision="d" * 40,
            ledger_entry=pending_ledger_entry(),
        )

        self.assertEqual(envelope["reviewStatus"], "needs-review")
        self.assertEqual(envelope["attestationStatus"], "needs-attestation")

    def test_noncanonical_ledger_status_is_rejected(self) -> None:
        source = b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" -->\n'
        marker = governance.parse_metadata_marker(source, "synthetic/ledger-only.html")

        with self.assertRaisesRegex(
            governance.GovernanceError,
            r"synthetic/ledger-only\.html: invalid canonical ledger record",
        ):
            governance.normalize_tool(
                source,
                "synthetic/ledger-only.html",
                "synthetic-ledger.html",
                marker,
                revision="b" * 40,
                ledger_entry={
                    "status": "attested",
                    "risk": {"kind": "general", "level": "low"},
                    "at": "2026-07-26",
                    "by": "Synthetic Reviewer, MD",
                },
            )

    def test_missing_ledger_entry_is_rejected(self) -> None:
        source = b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" -->\n'
        marker = governance.parse_metadata_marker(source, "synthetic/no-ledger.html")

        for label, invalid_entry in {"none": None, "empty dict": {}}.items():
            with self.subTest(label=label):
                with self.assertRaisesRegex(
                    governance.GovernanceError,
                    r"synthetic/no-ledger\.html: (missing|invalid) canonical ledger record",
                ):
                    governance.normalize_tool(
                        source,
                        "synthetic/no-ledger.html",
                        "synthetic-no-ledger.html",
                        marker,
                        revision="b" * 40,
                        ledger_entry=invalid_entry,
                    )

    def test_unsafe_policy_and_malformed_source_path_fail_schema_validation(self) -> None:
        source = b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" -->\n'
        marker = governance.parse_metadata_marker(source, "synthetic/source.html")
        envelope = governance.normalize_tool(
            source,
            "synthetic/source.html",
            "synthetic-output.html",
            marker,
            revision="c" * 40,
            ledger_entry=reviewed_ledger_entry(),
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
        source = b'<!-- [RC-META] tool="synthetic-tool" audience="trainee" -->\n'
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
                ledger_entry=reviewed_ledger_entry(),
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
        # The checked-in production reviewed.json has not been migrated to the
        # Task 1 risk schema yet (a separate, faculty-gated step), so this
        # patches in a synthetic-but-valid ledger to keep exercising the real
        # tool sources/markers/manifest without touching or depending on the
        # real reviewed.json's current content.
        with patch.object(
            governance,
            "load_validated_ledger",
            return_value=synthetic_ledger_for_site_entries(ROOT),
        ):
            diagnostics, documents = governance.validate_repository(ROOT)

        self.assertEqual(len(documents["ms3"]["items"]), 23)
        self.assertEqual(len(documents["resident"]["items"]), 25)
        self.assertEqual(len(diagnostics), 1)
        self.assertTrue(diagnostics[0].startswith("legacy metadata warning: "))

    def test_current_emitted_sources_leave_only_the_expected_legacy_markers(self) -> None:
        with patch.object(
            governance,
            "load_validated_ledger",
            return_value=synthetic_ledger_for_site_entries(ROOT),
        ):
            diagnostics, _documents = governance.validate_repository(ROOT)

        legacy_paths = set(
            diagnostics[0].removeprefix("legacy metadata warning: ").split(", ")
        )
        self.assertEqual(legacy_paths, EXPECTED_LEGACY_MARKER_SOURCES)

    def test_built_tool_inventory_matches_generated_governance_ids(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            document, _warnings = governance.build_governance_document(
                root, "ms3", revision="f" * 40
            )
            tools = root / "built/tools"
            tools.mkdir(parents=True)
            for item in document["items"]:
                (tools / f"{item['id'].removeprefix('tools/')}.html").write_text(
                    "<!doctype html>\n", encoding="utf-8"
                )

            governance.validate_built_tool_inventory(document, tools)

            (tools / "unexpected.html").write_text("<!doctype html>\n", encoding="utf-8")
            with self.assertRaisesRegex(
                governance.GovernanceError,
                r"tool-governance.json: built tool inventory mismatch",
            ):
                governance.validate_built_tool_inventory(document, tools)

    def test_production_count_invariant_rejects_a_coordinated_source_drop(self) -> None:
        entries = governance._tool_entries(ROOT, "ms3")
        # Ledger patched in before _tool_entries is patched, so this still
        # covers the real (untruncated) slug sets for both sites.
        ledger = synthetic_ledger_for_site_entries(ROOT)
        with (
            patch.object(governance, "_tool_entries", return_value=entries[:-1]),
            patch.object(governance, "load_validated_ledger", return_value=ledger),
        ):
            with self.assertRaisesRegex(
                governance.GovernanceError,
                r"tool-governance.json: ms3 item count must equal 23",
            ):
                governance.build_governance_document(
                    ROOT, "ms3", enforce_expected_count=True
                )

    def test_built_inventory_rejects_uppercase_html_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            document, _warnings = governance.build_governance_document(
                root, "ms3", revision="f" * 40
            )
            tools = root / "built/tools"
            tools.mkdir(parents=True)
            for item in document["items"]:
                (tools / f"{item['id'].removeprefix('tools/')}.html").write_text(
                    "<!doctype html>\n", encoding="utf-8"
                )
            (tools / "extra.HTML").write_text("<!doctype html>\n", encoding="utf-8")

            with patch.object(governance, "EXPECTED_TOOL_COUNTS", {"ms3": 3, "resident": 5}):
                with self.assertRaisesRegex(
                    governance.GovernanceError,
                    r"tool-governance.json: noncanonical HTML filename",
                ):
                    governance.validate_built_tool_inventory(document, tools, site="ms3")

    def test_cli_default_root_reports_ok_now_that_the_ledger_is_migrated(self) -> None:
        # 2026-08-12: the production reviewed.json was migrated to the
        # Task 1 risk schema (faculty-confirmed migration — see
        # .superpowers/sdd/2026-07-26-risk-aware-publishing-warnings/,
        # Task 6). This subprocess run cannot patch the loader like the
        # in-process tests above do, so it exercises the real repo root
        # end-to-end; it must now succeed against the real, migrated
        # ledger. (Formerly asserted the mirror-image fail-closed outcome
        # while the migration was pending faculty confirmation.)
        result = subprocess.run(
            [sys.executable, str(VALIDATOR)], check=False, capture_output=True, text=True
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("tool governance OK", result.stdout)
        self.assertIn("ms3: 23 item(s)", result.stdout)
        self.assertIn("resident: 25 item(s)", result.stdout)

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

    def test_atomic_output_rejects_invalid_aggregate_invariants(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            document = governance.build_governance_document(
                root, "ms3", revision="e" * 40
            )[0]
            cases = {
                "schema-version": lambda candidate: candidate.update({"schemaVersion": 2}),
                "duplicate-id": lambda candidate: candidate["items"].append(
                    json.loads(json.dumps(candidate["items"][0]))
                ),
                "unsorted-ids": lambda candidate: candidate["items"].reverse(),
            }
            for label, mutate in cases.items():
                with self.subTest(label=label):
                    candidate = json.loads(json.dumps(document))
                    mutate(candidate)
                    output = root / f"{label}.json"
                    output.write_bytes(b"stable-output\n")

                    with self.assertRaisesRegex(
                        governance.GovernanceError,
                        r"tool-governance.json: invalid (schemaVersion|item ids)",
                    ):
                        governance.write_atomic_json(output, candidate)

                    self.assertEqual(output.read_bytes(), b"stable-output\n")

    def test_atomic_output_serialization_failure_leaves_no_temporary_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            document = governance.build_governance_document(
                root, "ms3", revision="e" * 40
            )[0]
            document["schemaVersion"] = Decimal("1")
            output = root / "tool-governance.json"
            output.write_bytes(b"stable-output\n")

            try:
                governance.write_atomic_json(output, document)
            except Exception as error:
                raised = error
            else:
                raised = None

            self.assertIsInstance(raised, governance.GovernanceError)
            self.assertEqual(str(raised), "tool-governance.json: unable to serialize output")
            self.assertNotIn("Decimal", str(raised))
            self.assertEqual(output.read_bytes(), b"stable-output\n")
            self.assertEqual(list(root.glob(".tool-governance.json.*")), [])

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

    def test_invalid_audience_cannot_reach_output_or_diagnostics(self) -> None:
        sentinel = "SYNTHETIC-PRIVATE-AUDIENCE-SENTINEL-42"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_synthetic_repository(root)
            (root / "synthetic/base.html").write_bytes(
                (
                    '<!-- [CLERKSHIP-META v1] tool="synthetic-base" '
                    f'audience="ms3,{sentinel}" -->\n'
                ).encode("utf-8")
            )
            output = root / "tool-governance.json"
            output.write_bytes(b"stable-output\n")

            result = run_validator(
                root,
                "--site",
                "ms3",
                "--revision",
                "e" * 40,
                "--output",
                str(output),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_bytes(), b"stable-output\n")
            self.assertNotIn(sentinel, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
