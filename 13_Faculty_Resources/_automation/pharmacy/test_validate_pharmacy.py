#!/usr/bin/env python3
"""Behavior tests for validate_pharmacy.py: each check is proved by BREAKING it.

The committed pharmacy.json must pass; then one mutation per check must fail with that
check's own tag. A check that cannot be made to fail is not a check (SILENT_SHRINK §F).
"""

import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402

PHARMACY = json.loads(vp.PHARMACY.read_text(encoding="utf-8"))
RECEIPT = json.loads(vp.RECEIPT.read_text(encoding="utf-8"))
FIELDMAP = json.loads(vp.FIELDMAP.read_text(encoding="utf-8"))


def run(pharmacy=None, receipt=None):
    findings, _ = vp.check(pharmacy or PHARMACY, receipt or RECEIPT, FIELDMAP)
    return findings


def first(pharmacy):
    return next(r for r in pharmacy["records"] if r["id"] == "lithium")


class ValidatePharmacyTest(unittest.TestCase):
    def mutate(self):
        return copy.deepcopy(PHARMACY)

    def assertTagged(self, findings, tag):
        self.assertTrue(findings, "mutation produced no finding")
        self.assertTrue(any(f.startswith(tag) for f in findings), findings)

    def test_committed_file_is_clean(self):
        self.assertEqual(run(), [])

    def test_committed_file_is_not_vacuous(self):
        self.assertGreaterEqual(len(PHARMACY["records"]), 5)
        spans = sum(len(v) for r in PHARMACY["records"] for v in r["provenance"]["jSources"].values())
        self.assertGreater(spans, 20)

    def test_label_mismatch_fails(self):
        data = self.mutate()
        first(data)["dailymedSetId"] = "00000000-0000-0000-0000-000000000000"
        self.assertTagged(run(data), "AC2")

    def test_boxed_warning_mismatch_fails(self):
        data = self.mutate()
        first(data)["boxedWarning"]["present"] = False
        self.assertTagged(run(data), "AC2")

    def test_missing_receipt_fails(self):
        receipt = copy.deepcopy(RECEIPT)
        del receipt["agents"]["lithium"]
        self.assertTagged(run(receipt=receipt), "AC2")

    def test_dose_literal_fails(self):
        data = self.mutate()
        first(data)["dosing"]["titration"] = "start at 300 mg"
        self.assertTagged(run(data), "AC4'")

    def test_denylisted_key_fails(self):
        data = self.mutate()
        first(data)["provenance"]["carried"]["absolute_max_dose"] = "x"
        self.assertTagged(run(data), "AC13")

    def test_unknown_evidence_id_fails(self):
        data = self.mutate()
        first(data)["evidenceIds"].append("no-such-source")
        self.assertTagged(run(data), "AC5")

    def test_unknown_qbank_id_fails(self):
        data = self.mutate()
        first(data)["qbankIds"].append("qb_nope_999")
        self.assertTagged(run(data), "AC5")

    def test_reworded_quote_fails(self):
        data = self.mutate()
        source = first(data)["provenance"]["jSources"]["pearls"][0]
        source["quote"] = source["quote"].replace("12-hour", "twelve-hour")
        self.assertTagged(run(data), "SPAN")

    def test_reconnect_quote_must_equal_carried(self):
        data = self.mutate()
        first(data)["provenance"]["jSources"]["familyExplainer.text"][0]["quote"] += " extra"
        self.assertTagged(run(data), "SPAN")

    def test_unsourced_judgment_field_fails(self):
        data = self.mutate()
        del first(data)["provenance"]["jSources"]["pearls"]
        self.assertTagged(run(data), "COVER")

    def test_hard_family_text_fails(self):
        data = self.mutate()
        first(data)["familyExplainer"]["text"] = (
            "Pharmacokinetic considerations necessitate comprehensive individualized "
            "therapeutic drug monitoring incorporating nephrological and endocrinological "
            "surveillance parameters.")
        self.assertTagged(run(data), "AC7")

    def test_review_hash_binds_j_fields(self):
        data = self.mutate()
        record = first(data)
        record["facultyReview"] = {"status": "reviewed", "reviewer": "x",
                                   "lastReviewed": "2026-09-29",
                                   "reviewedFieldsHash": vp.j_hash(record)}
        self.assertEqual(run(data), [])
        record["pearls"]["t1"][0] += " (edited)"
        self.assertTagged(run(data), "AC6")

    def test_fieldmap_denylist_covers_the_sync_engine(self):
        self.assertLessEqual(set(vp.ENGINE_DENYLIST), set(FIELDMAP["denylist"]))

    def test_l_field_edit_does_not_reopen_review(self):
        data = self.mutate()
        record = first(data)
        before = vp.j_hash(record)
        record["pk"]["halfLifeHours"] = "25"
        self.assertEqual(before, vp.j_hash(record))


if __name__ == "__main__":
    unittest.main(verbosity=2)
