"""The owner receipt cannot turn incomplete judgment into a passed run."""

import sys
import json
import re
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

AUTOMATION = Path(__file__).resolve().parents[2] / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance.record_red_team import (  # noqa: E402
    IncompleteReview, MANUAL_ROWS, build_receipt, record_interactive,
)

NOW = datetime(2026, 9, 27, 2, 0, tzinfo=timezone.utc)


def work():
    return {
        "state": "prepared", "packSha256": "a" * 64, "packVersion": "fixture",
        "model": "model-a", "packSourceCommit": "4" * 40,
        "deployments": {
            key: {"siteId": key, "deployId": key, "commitRef": "1" * 40,
                  "deployUrl": f"https://{key}.example", "publishedAt": "2026-09-27T01:00:00Z"}
            for key in ("proxy", "ms3", "res")},
        "runtime": {"actorModel": "model-a", "evaluatorModel": "model-a",
                    "realtimeEnabled": False, "realtimeModel": None,
                    "transcriptionModel": None, "managedVoiceEnabled": False,
                    "managedVoiceStack": None},
        "mechanical": {
            "tier1": {"state": "passed", "checkedAt": "2026-09-27T01:30:00Z",
                      "passes": 30, "total": 30, "sourceCommit": "1" * 40},
            "tier2": {"state": "passed", "checkedAt": "2026-09-27T01:30:00Z",
                      "checks": [{"id": key, "status": "pass"} for key in
                                 ("D0", "D1", "D1b", "D5", "B5")]},
        },
    }


def passing_rows(*sections):
    return {row_id: {"status": "pass", "reason": ""}
            for section in sections for row_id in MANUAL_ROWS[section]}


