#!/usr/bin/env python3
"""Behavior tests for the canonical surface-governance contract.

Everything here runs against synthetic fixtures written to a fresh temp
directory per test — never against the repo's real reviewed.json (which has
no risk fields yet; that migration is a later task). See
.superpowers/sdd/2026-07-26-risk-aware-publishing-warnings/task-1-brief.md
and task-3-brief.md (the BuildContractTests class below).
"""

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
SCHEMA_SOURCE = ROOT / "13_Faculty_Resources" / "reviewed.schema.json"
SURFACE_GOVERNANCE_MODULE = Path(__file__).with_name("surface_governance.py")

# site_build/ is a sibling directory (not a package), so it needs its own
# sys.path entry — same convention test_validate_claim_anchors.py already
# uses to import from this same directory.
SITE_BUILD_DIRECTORY = ROOT / "13_Faculty_Resources" / "_automation" / "site_build"
if str(SITE_BUILD_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SITE_BUILD_DIRECTORY))
try:
    import common as site_common
except ModuleNotFoundError:
    site_common = None


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


def legacy_reviewed_entry(at: str = "2026-07-01") -> dict:
    """A record in the CURRENT production reviewed.json shape -- no "risk"
    field at all. Distinct from reviewed_entry() above (which is already
    migrated to the Task 1 schema) because build_risk_proposal() reads the
    ledger exactly as it stands today, pre-migration."""
    return {"status": "reviewed", "at": at, "by": "Joshua Moss, MD"}


def legacy_pending_entry(at: str = "2026-07-01") -> dict:
    return {"status": "pending", "at": at, "by": "Joshua Moss, MD"}


# Minimal-but-parseable stand-ins for the real nav-building modules, each
# exercising ONE of the two literal shapes _extract_literal_nav_slugs()
# recognizes -- see that function's docstring. Neither needs to be
# runnable (surface_governance never executes them), only valid Python
# containing the exact literal patterns.
DEFAULT_MS3_NAV_SOURCE = (
    "def _md(t, f, hidden=False):\n"
    "    return {'t': t, 'f': f, 'k': 'md'}\n"
    "def _tool(f, t=None, hidden=None):\n"
    "    return {'t': t, 'f': f, 'k': 'tool'}\n"
    "nav = [{'section': 'S', 'items': ["
    "_md('Welcome', 'welcome.md'), _tool('mse.html', 'MSE')]}]\n"
)
DEFAULT_RESIDENT_NAV_SOURCE = (
    "nav = [{'section': 'S', 'items': ["
    "{'t': 'Welcome', 'f': 'welcome.md', 'k': 'md'}, "
    "{'t': 'MSE', 'f': 'mse.html', 'k': 'tool'}]}]\n"
)
DEFAULT_COTW_REGISTRY: dict = {"weeks": []}


