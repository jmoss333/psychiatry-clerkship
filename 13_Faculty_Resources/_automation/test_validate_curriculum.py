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
import copy
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
#
# Each entry carries "sites" whenever the build extra is single-site, because the validator
# now rejects an unscoped entry for a page only one site ships (an unscoped entry applies to
# every site, and a site that does not ship the page can neither place nor exclude it). The
# scoping is derived, never restated, so a build change moves these with it.
def _extra_exclude(slug):
    sites = [s for s in validate_curriculum.SITES
             if slug in validate_curriculum.EXTRA_SHIPPED_BY_SITE[s]]
    entry = {"ref": slug, "reason": "outside this fixture — a build extra, not a manifest page"}
    if len(sites) != len(validate_curriculum.SITES):
        entry["sites"] = sites
    return entry


EXTRA_EXCLUDES = [
    _extra_exclude(slug)
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
        for slug in ("orientation-video.html", "rp-agitation.html",
                     "rp-brief-psych.html", "rp-canon-quiz.html", "rotation.md",
                     "adv_psychopharm.md", "systems_medlegal.md", "supervision_teaching.md",
                     "canon_200.md", "cl_reference.md"):
            self.assertIn(slug, extras)

    def test_extras_are_attributed_to_the_site_that_actually_ships_them(self):
        # The union alone cannot tell "MS3 does not ship this" from "nobody ships this",
        # which is the distinction per-site membership turns on.
        by_site = validate_curriculum.EXTRA_SHIPPED_BY_SITE
        self.assertEqual(set(by_site), {"ms3", "resident"})
        self.assertIn("orientation-video.html", by_site["ms3"])
        self.assertNotIn("orientation-video.html", by_site["resident"])
        for slug in ("rp-agitation.html", "rp-brief-psych.html", "rp-canon-quiz.html",
                     "rotation.md", "adv_psychopharm.md", "systems_medlegal.md",
                     "supervision_teaching.md", "canon_200.md", "cl_reference.md"):
            self.assertIn(slug, by_site["resident"])
            self.assertNotIn(slug, by_site["ms3"])

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


class PerSiteMembershipTest(unittest.TestCase):
    """A library entry may be scoped to the site(s) that actually ship the page.

    Before this existed, the only way to say "resident ships it, MS3 does not" was a
    libraryExclude entry, which hid the page from BOTH Libraries. With the sidebar gone
    that made the resident site's nine resident-only pages reachable only by search.
    """

    # One real resident-only slug and one real ms3-only slug, taken from the derivation
    # rather than restated, so a rename in the build breaks this instead of skipping it.
    RES_ONLY = "canon_200.md"
    MS3_ONLY = "orientation-video.html"

    def _cur(self, columns, exclude):
        c = _curriculum([])
        c["libraryColumns"] = columns
        c["libraryExclude"] = list(exclude)
        return c

    def _covering(self, *, place=(), extra_exclude=()):
        """Full-coverage fixture: place `place`, exclude everything else the build ships.

        Deep-copied: several tests below mutate the exclude entries, and EXTRA_EXCLUDES is
        module-level shared state — a shallow copy leaks the mutation into every later test.
        """
        placed = {e["ref"] if isinstance(e, dict) else e for e in place}
        exclude = [copy.deepcopy(e) for e in EXTRA_EXCLUDES if e["ref"] not in placed]
        exclude.extend(copy.deepcopy(list(extra_exclude)))
        return self._cur(
            [{"name": "Tools", "accent": "tool", "refs": ["mse.html", *place]},
             {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]}],
            exclude)

    def test_setup_sanity_the_two_real_slugs_are_single_site(self):
        by_site = validate_curriculum.EXTRA_SHIPPED_BY_SITE
        self.assertIn(self.RES_ONLY, by_site["resident"])
        self.assertNotIn(self.RES_ONLY, by_site["ms3"])
        self.assertIn(self.MS3_ONLY, by_site["ms3"])
        self.assertNotIn(self.MS3_ONLY, by_site["resident"])

    def test_accepts_a_column_ref_scoped_to_the_site_that_ships_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._covering(place=[
                {"ref": self.RES_ONLY, "sites": ["resident"], "title": "The Psychiatry Canon"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_column_ref_scoped_to_a_site_that_does_not_ship_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._covering(place=[
                {"ref": self.RES_ONLY, "sites": ["ms3"], "title": "The Psychiatry Canon"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("does not ship it", r.stdout)

    def test_rejects_a_one_site_page_placed_globally(self):
        # The whole point: a bare ref renders on BOTH sites, so a one-site page placed
        # without "sites" dead-links on the other.
        with tempfile.TemporaryDirectory() as tmp:
            cur = self._covering(place=[self.RES_ONLY])
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("needs an explicit", r.stdout)

    def test_rejects_an_unknown_site_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._covering(place=[
                {"ref": self.RES_ONLY, "sites": ["fellow"], "title": "The Psychiatry Canon"},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("unknown site", r.stdout)

    def test_rejects_a_page_left_unplaced_on_the_site_that_ships_it(self):
        # A resident-only page neither placed nor excluded for resident. The old global check
        # could not report this in the site's name; it is the exact failure that would have let
        # the nine resident-only pages ship with no browse path.
        with tempfile.TemporaryDirectory() as tmp:
            cur = self._covering()
            cur["libraryExclude"] = [e for e in cur["libraryExclude"]
                                     if e["ref"] != self.RES_ONLY]
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("resident ships '%s'" % self.RES_ONLY, r.stdout)
            self.assertNotIn("ms3 ships '%s'" % self.RES_ONLY, r.stdout)

    def test_requires_a_title_for_a_ref_the_manifest_does_not_register(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, m = _write(tmp, self._covering(place=[
                {"ref": self.RES_ONLY, "sites": ["resident"]},
            ]))
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("needs a non-empty", r.stdout)

    def test_forbids_a_title_on_a_ref_the_manifest_already_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = self._covering()
            cur["libraryColumns"][1]["refs"] = [
                {"ref": "welcome.md", "title": "Second source of truth"}]
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("single source of truth", r.stdout)

    def test_exclude_entries_are_site_scoped_too(self):
        # The default fixture already scopes them (see _extra_exclude), so this asserts the
        # scoped form is accepted AND that dropping the scope from a one-site page fails.
        with tempfile.TemporaryDirectory() as tmp:
            cur = self._covering()
            scoped = [e for e in cur["libraryExclude"] if e["ref"] == self.MS3_ONLY]
            self.assertEqual([e.get("sites") for e in scoped], [["ms3"]],
                             "fixture sanity: the ms3-only extra must arrive scoped")
            c, m = _write(tmp, cur)
            self.assertEqual(_run(c, m).returncode, 0, "control: scoped exclude must pass")

            for ent in cur["libraryExclude"]:
                ent.pop("sites", None)
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("needs an explicit", r.stdout)

    def test_rejects_a_week_item_only_one_site_ships(self):
        # Weeks are not site-scoped -- the Path tab renders the same six on both sites.
        with tempfile.TemporaryDirectory() as tmp:
            cur = self._covering()
            cur["weeks"][0]["items"] = [{"ref": self.RES_ONLY, "kind": "read"}]
            cur["libraryExclude"] = list(EXTRA_EXCLUDES)
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("is not shipped by ms3", r.stdout)

    def test_rejects_a_safety_kit_ref_only_one_site_ships(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = self._covering()
            cur["safetyKit"] = [{"ref": self.RES_ONLY, "sub": "n/a"}]
            c, m = _write(tmp, cur)
            r = _run(c, m)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("not site-scoped", r.stdout)


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
