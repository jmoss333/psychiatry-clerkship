#!/usr/bin/env python3
"""The pharmacy page never shows a drug whose faculty review is invalid.

Each way a review can be invalid is constructed and must keep the drug (and every RX# card
for it) out of pharmacy_public.json, which is the only pharmacy data the site ships:
  * never reviewed (status pending)
  * reviewed, then a J field edited (hash no longer matches)
  * status "reviewed" with no hash, a wrong hash, or a hash for a different drug
  * a valid J review but an edited ask mapping (asks withheld, defaults kept)
The projection's own verify() must also catch a hand-tampered projection.

A card's practice-question links follow the learner question bank: a question withheld from
learners (a draft under revision, or retired) is not listed, and comes back by itself when it
is attested again. The registry keeps the link either way.
"""

import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_pharmacy_public as pub  # noqa: E402
import validate_pharmacy as vp  # noqa: E402

SOURCE = json.loads(vp.PHARMACY.read_text(encoding="utf-8"))


def record(rid):
    return copy.deepcopy(next(r for r in SOURCE["records"] if r["id"] == rid))


def signed(rec, mapping=True):
    rec = copy.deepcopy(rec)
    rec["facultyReview"] = {"status": "reviewed", "reviewer": "T", "lastReviewed": "2026-09-29",
                            "reviewedFieldsHash": vp.j_hash(rec)}
    if mapping:
        rec["facultyReview"]["retrievalHash"] = vp.retrieval_hash(rec)
    return rec


def pending(rec):
    rec = copy.deepcopy(rec)
    rec["facultyReview"] = {"status": "pending"}
    return rec


def shown(*records):
    projection = pub.project({"records": list(records)})
    return projection, {a["id"] for a in projection["agents"]}, {c["drug"] for c in projection["cards"]}


class InvalidReviewNeverShips(unittest.TestCase):
    def assertHidden(self, rec):
        _, agents, drugs = shown(signed(record("sertraline")), rec)
        self.assertNotIn(rec["id"], agents)
        self.assertNotIn(rec["id"], drugs)
        self.assertIn("sertraline", agents)  # the control still ships

    def test_pending_drug_is_hidden(self):
        self.assertHidden(pending(record("lithium")))

    def test_j_edit_after_review_hides_the_drug(self):
        rec = signed(record("lithium"))
        rec["pearls"]["t1"][0] += " (edited after sign-off)"
        self.assertHidden(rec)

    def test_every_single_j_field_edit_hides_the_drug(self):
        base = signed(record("clozapine"))
        classes = base["provenance"]["fieldClasses"]
        j_paths = [p for p in sorted(classes) if classes[p] == "J" and vp.get_path(base, p) is not None]
        self.assertTrue(j_paths)
        for path in j_paths:
            rec = copy.deepcopy(base)
            parts = path.split(".")
            node = rec
            for part in parts[:-1]:
                node = node[part]
            node[parts[-1]] = {"tampered": path}
            with self.subTest(path=path):
                self.assertHidden(rec)

    def test_reviewed_status_without_valid_hash_is_hidden(self):
        other = vp.j_hash(record("sertraline"))
        for bad in (None, "", "0" * 64, other):
            rec = signed(record("lithium"))
            if bad is None:
                del rec["facultyReview"]["reviewedFieldsHash"]
            else:
                rec["facultyReview"]["reviewedFieldsHash"] = bad
            with self.subTest(hash=bad):
                self.assertHidden(rec)

    def test_edited_ask_mapping_withholds_asks_only(self):
        rec = signed(record("lithium"))
        rec["retrieval"][0]["revealFrom"] = ["pk.halfLifeHours"]
        projection, agents, _ = shown(rec)
        self.assertIn("lithium", agents)
        kinds = {c["kind"] for c in projection["cards"]}
        self.assertEqual(kinds, {"default"})

    def test_live_registry_ships_only_valid_reviews(self):
        projection = pub.project(SOURCE)
        valid = {r["id"] for r in SOURCE["records"] if pub.review_valid(r)}
        self.assertEqual({a["id"] for a in projection["agents"]}, valid)
        self.assertEqual(projection["pendingCount"], len(SOURCE["records"]) - len(valid))
        self.assertEqual(pub.verify(projection, SOURCE), [])


