#!/usr/bin/env python3
"""Contract tests for the safetySteps/safetyDoc fields on topic_meta.json.

Scoped deliberately: validate_topic_meta.py has no existing harness, and this
adds one only for the field this work introduces. Builds a minimal topic_meta in
a tmp dir and runs the validator as a subprocess, like test_validate_curriculum.py.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HERE, "validate_topic_meta.py")
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
TOPIC_META = os.path.join(REPO, "topic_meta.json")


def _page_keys():
    """Every page key the real topic_meta.json declares.

    validate_topic_meta.py resolves its sibling registries from __file__, not from
    the file it is handed, and checks their linkedPages against the topic keys of
    that handed file — unconditionally, before the per-topic loop. So a fixture
    holding only 'x.md' exits non-zero on a communication_cases.json linkedPages
    reference and never reaches the field under test. Seeding the fixture with the
    real key set (as empty objects, which the contract permits) satisfies that
    referential-integrity pass so each assertion below isolates safetySteps.
    """
    with open(TOPIC_META, encoding="utf-8") as fh:
        return [k for k in json.load(fh) if k != "_note"]


def _run(entry):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "topic_meta.json")
        doc = {"_note": "test"}
        for key in _page_keys():
            doc[key] = {}
        doc["x.md"] = entry
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh)
        return subprocess.run(
            [sys.executable, VALIDATOR, path], capture_output=True, text=True)


BASE = {"read": 4, "tldr": "t", "points": ["p"]}


class SafetyStepsTest(unittest.TestCase):
    def test_accepts_a_valid_safety_steps_block(self):
        e = dict(BASE, safetySteps=["a", "b", "c"], safetyDoc="what to chart")
        r = _run(e)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_safety_steps_that_is_not_a_list(self):
        r = _run(dict(BASE, safetySteps="a", safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_fewer_than_three_steps(self):
        r = _run(dict(BASE, safetySteps=["a", "b"], safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_more_than_five_steps(self):
        r = _run(dict(BASE, safetySteps=["a", "b", "c", "d", "e", "f"], safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_an_empty_step_string(self):
        r = _run(dict(BASE, safetySteps=["a", "", "c"], safetyDoc="d"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_safety_steps_requires_safety_doc(self):
        r = _run(dict(BASE, safetySteps=["a", "b", "c"]))
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetyDoc", r.stdout)


if __name__ == "__main__":
    unittest.main()
