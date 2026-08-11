#!/usr/bin/env python3
"""Behavior tests for the canonical surface-governance contract.

Everything here runs against synthetic fixtures written to a fresh temp
directory per test — never against the repo's real reviewed.json (which has
no risk fields yet; that migration is a later task). See
.superpowers/sdd/2026-07-26-risk-aware-publishing-warnings/task-1-brief.md.
"""

import json
import shutil
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

try:
    import surface_governance as governance
except ModuleNotFoundError:
    governance = None


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_SOURCE = ROOT / "13_Faculty_Resources" / "reviewed.schema.json"


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
    """Write a synthetic ledger + a copy of the real schema under root."""
    faculty = root / "13_Faculty_Resources"
    faculty.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SCHEMA_SOURCE, faculty / "reviewed.schema.json")
    (faculty / "reviewed.json").write_text(json.dumps(ledger), encoding="utf-8")


class LedgerValidationTests(unittest.TestCase):
    def test_module_and_schema_exist(self) -> None:
        self.assertIsNotNone(
            governance,
            "surface_governance.py must exist and import cleanly",
        )
        self.assertTrue(
            SCHEMA_SOURCE.exists(),
            "13_Faculty_Resources/reviewed.schema.json must exist",
        )

    def test_valid_reviewed_record_round_trips_unmodified(self) -> None:
        source = {"synthetic.md": reviewed_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, source)

            loaded = governance.load_validated_ledger(root)

        self.assertEqual(loaded, source)
        self.assertIsNot(loaded, source)

    def test_valid_pending_record_requires_explicit_reason_and_pending_reviewer(
        self,
    ) -> None:
        source = {"synthetic.html": pending_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, source)

            loaded = governance.load_validated_ledger(root)

        self.assertEqual(loaded, source)

    def test_multi_entry_ledger_with_mixed_status_loads_cleanly(self) -> None:
        source = {"a-reviewed.md": reviewed_entry(), "b-pending.html": pending_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, source)

            loaded = governance.load_validated_ledger(root)

        self.assertEqual(loaded, source)

    def test_invalid_records_fail_at_the_exact_field_without_echoing_values(
        self,
    ) -> None:
        cases = []

        missing_risk = reviewed_entry()
        del missing_risk["risk"]
        cases.append(("missing-risk", missing_risk, "/synthetic.md/risk", None))

        unknown_kind = reviewed_entry()
        unknown_kind["risk"]["kind"] = "sensitive-kind-value"
        cases.append(
            ("unknown-risk-kind", unknown_kind, "/synthetic.md/risk/kind", "sensitive-kind-value")
        )

        unknown_level = reviewed_entry()
        unknown_level["risk"]["level"] = "sensitive-level-value"
        cases.append(
            (
                "unknown-risk-level",
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
                "pending-non-pending-reviewer",
                pending_reviewer,
                "/synthetic.md/by",
                "Sensitive Unapproved Reviewer",
            )
        )

        reviewed_pending_label = reviewed_entry()
        reviewed_pending_label["by"] = "Pending faculty review"
        cases.append(
            ("reviewed-with-pending-label", reviewed_pending_label, "/synthetic.md/by", None)
        )

        invalid_date_format = reviewed_entry()
        invalid_date_format["at"] = "sensitive-invalid-date"
        cases.append(
            (
                "invalid-date-format",
                invalid_date_format,
                "/synthetic.md/at",
                "sensitive-invalid-date",
            )
        )

        invalid_calendar_date = reviewed_entry()
        invalid_calendar_date["at"] = "2026-02-30"  # matches the pattern, not a real day
        cases.append(
            ("invalid-calendar-date", invalid_calendar_date, "/synthetic.md/at", "2026-02-30")
        )

        future_date = reviewed_entry()
        future_date["at"] = "2999-01-01"
        cases.append(("future-date", future_date, "/synthetic.md/at", "2999-01-01"))

        future_evidence_through = reviewed_entry()
        future_evidence_through["evidenceThrough"] = "2999-01-01"
        cases.append(
            (
                "future-evidence-through",
                future_evidence_through,
                "/synthetic.md/evidenceThrough",
                "2999-01-01",
            )
        )

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

    def test_site_document_normalizes_entries_and_uses_fixed_high_risk_copy(
        self,
    ) -> None:
        reviewed = reviewed_entry()
        reviewed.update(
            {
                "note": "Internal faculty note — never shipped",
                "contentHash": "a" * 64,
                "claimsHash": "b" * 64,
                "evidenceHash": "c" * 64,
                "evidenceThrough": "2026-07-01",
            }
        )
        local_pending = pending_entry()  # kind=local-policy, level=high
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
                    {"t": "Local", "f": "local.html", "k": "tool", "hidden": True},
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
        # A hidden nav item still ships — "hidden" only affects sidebar linking.
        self.assertIn("local.html", document["items"])
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
            "This tool includes institution-specific teaching that has not "
            "completed faculty attestation. Verify current institutional "
            "policy or workflow before acting.",
        )
        self.assertEqual(
            document["items"]["clinical.md"]["warning"],
            "This page includes high-risk clinical teaching that has not "
            "completed faculty attestation. Verify decisions with your "
            "supervising clinician.",
        )
        self.assertEqual(
            document["items"]["moderate.md"]["warning"],
            "Synthetic formatting review is pending",
        )
        self.assertEqual(
            document["items"]["moderate.md"]["reason"],
            "Synthetic formatting review is pending",
        )
        serialized = json.dumps(document)
        self.assertNotIn("Internal faculty note", serialized)
        self.assertNotIn("a" * 64, serialized)
        self.assertNotIn("contentHash", serialized)
        self.assertNotIn("claimsHash", serialized)
        self.assertNotIn("evidenceHash", serialized)
        self.assertNotIn("evidenceThrough", serialized)

    def test_site_document_rejects_invalid_site_missing_record_and_kind_conflict(
        self,
    ) -> None:
        cases = (
            (
                "invalid-site",
                {"synthetic.md": reviewed_entry()},
                [{"section": "S", "items": [{"t": "T", "f": "synthetic.md", "k": "md"}]}],
                "surface governance: invalid site",
                "faculty-only",
            ),
            (
                "missing-record",
                {},
                [{"section": "S", "items": [{"t": "T", "f": "synthetic.md", "k": "md"}]}],
                "surface governance: synthetic.md missing ledger record",
                "ms3",
            ),
            (
                "kind-conflict",
                {"synthetic.md": reviewed_entry()},
                [
                    {
                        "section": "S",
                        "items": [
                            {"t": "T", "f": "synthetic.md", "k": "md"},
                            {"t": "T2", "f": "synthetic.md", "k": "tool"},
                        ],
                    }
                ],
                "surface governance: synthetic.md has conflicting kinds",
                "resident",
            ),
        )
        for label, ledger, nav, expected, site in cases:
            with self.subTest(label=label):
                with self.assertRaisesRegex(
                    governance.SurfaceGovernanceError, f"^{expected.replace('.', '[.]')}$"
                ):
                    governance.build_site_document(ledger, nav, site)

    def test_navigation_annotation_adds_governance_without_mutating_routes(
        self,
    ) -> None:
        nav = [
            {
                "section": "Synthetic",
                "items": [
                    {
                        "t": "Pending hidden tool",
                        "f": "synthetic.html",
                        "k": "tool",
                        "hidden": True,
                    },
                    {"t": "Reviewed page", "f": "synthetic.md", "k": "md"},
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
                },
                "synthetic.md": {
                    "kind": "page",
                    "status": "reviewed",
                    "riskKind": "general",
                    "riskLevel": "low",
                    "reviewer": "Synthetic Reviewer, MD",
                    "reviewedAt": "2026-07-26",
                },
            },
        }

        annotated = governance.annotate_navigation(nav, document)

        self.assertEqual(nav, original, "input nav must not be mutated")
        self.assertEqual(
            annotated[0]["items"][0]["governance"],
            {"status": "pending", "riskKind": "local-policy", "riskLevel": "high"},
        )
        self.assertEqual(
            annotated[0]["items"][1]["governance"],
            {"status": "reviewed", "riskKind": "general", "riskLevel": "low"},
        )
        for index in (0, 1):
            self.assertEqual(
                {key: annotated[0]["items"][index][key] for key in ("t", "f", "k")},
                {key: original[0]["items"][index][key] for key in ("t", "f", "k")},
            )
        self.assertEqual(annotated[0]["items"][0]["hidden"], True)

    def test_navigation_annotation_fails_closed_on_a_slug_missing_from_the_document(
        self,
    ) -> None:
        nav = [{"section": "S", "items": [{"t": "T", "f": "orphan.md", "k": "md"}]}]
        document = {"schemaVersion": 1, "site": "ms3", "items": {}}

        with self.assertRaisesRegex(
            governance.SurfaceGovernanceError,
            r"^surface governance: orphan[.]md missing site record$",
        ):
            governance.annotate_navigation(nav, document)


class DirectToolInjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(
            hasattr(governance, "apply_tool_status"),
            "surface_governance.py must inject direct-tool status",
        )
        self.assertTrue(
            hasattr(governance, "write_site_document"),
            "surface_governance.py must write deterministic site documents",
        )
        self.source = (
            "<!doctype html><html><head><title>Synthetic</title></head>"
            "<body><main>Tool</main></body></html>"
        )
        # Presentation-shaped entries (build_site_document's output shape),
        # not ledger-shaped ones — each test composes only the entries whose
        # files it actually writes, since apply_tool_status fails closed on
        # any "tool" kind entry in the document with no file on disk.
        self.pending_high_entry = {
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
        }
        self.pending_moderate_entry = {
            "kind": "tool",
            "status": "pending",
            "riskKind": "general",
            "riskLevel": "moderate",
            "reviewer": "Pending faculty review",
            "reviewedAt": "2026-07-26",
            "reason": "Synthetic <unsafe> & pending",
            "warning": "Synthetic <unsafe> & pending",
        }
        self.reviewed_tool_entry = {
            "kind": "tool",
            "status": "reviewed",
            "riskKind": "general",
            "riskLevel": "low",
            "reviewer": "Synthetic Reviewer, MD",
            "reviewedAt": "2026-07-26",
        }
        self.pending_page_entry = {
            "kind": "page",
            "status": "pending",
            "riskKind": "clinical",
            "riskLevel": "high",
            "reviewer": "Pending faculty review",
            "reviewedAt": "2026-07-26",
            "reason": "Synthetic page review is pending",
            "warning": "Synthetic page warning",
        }

    @staticmethod
    def _document(items: dict) -> dict:
        return {"schemaVersion": 1, "site": "ms3", "items": items}

    def test_pending_high_tool_gets_one_marker_delimited_alert_block(self) -> None:
        document = self._document({"pending-high.html": self.pending_high_entry})
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            (tools / "pending-high.html").write_text(self.source, encoding="utf-8")

            governance.apply_tool_status(tools, document)

            rendered = (tools / "pending-high.html").read_text(encoding="utf-8")

        self.assertEqual(rendered.count("<!-- SURFACE-GOVERNANCE:START -->"), 1)
        self.assertEqual(rendered.count("<!-- SURFACE-GOVERNANCE:END -->"), 1)
        self.assertIn('role="alert"', rendered)
        self.assertIn("Pending faculty review", rendered)
        self.assertIn(
            "Verify decisions with your supervising clinician.", rendered
        )
        self.assertIn("Synthetic clinical review is pending", rendered)

    def test_pending_moderate_tool_gets_compact_escaped_status(self) -> None:
        document = self._document({"pending-moderate.html": self.pending_moderate_entry})
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            (tools / "pending-moderate.html").write_text(self.source, encoding="utf-8")

            governance.apply_tool_status(tools, document)

            rendered = (tools / "pending-moderate.html").read_text(encoding="utf-8")

        self.assertIn('role="status"', rendered)
        self.assertNotIn('role="alert"', rendered)
        self.assertIn("Pending faculty review", rendered)
        self.assertIn("Synthetic &lt;unsafe&gt; &amp; pending", rendered)
        self.assertNotIn("<unsafe>", rendered)

    def test_reviewed_tool_gets_a_reviewer_and_date_receipt(self) -> None:
        document = self._document({"reviewed.html": self.reviewed_tool_entry})
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            (tools / "reviewed.html").write_text(self.source, encoding="utf-8")

            governance.apply_tool_status(tools, document)

            rendered = (tools / "reviewed.html").read_text(encoding="utf-8")

        self.assertIn("Reviewed by Synthetic Reviewer, MD on 2026-07-26", rendered)
        self.assertNotIn("Pending faculty review", rendered)
        self.assertIn('role="status"', rendered)

    def test_reinjection_replaces_the_prior_block_instead_of_duplicating(self) -> None:
        document = self._document(
            {
                "pending-high.html": self.pending_high_entry,
                "pending-moderate.html": self.pending_moderate_entry,
                "reviewed.html": self.reviewed_tool_entry,
            }
        )
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            for slug in ("pending-high.html", "pending-moderate.html", "reviewed.html"):
                (tools / slug).write_text(self.source, encoding="utf-8")

            governance.apply_tool_status(tools, document)
            governance.apply_tool_status(tools, document)

            for slug in ("pending-high.html", "pending-moderate.html", "reviewed.html"):
                rendered = (tools / slug).read_text(encoding="utf-8")
                self.assertEqual(
                    rendered.count("SURFACE-GOVERNANCE:START"), 1, slug
                )
                self.assertEqual(rendered.count("SURFACE-GOVERNANCE:END"), 1, slug)
                self.assertEqual(
                    rendered.count('id="surface-governance-style"'), 1, slug
                )
                self.assertEqual(
                    rendered.count('id="surface-governance-script"'), 1, slug
                )

    def test_direct_status_is_theme_aware_and_visible_by_default_at_top_level(
        self,
    ) -> None:
        # A top-level (non-iframe) load must always show the block: the CSS only
        # hides it under html.governed-embed, and the script only ever adds that
        # class when embedded *and* explicitly told ?governed=1.
        document = self._document({"pending-high.html": self.pending_high_entry})
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            (tools / "pending-high.html").write_text(self.source, encoding="utf-8")

            governance.apply_tool_status(tools, document)

            rendered = (tools / "pending-high.html").read_text(encoding="utf-8")

        self.assertIn("window.self!==window.top", rendered)
        self.assertIn("params.get('governed')==='1'", rendered)
        self.assertIn("html.governed-embed .surface-governance-direct{display:none", rendered)
        self.assertNotIn("surface-governance-direct{display:none", rendered.split("governed-embed")[0])
        self.assertIn('[data-theme="dark"]', rendered)
        # The script is defensive: a runtime failure must never silently hide a
        # warning that would otherwise show (fail visible, not fail hidden).
        self.assertIn("try{", rendered)
        self.assertIn("}catch(error){}", rendered)

    def test_pending_page_does_not_trigger_html_tool_injection(self) -> None:
        # Only a "page" kind entry — no "tool" entries at all — and no file on
        # disk for it either. If apply_tool_status mistakenly treated a page
        # like a tool, this would raise "built tool unavailable".
        document = self._document({"page.md": self.pending_page_entry})
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)

            governance.apply_tool_status(tools, document)

            self.assertEqual(list(tools.iterdir()), [])

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

                # Fail closed means unmodified, not partially/incorrectly written.
                self.assertEqual(
                    (tools / "synthetic.html").read_text(encoding="utf-8"), source
                )

    def test_apply_tool_status_rejects_a_slug_that_is_not_a_safe_basename(self) -> None:
        document = {
            "schemaVersion": 1,
            "site": "ms3",
            "items": {
                "../escape.html": {
                    "kind": "tool",
                    "status": "reviewed",
                    "riskKind": "general",
                    "riskLevel": "low",
                    "reviewer": "Synthetic Reviewer, MD",
                    "reviewedAt": "2026-07-26",
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            with self.assertRaisesRegex(
                governance.SurfaceGovernanceError, "invalid tool slug"
            ):
                governance.apply_tool_status(tools, document)

    def test_apply_tool_status_fails_closed_on_a_missing_built_tool(self) -> None:
        document = {
            "schemaVersion": 1,
            "site": "ms3",
            "items": {
                "missing.html": {
                    "kind": "tool",
                    "status": "reviewed",
                    "riskKind": "general",
                    "riskLevel": "low",
                    "reviewer": "Synthetic Reviewer, MD",
                    "reviewedAt": "2026-07-26",
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            tools = Path(temporary)
            with self.assertRaisesRegex(
                governance.SurfaceGovernanceError, "built tool unavailable"
            ):
                governance.apply_tool_status(tools, document)

    def test_site_document_write_is_sorted_atomic_and_newline_terminated(self) -> None:
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
        self.assertEqual(list(output.parent.glob(".governance.json.*.tmp")), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
