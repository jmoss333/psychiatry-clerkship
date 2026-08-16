#!/usr/bin/env python3
"""Contract tests for validate_curriculum.py.

Mirrors the harness convention of test_validate_registry_schemas.py: build a
minimal in-memory curriculum + manifest in a tmp dir, run the validator as a
subprocess, and assert on exit code and message. Nothing here reads the real
curriculum.json, so a content edit never turns these red.

The manifest IS synthetic, but the validator's shipped set is manifest + the
extras it derives from validate_tool_governance.py and resident_section.py (see
its docstring). Those extras are therefore present in every run, synthetic
manifest or not, so each fixture excludes them — imported from the validator
rather than restated, so the fixture cannot drift from the derivation.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HERE, "validate_curriculum.py")

if HERE not in sys.path:
    sys.path.insert(0, HERE)
import validate_curriculum  # noqa: E402  (path set above)

MANIFEST = {
    "tools": [["src/a.html", "mse.html", "Mental Status Exam"]],
    "md": [["src/b.md", "welcome.md", "Welcome to the Rotation"]],
}
MANIFEST_SLUGS = {"mse.html", "welcome.md"}

# Keep the two manifest slugs out of this list: the totality tests below assert on
# exactly those, and blanket-excluding them would hide what they are checking.
EXTRA_EXCLUDES = [
    {"ref": slug, "reason": "outside this fixture — a build extra, not a manifest page"}
    for slug in sorted(validate_curriculum.EXTRA_SHIPPED - MANIFEST_SLUGS)
]


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
        "libraryExclude": list(EXTRA_EXCLUDES),
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
        c["libraryExclude"] = list(exclude) + EXTRA_EXCLUDES
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


class ShippedSetTest(unittest.TestCase):
    """The shipped set is manifest + build extras, not the manifest alone.

    Before this, `shipped` came only from site_manifest.json, so the totality guard
    was false-green: the ten-odd pages the build copies outside the manifest were
    neither required to be placed nor even *allowed* in libraryExclude.
    """

    def test_extras_cover_the_per_site_tools_and_resident_only_pages(self):
        extras = validate_curriculum.EXTRA_SHIPPED
        for slug in ("learning-path.html", "orientation-video.html", "rp-agitation.html",
                     "rp-brief-psych.html", "rp-canon-quiz.html", "rotation.md",
                     "adv_psychopharm.md", "systems_medlegal.md", "supervision_teaching.md",
                     "canon_200.md", "cl_reference.md"):
            self.assertIn(slug, extras)

    def test_library_exclude_accepts_a_page_outside_site_manifest(self):
        # The spec names orientation-video.html as an exclusion example, and the guard
        # used to reject it as "not a shipped slug" purely because it has no manifest row.
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["libraryColumns"] = [
                {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
                {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
            ]
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertNotIn("orientation-video.html", r.stdout)

    def test_a_build_extra_left_unplaced_and_unexcluded_still_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["libraryColumns"] = [
                {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
                {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
            ]
            cur["libraryExclude"] = [e for e in EXTRA_EXCLUDES
                                     if e["ref"] != "orientation-video.html"]
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("orientation-video.html", r.stdout)


class SafetyKitTest(unittest.TestCase):
    def _cur(self, kit):
        c = _curriculum([])
        c["libraryColumns"] = [
            {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
            {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
        ]
        c["safetyKit"] = kit
        return c

    def test_accepts_kit_refs_that_are_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"ref": "welcome.md", "sub": "Screen · stratify · plan"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_kit_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"ref": "ghost.md", "sub": "nope"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("ghost.md", r.stdout)

    def test_rejects_a_kit_entry_with_an_empty_sub(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"ref": "welcome.md", "sub": "   "}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("sub", r.stdout)

    def test_rejects_a_non_string_kit_ref_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                [{"ref": {"nested": "dict"}, "sub": "n/a"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a string", r.stdout)


class RolesTest(unittest.TestCase):
    """roles.{ms3,resident}[] — non-empty id/name/desc, and audience-neutral displayed text.

    curriculum.json is one document read by both site builds, so a role's displayed name/desc
    (unlike its id, an identifier rather than copy) must not carry an audience-specific token —
    the Python analogue of tests/shell-copy.test.mjs's shared-copy scan.
    """

    def _cur(self, ms3=None, resident=None):
        c = _curriculum([])
        c["roles"] = {
            "ms3": ms3 if ms3 is not None else [],
            "resident": resident if resident is not None else [],
        }
        return c

    def test_accepts_well_formed_audience_neutral_roles(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": "Core rotation",
                      "desc": "The six-week inpatient rotation", "hint": "most common"},
                     {"id": "staff", "name": "Nursing · SW · family",
                      "desc": "Unit staff and families", "hint": ""}],
                resident=[{"id": "pgy1", "name": "PGY-1",
                           "desc": "First year on inpatient psychiatry", "hint": "most common"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_role_missing_a_required_field(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": "", "desc": "The rotation", "hint": ""}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("name", r.stdout)

    def test_rejects_a_role_with_a_non_string_field_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": {"nested": "dict"}, "desc": "The rotation"}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a non-empty string", r.stdout)

    def test_rejects_a_role_that_is_not_an_object_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(ms3=["just a string"]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be an object", r.stdout)

    def test_rejects_a_role_name_carrying_an_audience_specific_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": "MS3 · clerkship student",
                      "desc": "The rotation", "hint": ""}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("audience-specific token", r.stdout)

    def test_rejects_a_role_desc_carrying_an_audience_specific_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._cur(
                resident=[{"id": "pgy1", "name": "PGY-1",
                           "desc": "Resident on the unit", "hint": ""}]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1)
            self.assertIn("audience-specific token", r.stdout)

    def test_rejects_roles_missing_a_site_key_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["roles"] = {"ms3": []}  # no "resident" key at all
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("roles.resident", r.stdout)


if __name__ == "__main__":
    unittest.main()
