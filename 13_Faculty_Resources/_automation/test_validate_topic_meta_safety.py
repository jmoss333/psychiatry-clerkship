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


class SafetyTreeValidatorTest(unittest.TestCase):
    def run_tree(self, mutate=None, record=None):
        tree = copy.deepcopy(TREE)
        if mutate:
            mutate(tree)
        entry = record if record is not None else dict(
            BASE, safetySteps=["a", "b", "c"], safetyDoc="d", safetyTree=tree)
        return _run(entry)

    def assert_rejects(self, needle, mutate=None, record=None):
        r = self.run_tree(mutate, record)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(needle, r.stdout)

    def test_accepts_a_valid_tree(self):
        r = self.run_tree()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_word_boundaries_spare_clinical_words_that_contain_une(self):
        r = self.run_tree(lambda t: t["nodes"][0].__setitem__("hint", "Unexplained autoimmune signs."))
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_rejects_plural_and_possessive_audience_tokens(self):
        for field, text in (("act", "Page the residents now."),
                            ("title", "Students stay at bedside."),
                            ("act", "Read the residents' note.")):
            def mutate(t, field=field, text=text):
                t["nodes"][2][field] = [text] if field == "act" else text
            with self.subTest(text=text):
                self.assert_rejects("audience-specific token", mutate)

    def test_rejects_a_tree_without_the_checklist_fallback(self):
        self.assert_rejects("requires 'safetySteps'", record=dict(BASE, safetyTree=TREE))

    def test_rejects_a_non_object_tree(self):
        self.assert_rejects("'safetyTree' must be an object", record=dict(
            BASE, safetySteps=["a", "b", "c"], safetyDoc="d", safetyTree=[]))

    def test_rejects_a_tree_without_a_now_script(self):
        self.assert_rejects("'now' script", lambda t: t["scripts"].pop("now"))

    def test_rejects_an_unknown_script_key(self):
        self.assert_rejects("'now' and 'soon' only",
                            lambda t: t["scripts"].__setitem__("later", SCRIPT))

    def test_rejects_a_script_missing_a_part(self):
        self.assert_rejects("must have exactly the keys",
                            lambda t: t["scripts"]["now"].pop("readBack"))

    def test_rejects_a_blank_outside_a_script(self):
        self.assert_rejects("blanks belong in scripts only",
                            lambda t: t["nodes"][0].__setitem__("ask", "Is [name] safe?"))

    def test_rejects_an_unbalanced_bracket_in_a_script(self):
        self.assert_rejects("bracket outside a [blank]",
                            lambda t: t["scripts"]["now"].__setitem__("situation", "Call [now."))

    def test_rejects_a_dose_literal(self):
        self.assert_rejects("dose literal",
                            lambda t: t["nodes"][2]["act"].__setitem__(0, "Give 5 mg."))

    def test_rejects_a_crisis_or_phone_number(self):
        self.assert_rejects("3+ digits",
                            lambda t: t["nodes"][2]["act"].__setitem__(0, "Call 988."))

    def test_rejects_an_audience_token(self):
        self.assert_rejects("audience-specific token",
                            lambda t: t["nodes"][2].__setitem__("title", "Student move"))

    def test_rejects_a_duplicate_node_id(self):
        self.assert_rejects("duplicate node id",
                            lambda t: t["nodes"][3].__setitem__("id", "a1"))

    def test_rejects_a_malformed_node_id(self):
        self.assert_rejects("needs an id matching",
                            lambda t: t["nodes"][3].__setitem__("id", "Bad Id"))

    def test_rejects_a_node_mixing_question_and_action_keys(self):
        self.assert_rejects("mixes question and action keys",
                            lambda t: t["nodes"][0].__setitem__("tone", "danger"))

    def test_rejects_a_question_with_one_option(self):
        self.assert_rejects("needs 2-4 options",
                            lambda t: t["nodes"][0].__setitem__("options", t["nodes"][0]["options"][:1]))

    def test_rejects_an_option_pointing_nowhere(self):
        self.assert_rejects("points at unknown node",
                            lambda t: t["nodes"][0]["options"][0].__setitem__("next", "zz"))

    def test_rejects_a_bad_tone(self):
        self.assert_rejects("tone must be",
                            lambda t: t["nodes"][2].__setitem__("tone", "amber"))

    def test_rejects_an_action_with_no_acts(self):
        self.assert_rejects("needs 1-4 actions",
                            lambda t: t["nodes"][2].__setitem__("act", []))

    def test_rejects_an_escalation_to_a_missing_script(self):
        self.assert_rejects("escalates to missing script",
                            lambda t: t["scripts"].pop("soon"))

    def test_rejects_a_see_link_to_its_own_page(self):
        self.assert_rejects("must not name its own page",
                            lambda t: t["nodes"][2].__setitem__("see", ["x.md"]))

    def test_rejects_a_see_that_is_not_a_list(self):
        self.assert_rejects("see must list 1-2 page refs",
                            lambda t: t["nodes"][2].__setitem__("see", "other.md"))

    def test_rejects_a_start_that_names_no_node(self):
        self.assert_rejects("names no node", lambda t: t.__setitem__("start", "zz"))

    def test_rejects_an_unreachable_node(self):
        self.assert_rejects("unreachable from start", lambda t: t["nodes"].append(
            {"id": "a3", "title": "Lost", "tone": "first", "act": ["Do."], "escalate": "now"}))

    def test_rejects_a_cycle(self):
        self.assert_rejects("has a cycle",
                            lambda t: t["nodes"][1]["options"][0].__setitem__("next", "q1"))

    def test_rejects_a_path_longer_than_five_questions(self):
        def deep(t):
            chain = [{"id": "c%d" % i, "ask": "Q%d?" % i,
                      "options": [{"label": "Go", "next": "c%d" % (i + 1)},
                                  {"label": "Stop", "next": "a2"}]} for i in range(6)]
            chain[-1]["options"][0]["next"] = "a2"
            t["nodes"] = chain + t["nodes"][2:]
            t["start"] = "c0"
        self.assert_rejects("more than 5 questions", deep)

    def test_rejects_an_over_long_question(self):
        self.assert_rejects("max 140",
                            lambda t: t["nodes"][0].__setitem__("ask", "x" * 141))


if __name__ == "__main__":
    unittest.main()
