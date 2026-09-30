#!/usr/bin/env python3
"""Behavior tests for build_rx_deck.py: the deck reveals only attested text, behind two gates.

Each gate is proved by breaking it: an unreviewed card, a J edit after review, and an
unreviewed or edited ask mapping must each withhold exactly the cards they govern.
"""

import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_rx_deck as deck  # noqa: E402
import validate_pharmacy as vp  # noqa: E402

PHARMACY = json.loads(vp.PHARMACY.read_text(encoding="utf-8"))


def attested(record, mapping=True):
    """A copy of `record` with valid review blocks, as the console would write them."""
    rec = copy.deepcopy(record)
    rec["facultyReview"] = {"status": "reviewed", "reviewer": "T", "lastReviewed": "2026-09-29",
                            "reviewedFieldsHash": vp.j_hash(rec)}
    if mapping:
        rec["facultyReview"]["retrievalHash"] = vp.retrieval_hash(rec)
    return rec


def lithium():
    """The committed lithium card with its review blocks REMOVED.

    Never read live governance state in a test (CLAUDE.md): the committed record is
    pending on the feature branch and reviewed once attest/pending lands, and a test
    that assumed either would turn red when the faculty queue moved.
    """
    rec = copy.deepcopy(next(r for r in PHARMACY["records"] if r["id"] == "lithium"))
    rec["facultyReview"] = {"status": "pending"}
    return rec


def ids(built):
    return [c["id"] for c in built["cards"]]


class BuildDeckTest(unittest.TestCase):
    def test_committed_deck_is_current(self):
        self.assertEqual(deck.main(["--check"]), 0)

    def test_unreviewed_card_yields_no_cards(self):
        built = deck.build({"records": [lithium()]})
        self.assertEqual(built["cards"], [])
        self.assertEqual(built["withheld"][0]["drug"], "lithium")

    def test_reviewed_card_yields_defaults_and_asks(self):
        built = deck.build({"records": [attested(lithium())]})
        self.assertIn("RX#lithium#boxed", ids(built))
        self.assertIn("RX#lithium#ask0", ids(built))
        self.assertEqual(built["withheld"], [])

    def test_j_edit_after_review_withdraws_every_card(self):
        rec = attested(lithium())
        rec["pearls"]["t1"][0] += " (edited)"
        self.assertEqual(deck.build({"records": [rec]})["cards"], [])

    def test_unreviewed_mapping_withholds_asks_only(self):
        built = deck.build({"records": [attested(lithium(), mapping=False)]})
        kinds = {c["kind"] for c in built["cards"]}
        self.assertEqual(kinds, {"default"})
        self.assertIn("ask mapping", built["withheld"][0]["reason"])

    def test_remapping_after_review_withholds_asks(self):
        rec = attested(lithium())
        rec["retrieval"][0]["revealFrom"] = ["pk.halfLifeHours"]
        kinds = {c["kind"] for c in deck.build({"records": [rec]})["cards"]}
        self.assertEqual(kinds, {"default"})

    def test_reworded_ask_after_review_withdraws_the_card(self):
        rec = attested(lithium())
        rec["attendingAsks"][0] = "A different question"
        # attendingAsks is itself a J field, so a reworded ask voids the whole card review —
        # stricter than withholding the asks alone, and the right answer.
        self.assertEqual(deck.build({"records": [rec]})["cards"], [])

    def test_reveal_is_verbatim_card_text(self):
        rec = attested(lithium())
        card = next(c for c in deck.build({"records": [rec]})["cards"] if c["id"] == "RX#lithium#boxed")
        self.assertEqual(card["reveal"][0]["lines"], [rec["boxedWarning"]["summary"]])
        card = next(c for c in deck.build({"records": [rec]})["cards"] if c["id"] == "RX#lithium#ask0")
        self.assertEqual(card["reveal"][0]["lines"], [rec["pearls"]["t1"][0]])

    def test_missing_field_drops_prompt_not_shows_empty(self):
        rec = lithium()
        rec = copy.deepcopy(rec)
        del rec["boxedWarning"]["summary"]
        rec = attested(rec)
        self.assertNotIn("RX#lithium#boxed", ids(deck.build({"records": [rec]})))

    def test_unmapped_asks_are_reported(self):
        rec = copy.deepcopy(lithium())
        rec["retrieval"] = [e for e in rec["retrieval"] if e["askIndex"] != 1]
        built = deck.build({"records": [rec]})
        self.assertEqual(built["unmapped"], [{"drug": "lithium", "askIndex": 1,
                                              "ask": rec["attendingAsks"][1]}])

    def test_deck_has_no_dose_literal(self):
        text = deck.render(deck.build({"records": [attested(r) for r in PHARMACY["records"]]}))
        self.assertIsNone(vp.DOSE_RE.search(text))


if __name__ == "__main__":
    unittest.main(verbosity=2)
