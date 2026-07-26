#!/usr/bin/env python3
"""Behavior tests for the learner-facing surface governance contract."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

try:
    import surface_governance as governance
except ModuleNotFoundError:
    governance = None


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_SOURCE = ROOT / "13_Faculty_Resources/reviewed.schema.json"
SCRIPT = Path(__file__).with_name("surface_governance.py")


def reviewed_entry() -> dict:
    return {
        "status": "reviewed",
        "risk": {"kind": "clinical", "level": "high"},
        "at": "2026-07-26",
        "by": "Synthetic Reviewer, MD",
    }


def pending_entry() -> dict:
    return {
        "status": "pending",
        "risk": {"kind": "local-policy", "level": "high"},
        "reason": "Synthetic local workflow awaiting confirmation",
        "at": "2026-07-26",
        "by": "Pending faculty review",
    }


def write_ledger(root: Path, ledger: dict) -> None:
    faculty = root / "13_Faculty_Resources"
    faculty.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SCHEMA_SOURCE, faculty / "reviewed.schema.json")
    (faculty / "reviewed.json").write_text(
        json.dumps(ledger), encoding="utf-8"
    )


class LedgerValidationTests(unittest.TestCase):
    def test_valid_reviewed_record_loads_without_mutation(self) -> None:
        self.assertIsNotNone(
            governance,
            "surface_governance.py must provide the canonical ledger loader",
        )
        source = {"synthetic.md": reviewed_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, source)

            loaded = governance.load_validated_ledger(root)

        self.assertEqual(loaded, source)
        self.assertIsNot(loaded, source)

    def test_valid_pending_record_requires_explicit_reason_and_pending_reviewer(self) -> None:
        source = {"synthetic.html": pending_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, source)

            loaded = governance.load_validated_ledger(root)

        self.assertEqual(loaded, source)

    def test_invalid_records_fail_at_the_exact_field_without_echoing_values(self) -> None:
        cases = []

        missing_risk = reviewed_entry()
        del missing_risk["risk"]
        cases.append(("missing-risk", missing_risk, "/synthetic.md/risk", None))

        unknown_kind = reviewed_entry()
        unknown_kind["risk"]["kind"] = "sensitive-kind-value"
        cases.append(
            (
                "unknown-kind",
                unknown_kind,
                "/synthetic.md/risk/kind",
                "sensitive-kind-value",
            )
        )

        unknown_level = reviewed_entry()
        unknown_level["risk"]["level"] = "sensitive-level-value"
        cases.append(
            (
                "unknown-level",
                unknown_level,
                "/synthetic.md/risk/level",
                "sensitive-level-value",
            )
        )

        missing_reason = pending_entry()
        del missing_reason["reason"]
        cases.append(
            ("pending-missing-reason", missing_reason, "/synthetic.md/reason", None)
        )

        pending_reviewer = pending_entry()
        pending_reviewer["by"] = "Sensitive Unapproved Reviewer"
        cases.append(
            (
                "pending-reviewer",
                pending_reviewer,
                "/synthetic.md/by",
                "Sensitive Unapproved Reviewer",
            )
        )

        reviewed_pending_label = reviewed_entry()
        reviewed_pending_label["by"] = "Pending faculty review"
        cases.append(
            (
                "reviewed-pending-label",
                reviewed_pending_label,
                "/synthetic.md/by",
                None,
            )
        )

        invalid_date = reviewed_entry()
        invalid_date["at"] = "sensitive-invalid-date"
        cases.append(
            (
                "invalid-date",
                invalid_date,
                "/synthetic.md/at",
                "sensitive-invalid-date",
            )
        )

        future_date = reviewed_entry()
        future_date["at"] = "2999-01-01"
        cases.append(("future-date", future_date, "/synthetic.md/at", "2999-01-01"))

        unexpected = reviewed_entry()
        unexpected["sensitiveUnexpectedField"] = "sensitive-unexpected-value"
        cases.append(
            (
                "unexpected-field",
                unexpected,
                "/synthetic.md/sensitiveUnexpectedField",
                "sensitive-unexpected-value",
            )
        )

        for label, entry, expected_path, secret in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_ledger(root, {"synthetic.md": entry})

                with self.assertRaises(governance.SurfaceGovernanceError) as raised:
                    governance.load_validated_ledger(root)

                self.assertEqual(
                    str(raised.exception),
                    f"reviewed.json: synthetic.md invalid at {expected_path}",
                )
                if secret:
                    self.assertNotIn(secret, str(raised.exception))


class SiteDocumentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(
            hasattr(governance, "build_site_document"),
            "surface_governance.py must build sanitized site documents",
        )
        self.assertTrue(
            hasattr(governance, "annotate_navigation"),
            "surface_governance.py must annotate navigation copies",
        )

    def test_site_document_sanitizes_records_and_uses_fixed_warning_copy(self) -> None:
        reviewed = reviewed_entry()
        reviewed.update(
            {
                "note": "Internal faculty note",
                "contentHash": "a" * 64,
                "claimsHash": "b" * 64,
                "evidenceHash": "c" * 64,
                "evidenceThrough": "2026-07-01",
            }
        )
        local_pending = pending_entry()
        clinical_pending = pending_entry()
        clinical_pending["risk"] = {"kind": "clinical", "level": "high"}
        clinical_pending["reason"] = "Synthetic clinical review is pending"
        moderate_pending = pending_entry()
        moderate_pending["risk"] = {"kind": "general", "level": "moderate"}
        moderate_pending["reason"] = "Synthetic formatting review is pending"
        ledger = {
            "reviewed.md": reviewed,
            "local.html": local_pending,
            "clinical.md": clinical_pending,
            "moderate.md": moderate_pending,
            "not-shipped.md": reviewed_entry(),
        }
        nav = [
            {
                "section": "Synthetic",
                "items": [
                    {"t": "Reviewed", "f": "reviewed.md", "k": "md"},
                    {
                        "t": "Local",
                        "f": "local.html",
                        "k": "tool",
                        "hidden": True,
                    },
                    {"t": "Clinical", "f": "clinical.md", "k": "md"},
                    {"t": "Moderate", "f": "moderate.md", "k": "md"},
                ],
            }
        ]

        document = governance.build_site_document(ledger, nav, "ms3")

        self.assertEqual(document["schemaVersion"], 1)
        self.assertEqual(document["site"], "ms3")
        self.assertEqual(list(document["items"]), sorted(document["items"]))
        self.assertNotIn("not-shipped.md", document["items"])
        self.assertEqual(
            document["items"]["reviewed.md"],
            {
                "kind": "page",
                "status": "reviewed",
                "riskKind": "clinical",
                "riskLevel": "high",
                "reviewer": "Synthetic Reviewer, MD",
                "reviewedAt": "2026-07-26",
            },
        )
        self.assertEqual(
            document["items"]["local.html"]["warning"],
            (
                "This tool includes institution-specific teaching that has not "
                "completed faculty attestation. Verify current institutional "
                "policy or workflow before acting."
            ),
        )
        self.assertEqual(
            document["items"]["clinical.md"]["warning"],
            (
                "This page includes high-risk clinical teaching that has not "
                "completed faculty attestation. Verify decisions with your "
                "supervising clinician."
            ),
        )
        self.assertEqual(
            document["items"]["moderate.md"]["warning"],
            "Synthetic formatting review is pending",
        )
        serialized = json.dumps(document)
        self.assertNotIn("Internal faculty note", serialized)
        self.assertNotIn("contentHash", serialized)
        self.assertNotIn("claimsHash", serialized)
        self.assertNotIn("evidenceHash", serialized)
        self.assertNotIn("evidenceThrough", serialized)

    def test_site_document_rejects_invalid_site_missing_records_and_kind_conflicts(
        self,
    ) -> None:
        cases = (
            (
                "invalid-site",
                {"synthetic.md": reviewed_entry()},
                [{"f": "synthetic.md", "k": "md"}],
                "surface governance: invalid site",
                "faculty-only",
            ),
            (
                "missing-record",
                {},
                [{"f": "synthetic.md", "k": "md"}],
                "surface governance: synthetic.md missing ledger record",
                "ms3",
            ),
            (
                "kind-conflict",
                {"synthetic.md": reviewed_entry()},
                [
                    {"f": "synthetic.md", "k": "md"},
                    {"f": "synthetic.md", "k": "tool"},
                ],
                "surface governance: synthetic.md has conflicting kinds",
                "resident",
            ),
        )
        for label, ledger, nav, expected, site in cases:
            with self.subTest(label=label):
                with self.assertRaisesRegex(
                    governance.SurfaceGovernanceError,
                    f"^{expected.replace('.', '[.]')}$",
                ):
                    governance.build_site_document(ledger, nav, site)

    def test_navigation_annotation_copies_status_without_mutating_routes(self) -> None:
        nav = [
            {
                "section": "Synthetic",
                "items": [
                    {
                        "t": "Pending hidden tool",
                        "f": "synthetic.html",
                        "k": "tool",
                        "hidden": True,
                    }
                ],
            }
        ]
        original = deepcopy(nav)
        document = {
            "schemaVersion": 1,
            "site": "resident",
            "items": {
                "synthetic.html": {
                    "kind": "tool",
                    "status": "pending",
                    "riskKind": "local-policy",
                    "riskLevel": "high",
                    "reviewer": "Pending faculty review",
                    "reviewedAt": "2026-07-26",
                    "reason": "Synthetic local workflow awaiting confirmation",
                    "warning": "Fixed warning",
                }
            },
        }

        annotated = governance.annotate_navigation(nav, document)

        self.assertEqual(nav, original)
        self.assertEqual(
            annotated[0]["items"][0]["governance"],
            {
                "status": "pending",
                "riskKind": "local-policy",
                "riskLevel": "high",
            },
        )
        self.assertEqual(
            {
                key: annotated[0]["items"][0][key]
                for key in ("t", "f", "k", "hidden")
            },
            original[0]["items"][0],
        )

    def test_publish_site_governance_updates_all_public_surfaces_consistently(
        self,
    ) -> None:
        self.assertTrue(
            hasattr(governance, "publish_site_governance"),
            "surface_governance.py must publish one consistent site governance set",
        )
        ledger = {
            "synthetic.md": reviewed_entry(),
            "synthetic.html": pending_entry(),
        }
        nav = [
            {
                "section": "Synthetic",
                "items": [
                    {"t": "Page", "f": "synthetic.md", "k": "md"},
                    {"t": "Tool", "f": "synthetic.html", "k": "tool"},
                ],
            }
        ]
        search = {
            "version": 1,
            "n": 2,
            "docs": [
                {"t": "Page", "f": "synthetic.md", "k": "md"},
                {"t": "Tool", "f": "synthetic.html", "k": "tool"},
            ],
            "postings": {},
            "df": {},
            "synonyms": {},
        }
        source = (
            "<!doctype html><html><head><title>Synthetic</title></head>"
            "<body><main>Tool</main></body></html>"
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, ledger)
            output = root / "_build/ms3"
            tools = output / "tools"
            tools.mkdir(parents=True)
            (tools / "synthetic.html").write_text(source, encoding="utf-8")
            (output / "search-index.json").write_text(
                json.dumps(search), encoding="utf-8"
            )
            (output / "reviewed.json").write_text(
                "internal raw ledger", encoding="utf-8"
            )

            document = governance.publish_site_governance(
                root, output, nav, "ms3"
            )

            published_nav = json.loads(
                (output / "nav.json").read_text(encoding="utf-8")
            )
            published_search = json.loads(
                (output / "search-index.json").read_text(encoding="utf-8")
            )
            published_document = json.loads(
                (output / "governance.json").read_text(encoding="utf-8")
            )
            rendered_tool = (tools / "synthetic.html").read_text(encoding="utf-8")
            raw_ledger_published = (output / "reviewed.json").exists()

        self.assertEqual(published_document, document)
        self.assertEqual(
            published_nav[0]["items"][1]["governance"],
            {
                "status": "pending",
                "riskKind": "local-policy",
                "riskLevel": "high",
            },
        )
        self.assertEqual(
            published_search["docs"][0]["governance"],
            {
                "status": "reviewed",
                "riskKind": "clinical",
                "riskLevel": "high",
            },
        )
        self.assertEqual(
            published_search["docs"][1]["governance"],
            published_nav[0]["items"][1]["governance"],
        )
        self.assertFalse(raw_ledger_published)
        self.assertEqual(rendered_tool.count("SURFACE-GOVERNANCE:START"), 1)


class DirectToolPresentationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(
            hasattr(governance, "apply_tool_status"),
            "surface_governance.py must inject direct-tool status",
        )
        self.assertTrue(
            hasattr(governance, "write_site_document"),
            "surface_governance.py must write deterministic site documents",
        )

    def test_tool_injection_scales_status_and_replaces_prior_blocks(self) -> None:
        document = {
            "schemaVersion": 1,
            "site": "ms3",
            "items": {
                "pending-high.html": {
                    "kind": "tool",
                    "status": "pending",
                    "riskKind": "clinical",
                    "riskLevel": "high",
                    "reviewer": "Pending faculty review",
                    "reviewedAt": "2026-07-26",
                    "reason": "Synthetic clinical review is pending",
                    "warning": (
                        "This tool includes high-risk clinical teaching that has not "
                        "completed faculty attestation. Verify decisions with your "
                        "supervising clinician."
                    ),
                },
                "pending-moderate.html": {
                    "kind": "tool",
                    "status": "pending",
                    "riskKind": "general",
                    "riskLevel": "moderate",
                    "reviewer": "Pending faculty review",
                    "reviewedAt": "2026-07-26",
                    "reason": "Synthetic <unsafe> & pending",
                    "warning": "Synthetic <unsafe> & pending",
                },
                "reviewed.html": {
                    "kind": "tool",
                    "status": "reviewed",
                    "riskKind": "general",
                    "riskLevel": "low",
                    "reviewer": "Synthetic Reviewer, MD",
                    "reviewedAt": "2026-07-26",
                },
                "page.md": {
                    "kind": "page",
                    "status": "pending",
                    "riskKind": "clinical",
                    "riskLevel": "high",
                    "reviewer": "Pending faculty review",
                    "reviewedAt": "2026-07-26",
                    "reason": "Synthetic page review is pending",
                    "warning": "Synthetic page warning",
                },
            },
        }
        source = "<!doctype html><html><head><title>Synthetic</title></head><body><main>Tool</main></body></html>"
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            for slug in ("pending-high.html", "pending-moderate.html", "reviewed.html"):
                (tools / slug).write_text(source, encoding="utf-8")

            governance.apply_tool_status(tools, document)
            governance.apply_tool_status(tools, document)

            high = (tools / "pending-high.html").read_text(encoding="utf-8")
            moderate = (tools / "pending-moderate.html").read_text(encoding="utf-8")
            reviewed = (tools / "reviewed.html").read_text(encoding="utf-8")

        for rendered in (high, moderate, reviewed):
            self.assertEqual(rendered.count("SURFACE-GOVERNANCE:START"), 1)
            self.assertEqual(rendered.count("SURFACE-GOVERNANCE:END"), 1)
            self.assertEqual(rendered.count('id="surface-governance-style"'), 1)
            self.assertEqual(rendered.count('id="surface-governance-script"'), 1)
            self.assertIn("window.self!==window.top", rendered)
            self.assertIn("params.get('governed')==='1'", rendered)
        self.assertIn('role="alert"', high)
        self.assertIn("Verify decisions with your supervising clinician.", high)
        self.assertIn('role="status"', moderate)
        self.assertIn("Pending faculty review", moderate)
        self.assertIn("Synthetic &lt;unsafe&gt; &amp; pending", moderate)
        self.assertNotIn("<unsafe>", moderate)
        self.assertIn("Reviewed by Synthetic Reviewer, MD on 2026-07-26", reviewed)
        self.assertNotIn("Pending faculty review", reviewed)

    def test_pending_tool_without_safe_injection_points_fails_closed(self) -> None:
        document = {
            "schemaVersion": 1,
            "site": "resident",
            "items": {
                "synthetic.html": {
                    "kind": "tool",
                    "status": "pending",
                    "riskKind": "local-policy",
                    "riskLevel": "high",
                    "reviewer": "Pending faculty review",
                    "reviewedAt": "2026-07-26",
                    "reason": "Synthetic workflow review is pending",
                    "warning": "Synthetic fixed warning",
                }
            },
        }
        malformed_sources = (
            "<html><body>Missing head</body></html>",
            "<html><head></head>Missing body</html>",
        )
        for source in malformed_sources:
            with self.subTest(source=source), tempfile.TemporaryDirectory() as temporary:
                tools = Path(temporary)
                (tools / "synthetic.html").write_text(source, encoding="utf-8")

                with self.assertRaisesRegex(
                    governance.SurfaceGovernanceError,
                    r"^surface governance: synthetic[.]html cannot receive direct status$",
                ):
                    governance.apply_tool_status(tools, document)

    def test_site_document_write_is_sorted_and_atomic_at_the_public_boundary(self) -> None:
        document = {
            "schemaVersion": 1,
            "site": "ms3",
            "items": {
                "z.html": {"status": "reviewed"},
                "a.md": {"status": "pending"},
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "governance.json"

            governance.write_site_document(output, document)

            rendered = output.read_text(encoding="utf-8")
            self.assertEqual(json.loads(rendered), document)
            self.assertLess(rendered.index('"a.md"'), rendered.index('"z.html"'))
            self.assertTrue(rendered.endswith("\n"))
            self.assertEqual(
                list(output.parent.glob(".governance.json.*.tmp")),
                [],
            )


class ProposalCliTests(unittest.TestCase):
    def test_proposal_classifies_explicit_signals_without_mutating_the_ledger(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            faculty = root / "13_Faculty_Resources"
            faculty.mkdir(parents=True)
            ledger_path = faculty / "reviewed.json"
            ledger_path.write_text(
                '{\n'
                '  "general.md": {"status": "reviewed", "at": "2026-07-01", '
                '"by": "Synthetic Reviewer, MD"},\n'
                '  "cotw_case.md": {"status": "pending", "at": "2026-07-01", '
                '"by": "Synthetic Reviewer, MD"},\n'
                '  "high.md": {"status": "pending", "at": "2026-07-02", '
                '"by": "Synthetic Reviewer, MD"},\n'
                '  "local.html": {"status": "pending", "at": "2026-07-03", '
                '"by": "Synthetic Reviewer, MD"},\n'
                '  "rp-brief-psych.html": {"status": "pending", '
                '"at": "2026-07-03", "by": "Synthetic Reviewer, MD"}\n'
                '}\n',
                encoding="utf-8",
            )
            before = ledger_path.read_bytes()
            manifest = (
                faculty / "_automation/site_build/site_manifest.json"
            )
            manifest.parent.mkdir(parents=True)
            manifest.write_text(
                json.dumps(
                    {
                        "md": [
                            ["synthetic/general.md", "general.md", "General"],
                            ["synthetic/high.md", "high.md", "High"],
                        ],
                        "tools": [
                            ["synthetic/local.html", "local.html", "Local"],
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (root / "topic_meta.json").write_text(
                json.dumps({"high.md": {"safetyLevel": "high"}}),
                encoding="utf-8",
            )
            sources = {
                "synthetic/general.md": "# Synthetic general orientation",
                "synthetic/high.md": "# Synthetic clinical teaching",
                "08_Cases_and_Simulation/cotw_case.md": "# Synthetic case",
                "_prototypes/brief-psych/rp-brief-psych.html": (
                    "<!doctype html><title>Synthetic coaching tool</title>"
                ),
                "synthetic/local.html": (
                    '<!-- [CLERKSHIP-META v1] tool="synthetic-local" '
                    'audience="trainee" reviewCategory="local-policy" '
                    'safetySeverity="high" -->'
                ),
            }
            for relative, content in sources.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
            output = root / "risk-review.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--root",
                    str(root),
                    "--write-proposal",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(ledger_path.read_bytes(), before)
            self.assertTrue(
                output.exists(),
                "proposal CLI must write the explicitly requested worksheet",
            )
            proposal = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(
            proposal,
            [
                {
                    "slug": "cotw_case.md",
                    "status": "pending",
                    "risk": {"kind": "clinical", "level": "high"},
                    "basis": ["source path indicates high-risk clinical teaching"],
                    "facultyConfirmationRequired": True,
                },
                {
                    "slug": "general.md",
                    "status": "reviewed",
                    "risk": {"kind": "general", "level": "low"},
                    "basis": ["No explicit risk signal found"],
                    "facultyConfirmationRequired": True,
                },
                {
                    "slug": "high.md",
                    "status": "pending",
                    "risk": {"kind": "clinical", "level": "high"},
                    "basis": ["topic_meta.safetyLevel=high"],
                    "facultyConfirmationRequired": True,
                },
                {
                    "slug": "local.html",
                    "status": "pending",
                    "risk": {"kind": "local-policy", "level": "high"},
                    "basis": [
                        "metadata reviewCategory=local-policy",
                        "metadata safetySeverity=high",
                    ],
                    "facultyConfirmationRequired": True,
                },
                {
                    "slug": "rp-brief-psych.html",
                    "status": "pending",
                    "risk": {"kind": "clinical", "level": "moderate"},
                    "basis": ["source path indicates clinical teaching"],
                    "facultyConfirmationRequired": True,
                },
            ],
        )

    def test_confirmed_proposal_adds_only_risk_and_pending_review_context(
        self,
    ) -> None:
        self.assertTrue(
            hasattr(governance, "apply_confirmed_risk_proposal"),
            "surface_governance.py must apply a fully confirmed mapping",
        )
        ledger = {
            "reviewed.md": {
                "status": "reviewed",
                "at": "2026-07-01",
                "by": "Synthetic Reviewer, MD",
                "note": "Preserve this internal note.",
                "contentHash": "a" * 64,
            },
            "pending.html": {
                "status": "pending",
                "at": "2026-07-02",
                "by": "Historical Reviewer, MD",
                "claimsHash": "b" * 64,
            },
        }
        proposal = [
            {
                "slug": "pending.html",
                "status": "pending",
                "risk": {"kind": "clinical", "level": "high"},
                "basis": ["Synthetic confirmation basis"],
                "facultyConfirmationRequired": False,
            },
            {
                "slug": "reviewed.md",
                "status": "reviewed",
                "risk": {"kind": "general", "level": "low"},
                "basis": ["Synthetic confirmation basis"],
                "facultyConfirmationRequired": False,
            },
        ]
        original = deepcopy(ledger)

        migrated = governance.apply_confirmed_risk_proposal(ledger, proposal)

        self.assertEqual(ledger, original)
        self.assertEqual(set(migrated), set(ledger))
        self.assertEqual(
            {slug: (entry["status"], entry["at"]) for slug, entry in migrated.items()},
            {slug: (entry["status"], entry["at"]) for slug, entry in ledger.items()},
        )
        self.assertEqual(
            migrated["reviewed.md"],
            {
                **ledger["reviewed.md"],
                "risk": {"kind": "general", "level": "low"},
            },
        )
        self.assertEqual(
            migrated["pending.html"],
            {
                **ledger["pending.html"],
                "risk": {"kind": "clinical", "level": "high"},
                "by": "Pending faculty review",
                "reason": "Pending faculty review of this learner surface.",
            },
        )

    def test_unconfirmed_or_incomplete_proposals_cannot_change_the_ledger(self) -> None:
        ledger = {
            "synthetic.md": {
                "status": "reviewed",
                "at": "2026-07-01",
                "by": "Synthetic Reviewer, MD",
            }
        }
        cases = (
            (
                "unconfirmed",
                [{
                    "slug": "synthetic.md",
                    "status": "reviewed",
                    "risk": {"kind": "general", "level": "low"},
                    "facultyConfirmationRequired": True,
                }],
                "risk proposal: synthetic.md is not faculty-confirmed",
            ),
            (
                "missing-row",
                [],
                "risk proposal: ledger and proposal slugs differ",
            ),
            (
                "status-drift",
                [{
                    "slug": "synthetic.md",
                    "status": "pending",
                    "risk": {"kind": "general", "level": "low"},
                    "facultyConfirmationRequired": False,
                }],
                "risk proposal: synthetic.md review status changed",
            ),
        )
        for label, proposal, expected in cases:
            with self.subTest(label=label):
                before = deepcopy(ledger)
                with self.assertRaisesRegex(
                    governance.SurfaceGovernanceError,
                    f"^{expected.replace('.', '[.]')}$",
                ):
                    governance.apply_confirmed_risk_proposal(ledger, proposal)
                self.assertEqual(ledger, before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
