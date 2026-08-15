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
        "libraryColumns": [],
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


if __name__ == "__main__":
    unittest.main()