def write_proposal_root(
    root: Path,
    ledger: dict,
    *,
    topic_meta: dict | None = None,
    tool_manifest_entries: list | None = None,
    ms3_nav_source: str = DEFAULT_MS3_NAV_SOURCE,
    resident_nav_source: str = DEFAULT_RESIDENT_NAV_SOURCE,
    cotw_registry: dict | None = None,
) -> None:
    """Write a full synthetic repository root for build_risk_proposal()/
    the --write-proposal CLI: reviewed.json (legacy shape, no schema
    needed since this path never validates against it), topic_meta.json,
    site_manifest.json, stand-in nav-building sources, and a Case of the
    Week registry. Every parameter defaults to a minimal-but-valid stand-in
    so a test only has to override the one piece it is exercising.
    """
    faculty = root / "13_Faculty_Resources"
    faculty.mkdir(parents=True, exist_ok=True)
    (faculty / "reviewed.json").write_text(json.dumps(ledger), encoding="utf-8")
    (root / "topic_meta.json").write_text(
        json.dumps(topic_meta if topic_meta is not None else {}), encoding="utf-8"
    )
    site_build = faculty / "_automation" / "site_build"
    site_build.mkdir(parents=True, exist_ok=True)
    manifest = {
        "tools": tool_manifest_entries if tool_manifest_entries is not None else [],
        "md": [],
    }
    (site_build / "site_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (site_build / "build_deploy.py").write_text(ms3_nav_source, encoding="utf-8")
    (site_build / "resident_section.py").write_text(resident_nav_source, encoding="utf-8")
    cotw_dir = root / "08_Cases_and_Simulation" / "case-of-the-week"
    cotw_dir.mkdir(parents=True, exist_ok=True)
    (cotw_dir / "cotw_registry.json").write_text(
        json.dumps(cotw_registry if cotw_registry is not None else DEFAULT_COTW_REGISTRY),
        encoding="utf-8",
    )


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

        general_high_risk = reviewed_entry()
        general_high_risk["risk"] = {"kind": "general", "level": "high"}
        cases.append(
            ("general-high-risk-forbidden", general_high_risk, "/synthetic.md/risk", None)
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

    def test_general_high_risk_is_rejected_without_echoing_the_forbidden_values(
        self,
    ) -> None:
        # 2026-08-12 faculty ruling: risk kind "general" at level "high" is
        # forbidden outright (see CONSERVATIVE_RISK's docstring in
        # surface_governance.py). Already covered by one row of the
        # table-driven test above; this is a dedicated, explicit proof that
        # neither "general" nor "high" -- the two forbidden values
        # themselves -- ever appear in the raised error, only the field
        # name ("risk").
        entry = reviewed_entry()
        entry["risk"] = {"kind": "general", "level": "high"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_ledger(root, {"synthetic.md": entry})

            with self.assertRaises(governance.SurfaceGovernanceError) as raised:
                governance.load_validated_ledger(root)

        message = str(raised.exception)
        self.assertEqual(message, "reviewed.json: synthetic.md invalid at /synthetic.md/risk")
        self.assertNotIn("general", message)
        self.assertNotIn("high", message)

    def test_general_low_and_general_moderate_remain_valid(self) -> None:
        # The ruling forbids exactly the general+high combination -- prove
        # it does not over-fire on "general" at any other level.
        for level in ("low", "moderate"):
            with self.subTest(level=level):
                with tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    entry = reviewed_entry()
                    entry["risk"] = {"kind": "general", "level": level}
                    write_ledger(root, {"synthetic.md": entry})

                    loaded = governance.load_validated_ledger(root)

                self.assertEqual(
                    loaded["synthetic.md"]["risk"], {"kind": "general", "level": level}
                )


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


class BuildContractTests(unittest.TestCase):
    """End-to-end build-contract assertions (task-3-brief.md, Step 1).

    Unlike the unit-level tests above, these exercise the full sequence a
    site build actually runs — load_validated_ledger -> build_site_document
    -> annotate_navigation -> common.build_search_index -> apply_tool_status
    -> write_site_document — against a synthetic nav/tools/ledger tree, and
    read every assertion back off the artifacts written to disk (never off
    the in-memory objects only), so a wiring mistake in the disk-facing
    functions can't hide behind an in-memory-only check.
    """

    def setUp(self) -> None:
        self.assertIsNotNone(site_common, "common.py (site_build/) must import cleanly")

    @staticmethod
    def _write_tool(tools_dir: Path, slug: str) -> None:
        (tools_dir / slug).write_text(
            "<!doctype html><html><head><title>Synthetic</title></head>"
            "<body><main>Tool body</main></body></html>",
            encoding="utf-8",
        )

    def test_governance_artifact_contains_every_nav_slug_exactly_once(self) -> None:
        ledger = {
            "page.md": reviewed_entry(),
            "pending-high.html": pending_entry(),
            "pending-moderate.html": {
                **pending_entry(),
                "risk": {"kind": "general", "level": "moderate"},
                "reason": "Synthetic moderate review is pending",
            },
            "reviewed-tool.html": reviewed_entry(),
            # In the ledger but never referenced by nav — must NOT appear in
            # the artifact (build_site_document's own documented contract),
            # so "exactly once" also means "never a phantom extra entry".
            "unshipped.md": reviewed_entry(),
        }
        nav = [
            {
                "section": "First",
                "items": [
                    {"t": "Page", "f": "page.md", "k": "md"},
                    {"t": "Pending high", "f": "pending-high.html", "k": "tool"},
                ],
            },
            {
                "section": "Second",
                # "page.md" is linked again from a second section — a real
                # nav does this (e.g. a page reachable from two menus); the
                # artifact must still carry exactly one record for it.
                "items": [
                    {"t": "Page again", "f": "page.md", "k": "md"},
                    {"t": "Pending moderate", "f": "pending-moderate.html", "k": "tool"},
                    {"t": "Reviewed tool", "f": "reviewed-tool.html", "k": "tool"},
                ],
            },
        ]

        document = governance.build_site_document(ledger, nav, "ms3")
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "governance.json"
            governance.write_site_document(output, document)
            artifact = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(
            set(artifact["items"]),
            {"page.md", "pending-high.html", "pending-moderate.html", "reviewed-tool.html"},
        )
        self.assertNotIn("unshipped.md", artifact["items"])
        self.assertEqual(len(artifact["items"]), 4)

    def test_internal_ledger_fields_are_absent_from_the_written_artifact(self) -> None:
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
        ledger = {"synthetic.md": reviewed}
        nav = [{"section": "S", "items": [{"t": "T", "f": "synthetic.md", "k": "md"}]}]

        document = governance.build_site_document(ledger, nav, "ms3")
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "governance.json"
            governance.write_site_document(output, document)
            # Read the RAW file text, not the in-memory document — this is
            # the artifact a learner's browser would actually receive.
            raw = output.read_text(encoding="utf-8")

        self.assertNotIn("Internal faculty note", raw)
        self.assertNotIn("a" * 64, raw)
        self.assertNotIn("contentHash", raw)
        self.assertNotIn("claimsHash", raw)
        self.assertNotIn("evidenceHash", raw)
        self.assertNotIn("evidenceThrough", raw)

    def test_nav_and_search_governance_triplets_match_the_written_artifact(self) -> None:
        ledger = {
            "page.md": reviewed_entry(),
            "hidden-tool.html": pending_entry(),
        }
        nav = [
            {
                "section": "S",
                "items": [
                    {"t": "Page", "f": "page.md", "k": "md"},
                    # Hidden items still ship and still carry governance, but
                    # common.build_search_index() deliberately excludes them
                    # from the search index (they stay reachable by direct
                    # link only) — the artifact/nav/search triplet contract
                    # must hold for the two that are indexed AND account for
                    # the one that (correctly) is not.
                    {"t": "Hidden", "f": "hidden-tool.html", "k": "tool", "hidden": True},
                ],
            }
        ]

        document = governance.build_site_document(ledger, nav, "ms3")
        annotated = governance.annotate_navigation(nav, document)

        with tempfile.TemporaryDirectory() as temporary:
            out_dir = Path(temporary)
            governance_path = out_dir / "governance.json"
            governance.write_site_document(governance_path, document)
            site_common.build_search_index(annotated, str(out_dir), label="test")

            artifact = json.loads(governance_path.read_text(encoding="utf-8"))
            search_index = json.loads((out_dir / "search-index.json").read_text(encoding="utf-8"))

        def triplet_from_artifact(slug: str) -> dict:
            entry = artifact["items"][slug]
            return {
                "status": entry["status"],
                "riskKind": entry["riskKind"],
                "riskLevel": entry["riskLevel"],
            }

        for section in annotated:
            for item in section["items"]:
                self.assertEqual(item["governance"], triplet_from_artifact(item["f"]), item["f"])

        search_docs_by_slug = {doc["f"]: doc for doc in search_index["docs"]}
        self.assertIn("page.md", search_docs_by_slug)
        self.assertEqual(
            search_docs_by_slug["page.md"]["governance"], triplet_from_artifact("page.md")
        )
        # The hidden tool is governed (present in the artifact and on its nav
        # item) but must not leak into the search index at all.
        self.assertIn("hidden-tool.html", artifact["items"])
        self.assertNotIn("hidden-tool.html", search_docs_by_slug)

    def test_pending_tool_gets_the_marker_and_reviewed_tool_gets_a_receipt_not_pending_copy(
        self,
    ) -> None:
        ledger = {
            "pending-high.html": pending_entry(),
            "reviewed-tool.html": reviewed_entry(),
        }
        nav = [
            {
                "section": "S",
                "items": [
                    {"t": "Pending", "f": "pending-high.html", "k": "tool"},
                    {"t": "Reviewed", "f": "reviewed-tool.html", "k": "tool"},
                ],
            }
        ]
        document = governance.build_site_document(ledger, nav, "ms3")

        with tempfile.TemporaryDirectory() as temporary:
            out_dir = Path(temporary)
            tools_dir = out_dir / "tools"
            tools_dir.mkdir()
            self._write_tool(tools_dir, "pending-high.html")
            self._write_tool(tools_dir, "reviewed-tool.html")

            governance.apply_tool_status(tools_dir, document)
            governance.write_site_document(out_dir / "governance.json", document)

            pending_rendered = (tools_dir / "pending-high.html").read_text(encoding="utf-8")
            reviewed_rendered = (tools_dir / "reviewed-tool.html").read_text(encoding="utf-8")

        self.assertEqual(pending_rendered.count(governance.STATUS_START), 1)
        self.assertIn("Pending faculty review", pending_rendered)
        self.assertIn('role="alert"', pending_rendered)

        self.assertEqual(reviewed_rendered.count(governance.STATUS_START), 1)
        self.assertIn("Reviewed by Synthetic Reviewer, MD on 2026-07-26", reviewed_rendered)
        self.assertNotIn("Pending faculty review", reviewed_rendered)

    def test_rerunning_resident_injection_replaces_inherited_ms3_blocks(self) -> None:
        # Mirrors the real pipeline: build_deploy.py (site="ms3") injects
        # into a shared tool; resident_section.py copytrees the MS3 build
        # (inheriting that already-injected file byte-for-byte), then
        # applies its OWN, differently-scoped document for the SAME slug.
        # The rerun must fully replace the inherited block, not stack a
        # second one and not leave any MS3-specific text behind.
        ms3_ledger = {
            "mse.html": {
                "status": "pending",
                "risk": {"kind": "clinical", "level": "high"},
                "reason": "MS3-ONLY synthetic reason — must not survive the resident rerun",
                "at": "2026-07-20",
                "by": "Pending faculty review",
            }
        }
        ms3_nav = [{"section": "S", "items": [{"t": "MSE", "f": "mse.html", "k": "tool"}]}]
        ms3_document = governance.build_site_document(ms3_ledger, ms3_nav, "ms3")

        resident_ledger = {
            "mse.html": {
                "status": "reviewed",
                "risk": {"kind": "clinical", "level": "high"},
                "at": "2026-07-28",
                "by": "Resident Synthetic Reviewer, MD",
            }
        }
        resident_nav = [{"section": "S", "items": [{"t": "MSE", "f": "mse.html", "k": "tool"}]}]
        resident_document = governance.build_site_document(
            resident_ledger, resident_nav, "resident"
        )

        with tempfile.TemporaryDirectory() as temporary:
            tools_dir = Path(temporary)
            self._write_tool(tools_dir, "mse.html")

            governance.apply_tool_status(tools_dir, ms3_document)
            after_ms3 = (tools_dir / "mse.html").read_text(encoding="utf-8")

            governance.apply_tool_status(tools_dir, resident_document)
            after_resident = (tools_dir / "mse.html").read_text(encoding="utf-8")

        # Sanity: the MS3 pass actually injected its own reason first.
        self.assertIn("MS3-ONLY synthetic reason", after_ms3)

        # A rerun replaces, never stacks, the injected block.
        self.assertEqual(after_resident.count(governance.STATUS_START), 1)
        self.assertEqual(after_resident.count(governance.STATUS_END), 1)
        self.assertEqual(after_resident.count('id="surface-governance-style"'), 1)
        self.assertEqual(after_resident.count('id="surface-governance-script"'), 1)

        # No trace of the inherited MS3 block's content survives.
        self.assertNotIn("MS3-ONLY synthetic reason", after_resident)
        self.assertNotIn("Pending faculty review", after_resident)

        # The final block reflects only the resident document.
        self.assertIn("Reviewed by Resident Synthetic Reviewer, MD on 2026-07-28", after_resident)


class RiskProposalTests(unittest.TestCase):
    """--write-proposal (task-6-brief.md, Steps 1-2): a non-mutating CLI
    mode that proposes a risk{kind,level} for every CURRENT (pre-migration)
    reviewed.json record. Every fixture here is synthetic, written fresh
    per test via write_proposal_root() -- consistent with this file's own
    module docstring, this class also never reads or writes the repo's
    real reviewed.json.
    """

    def setUp(self) -> None:
        self.assertTrue(
            hasattr(governance, "build_risk_proposal"),
            "surface_governance.py must build the risk-proposal worksheet",
        )
        self.assertTrue(
            hasattr(governance, "write_risk_proposal"),
            "surface_governance.py must write the risk-proposal worksheet",
        )

    # ---- byte-preservation fixture (the brief's explicit Step 2 test) ----

    def test_write_proposal_never_mutates_reviewed_json_bytes(self) -> None:
        ledger = {
            "welcome.md": legacy_reviewed_entry(),
            "mse.html": legacy_pending_entry(),
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)
            reviewed_path = root / "13_Faculty_Resources" / "reviewed.json"
            before = reviewed_path.read_bytes()

            # Exercise both the pure builder AND the real CLI entry point --
            # a mutation introduced in either path must be caught here.
            governance.build_risk_proposal(root)
            output_path = root / "proposal.json"
            exit_code = governance.main(
                ["--root", str(root), "--write-proposal", str(output_path)]
            )

            after = reviewed_path.read_bytes()

        self.assertEqual(exit_code, 0)
        self.assertEqual(before, after, "reviewed.json bytes must be unchanged")

    def test_cli_subprocess_never_mutates_reviewed_json_bytes(self) -> None:
        # The in-process test above proves the Python-level contract; this
        # proves the literal command shape the brief documents actually
        # behaves the same way as a real, separate process.
        ledger = {"welcome.md": legacy_reviewed_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)
            reviewed_path = root / "13_Faculty_Resources" / "reviewed.json"
            before = reviewed_path.read_bytes()
            output_path = root / "proposal.json"

            completed = subprocess.run(
                [
                    sys.executable,
                    str(SURFACE_GOVERNANCE_MODULE),
                    "--root",
                    str(root),
                    "--write-proposal",
                    str(output_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            after = reviewed_path.read_bytes()
            output_exists = output_path.exists()

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(before, after)
        self.assertTrue(output_exists)

    # ---- explicit-signal classification ----

    def test_local_policy_pack_signal_proposes_local_policy_high_without_confirmation(
        self,
    ) -> None:
        ledger = {"rp-synthetic.html": legacy_pending_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(
                root,
                ledger,
                tool_manifest_entries=[
                    ["_prototypes/synthetic/rp-synthetic.html", "rp-synthetic.html", "Synthetic"]
                ],
            )
            tool_dir = root / "_prototypes" / "synthetic"
            tool_dir.mkdir(parents=True)
            (tool_dir / "rp-synthetic.html").write_text("<html></html>", encoding="utf-8")
            (tool_dir / "rp-synthetic.pack.json").write_text(
                json.dumps(
                    {
                        "localPolicies": [
                            {"type": "LOCAL_POLICY", "id": "x.y", "value": "Confirm locally"}
                        ]
                    }
                ),
                encoding="utf-8",
            )

            proposal = governance.build_risk_proposal(root)

        row = next(r for r in proposal["proposals"] if r["slug"] == "rp-synthetic.html")
        self.assertEqual(row["risk"], {"kind": "local-policy", "level": "high"})
        self.assertFalse(row["facultyConfirmationRequired"])
        self.assertNotIn("note", row)
        self.assertIn("LOCAL_POLICY", row["basis"])

    def test_tool_with_no_local_policies_key_is_not_flagged(self) -> None:
        # A pack.json that simply has no "localPolicies" key at all (like
        # the real sp-interview.pack.json) must not be mistaken for a
        # signal -- only a non-empty declared list counts.
        ledger = {"rp-synthetic.html": legacy_pending_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(
                root,
                ledger,
                tool_manifest_entries=[
                    ["_prototypes/synthetic/rp-synthetic.html", "rp-synthetic.html", "Synthetic"]
                ],
            )
            tool_dir = root / "_prototypes" / "synthetic"
            tool_dir.mkdir(parents=True)
            (tool_dir / "rp-synthetic.html").write_text("<html></html>", encoding="utf-8")
            (tool_dir / "rp-synthetic.pack.json").write_text(
                json.dumps({"schemaVersion": 1}), encoding="utf-8"
            )

            proposal = governance.build_risk_proposal(root)

        row = next(r for r in proposal["proposals"] if r["slug"] == "rp-synthetic.html")
        self.assertEqual(row["risk"], governance.CONSERVATIVE_RISK)
        self.assertTrue(row["facultyConfirmationRequired"])

    def test_topic_meta_safety_level_high_proposes_clinical_high_without_confirmation(
        self,
    ) -> None:
        ledger = {"t_synthetic.md": legacy_reviewed_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(
                root, ledger, topic_meta={"t_synthetic.md": {"safetyLevel": "high"}}
            )

            proposal = governance.build_risk_proposal(root)

        row = next(r for r in proposal["proposals"] if r["slug"] == "t_synthetic.md")
        self.assertEqual(row["risk"], {"kind": "clinical", "level": "high"})
        self.assertFalse(row["facultyConfirmationRequired"])
        self.assertNotIn("note", row)
        self.assertIn("safetyLevel", row["basis"])

    def test_topic_meta_safety_level_moderate_is_not_an_explicit_signal(self) -> None:
        ledger = {"t_synthetic.md": legacy_reviewed_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(
                root, ledger, topic_meta={"t_synthetic.md": {"safetyLevel": "moderate"}}
            )

            proposal = governance.build_risk_proposal(root)

        row = next(r for r in proposal["proposals"] if r["slug"] == "t_synthetic.md")
        self.assertEqual(row["risk"], governance.CONSERVATIVE_RISK)
        self.assertTrue(row["facultyConfirmationRequired"])

    # ---- conservative fallback + the 2026-08-12 general/high design ruling ----

    def test_unclassified_slug_proposes_conservative_clinical_high_and_forces_confirmation(
        self,
    ) -> None:
        # Post-ruling, the conservative default is clinical/high (a
        # schema-legal, assume-the-worst combination that carries fixed
        # supervision copy) rather than general/high (now schema-forbidden
        # outright -- see reviewed.schema.json).
        ledger = {"unclassified.md": legacy_reviewed_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)

            proposal = governance.build_risk_proposal(root)

        row = next(r for r in proposal["proposals"] if r["slug"] == "unclassified.md")
        self.assertEqual(row["risk"], {"kind": "clinical", "level": "high"})
        self.assertTrue(row["facultyConfirmationRequired"])
        self.assertIn("note", row)
        self.assertIn("conservative default", row["note"])
        self.assertIn("clinical/high", row["note"])

    def test_topic_meta_signaled_clinical_high_is_never_confused_with_the_conservative_default(
        self,
    ) -> None:
        # The explicit topic_meta.json signal and the conservative fallback
        # can now propose the identical {kind, level} pair (clinical/high).
        # Only the ORIGIN may distinguish them: a real signal must still
        # skip confirmation and carry no note, even though its risk dict is
        # == CONSERVATIVE_RISK by value.
        ledger = {
            "signaled.md": legacy_reviewed_entry(),
            "unsignaled.md": legacy_reviewed_entry(),
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(
                root, ledger, topic_meta={"signaled.md": {"safetyLevel": "high"}}
            )

            proposal = governance.build_risk_proposal(root)

        rows = {row["slug"]: row for row in proposal["proposals"]}
        self.assertEqual(rows["signaled.md"]["risk"], {"kind": "clinical", "level": "high"})
        self.assertEqual(rows["unsignaled.md"]["risk"], {"kind": "clinical", "level": "high"})
        self.assertFalse(rows["signaled.md"]["facultyConfirmationRequired"])
        self.assertTrue(rows["unsignaled.md"]["facultyConfirmationRequired"])
        self.assertNotIn("note", rows["signaled.md"])
        self.assertIn("note", rows["unsignaled.md"])

    # ---- ledger coverage + determinism ----

    def test_write_proposal_covers_every_ledger_slug_exactly_once_and_sorted(self) -> None:
        ledger = {
            "z-page.md": legacy_reviewed_entry(),
            "a-tool.html": legacy_pending_entry(),
            "m-page.md": legacy_reviewed_entry(),
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)

            proposal = governance.build_risk_proposal(root)

        slugs = [row["slug"] for row in proposal["proposals"]]
        self.assertEqual(slugs, sorted(slugs))
        self.assertEqual(set(slugs), set(ledger))
        self.assertEqual(len(slugs), len(ledger))

    def test_proposal_header_records_measured_inventory(self) -> None:
        ledger = {
            "a.md": legacy_reviewed_entry(),
            "b.md": legacy_reviewed_entry(),
            "c.html": legacy_pending_entry(),
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)

            proposal = governance.build_risk_proposal(root)

        self.assertEqual(proposal["schemaVersion"], 1)
        self.assertEqual(
            proposal["measuredInventory"],
            {"entries": 3, "statuses": {"reviewed": 2, "pending": 1}},
        )

    def test_cli_write_proposal_output_is_deterministic_across_reruns(self) -> None:
        ledger = {"z.md": legacy_reviewed_entry(), "a.html": legacy_pending_entry()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)
            output = root / "proposal.json"

            governance.main(["--root", str(root), "--write-proposal", str(output)])
            first = output.read_bytes()
            governance.main(["--root", str(root), "--write-proposal", str(output)])
            second = output.read_bytes()

        self.assertEqual(first, second)
        self.assertTrue(first.endswith(b"\n"))
        parsed = json.loads(first)
        self.assertEqual(list(parsed), sorted(parsed))

    # ---- nav-missing flagging (add-with-pending candidates) ----

    def test_nav_slugs_missing_from_ledger_are_flagged_as_add_with_pending(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, {})  # empty ledger: every nav slug is missing

            proposal = governance.build_risk_proposal(root)

        missing_by_slug = {row["slug"]: row for row in proposal["navMissing"]}
        # The default ms3 fixture ships welcome.md + mse.html; ms3's own
        # always-on week1..week6.md special case (see _MS3_WEEK_SLUGS) adds
        # six more regardless of nav source content -- both are legitimate
        # "missing from an empty ledger" rows, not test noise.
        expected_slugs = {"welcome.md", "mse.html"} | {"week%d.md" % i for i in range(1, 7)}
        self.assertEqual(set(missing_by_slug), expected_slugs)
        for row in missing_by_slug.values():
            self.assertEqual(row["status"], "missing")
            self.assertEqual(row["proposedStatus"], "pending")
            self.assertTrue(row["facultyConfirmationRequired"])
        self.assertEqual(sorted(missing_by_slug["welcome.md"]["sites"]), ["ms3", "resident"])
        self.assertEqual(sorted(missing_by_slug["mse.html"]["sites"]), ["ms3", "resident"])
        self.assertEqual(missing_by_slug["welcome.md"]["kind"], "page")
        self.assertEqual(missing_by_slug["mse.html"]["kind"], "tool")
        self.assertEqual(missing_by_slug["week1.md"]["sites"], ["ms3"])

    def test_nav_slug_present_in_ledger_is_not_flagged_as_missing(self) -> None:
        ledger = {
            "welcome.md": legacy_reviewed_entry(),
            "mse.html": legacy_pending_entry(),
            **{"week%d.md" % i: legacy_reviewed_entry() for i in range(1, 7)},
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, ledger)

            proposal = governance.build_risk_proposal(root)

        self.assertEqual(proposal["navMissing"], [])

    def test_cotw_and_call_style_nav_items_are_recognized_by_the_static_extractor(
        self,
    ) -> None:
        cotw_registry = {"weeks": [{"date": "2026-01-05", "topic": "demo", "label": "Demo"}]}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, {}, cotw_registry=cotw_registry)

            proposal = governance.build_risk_proposal(root)

        missing_slugs = {row["slug"] for row in proposal["navMissing"]}
        # The Case of the Week comprehension's computed slug (not a literal
        # the AST walk can see) is supplied by _cotw_nav_slugs() instead.
        self.assertIn("cotw_20260105_demo_ms3.md", missing_slugs)
        self.assertIn("cotw_20260105_demo_res.md", missing_slugs)
        # ms3's week1..week6 special case (build_deploy.py's OWN computed
        # slug, invisible to the static extractor for the same reason).
        self.assertIn("week1.md", missing_slugs)
        week_row = next(r for r in proposal["navMissing"] if r["slug"] == "week1.md")
        self.assertEqual(week_row["sites"], ["ms3"])

    def test_write_proposal_cli_requires_the_write_proposal_flag(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(root, {"welcome.md": legacy_reviewed_entry()})

            completed = subprocess.run(
                [sys.executable, str(SURFACE_GOVERNANCE_MODULE), "--root", str(root)],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(completed.returncode, 0)

    def test_unparseable_nav_source_fails_closed_with_a_clean_error(self) -> None:
        # A syntax error in build_deploy.py/resident_section.py must raise
        # SurfaceGovernanceError (caught and cleanly reported by main()),
        # never an uncaught SyntaxError traceback.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_proposal_root(
                root, {"welcome.md": legacy_reviewed_entry()}, ms3_nav_source="nav = [\n"
            )

            with self.assertRaisesRegex(
                governance.SurfaceGovernanceError, r"^build_deploy[.]py: unparseable$"
            ):
                governance.build_risk_proposal(root)


if __name__ == "__main__":
    unittest.main(verbosity=2)