class ReceiptTests(unittest.TestCase):
    def test_manual_row_map_tracks_authoritative_checklist(self):
        checklist = (AUTOMATION.parents[1] / "sp-proxy" / "REDTEAM_CHECKLIST.md").read_text(encoding="utf-8")
        for section in ("A", "R", "V"):
            observed = tuple(re.findall(rf"^\| ({section}[0-9]+) \|", checklist, re.M))
            self.assertEqual(MANUAL_ROWS[section], observed)
        for section, mechanical in (("C", {"C3"}), ("D", {"D1", "D5"})):
            observed = set(re.findall(rf"^\| ({section}[0-9]+) \|", checklist, re.M))
            self.assertEqual(set(MANUAL_ROWS[section]) | mechanical, observed)

    def test_complete_voice_off_receipt_is_v2_with_exact_evidence(self):
        source = work()
        source["runtime"]["rawReply"] = "patient reply must not be copied"
        source["mechanical"]["tier2"]["rawLog"] = "patient reply must not be copied"
        receipt = build_receipt(source, passing_rows("A", "C", "D", "E"),
                                "Joshua Moss, MD", NOW)
        self.assertEqual(receipt["state"], "passed")
        self.assertEqual(receipt["schemaVersion"], 2)
        self.assertEqual(receipt["deployments"], source["deployments"])
        self.assertEqual(receipt["requiredSections"], ["A", "B", "C", "D", "E"])
        self.assertEqual(receipt["completedSections"], ["A", "B", "C", "D", "E"])
        self.assertEqual(receipt["checkedAt"], NOW.isoformat())
        self.assertEqual(receipt["packSourceCommit"], "4" * 40)
        self.assertEqual(receipt["checklist"], "sp-proxy/REDTEAM_CHECKLIST.md")
        self.assertNotIn("patient reply", json.dumps(receipt))

    def test_realtime_and_managed_voice_add_their_manual_rows(self):
        source = work()
        source["runtime"]["realtimeEnabled"] = True
        source["runtime"]["realtimeModel"] = "realtime-model"
        source["runtime"]["transcriptionModel"] = "transcribe-model"
        with self.assertRaisesRegex(IncompleteReview, "R"):
            build_receipt(source, passing_rows("A", "C", "D", "E"), "Owner", NOW)
        source = work()
        source["runtime"]["managedVoiceEnabled"] = True
        source["runtime"]["managedVoiceStack"] = {"id": "stack-a"}
        with self.assertRaisesRegex(IncompleteReview, "V"):
            build_receipt(source, passing_rows("A", "C", "D", "E"), "Owner", NOW)

    def test_unknown_activation_and_failed_mechanics_never_pass(self):
        source = work()
        source["runtime"]["realtimeEnabled"] = None
        with self.assertRaisesRegex(IncompleteReview, "activation unverified"):
            build_receipt(source, passing_rows("A", "C", "D", "E"), "Owner", NOW)
        source = work()
        source["mechanical"]["tier2"]["state"] = "failed"
        with self.assertRaisesRegex(IncompleteReview, "mechanical tier incomplete"):
            build_receipt(source, passing_rows("A", "C", "D", "E"), "Owner", NOW)
        source = work()
        source["mechanical"]["tier2"]["checks"][-1]["status"] = "skipped"
        with self.assertRaisesRegex(IncompleteReview, "mechanical tier incomplete"):
            build_receipt(source, passing_rows("A", "C", "D", "E"), "Owner", NOW)
        source = work()
        source["mechanical"]["tier1"]["sourceCommit"] = "2" * 40
        with self.assertRaisesRegex(IncompleteReview, "mechanical tier incomplete"):
            build_receipt(source, passing_rows("A", "C", "D", "E"), "Owner", NOW)

    def test_blocked_row_is_incomplete_even_when_owner_preserves_record(self):
        rows = passing_rows("A", "C", "D", "E")
        rows["C4"] = {"status": "blocked", "reason": "clinical_review_needed"}
        with self.assertRaisesRegex(IncompleteReview, "C4"):
            build_receipt(work(), rows, "Owner", NOW)
        receipt = build_receipt(work(), rows, "Owner", NOW, preserve_incomplete=True)
        self.assertEqual(receipt["state"], "incomplete")
        self.assertIn("C4", receipt["incompleteRows"])

    def test_identity_reason_and_timestamp_are_bounded(self):
        with self.assertRaisesRegex(IncompleteReview, "signedBy"):
            build_receipt(work(), passing_rows("A", "C", "D", "E"), " ", NOW)
        rows = passing_rows("A", "C", "D", "E")
        rows["C4"] = {"status": "fail", "reason": "x" * 241}
        with self.assertRaisesRegex(IncompleteReview, "reason"):
            build_receipt(work(), rows, "Owner", NOW, preserve_incomplete=True)
        rows["C4"] = {"status": "fail", "reason": "Patient said identifiable details"}
        with self.assertRaisesRegex(IncompleteReview, "content-free code"):
            build_receipt(work(), rows, "Owner", NOW, preserve_incomplete=True)
        with self.assertRaisesRegex(IncompleteReview, "timezone"):
            build_receipt(work(), passing_rows("A", "C", "D", "E"),
                          "Owner", datetime(2026, 9, 27))

    def test_interactive_record_requires_owner_phrase_and_preserves_incomplete(self):
        source = work()
        source["runtime"].update({"realtimeEnabled": True, "realtimeModel": "rt",
                                  "transcriptionModel": "tx"})
        manual_ids = [row for section in ("A", "C", "D", "E", "R")
                      for row in MANUAL_ROWS[section]]
        with tempfile.TemporaryDirectory() as directory:
            work_file = Path(directory) / "work.json"
            receipt_file = Path(directory) / "receipt.json"
            work_file.write_text(json.dumps(source), encoding="utf-8")
            answers = ["blocked" if row == "R1" else "pass" for row in manual_ids]
            answers.insert(manual_ids.index("R1") + 1, "clinical_review_needed")
            with patch("builtins.input", side_effect=answers + ["Owner", "no"]):
                self.assertEqual(record_interactive(work_file, receipt_file), 2)
            self.assertFalse(receipt_file.exists())
            with patch("builtins.input", side_effect=answers +
                       ["Owner", "Preserve incomplete review"]):
                self.assertEqual(record_interactive(work_file, receipt_file), 2)
            receipt = json.loads(receipt_file.read_text(encoding="utf-8"))
            self.assertEqual(receipt["state"], "incomplete")
            self.assertIn("R1", receipt["incompleteRows"])
            self.assertNotIn("fixture-passcode", receipt_file.read_text(encoding="utf-8"))

    def test_interactive_pass_refreshes_exact_production_before_writing(self):
        source = work()
        manual_ids = [row for section in ("A", "C", "D", "E")
                      for row in MANUAL_ROWS[section]]
        answers = ["pass"] * len(manual_ids) + ["Owner", "I attest this complete review"]
        with tempfile.TemporaryDirectory() as directory:
            work_file = Path(directory) / "work.json"
            receipt_file = Path(directory) / "receipt.json"
            work_file.write_text(json.dumps(source), encoding="utf-8")
            changed = {key: source[key] for key in
                       ("deployments", "packSha256", "packVersion", "model")}
            changed = json.loads(json.dumps(changed))
            changed["deployments"]["proxy"]["deployId"] = "later"
            with patch("builtins.input", side_effect=answers):
                self.assertEqual(record_interactive(work_file, receipt_file,
                                                     current_snapshot=lambda: changed), 2)
            self.assertFalse(receipt_file.exists())
            exact = {key: source[key] for key in
                     ("deployments", "packSha256", "packVersion", "model")}
            with patch("builtins.input", side_effect=answers):
                self.assertEqual(record_interactive(work_file, receipt_file,
                                                     current_snapshot=lambda: exact), 0)
            self.assertEqual(json.loads(receipt_file.read_text())["state"], "passed")


if __name__ == "__main__":
    unittest.main()
