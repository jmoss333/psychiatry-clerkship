#!/usr/bin/env python3
"""Contract tests for the safetySteps/safetyDoc fields on topic_meta.json.

Scoped deliberately: validate_topic_meta.py has no existing harness, and this
adds one only for the field this work introduces. Builds a minimal topic_meta in
a tmp dir and runs the validator as a subprocess, like test_validate_curriculum.py.
"""
import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest

from jsonschema import Draft7Validator

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

SCRIPT = {
    "label": "Come now", "identify": "This is [your name], [your role].",
    "situation": "Situation [what you saw].", "background": "Background.",
    "assessment": "Assessment.", "recommendation": "Recommendation.",
    "readBack": "Read back [their instructions].",
}

# A minimal valid tree: two questions, two actions, both scripts. Mutations below break exactly
# one rule each.
TREE = {
    "start": "q1",
    "nodes": [
        {"id": "q1", "ask": "Question one?", "hint": "Hint.",
         "options": [{"label": "Yes", "next": "a1"}, {"label": "No", "next": "q2"}]},
        {"id": "q2", "ask": "Question two?",
         "options": [{"label": "Left", "next": "a1"}, {"label": "Right", "next": "a2"}]},
        {"id": "a1", "title": "Act one", "tone": "danger", "act": ["Do one."],
         "escalate": "now", "see": ["other.md"]},
        {"id": "a2", "title": "Act two", "tone": "first", "act": ["Do two."], "escalate": "soon"},
    ],
    "scripts": {"now": SCRIPT, "soon": dict(SCRIPT, label="See today")},
}


class SafetyTreeSchemaTest(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(REPO, "topic_meta.schema.json"), encoding="utf-8") as fh:
            self.validator = Draft7Validator(json.load(fh))

    def errors(self, tree):
        return list(self.validator.iter_errors({"x.md": dict(BASE, safetyTree=tree)}))

    def test_accepts_a_valid_tree(self):
        self.assertEqual(self.errors(TREE), [])

    def test_rejects_a_tree_without_a_now_script(self):
        tree = copy.deepcopy(TREE)
        del tree["scripts"]["now"]
        self.assertTrue(self.errors(tree))

    def test_rejects_a_node_that_mixes_question_and_action_keys(self):
        tree = copy.deepcopy(TREE)
        tree["nodes"][0]["title"] = "Both"
        self.assertTrue(self.errors(tree))

    def test_rejects_an_unknown_tree_key(self):
        self.assertTrue(self.errors(dict(TREE, extra=True)))

    def test_the_soon_script_is_checked_through_its_ref(self):
        tree = copy.deepcopy(TREE)
        del tree["scripts"]["soon"]["readBack"]
        self.assertTrue(self.errors(tree))


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


class CommunicationChoiceTest(unittest.TestCase):
    def run_choices(self, mutate):
        with open(os.path.join(REPO, "communication_cases.json"), encoding="utf-8") as fh:
            cases = json.load(fh)
        pilot = next(c for c in cases["cases"] if c["id"] == "teach_back_closing_001")
        # The optional-field validator can land before the authored pilot content.
        # Exercise its contract with a fixture independent of that delivery order.
        pilot["secondPass"] = {
            "prompt": "Second-pass fixture",
            "choices": copy.deepcopy(pilot["choices"]),
            "listenFor": "Second-pass fixture guidance",
        }
        mutate(pilot)
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "communication_cases.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(cases, fh)
            with open(VALIDATOR, encoding="utf-8") as fh:
                source = fh.read()
            binding = 'communication_cases_path = os.path.join(repo_root, "communication_cases.json")'
            self.assertIn(binding, source)
            # Redirect only this input; run the real validator and other canonical registries.
            source = source.replace(binding, "communication_cases_path = " + repr(path), 1)
            code = "__file__=" + repr(VALIDATOR) + "\n" + source
            return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)

    def test_accepts_both_authored_choice_sets(self):
        r = self.run_choices(lambda case: None)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_missing_or_multiple_best_second_choices(self):
        for quality in ("partial", "best"):
            with self.subTest(quality=quality):
                def mutate(case):
                    case["secondPass"]["choices"][0]["quality"] = quality
                    if quality == "partial":
                        case["secondPass"]["choices"][2]["quality"] = "partial"
                r = self.run_choices(mutate)
                self.assertEqual(r.returncode, 1)
                self.assertIn("teach_back_closing_001/secondPass must have exactly one best choice", r.stdout)

    def test_rejects_duplicate_second_choice_ids(self):
        r = self.run_choices(lambda c: c["secondPass"]["choices"][1].update(id="a"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("teach_back_closing_001/secondPass INVALID — duplicate id(s): a", r.stdout)

    def test_rejects_duplicate_first_choice_ids(self):
        r = self.run_choices(lambda c: c["choices"][1].update(id="a"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("teach_back_closing_001 INVALID — duplicate id(s): a", r.stdout)


if __name__ == "__main__":
    unittest.main()
