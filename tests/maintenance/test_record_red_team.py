import json
import sys
import unittest
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTOMATION = ROOT / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance.record_red_team import build_receipt  # noqa: E402


class BuildReceiptTests(unittest.TestCase):
    def test_receipt_matches_monthly_review_contract(self):
        pack_bytes = json.dumps(
            {"version": "0.1.0", "engine": {"modelPinned": "claude-haiku-4-5-20251001"}}
        ).encode("utf-8")
        now = datetime(2026, 8, 2, 15, 0, tzinfo=timezone.utc)
        receipt = build_receipt(
            pack_bytes, "passed", "Joshua Moss, MD", ["A", "B", "C", "D", "E"], now
        )
        self.assertEqual(receipt["state"], "passed")
        self.assertEqual(receipt["checkedAt"], "2026-08-02T15:00:00+00:00")
        self.assertEqual(receipt["packSha256"], sha256(pack_bytes).hexdigest())
        self.assertEqual(receipt["packVersion"], "0.1.0")
        self.assertEqual(receipt["model"], "claude-haiku-4-5-20251001")
        self.assertEqual(receipt["sections"], ["A", "B", "C", "D", "E"])
        self.assertEqual(receipt["signedBy"], "Joshua Moss, MD")
        self.assertEqual(receipt["checklist"], "sp-proxy/REDTEAM_CHECKLIST.md")

    def test_timestamp_is_timezone_aware(self):
        # monthly_review compares checkedAt with the pack's git %cI timestamp;
        # a naive datetime would raise TypeError inside the steward.
        receipt = build_receipt(b"{}", "passed", "x", ["A"], datetime.now(timezone.utc))
        self.assertIsNotNone(datetime.fromisoformat(receipt["checkedAt"]).tzinfo)


if __name__ == "__main__":
    unittest.main()
