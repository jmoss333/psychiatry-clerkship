#!/usr/bin/env python3
"""Behavior tests for the evidence-literacy drill generator."""

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATOR = Path(__file__).with_name("generate_evidence_drill.py")
OUT = ROOT / "13_Faculty_Resources/_automation/generated/evidence_drill.json"

sys.path.insert(0, str(Path(__file__).parent))
import generate_evidence_drill as gen  # noqa: E402


class GeneratedFileContract(unittest.TestCase):
    def test_committed_file_is_not_stale(self):
        """--check is the CI gate: anchors change, the drill regenerates."""
        result = subprocess.run(
            [sys.executable, str(GENERATOR), str(ROOT), "--check"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_generation_is_deterministic(self):
        """Same inputs, byte-identical output — so a diff means anchors moved."""
        self.assertEqual(gen.build(ROOT), gen.build(ROOT))

    def test_every_item_is_a_draft(self):
        """Generated clinical content must never reach a learner unreviewed."""
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        self.assertTrue(payload["items"])
        for item in payload["items"]:
            self.assertEqual(item["status"], "draft", item["id"])

    def test_each_item_has_exactly_one_correct_option(self):
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        for item in payload["items"]:
            correct = [o for o in item["options"] if o.get("c")]
            self.assertEqual(len(correct), 1, item["id"])
            self.assertEqual(correct[0]["sourceId"], item["sourceId"], item["id"])

    def test_options_are_distinct_and_keyed(self):
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        for item in payload["items"]:
            ids = [o["sourceId"] for o in item["options"]]
            self.assertEqual(len(ids), len(set(ids)), item["id"])
            self.assertEqual([o["key"] for o in item["options"]], list("ABCD")[: len(ids)])

    def test_every_source_id_resolves_to_the_registry(self):
        registry = json.loads((ROOT / "evidence_registry.json").read_text(encoding="utf-8"))
        known = {s["id"] for s in registry["sources"]}
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        for item in payload["items"]:
            self.assertIn(item["sourceId"], known, item["id"])
            for opt in item["options"]:
                self.assertIn(opt["sourceId"], known, item["id"])

    def test_explanation_carries_the_registry_note(self):
        """The whole point: the explanation is the verification record."""
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        registry = json.loads((ROOT / "evidence_registry.json").read_text(encoding="utf-8"))
        notes = {s["id"]: (s.get("identity") or {}).get("note", "") for s in registry["sources"]}
        for item in payload["items"]:
            self.assertEqual(item["why"], notes[item["sourceId"]], item["id"])

    def test_claims_carry_no_markdown_or_anchors(self):
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        for item in payload["items"]:
            claim = item["claim"]
            self.assertNotIn("[^", claim, item["id"])
            self.assertNotIn("**", claim, item["id"])
            self.assertTrue(claim.strip(), item["id"])


class ScopeExtraction(unittest.TestCase):
    def test_pulls_the_does_not_support_sentence(self):
        note = (
            "PMID 12345 resolved and matches. "
            "Scope note: covers atypical agents only and does not support a claim about typicals."
        )
        self.assertIn("does not support", gen.scope_sentence(note))

    def test_falls_back_when_no_scope_clause(self):
        self.assertEqual(gen.scope_sentence("PMID 12345 resolved and matches."), "")

    def test_mckeith_item_warns_about_the_decoy_pmid(self):
        """The near-identical 'Author response' record is the trap worth teaching."""
        payload = json.loads(OUT.read_text(encoding="utf-8"))
        item = next(i for i in payload["items"] if i["sourceId"] == "mckeith-2017-dlb-consensus")
        self.assertIn("29438029", item["why"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