class ProjectionSelfCheck(unittest.TestCase):
    def test_verify_catches_a_smuggled_drug(self):
        projection = pub.project({"records": [signed(record("sertraline"))]})
        projection["agents"].append(pub.public_record(signed(record("lithium"))))
        source = {"records": [signed(record("sertraline")), pending(record("lithium"))]}
        self.assertTrue(any("lithium" in p for p in pub.verify(projection, source)))

    def test_verify_catches_an_orphan_card(self):
        projection = pub.project({"records": [signed(record("sertraline"))]})
        projection["cards"].append({"id": "RX#lithium#boxed", "drug": "lithium", "kind": "default"})
        problems = pub.verify(projection, {"records": [signed(record("sertraline"))]})
        self.assertTrue(any("RX#lithium#boxed" in p for p in problems))

    def test_no_internal_fields_or_dose_literals(self):
        text = json.dumps(pub.project({"records": [signed(record(r["id"])) for r in SOURCE["records"]]}))
        for leaked in ("reviewedFieldsHash", "retrievalHash", "provenance", "fieldClasses"):
            self.assertNotIn(leaked, text)
        self.assertEqual(vp.dose_literals(text), [])

    def test_review_stamp_is_shown(self):
        agent = pub.project({"records": [signed(record("lithium"))]})["agents"][0]
        self.assertEqual(agent["review"], {"reviewer": "T", "lastReviewed": "2026-09-29"})


class WithheldQuestionsAreNotLinked(unittest.TestCase):
    """PR #1197: demoting a linked question to draft failed both site builds."""

    def setUp(self):
        self.rec = signed(record("lithium"))
        self.linked = list(self.rec["qbankIds"])
        self.assertGreaterEqual(len(self.linked), 2, "fixture needs a card with two linked questions")

    def test_a_withheld_question_drops_off_the_card_and_the_rest_stay(self):
        released = frozenset(self.linked[1:])
        agent = pub.project({"records": [self.rec]}, released)["agents"][0]
        self.assertEqual(agent["qbankIds"], self.linked[1:])
        self.assertNotIn(self.linked[0], json.dumps(agent))

    def test_it_returns_when_released_again_and_the_registry_is_untouched(self):
        before = copy.deepcopy(self.rec)
        pub.project({"records": [self.rec]}, frozenset())
        self.assertEqual(self.rec, before)
        agent = pub.project({"records": [self.rec]}, frozenset(self.linked))["agents"][0]
        self.assertEqual(agent["qbankIds"], self.linked)

    def test_a_card_with_no_released_question_has_no_link_list(self):
        agent = pub.project({"records": [self.rec]}, frozenset())["agents"][0]
        self.assertNotIn("qbankIds", agent)

    def test_the_drug_and_its_cards_ship_regardless(self):
        full = pub.project({"records": [self.rec]}, frozenset(self.linked))
        none = pub.project({"records": [self.rec]}, frozenset())
        self.assertEqual(none["cards"], full["cards"])
        self.assertEqual([a["id"] for a in none["agents"]], ["lithium"])

    def test_verify_catches_a_smuggled_withheld_link(self):
        projection = pub.project({"records": [self.rec]}, frozenset(self.linked))
        problems = pub.verify(projection, {"records": [self.rec]}, frozenset(self.linked[1:]))
        self.assertTrue(any("withholds" in p for p in problems), problems)

    def test_shipped_bytes_list_only_released_questions(self):
        released = pub.released_qbank_ids()
        for agent in json.loads(pub.feed_bytes())["agents"]:
            self.assertLessEqual(set(agent.get("qbankIds", [])), released, agent["id"])

    def test_an_unreadable_bank_fails_closed(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "pharmacy.json").write_text(json.dumps(SOURCE), encoding="utf-8")
            with self.assertRaises(ValueError):
                pub.feed_bytes(tmp)
            (Path(tmp) / "question_bank.json").write_text("{not json", encoding="utf-8")
            with self.assertRaises(ValueError):
                pub.feed_bytes(tmp)


if __name__ == "__main__":
    unittest.main(verbosity=1)
