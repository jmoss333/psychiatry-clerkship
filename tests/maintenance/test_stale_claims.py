"""Unit tests for bin/check_stale_claims.py.

`--self-test` already proves each rule can fail and stays silent on the good case;
these cover what a self-test cannot: the real file/JSON boundaries, the receipt
contract the monthly review depends on, and the parser corners that decide whether a
claim is even seen.
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "check_stale_claims", ROOT / "bin" / "check_stale_claims.py"
)
CSC = importlib.util.module_from_spec(_spec)
sys.modules["check_stale_claims"] = CSC
_spec.loader.exec_module(CSC)

TODAY = date(2026, 9, 10)


class SelfTestPasses(unittest.TestCase):
    def test_self_test_returns_zero(self):
        """If --self-test ever fails, every other assertion here is suspect."""
        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = CSC.self_test()
        self.assertEqual(rc, 0, buf.getvalue())
        self.assertIn("self-test:", buf.getvalue())


class BlockScoping(unittest.TestCase):
    """A stamp must not vouch for a neighbour it never checked."""

    def test_one_stamp_does_not_cover_a_sibling_list_item(self):
        text = (
            "1. Do NOT use the Netlify MCP; it 404s them.\n"
            "2. Do NOT use the metrics API; it 404s them. Re-verified 2026-09-01.\n"
        )
        findings, _ = CSC.claim_findings("s.md", text, TODAY)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["line"], 1)
        self.assertEqual(findings[0]["state"], "unstamped")

    def test_a_stamp_covers_its_own_wrapped_item(self):
        text = (
            "2. Do NOT use the Netlify MCP for these sites,\n"
            "   because it 404s them. Re-verified 2026-09-01.\n"
        )
        self.assertEqual(CSC.claim_findings("s.md", text, TODAY)[0], [])

    def test_setext_and_rule_lines_do_not_split_a_block(self):
        text = "Do NOT use the Netlify MCP.\n---\nRe-verified 2026-09-01.\n"
        self.assertEqual(CSC.claim_findings("s.md", text, TODAY)[0], [])


class ClaimBoundary(unittest.TestCase):
    def test_reads_skill_files_from_disk_and_reports_the_relative_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill = root / ".claude" / "skills" / "demo"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text(
                "Do NOT use the Netlify MCP; it 404s them.\n", encoding="utf-8"
            )
            findings, scanned, suppressed = CSC.collect_claims(root, TODAY)
        self.assertEqual(scanned, 1)
        self.assertEqual(suppressed, 0)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["path"], ".claude/skills/demo/SKILL.md")

    def test_an_unreadable_skill_file_is_unknown_not_clean(self):
        """Silence about a file nobody could read is the failure mode this whole
        tool exists to prevent, so it must not read as a pass."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill = root / ".claude" / "skills" / "demo"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_bytes(b"\xff\xfe not utf-8 \xff")
            findings, scanned, _ = CSC.collect_claims(root, TODAY)
        self.assertEqual(scanned, 1)
        self.assertEqual([f["state"] for f in findings], ["unknown"])

    def test_no_skill_files_is_clean_but_reports_a_zero_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            findings, scanned, _ = CSC.collect_claims(Path(tmp), TODAY)
        self.assertEqual((findings, scanned), ([], 0))


class StampParsing(unittest.TestCase):
    def test_accepts_the_verbs_the_skills_actually_use(self):
        for phrase in (
            "verified 2026-09-01",
            "re-verified 2026-09-01",
            "checked 2026-09-01",
            "confirmed 2026-09-01",
            "found 2026-09-01",
        ):
            self.assertEqual(
                CSC.newest_stamp([phrase]), date(2026, 9, 1), phrase
            )

    def test_ignores_a_bare_date_with_no_verb(self):
        """A date is not a verification. `retired on 2026-09-03` says when something
        happened, not when anyone last checked it."""
        self.assertIsNone(CSC.newest_stamp(["retired on 2026-09-03"]))

    def test_boundary_is_inclusive_of_the_window(self):
        text = "Do NOT use the Netlify MCP; it 404s them. Verified 2026-06-12."
        # 2026-06-12 -> 2026-09-10 is exactly 90 days: still inside the window.
        self.assertEqual(CSC.claim_findings("s.md", text, TODAY)[0], [])
        text = "Do NOT use the Netlify MCP; it 404s them. Verified 2026-06-11."
        self.assertEqual(len(CSC.claim_findings("s.md", text, TODAY)[0]), 1)


class AuditBoundary(unittest.TestCase):
    def test_a_nonzero_count_at_any_severity_but_info_is_a_finding(self):
        for sev in ("low", "moderate", "high", "critical"):
            got = CSC.audit_findings([{"dir": "d", "ok": True, "counts": {sev: 1}}])
            self.assertEqual(len(got), 1, sev)
            self.assertEqual(got[0]["counts"], {sev: 1})

    def test_counts_are_sorted_so_output_is_deterministic(self):
        got = CSC.audit_findings(
            [{"dir": "d", "ok": True, "counts": {"moderate": 2, "critical": 1}}]
        )
        self.assertEqual(list(got[0]["counts"]), ["critical", "moderate"])


class ReceiptContract(unittest.TestCase):
    """monthly_review._receipt_state reads exactly these fields."""

    def test_receipt_has_the_shape_the_monthly_review_ages(self):
        summary = {
            "skillFilesScanned": 2,
            "suppressedBlocks": 1,
            "manifestsAudited": 4,
            "branchesScanned": 107,
            "worktreesScanned": 33,
        }
        with tempfile.TemporaryDirectory() as tmp:
            original = CSC.RECEIPT
            try:
                CSC.RECEIPT = Path(tmp) / "receipts" / "stale-claims.json"
                CSC.write_receipt(summary)
                payload = json.loads(CSC.RECEIPT.read_text(encoding="utf-8"))
            finally:
                CSC.RECEIPT = original
        self.assertEqual(payload["state"], "success")
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertTrue(payload["checkedAt"].endswith("Z"))
        for key, value in summary.items():
            self.assertEqual(payload[key], value, key)
        # Content-free: counts only. The claims themselves live in the files.
        self.assertNotIn("findings", payload)


if __name__ == "__main__":
    unittest.main()
