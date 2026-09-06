#!/usr/bin/env python3
"""Contract tests for validate_curriculum.py.

Mirrors the harness convention of test_validate_registry_schemas.py: build a
minimal in-memory curriculum + shipped-pages listing in a tmp dir, run the
validator as a subprocess, and assert on exit code and message. Nothing here
reads the real curriculum.json, so a content edit never turns these red.

The validator asks site_build/shipped_pages.json what ships (ADR-002), so the
fixture writes that listing rather than the producers behind it. The listing it
writes is the synthetic manifest rows PLUS the real build extras — the per-site
tools and resident-only pages — copied from the repo's own shipped_pages.json
rather than restated here, so the fixture cannot drift from what ships. The
per-site assertions below (orientation-video.html is ms3-only, rp-canon-quiz.html
is resident-only) are about those real entries.

The weekly-case pages are dropped, matching the validator: it excludes the
"cotw_registry" producer by the decision recorded in its docstring.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
VALIDATOR = os.path.join(HERE, "validate_curriculum.py")
SHIPPED_RELATIVE = os.path.join(
    "13_Faculty_Resources", "_automation", "site_build", "shipped_pages.json")

MANIFEST = {
    "tools": [["src/a.html", "mse.html", "Mental Status Exam"]],
    "md": [
        ["src/b.md", "welcome.md", "Welcome to the Rotation"],
        ["src/pg_suicide.md", "pg_suicide.md", "Suicide Safety"],
        ["src/agitation.md", "agitation.md", "Agitation"],
        ["src/exp_consult.md", "exp_consult.md", "Capacity"],
        ["src/t_sud.md", "t_sud.md", "Withdrawal"],
        ["src/delirium.md", "delirium.md", "Delirium"],
    ],
}
MANIFEST_SLUGS = {"mse.html", "welcome.md", "pg_suicide.md", "agitation.md",
                  "exp_consult.md", "t_sud.md", "delirium.md"}

# The real build extras: everything the repo's own listing ships that neither
# site_manifest.json nor the weekly-case registry produces. Read, not restated.
with open(os.path.join(ROOT, SHIPPED_RELATIVE), encoding="utf-8") as _fh:
    REAL_EXTRAS = [
        page for page in json.load(_fh)["pages"]
        if page["producer"] not in ("site_manifest", "cotw_registry")
    ]
EXTRA_SHIPPED = frozenset(page["slug"] for page in REAL_EXTRAS)


def _shipped_document():
    """The synthetic manifest rows plus the real extras, in listing shape."""
    pages = [
        {"slug": slug, "kind": kind, "sites": ["ms3", "res"],
         "title": title, "source": source, "producer": "site_manifest"}
        for kind, key in (("tool", "tools"), ("page", "md"))
        for source, slug, title in MANIFEST[key]
    ]
    return {"version": 1, "pages": pages + list(REAL_EXTRAS)}
SAFETY_REFS = (
    "pg_suicide.md",
    "agitation.md",
    "exp_consult.md",
    "t_sud.md",
    "delirium.md",
)

# Keep the two manifest slugs out of this list: the totality tests below assert on
# exactly those, and blanket-excluding them would hide what they are checking.
EXTRA_EXCLUDES = [
    {"ref": slug, "reason": "outside this fixture — a build extra, not a manifest page"}
    for slug in sorted(EXTRA_SHIPPED - MANIFEST_SLUGS)
]
FIXTURE_SAFETY_EXCLUDES = [
    {"ref": ref, "reason": "outside this fixture — supplied only for safety-kit validation"}
    for ref in SAFETY_REFS
]


def _topic_meta():
    return {
        ref: {
            "safetyLevel": "high",
            "facultyReview": {"status": "reviewed"},
            "evidenceIds": ["evidence-ok"],
            "safetySteps": ["one", "two", "three"],
            "safetyDoc": "what happened and what was done",
        }
        for ref in SAFETY_REFS
    }


def _evidence_registry():
    return {"sources": [{"id": "evidence-ok"}]}


def _write(tmp, curriculum, topic_meta=None, evidence_registry=None):
    """Write the synthetic repo into `tmp`; return (curriculum path, repo root)."""
    cpath = os.path.join(tmp, "curriculum.json")
    spath = os.path.join(tmp, SHIPPED_RELATIVE)
    tpath = os.path.join(tmp, "topic_meta.json")
    epath = os.path.join(tmp, "evidence_registry.json")
    os.makedirs(os.path.dirname(spath), exist_ok=True)
    with open(cpath, "w", encoding="utf-8") as fh:
        json.dump(curriculum, fh)
    with open(spath, "w", encoding="utf-8") as fh:
        json.dump(_shipped_document(), fh)
    with open(tpath, "w", encoding="utf-8") as fh:
        json.dump(_topic_meta() if topic_meta is None else topic_meta, fh)
    with open(epath, "w", encoding="utf-8") as fh:
        json.dump(_evidence_registry() if evidence_registry is None else evidence_registry, fh)
    return cpath, tmp


def _run(cpath, root, tpath=None, epath=None):
    tpath = tpath or os.path.join(os.path.dirname(cpath), "topic_meta.json")
    epath = epath or os.path.join(os.path.dirname(cpath), "evidence_registry.json")
    return subprocess.run(
        [sys.executable, VALIDATOR, cpath, root, tpath, epath],
        capture_output=True, text=True,
    )


def _weeks(count, first_items=None):
    return [
        {"n": n, "title": "T%d" % n, "theme": "Th%d" % n,
         "focusCategories": ["safety"],
         "items": list(first_items or []) if n == 1 else []}
        for n in range(1, count + 1)
    ]


def _curriculum(items):
    return {
        "learningPaths": {
            "ms3": {"id": "ms3-six-week", "weeks": _weeks(6, items)},
            "resident": {"id": "resident-four-week", "weeks": _weeks(4)},
        },
        # Default coverage keeps the fixture VALID under the totality check. Tests that
        # exercise column behaviour overwrite both keys wholesale (see LibraryTotalityTest._cur),
        # so this default never masks what they assert.
        "libraryColumns": [
            {"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
            {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]},
        ],
        "libraryExclude": list(EXTRA_EXCLUDES) + list(FIXTURE_SAFETY_EXCLUDES),
        "safetyKit": [
            {"ref": ref, "sub": "Protocol " + str(index + 1)}
            for index, ref in enumerate(SAFETY_REFS)
        ],
        "roles": {"ms3": [], "resident": []},
        "synonyms": {},
        "siteLibrary": {
            "ms3": {"additions": [], "exclusions": []},
            "resident": {"additions": [], "exclusions": []},
        },
    }


class ValidateCurriculumTest(unittest.TestCase):
    def test_accepts_refs_that_resolve_to_shipped_slugs(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, _curriculum([
                {"ref": "welcome.md", "kind": "read"},
                {"ref": "mse.html", "kind": "tool"},
            ]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("OK", r.stdout)

    def test_rejects_a_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, _curriculum([
                {"ref": "does-not-exist.md", "kind": "read"},
            ]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("learningPaths.ms3 week 1", r.stdout)
            self.assertIn("does-not-exist.md", r.stdout)

    def test_rejects_kind_that_disagrees_with_the_slug_type(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, _curriculum([
                {"ref": "mse.html", "kind": "read"},
            ]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("learningPaths.ms3 week 1", r.stdout)
            self.assertIn("kind", r.stdout)

    def test_rejects_resident_only_ref_on_ms3_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["learningPaths"]["ms3"]["weeks"][0]["items"] = [
                {"ref": "rp-canon-quiz.html", "kind": "tool"}]
            c, root = _write(tmp, cur)
            result = _run(c, root)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("ms3", result.stdout)
        self.assertIn("rp-canon-quiz.html", result.stdout)

    def test_accepts_resident_only_ref_on_resident_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["learningPaths"]["resident"]["weeks"][0]["items"] = [
                {"ref": "rp-canon-quiz.html", "kind": "tool"}]
            c, root = _write(tmp, cur)
            result = _run(c, root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_ms3_only_ref_on_resident_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["learningPaths"]["resident"]["weeks"][0]["items"] = [
                {"ref": "orientation-video.html", "kind": "tool"}]
            c, root = _write(tmp, cur)
            result = _run(c, root)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("resident", result.stdout)
        self.assertIn("orientation-video.html", result.stdout)

    def test_rejects_a_missing_or_duplicated_week_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["learningPaths"]["ms3"]["weeks"][5]["n"] = 5
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("learningPaths.ms3", r.stdout)
            self.assertIn("week", r.stdout.lower())

    def test_rejects_resident_path_with_wrong_week_count_or_gap(self):
        for label, mutate in (
            ("count", lambda c: c["learningPaths"]["resident"]["weeks"].pop()),
            ("gap", lambda c: c["learningPaths"]["resident"]["weeks"].__setitem__(2,
                dict(c["learningPaths"]["resident"]["weeks"][2], n=4))),
        ):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as tmp:
                cur = _curriculum([])
                mutate(cur)
                c, root = _write(tmp, cur)
                r = _run(c, root)
                self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                self.assertIn("learningPaths.resident", r.stdout)

    def test_rejects_duplicate_ref_bad_kind_and_unknown_category_with_path_labels(self):
        mutations = (
            ("duplicate", lambda c: c["learningPaths"]["resident"]["weeks"][0].update(
                {"items": [{"ref": "rp-canon-quiz.html", "kind": "tool"},
                           {"ref": "rp-canon-quiz.html", "kind": "tool"}]})),
            ("kind", lambda c: c["learningPaths"]["resident"]["weeks"][0].update(
                {"items": [{"ref": "rp-canon-quiz.html", "kind": "read"}]})),
            ("category", lambda c: c["learningPaths"]["resident"]["weeks"][0].update(
                {"focusCategories": ["unknown"]})),
        )
        for label, mutate in mutations:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as tmp:
                cur = _curriculum([])
                mutate(cur)
                c, root = _write(tmp, cur)
                r = _run(c, root)
                self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                self.assertIn("learningPaths.resident week 1", r.stdout)

    def test_reports_every_violation_not_just_the_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, _curriculum([
                {"ref": "nope-one.md", "kind": "read"},
                {"ref": "nope-two.md", "kind": "read"},
            ]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("learningPaths.ms3 week 1", r.stdout)
            self.assertIn("nope-one.md", r.stdout)
            self.assertIn("nope-two.md", r.stdout)

    def test_rejects_a_week_missing_its_n_field_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            del cur["learningPaths"]["ms3"]["weeks"][0]["n"]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("learningPaths.ms3", r.stdout)

    def test_rejects_a_week_with_a_null_n_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["learningPaths"]["ms3"]["weeks"][0]["n"] = None
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("learningPaths.ms3", r.stdout)

    def test_rejects_a_boolean_n_instead_of_treating_true_as_week_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([{"ref": "welcome.md", "kind": "read"}])
            cur["learningPaths"]["ms3"]["weeks"][0]["n"] = True
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("learningPaths.ms3", r.stdout)

    def test_rejects_a_non_string_ref_in_a_week_item_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, _curriculum([
                {"ref": {"nested": "dict"}, "kind": "read"},
            ]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("learningPaths.ms3 week 1", r.stdout)
            self.assertIn("must be a string", r.stdout)


class LibraryTotalityTest(unittest.TestCase):
    """Every shipped slug is placed in a column or explicitly excluded with a reason.

    This is the front-door analogue of the build's orphaned-source check: adding a
    page and forgetting to place it must break the build, not silently orphan it.
    """

    def _cur(self, columns, exclude):
        c = _curriculum([])
        c["libraryColumns"] = columns
        c["libraryExclude"] = list(exclude) + EXTRA_EXCLUDES + FIXTURE_SAFETY_EXCLUDES
        return c

    def test_accepts_full_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]},
                 {"name": "Topics", "accent": "topic", "refs": ["welcome.md"]}],
                []))
            r = _run(c, root)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)

    def test_accepts_a_slug_placed_only_in_the_exclude_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": "welcome.md", "reason": "surfaced by the Path tab"}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)

    def test_rejects_a_shipped_slug_that_is_neither_placed_nor_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}], []))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("welcome.md", r.stdout)

    def test_rejects_a_column_ref_that_is_not_shipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html", "ghost.html"]}],
                [{"ref": "welcome.md", "reason": "n/a"}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("ghost.html", r.stdout)

    def test_rejects_an_exclude_entry_with_an_empty_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": "welcome.md", "reason": ""}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("reason", r.stdout)

    def test_rejects_a_non_string_column_ref_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool",
                  "refs": ["mse.html", ["nested", "list"]]}],
                [{"ref": "welcome.md", "reason": "n/a"}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a string", r.stdout)

    def test_rejects_a_non_string_exclude_ref_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                [{"name": "Tools", "accent": "tool", "refs": ["mse.html"]}],
                [{"ref": {"nested": "dict"}, "reason": "n/a"}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a string", r.stdout)


class SiteLibraryTest(unittest.TestCase):
    def test_rejects_a_site_addition_for_an_unknown_column(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["siteLibrary"]["resident"]["additions"] = [
                {"column": "Missing column", "refs": ["mse.html"]}
            ]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("Missing column", r.stdout)

    def test_rejects_a_duplicate_site_addition_ref(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["siteLibrary"]["resident"]["additions"] = [
                {"column": "Tools", "refs": ["mse.html", "mse.html"]}
            ]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("duplicate", r.stdout)

    def test_rejects_a_site_addition_for_an_unknown_slug(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["siteLibrary"]["resident"]["additions"] = [
                {"column": "Tools", "refs": ["ghost.md"]}
            ]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("ghost.md", r.stdout)
            self.assertIn("not shipped on resident", r.stdout)

    def test_rejects_a_site_exclusion_for_an_unknown_slug(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["siteLibrary"]["resident"]["exclusions"] = ["ghost.md"]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("ghost.md", r.stdout)
            self.assertIn("not shipped on resident", r.stdout)

    def test_rejects_resident_addition_of_an_ms3_only_extra(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["siteLibrary"]["resident"]["additions"] = [
                {"column": "Tools", "refs": ["orientation-video.html"]}
            ]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("orientation-video.html", r.stdout)
            self.assertIn("not shipped on resident", r.stdout)

    def test_rejects_ms3_addition_of_a_resident_only_extra(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["siteLibrary"]["ms3"]["additions"] = [
                {"column": "Tools", "refs": ["rp-agitation.html"]}
            ]
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("rp-agitation.html", r.stdout)
            self.assertIn("not shipped on ms3", r.stdout)

    def test_rejects_cross_site_exclusions(self):
        cases = (
            ("resident", "orientation-video.html"),
            ("ms3", "rp-agitation.html"),
        )
        for site, ref in cases:
            with self.subTest(site=site, ref=ref), tempfile.TemporaryDirectory() as tmp:
                cur = _curriculum([])
                cur["siteLibrary"][site]["exclusions"] = [ref]
                c, root = _write(tmp, cur)
                r = _run(c, root)
                self.assertEqual(r.returncode, 1)
                self.assertIn(ref, r.stdout)
                self.assertIn("not shipped on " + site, r.stdout)


class ShippedSetTest(unittest.TestCase):
    """The shipped set is manifest + build extras, not the manifest alone.

    Before this, `shipped` came only from site_manifest.json, so the totality guard
    was false-green: the ten-odd pages the build copies outside the manifest were
    neither required to be placed nor even *allowed* in libraryExclude.
    """

    def test_extras_cover_the_per_site_tools_and_resident_only_pages(self):
        extras = EXTRA_SHIPPED
        for slug in ("orientation-video.html", "rp-agitation.html",
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
            c, root = _write(tmp, cur)
            r = _run(c, root)
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
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("orientation-video.html", r.stdout)


class SafetyKitTest(unittest.TestCase):
    def _run(self, mutate=None, topic_meta=None, evidence_registry=None):
        cur = _curriculum([])
        if mutate:
            mutate(cur)
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, cur, topic_meta, evidence_registry)
            return _run(c, root)

    def test_accepts_the_current_five_reviewed_protocols(self):
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_the_wrong_number_of_protocols(self):
        r = self._run(lambda c: c.__setitem__("safetyKit", c["safetyKit"][:-1]))
        self.assertEqual(r.returncode, 1)
        self.assertIn("exactly 5", r.stdout)

    def test_rejects_a_duplicate_protocol_ref(self):
        r = self._run(lambda c: c["safetyKit"].__setitem__(1, c["safetyKit"][0]))
        self.assertEqual(r.returncode, 1)
        self.assertIn("unique", r.stdout)

    def test_rejects_a_non_current_protocol_ref(self):
        def replace_ref(cur):
            cur["safetyKit"][4] = {"ref": "welcome.md", "sub": "Not a protocol"}
        r = self._run(replace_ref)
        self.assertEqual(r.returncode, 1)
        self.assertIn("current five", r.stdout)

    def test_rejects_a_non_high_safety_protocol(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["safetyLevel"] = "moderate"
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetyLevel", r.stdout)

    def test_rejects_a_protocol_with_no_evidence_ids(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["evidenceIds"] = []
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("evidenceIds", r.stdout)

    def test_rejects_a_protocol_with_an_unknown_evidence_id(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["evidenceIds"] = ["unknown-evidence"]
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("unknown-evidence", r.stdout)

    def test_rejects_a_protocol_missing_safety_steps(self):
        meta = _topic_meta()
        del meta[SAFETY_REFS[0]]["safetySteps"]
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetySteps", r.stdout)

    def test_rejects_a_protocol_with_too_few_safety_steps(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["safetySteps"] = ["one", "two"]
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("3 to 5", r.stdout)

    def test_rejects_a_protocol_with_too_many_safety_steps(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["safetySteps"] = ["one", "two", "three", "four", "five", "six"]
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("3 to 5", r.stdout)

    def test_rejects_a_protocol_missing_a_documentation_line(self):
        meta = _topic_meta()
        del meta[SAFETY_REFS[0]]["safetyDoc"]
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("safetyDoc", r.stdout)

    def test_rejects_a_protocol_without_reviewed_faculty_status(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["facultyReview"]["status"] = "draft"
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn("facultyReview", r.stdout)

    def test_reports_multiple_protocol_violations_in_one_run(self):
        meta = _topic_meta()
        meta[SAFETY_REFS[0]]["safetyLevel"] = "moderate"
        del meta[SAFETY_REFS[1]]["safetyDoc"]
        r = self._run(topic_meta=meta)
        self.assertEqual(r.returncode, 1)
        self.assertIn(SAFETY_REFS[0], r.stdout)
        self.assertIn(SAFETY_REFS[1], r.stdout)


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
            c, root = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": "Core rotation",
                      "desc": "The six-week inpatient rotation", "hint": "most common"},
                     {"id": "staff", "name": "Nursing · SW · family",
                      "desc": "Unit staff and families", "hint": ""}],
                resident=[{"id": "pgy1", "name": "PGY-1",
                           "desc": "First year on inpatient psychiatry", "hint": "most common"}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_rejects_a_role_missing_a_required_field(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": "", "desc": "The rotation", "hint": ""}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("name", r.stdout)

    def test_rejects_a_role_with_a_non_string_field_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": {"nested": "dict"}, "desc": "The rotation"}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be a non-empty string", r.stdout)

    def test_rejects_a_role_that_is_not_an_object_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(ms3=["just a string"]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("must be an object", r.stdout)

    def test_rejects_a_role_name_carrying_an_audience_specific_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                ms3=[{"id": "student", "name": "MS3 · clerkship student",
                      "desc": "The rotation", "hint": ""}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("audience-specific token", r.stdout)

    def test_rejects_a_role_desc_carrying_an_audience_specific_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            c, root = _write(tmp, self._cur(
                resident=[{"id": "pgy1", "name": "PGY-1",
                           "desc": "Resident on the unit", "hint": ""}]))
            r = _run(c, root)
            self.assertEqual(r.returncode, 1)
            self.assertIn("audience-specific token", r.stdout)

    def test_rejects_roles_missing_a_site_key_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cur = _curriculum([])
            cur["roles"] = {"ms3": []}  # no "resident" key at all
            c, root = _write(tmp, cur)
            r = _run(c, root)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertNotIn("Traceback", r.stderr)
            self.assertIn("roles.resident", r.stdout)


if __name__ == "__main__":
    unittest.main()
