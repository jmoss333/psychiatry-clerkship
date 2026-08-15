#!/usr/bin/env python3
"""Contract tests for validate_curriculum.py.

Mirrors the harness convention of test_validate_registry_schemas.py: build a
minimal in-memory curriculum + manifest in a tmp dir, run the validator as a
subprocess, and assert on exit code and message. Nothing here touches the real
curriculum.json, so a content edit never turns these red.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HERE, "validate_curriculum.py")

MANIFEST = {
    "tools": [["src/a.html", "mse.html", "Mental Status Exam"]],
    "md": [["src/b.md", "welcome.md", "Welcome to the Rotation"]],
}


def _write(tmp, curriculum):
    cpath = os.path.join(tmp, "curriculum.json")
    mpath = os.path.join(tmp, "site_manifest.json")
    with open(cpath, "w", encoding="utf-8") as fh:
        json.dump(curriculum, fh)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(MANIFEST, fh)
    return cpath, mpath


def _run(cpath, mpath):
    return subprocess.run(
        [sys.executable, VALIDATOR, cpath, mpath],
        capture_output=True, text=True,
    )


def _curriculum(items):
    return {
        "weeks": [{"n": n, "title": "T%d" % n, "theme": "Th%d" % n,
                   "items": items if n == 1 else []} for n in range(1, 7)],
        # Default coverage keeps the fixture VALID under the totality check. Tests that
        # exercise column behaviour overwrite both keys wholesale (see LibraryTotalityTest._cur),
        # so this default never masks what they assert.
        "libraryColumns": [
            {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
            {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
        ],
        "libraryExclude": [],
        "safetyKit": [],
        "roles": {"ms3": [], "resident": []},
        "synonyms": {},
    }


class ValidateCurriculumTest(unittest.TestCase):
    def test_accepts_refs_that_resolve_to_shipped_slugs(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "welcome.md", "kind": "read"},
                {"ref": "mse.html", "kind": "tool"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("OK", r.stdout)

    def test_rejects_a_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "does-not-exist.md", "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("does-not-exist.md", r.stdout)

    def test_rejects_kind_that_disagrees_with_the_slug_type(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "mse.html", "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("kind", r.stdout)

    def test_rejects_a_missing_or_duplicated_week_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["weeks"][5]["n"] = 5  # now 1,2,3,4,5,5 — week 6 missing
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("week", r.stdout.lower())

    def test_reports_every_violation_not_just_the_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": "nope-one.md", "kind": "read"},
                {"ref": "nope-two.md", "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("nope-one.md", r.stdout)
            self.assertIn("nope-two.md", r.stdout)

    def test_rejects_a_week_missing_its_n_field_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            del cur["weeks"][0]["n"]
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("missing or non-integer", r.stdout)

    def test_rejects_a_week_with_a_null_n_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["weeks"][0]["n"] = None
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("missing or non-integer", r.stdout)

    def test_rejects_a_boolean_n_instead_of_treating_true_as_week_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["weeks"][0]["n"] = True
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("missing or non-integer", r.stdout)

    def test_rejects_a_non_string_ref_in_a_week_item_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, _curriculum([
                {"ref": {"nested": "dict"}, "kind": "read"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a string", r.stdout)


class LibraryTotalityTest(unittest.TestCase):
    """Every shipped slug is placed in a column or explicitly excluded with a reason.

    This is the front-door analogue of the build's orphaned-source check: adding a
    page and forgetting to place it must break the build, not silently orphan it.
    """

    def _cur(self, columns, exclude):
        c = _curriculum([])
        c["libraryColumns"] = columns
        c["libraryExclude"] = exclude
        return c

    def test_accepts_full_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
                 {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]}],
                []))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)

    def test_accepts_a_slug_placed_only_in_the_exclude_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": "welcome.md", "reason": "surfaced by the Path tab"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)

    def test_rejects_a_shipped_slug_that_is_neither_placed_nor_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}], []))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("welcome.md", r.stdout)

    def test_rejects_a_column_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html", "ghost.html"]}],
                [{"ref": "welcome.md", "reason": "n/a"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("ghost.html", r.stdout)

    def test_rejects_an_exclude_entry_with_an_empty_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": "welcome.md", "reason": ""}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("reason", r.stdout)

    def test_rejects_a_non_string_column_ref_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool",
                  "refs": ["mse.html", ["nested", "list"]]}],
                [{"ref": "welcome.md", "reason": "n/a"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a string", r.stdout)

    def test_rejects_a_non_string_exclude_ref_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": {"nested": "dict"}, "reason": "n/a"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a string", r.stdout)


if __name__ == "__main__":
    unittest.main()
