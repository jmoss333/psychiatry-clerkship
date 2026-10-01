#!/usr/bin/env python3
"""registry_checks.py must agree with pharmacy/validate_pharmacy.py byte for byte on every
primitive it lifted. The pharmacy copy stays authoritative (its J-hash is what the promotion
guard pins), so the pin runs from the pharmacy side: for each shared function, the SOURCE
TEXT of the two definitions must be identical. A behavioural check on sample inputs backs it.
"""

import ast
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHARED = HERE / "registry_checks.py"
PHARMACY = HERE / "pharmacy" / "validate_pharmacy.py"
LIFTED = ("norm", "load", "get_path", "resolve", "retrieval_hash", "j_hash", "syllables", "fk_grade", "walk")


def function_sources(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {node.name: ast.get_source_segment(path.read_text(encoding="utf-8"), node)
            for node in tree.body if isinstance(node, ast.FunctionDef)}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ParityTests(unittest.TestCase):
    def test_every_lifted_function_is_byte_identical_to_the_pharmacy_copy(self):
        shared, pharmacy = function_sources(SHARED), function_sources(PHARMACY)
        for name in LIFTED:
            self.assertIn(name, pharmacy, name)
            self.assertIn(name, shared, name)
            self.assertEqual(shared[name], pharmacy[name], "%s drifted from validate_pharmacy.py" % name)

    def test_constants_match(self):
        shared = load_module("registry_checks", SHARED)
        sys.path.insert(0, str(PHARMACY.parent))
        pharmacy = load_module("validate_pharmacy", PHARMACY)
        self.assertEqual(shared.DOSE_RE.pattern, pharmacy.DOSE_RE.pattern)
        self.assertEqual(shared.FK_MAX, pharmacy.FK_MAX)

    def test_j_hash_and_fk_agree_on_a_sample(self):
        shared = load_module("registry_checks", SHARED)
        pharmacy = load_module("validate_pharmacy", PHARMACY)
        record = {"a": {"b": "x"}, "c": "y",
                  "provenance": {"fieldClasses": {"a.b": "J", "c": "L"}}}
        self.assertEqual(shared.j_hash(record), pharmacy.j_hash(record))
        text = "This medicine helps sleep. Tell the team if you feel dizzy."
        self.assertEqual(shared.fk_grade(text), pharmacy.fk_grade(text))

    def test_bare_percentage_detector(self):
        shared = load_module("registry_checks", SHARED)
        self.assertEqual(shared.bare_percentages("60-70% positive response rates"), ["70%"])
        self.assertEqual(shared.bare_percentages("88% at cutoff >=10"), [])
        self.assertEqual(shared.bare_percentages("sensitivity 0.88"), [])
        self.assertEqual(shared.bare_percentages(None), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
