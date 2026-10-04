#!/usr/bin/env python3
"""Behavior tests for validate_pharmacy.py: each check is proved by BREAKING it.

The committed pharmacy.json must pass; then one mutation per check must fail with that
check's own tag. A check that cannot be made to fail is not a check (SILENT_SHRINK §F).
"""

import ast
import copy
import json
import shutil
import sys
import tempfile
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

    # AC4' revision 2 (2026-10-03): a lab or physiology value is not a dose; a dose still is.
    STILL_DOSES = (
        "start at 300 mg", "200 mg bid", "0.5 mg at bedtime", "25 mcg", "5 mL",
        "10 mg/kg", "300 mg/day", "2 mg/min IV push",
        "haloperidol decanoate 50 mg/mL",           # a product strength: no level is named
        "Levels were checked. Draw up 5 mg/mL",     # the cue sits in the PREVIOUS sentence
        "supplied at a concentration of 5 mg/mL",   # a level cue, vetoed by a product cue
        "available concentration range is 2-5 mg/mL",
        "each mL of oral solution contains 20 mg/mL",
    )
    LAB_VALUES = (
        "CRP >100 mg/L and troponin",               # OE clozapine card, 2026-10-02
        "mean difference, -43.98 mg/L",             # OE valproate card
        "fasting glucose 126 mg/dL",
        "avoid if GFR <30 mL/min",                  # OE duloxetine card
        "severe renal impairment, GFR <30 mL/minute",
        "trough plasma concentrations between 85 and 125 mcg/mL",
        "total valproate concentrations of 110 mcg/mL",
        "the epilepsy range of 50-100 mcg/mL",
        "serum level 0.5 mg / dL",
    )

    def test_doses_are_still_dose_literals(self):
        for text in self.STILL_DOSES:
            with self.subTest(text=text):
                self.assertTrue(vp.has_dose_literal(text))

    def test_lab_and_physiology_values_are_not_dose_literals(self):
        for text in self.LAB_VALUES:
            with self.subTest(text=text):
                self.assertEqual(vp.dose_literals(text), [])

    def test_a_dose_beside_a_lab_value_is_still_caught_and_masked(self):
        text = "If CRP >100 mg/L, hold; restart at 12.5 mg."
        self.assertEqual([literal for _, _, literal in vp.dose_literals(text)], ["12.5 mg"])
        self.assertEqual(vp.mask_dose_literals(text), "If CRP >100 mg/L, hold; restart at [dose].")

    def test_the_level_cue_window_is_bounded(self):
        self.assertFalse(vp.has_dose_literal("serum level 5 mg/mL"))
        self.assertTrue(vp.has_dose_literal("serum " + "x" * vp.LEVEL_CUE_WINDOW + " 5 mg/mL"))

    def test_check_passes_a_lab_value_and_fails_a_product_strength(self):  # AC4' through check()
        data = self.mutate()
        first(data)["dosing"]["titration"] = "hold if CRP >100 mg/L or GFR <30 mL/min"
        self.assertFalse([f for f in run(data) if f.startswith("AC4'")])
        first(data)["dosing"]["titration"] = "the vial is 5 mg/mL"
        self.assertTagged(run(data), "AC4'")

    def test_one_ac4_rule_for_every_pharmacy_tool(self):
        # The receipt writer masks with the validator's rule, so a lab value a card may carry
        # is not hidden from the reviewer and a dose is never written into the receipt.
        import verify_pharmacy_labels as labels
        self.assertEqual(labels.lead("Give 10 mg. Keep GFR >30 mL/min."),
                         "Give [dose]. Keep GFR >30 mL/min.")
        # ...and no other tool here carries its own copy of the unit regex to drift from it.
        for path in sorted(HERE.glob("*.py")):
            if path.name == "validate_pharmacy.py" or path.name.startswith("test_"):
                continue
            with self.subTest(tool=path.name):
                self.assertNotIn("mg|mcg", path.read_text(encoding="utf-8"))

    def test_denylisted_key_fails(self):
        data = self.mutate()
        first(data)["provenance"]["carried"]["absolute_max_dose"] = "x"
        self.assertTagged(run(data), "AC13")

    def test_denylisted_key_at_record_level_fails(self):  # #898: "top-level or nested"
        data = self.mutate()
        first(data)["starting_dose"] = "x"
        self.assertTagged(run(data), "AC13")

    def test_interaction_card_ids_resolve_against_the_interaction_cards_page(self):  # AC5
        data = self.mutate()
        first(data)["interactions"]["interactionCardIds"] = ["lithium"]
        self.assertEqual(run(data), [])
        first(data)["interactions"]["interactionCardIds"] = ["no-such-card"]
        self.assertTagged(run(data), "AC5")

    def test_oe_audio_ids_resolve_against_the_audio_manifest(self):  # AC5
        data = self.mutate()
        first(data)["oeAudioIds"] = ["03", "3"]  # leading zeros ignored, as in pairings.json
        self.assertEqual(run(data), [])
        first(data)["oeAudioIds"] = ["999"]
        self.assertTagged(run(data), "AC5")

    def test_off_card_ids_fail_when_their_target_cannot_be_read(self):  # AC5, fail closed
        data = self.mutate()
        first(data)["interactions"]["interactionCardIds"] = ["lithium"]
        first(data)["oeAudioIds"] = ["03"]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ("evidence_registry.json", "question_bank.json", "topic_meta.json"):
                shutil.copy(vp.ROOT / name, root / name)
            findings, _ = vp.check(data, RECEIPT, FIELDMAP, root=root)
        self.assertEqual(
            sorted(f.split(":")[1].strip().split(" ")[0] for f in findings
                   if f.startswith("AC5 lithium") and ("interaction" in f or "audio" in f)),
            ["audio", "interaction"],
        )

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

    def test_denylist_has_one_source_and_the_gate_never_imports_the_dev_only_sync(self):
        # The field map is the one denylist; sync_from_reconnect.py reads the same file
        # (pinned in test_sync_from_reconnect). A CI gate importing the dev-only sync would
        # blur the build-isolation line (C4 / BR3), so the validator must not.
        self.assertEqual(vp.FIELDMAP.name, "reconnect_meds_fieldmap.json")
        tree = ast.parse(Path(vp.__file__).read_text(encoding="utf-8"))
        imported = {alias.name for node in ast.walk(tree) if isinstance(node, ast.Import)
                    for alias in node.names}
        imported |= {node.module for node in ast.walk(tree)
                     if isinstance(node, ast.ImportFrom) and node.module}
        self.assertFalse({name for name in imported if "sync_from_reconnect" in name}, imported)
        for key in ("starting_dose", "typical_dose_min", "typical_dose_max", "absolute_max_dose",
                    "pregnancy_category", "goodrx_url", "cost_plus_price", "pharmacy_options",
                    "MaineCare Status", "Walmart $4 List", "Prior Auth Usually Required"):
            self.assertIn(key, FIELDMAP["denylist"])

    def test_l_field_edit_does_not_reopen_review(self):
        data = self.mutate()
        record = first(data)
        before = vp.j_hash(record)
        record["pk"]["halfLifeHours"] = "25"
        self.assertEqual(before, vp.j_hash(record))


if __name__ == "__main__":
    unittest.main(verbosity=2)
