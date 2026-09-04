#!/usr/bin/env python3
"""Contract tests for the site-specific Front Door catalog projection."""
import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
import warnings


HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common  # noqa: E402
from frontdoor_catalog import (  # noqa: E402
    assert_catalog_resolver_injected,
    build_frontdoor_payload,
    inject_frontdoor_payload,
    reachable_refs,
)


REVISION = "1234567890abcdef1234567890abcdef12345678"
ROTATION_PROJECTION = {
    "schemaVersion": 1, "audience": "ms3", "revision": "sha256-" + "A" * 43,
    "projectionDigest": "sha256-" + "B" * 43, "rotationEditionV2": "disabled",
    "selectionKeys": [], "resolutionRecords": [], "blockedKeys": [],
}


RESIDENT_EXTRAS = [
    "rp-agitation.html",
    "rp-brief-psych.html",
    "rp-canon-quiz.html",
    "systems_medlegal.md",
    "cl_reference.md",
    "rotation.md",
    "supervision_teaching.md",
    "adv_psychopharm.md",
    "canon_200.md",
]


DEFAULT_GOVERNANCE = {"status": "reviewed", "riskKind": "general", "riskLevel": "low"}


def _catalog(refs, governance_by_ref=None):
    """Final-nav-shaped catalog fixture; titles/kinds live here, never in curriculum."""
    governance_by_ref = governance_by_ref or {}
    return [{"section": "Library", "items": [
        {"f": ref, "t": "Title for " + ref,
         "k": "tool" if ref.endswith(".html") else "md",
         "governance": copy.deepcopy(governance_by_ref.get(ref, DEFAULT_GOVERNANCE))}
        for ref in refs
    ]}]


def _curriculum():
    shared = ["shared-%02d.md" % number for number in range(1, 82)]
    return {
        "learningPaths": {
            "ms3": {"id": "ms3-six-week", "weeks": [
                {"n": n, "title": "M%d" % n, "theme": "MT%d" % n,
                 "focusCategories": ["safety"],
                 "items": ([{"ref": self_ref, "kind": "read"}] if n == 1 else [])}
                for n, self_ref in [(1, "shared-01.md"), (2, "shared-02.md"),
                                    (3, "shared-03.md"), (4, "shared-04.md"),
                                    (5, "shared-05.md"), (6, "shared-06.md")]
            ]},
            "resident": {"id": "resident-four-week", "weeks": [
                {"n": 1, "title": "R1", "theme": "RT1",
                 "focusCategories": ["safety"],
                 "items": [{"ref": "rp-canon-quiz.html", "kind": "tool"}]},
                {"n": 2, "title": "R2", "theme": "RT2",
                 "focusCategories": ["mood"], "items": []},
                {"n": 3, "title": "R3", "theme": "RT3",
                 "focusCategories": ["ethics"], "items": []},
                {"n": 4, "title": "R4", "theme": "RT4",
                 "focusCategories": ["relational"], "items": []},
            ]},
        },
        "libraryColumns": [
            {"name": "Core", "accent": "topic", "refs": shared},
        ],
        "libraryExclude": [],
        "safetyKit": [],
        "roles": {
            "ms3": [{"id": "core", "name": "Core", "desc": "Core role"}],
            "resident": [{"id": "advanced", "name": "Advanced", "desc": "Advanced role"}],
        },
        "synonyms": {},
        "siteLibrary": {
            "ms3": {"additions": [], "exclusions": []},
            "resident": {
                "additions": [
                    {"column": "Core", "refs": RESIDENT_EXTRAS},
                ],
                "exclusions": [],
            },
        },
    }


class FrontdoorCatalogTest(unittest.TestCase):
    def setUp(self):
        self.curriculum = _curriculum()
        self.shared = list(self.curriculum["libraryColumns"][0]["refs"])
        self.ms3_catalog = _catalog(self.shared)
        self.resident_catalog = _catalog(self.shared + RESIDENT_EXTRAS)

    def test_site_projections_have_expected_placed_counts_and_roles(self):
        ms3 = build_frontdoor_payload("ms3", self.curriculum, self.ms3_catalog, REVISION)
        resident = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog, REVISION)

        self.assertEqual(ms3["audience"], "ms3")
        self.assertEqual(resident["audience"], "resident")
        self.assertEqual(ms3["coreRevision"], REVISION)
        self.assertEqual(resident["coreRevision"], REVISION)

        self.assertEqual(sum(len(column["refs"]) for column in ms3["curriculum"]["libraryColumns"]), 81)
        self.assertEqual(sum(len(column["refs"]) for column in resident["curriculum"]["libraryColumns"]), 90)
        self.assertEqual(ms3["roles"], self.curriculum["roles"]["ms3"])
        self.assertEqual(resident["roles"], self.curriculum["roles"]["resident"])
        self.assertNotEqual(ms3["roles"], resident["roles"])
        self.assertTrue(all(isinstance(ref, str)
                            for column in resident["curriculum"]["libraryColumns"]
                            for ref in column["refs"]))
        self.assertEqual(ms3["curriculum"]["path"],
                         {"id": "ms3-six-week", "weekCount": 6})
        self.assertEqual(resident["curriculum"]["path"],
                         {"id": "resident-four-week", "weekCount": 4})
        self.assertEqual(len(ms3["curriculum"]["weeks"]), 6)
        self.assertEqual(len(resident["curriculum"]["weeks"]), 4)
        self.assertNotIn("learningPaths", ms3["curriculum"])
        self.assertNotIn("learningPaths", resident["curriculum"])
        self.assertIn("rp-canon-quiz.html", {
            entry[1] for group in resident["manifest"].values() for entry in group})

    def test_payload_and_injection_carry_one_closed_rotation_catalog_projection(self):
        payload = build_frontdoor_payload("ms3", self.curriculum, self.ms3_catalog, REVISION,
                                         ROTATION_PROJECTION)
        self.assertEqual(payload["rotationEditionCatalog"], ROTATION_PROJECTION)
        with tempfile.NamedTemporaryFile("w+", encoding="utf-8") as page:
            page.write("\n".join([
                "var FD_CURRICULUM={};", "var FD_TOPIC_META={};", "var FD_TOOL_REGISTRY={};",
                "var FD_SITE_MANIFEST={};", "var FD_ROLES=[];", "var FD_AUDIENCE=\"\";",
                "var FD_CORE_REVISION=\"\";", "var FD_ROTATION_EDITION_CATALOG={};",
            ]))
            page.flush()
            inject_frontdoor_payload(page.name, payload, {}, {})
            page.seek(0)
            rendered = page.read()
        self.assertEqual(rendered.count("var FD_ROTATION_EDITION_CATALOG="), 1)
        self.assertIn('"rotationEditionV2": "disabled"', rendered)

    def test_projection_rejects_a_missing_site_path_wrong_id_missing_catalog_ref_or_kind_mismatch(self):
        cases = (
            ("missing", lambda c: c["learningPaths"].pop("resident"),
             self.resident_catalog, "learningPaths.resident"),
            ("id", lambda c: c["learningPaths"]["resident"].update({"id": "wrong"}),
             self.resident_catalog, "resident-four-week"),
            ("catalog", lambda c: c["learningPaths"]["resident"]["weeks"][0].update(
                {"items": [{"ref": "missing.md", "kind": "read"}]}),
             self.resident_catalog, "missing.md"),
            ("kind", lambda c: c["learningPaths"]["resident"]["weeks"][0].update(
                {"items": [{"ref": "rp-canon-quiz.html", "kind": "read"}]}),
             self.resident_catalog, "rp-canon-quiz.html"),
        )
        for label, mutate, catalog, message in cases:
            with self.subTest(label=label):
                curriculum = copy.deepcopy(self.curriculum)
                mutate(curriculum)
                with self.assertRaisesRegex(ValueError, message):
                    build_frontdoor_payload("resident", curriculum, catalog, REVISION)

    def test_resident_extra_titles_and_kinds_come_from_final_catalog(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog, REVISION)
        entries = payload["manifest"]["tools"] + payload["manifest"]["md"]
        resolved = {entry[1]: entry[2] for entry in entries}

        self.assertEqual(set(RESIDENT_EXTRAS), set(RESIDENT_EXTRAS) & set(resolved))
        for ref in RESIDENT_EXTRAS:
            self.assertEqual(resolved[ref], "Title for " + ref)
        self.assertEqual({entry[1] for entry in payload["manifest"]["tools"]},
                         {ref for ref in self.shared + RESIDENT_EXTRAS if ref.endswith(".html")})

    def test_projected_manifest_preserves_each_site_governance_triplet_without_mutating_inputs(self):
        shared_pending = {"status": "pending", "riskKind": "clinical", "riskLevel": "high"}
        resident_pending = {"status": "pending", "riskKind": "legal", "riskLevel": "moderate"}
        governance = {
            self.shared[0]: shared_pending,
            RESIDENT_EXTRAS[0]: resident_pending,
        }
        curriculum = copy.deepcopy(self.curriculum)
        ms3_catalog = _catalog(self.shared, governance)
        resident_catalog = _catalog(self.shared + RESIDENT_EXTRAS, governance)
        original_ms3_catalog = copy.deepcopy(ms3_catalog)
        original_resident_catalog = copy.deepcopy(resident_catalog)

        ms3 = build_frontdoor_payload("ms3", curriculum, ms3_catalog, REVISION)
        resident = build_frontdoor_payload("resident", curriculum, resident_catalog, REVISION)
        ms3_entries = {entry[1]: entry for group in ms3["manifest"].values() for entry in group}
        resident_entries = {entry[1]: entry for group in resident["manifest"].values() for entry in group}

        self.assertEqual(ms3_entries[self.shared[0]][3], shared_pending)
        self.assertEqual(resident_entries[self.shared[0]][3], shared_pending)
        self.assertEqual(resident_entries[RESIDENT_EXTRAS[0]][3], resident_pending)
        self.assertEqual(curriculum, self.curriculum)
        self.assertEqual(ms3_catalog, original_ms3_catalog)
        self.assertEqual(resident_catalog, original_resident_catalog)

    def test_projection_fails_closed_for_missing_malformed_extra_or_conflicting_governance(self):
        missing = _catalog(self.shared)
        missing[0]["items"][0].pop("governance")
        malformed = _catalog(self.shared)
        malformed[0]["items"][0]["governance"]["riskLevel"] = "unreviewed"
        extra = _catalog(self.shared)
        extra[0]["items"][0]["governance"]["reason"] = "not a compact triplet"
        conflicting = _catalog(self.shared)
        duplicate = copy.deepcopy(conflicting[0]["items"][0])
        duplicate["governance"] = {"status": "pending", "riskKind": "clinical", "riskLevel": "high"}
        conflicting.append({"section": "Duplicate", "items": [duplicate]})

        for name, catalog in (("missing", missing), ("malformed", malformed),
                              ("extra", extra), ("conflicting", conflicting)):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    build_frontdoor_payload("ms3", self.curriculum, catalog, REVISION)

    def test_every_emitted_ref_resolves_and_input_is_not_mutated(self):
        original = copy.deepcopy(self.curriculum)
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog, REVISION)
        manifest_refs = {entry[1] for group in payload["manifest"].values() for entry in group}
        placed = {ref for column in payload["curriculum"]["libraryColumns"]
                  for ref in column["refs"]}

        self.assertEqual(placed, manifest_refs)
        self.assertEqual(self.curriculum, original)

    def test_duplicate_placed_ref_fails(self):
        duplicate = copy.deepcopy(self.curriculum)
        duplicate["siteLibrary"]["resident"]["additions"].append(
            {"column": "Core", "refs": [RESIDENT_EXTRAS[0]]})

        with self.assertRaisesRegex(ValueError, "duplicate"):
            build_frontdoor_payload("resident", duplicate, self.resident_catalog, REVISION)

    def test_unplaced_ref_fails_when_final_catalog_has_no_entry(self):
        unplaced_catalog = _catalog(self.shared + RESIDENT_EXTRAS[:-1])

        with self.assertRaisesRegex(ValueError, RESIDENT_EXTRAS[-1]):
            build_frontdoor_payload("resident", self.curriculum, unplaced_catalog, REVISION)

    def test_resident_replacement_consumes_a_json_value_with_semicolons(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog, REVISION)
        previous = '{"_note":"old; MS3 payload"}'
        with tempfile.NamedTemporaryFile("w+", encoding="utf-8") as page:
            page.write("\n".join([
                "var FD_CURRICULUM=" + previous + ";",
                "var FD_TOPIC_META={};",
                "var FD_TOOL_REGISTRY={};",
                "var FD_SITE_MANIFEST={};",
                "var FD_ROLES=[];",
                "var FD_AUDIENCE=\"\";",
                "var FD_CORE_REVISION=\"\";",
                "var FD_ROTATION_EDITION_CATALOG={};",
            ]))
            page.flush()
            inject_frontdoor_payload(page.name, payload, {"note": "new; resident"}, {"tools": []})
            page.seek(0)
            rendered = page.read()

        self.assertNotIn(previous, rendered)
        self.assertEqual(rendered.count("var FD_CURRICULUM="), 1)
        self.assertIn('"note": "new; resident"', rendered)
        start = rendered.index("var FD_CURRICULUM=") + len("var FD_CURRICULUM=")
        _, end = json.JSONDecoder().raw_decode(rendered[start:])
        self.assertTrue(rendered[start + end:].startswith(";\nvar FD_TOPIC_META="), rendered)

    def test_inline_json_escapes_html_and_javascript_line_separators(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog, REVISION)
        hostile = "</script><!--&\u2028\u2029"
        with tempfile.NamedTemporaryFile("w+", encoding="utf-8") as page:
            page.write("\n".join([
                "var FD_CURRICULUM={};",
                "var FD_TOPIC_META={};",
                "var FD_TOOL_REGISTRY={};",
                "var FD_SITE_MANIFEST={};",
                "var FD_ROLES=[];",
                "var FD_AUDIENCE=\"\";",
                "var FD_CORE_REVISION=\"\";",
                "var FD_ROTATION_EDITION_CATALOG={};",
            ]))
            page.flush()
            inject_frontdoor_payload(page.name, payload, {"hostile": hostile}, {"tools": []})
            page.seek(0)
            rendered = page.read()
            js_check = subprocess.run(
                ["node", "--check", page.name], capture_output=True, text=True)

        self.assertNotIn("</script>", rendered.lower())
        self.assertNotIn("<!--", rendered)
        self.assertNotIn("&", rendered)
        self.assertNotIn("\u2028", rendered)
        self.assertNotIn("\u2029", rendered)
        self.assertEqual(js_check.returncode, 0, js_check.stderr)
        start = rendered.index("var FD_TOPIC_META=") + len("var FD_TOPIC_META=")
        parsed, end = json.JSONDecoder().raw_decode(rendered[start:])
        self.assertEqual(parsed, {"hostile": hostile})
        self.assertEqual(rendered[start + end], ";")

    def test_projection_removes_placed_refs_from_library_exclusions(self):
        curriculum = copy.deepcopy(self.curriculum)
        curriculum["libraryExclude"] = [
            {"ref": ref, "reason": "MS3-only placement"}
            for ref in RESIDENT_EXTRAS
        ]
        payload = build_frontdoor_payload("resident", curriculum, self.resident_catalog, REVISION)
        placed = {ref for column in payload["curriculum"]["libraryColumns"]
                  for ref in column["refs"]}
        excluded = {entry["ref"] for entry in payload["curriculum"]["libraryExclude"]}

        self.assertTrue(set(RESIDENT_EXTRAS).issubset(placed))
        self.assertTrue(placed.isdisjoint(excluded))
        self.assertTrue(set(RESIDENT_EXTRAS).isdisjoint(excluded))

    def test_real_curriculum_projection_pins_site_counts_and_resident_extras(self):
        repo = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
        with open(os.path.join(repo, "curriculum.json"), encoding="utf-8") as fh:
            curriculum = json.load(fh)
        refs = {
            ref for column in curriculum["libraryColumns"] for ref in column["refs"]
        }
        refs.update(ref for addition in curriculum["siteLibrary"]["resident"]["additions"]
                    for ref in addition["refs"])
        catalog = _catalog(sorted(refs))
        ms3 = build_frontdoor_payload("ms3", curriculum, catalog, REVISION)
        resident = build_frontdoor_payload("resident", curriculum, catalog, REVISION)
        resident_placed = {
            ref for column in resident["curriculum"]["libraryColumns"]
            for ref in column["refs"]
        }
        resident_excluded = {
            entry["ref"] for entry in resident["curriculum"]["libraryExclude"]
        }
        resident_additions = [
            ref for addition in curriculum["siteLibrary"]["resident"]["additions"]
            for ref in addition["refs"]
        ]

        # Pinned counts over the REAL curriculum.json: a silent change to
        # libraryColumns or siteLibrary has to be acknowledged here. They read 81/90
        # until 2026-09-04 while the real file had 83/92 — the pin had drifted by two
        # on each site and nothing said so, because this whole suite ran in neither
        # ci.yml nor bin/verify.sh. Both now run it; that is the other half of this fix.
        self.assertEqual(sum(len(column["refs"]) for column in ms3["curriculum"]["libraryColumns"]), 83)
        self.assertEqual(sum(len(column["refs"]) for column in resident["curriculum"]["libraryColumns"]), 92)
        self.assertEqual(resident_additions, RESIDENT_EXTRAS)
        self.assertTrue(set(RESIDENT_EXTRAS).issubset(resident_placed))
        self.assertTrue(set(RESIDENT_EXTRAS).isdisjoint(resident_excluded))

    def test_payload_requires_a_supported_site_and_lowercase_full_revision(self):
        for site, revision, message in (
            ("faculty", REVISION, "unsupported site"),
            ("ms3", "ABCDEF1234567890abcdef1234567890abcdef12", "revision"),
            ("ms3", "abc123", "revision"),
        ):
            with self.subTest(site=site, revision=revision):
                with self.assertRaisesRegex(ValueError, message):
                    build_frontdoor_payload(site, self.curriculum, self.ms3_catalog, revision)

    def test_injects_all_eight_values_once_and_boots_them_for_shell_and_curator_shapes(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog, REVISION)
        with open(os.path.join(HERE, "frontdoor", "fd_edition_catalog.js"), encoding="utf-8") as source:
            catalog_body = source.read()
        fixtures = {
            "shell": "\n".join([
                "var FD_CURRICULUM={};", "var FD_TOPIC_META={};", "var FD_TOOL_REGISTRY={};",
                "var FD_SITE_MANIFEST={};", "var FD_ROLES=[];", "var FD_AUDIENCE=\"\";",
                "var FD_CORE_REVISION=\"\";", "var FD_ROTATION_EDITION_CATALOG={};", "/*__FD_DATA__*/", "/*__FD_EDITION_CATALOG__*/", "/*__FD_EDITION_CONTRACT__*/",
                "/*__FD_EDITION_PROJECT__*/", "/*__FD_EDITION_STUDENT__*/",
                "var FD_BOOT_CONTEXT={audience:FD_AUDIENCE,revision:FD_CORE_REVISION};",
            ]),
            "curator": "\n".join([
                "var FD_AUDIENCE=\"\";", "var FD_CORE_REVISION=\"\";", "var FD_CURRICULUM={};",
                "var FD_TOPIC_META={};", "var FD_TOOL_REGISTRY={};", "var FD_SITE_MANIFEST={};",
                "var FD_ROLES=[];", "var FD_ROTATION_EDITION_CATALOG={};", "/*__FD_DATA__*/", "/*__FD_EDITION_CATALOG__*/", "/*__FD_EDITION_CONTRACT__*/",
                "/*__FD_EDITION_PROJECT__*/", "/*__FD_EDITION_STUDENT__*/",
                "var FD_BOOT_CONTEXT={audience:FD_AUDIENCE,revision:FD_CORE_REVISION};",
            ]),
        }
        for name, fixture in fixtures.items():
            with self.subTest(name=name), tempfile.NamedTemporaryFile("w+", suffix=".js", encoding="utf-8") as page:
                page.write(fixture)
                page.flush()
                inject_frontdoor_payload(page.name, payload, {"site": name}, {"tools": []})
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", ResourceWarning)
                    self.assertTrue(common.inject_shared_snippets(page.name))
                with open(page.name, encoding="utf-8") as rendered_page:
                    rendered = rendered_page.read()
                for needle in ("FD_CURRICULUM", "FD_TOPIC_META", "FD_TOOL_REGISTRY", "FD_SITE_MANIFEST",
                               "FD_ROLES", "FD_AUDIENCE", "FD_CORE_REVISION", "FD_ROTATION_EDITION_CATALOG"):
                    self.assertEqual(rendered.count("var %s=" % needle), 1, needle)
                self.assertLess(rendered.index("function fdEsc("), rendered.index("var FD_EDITION_RULES="))
                self.assertEqual(rendered.count(catalog_body), 1)
                self.assertLess(rendered.index("var FD_ROTATION_EDITION_CATALOG="), rendered.index(catalog_body))
                self.assertLess(rendered.index("var FD_EDITION_CATALOG="), rendered.index("var FD_EDITION_RULES="))
                self.assertLess(rendered.index("var FD_EDITION_RULES="), rendered.index("FD_BOOT_CONTEXT"))
                result = subprocess.run(
                    ["node", "-e", "const fs=require('fs');const t=fs.readFileSync(process.argv[1],'utf8');const x=new Function(t+';return {audience:FD_AUDIENCE,revision:FD_CORE_REVISION,boot:FD_BOOT_CONTEXT}')();process.stdout.write(JSON.stringify(x));", page.name],
                    check=True, capture_output=True, text=True,
                )
                self.assertEqual(json.loads(result.stdout), {
                    "audience": "resident", "revision": REVISION,
                    "boot": {"audience": "resident", "revision": REVISION},
                })

    def test_trusted_catalog_revision_is_substituted_for_fresh_ms3_and_reused_resident_assembler_paths(self):
        """A fresh resolver sentinel and an inherited prior-audience literal must both be rebound."""
        revisions = ("sha256-" + "M" * 43, "sha256-" + "R" * 43)
        ms3_projection = {
            **ROTATION_PROJECTION, "revision": revisions[0], "audience": "ms3",
        }
        resident_projection = {
            **ROTATION_PROJECTION, "revision": revisions[1], "audience": "resident",
        }
        fixture = "\n".join([
            "var FD_ROTATION_EDITION_CATALOG=%s;" % json.dumps(
                ms3_projection, ensure_ascii=False, sort_keys=True
            ),
            "/*__FD_EDITION_CATALOG__*/",
        ])
        with tempfile.NamedTemporaryFile("w+", suffix=".js", encoding="utf-8") as page:
            page.write(fixture)
            page.flush()
            self.assertTrue(common.inject_shared_snippets(page.name))

            # Fresh MS3 assembly replaces the checked-in sentinel.
            assert_catalog_resolver_injected(page.name, revisions[0])
            with open(page.name, encoding="utf-8") as rendered_page:
                ms3 = rendered_page.read()
            self.assertEqual(ms3.count("var EXPECTED_REVISION='%s';" % revisions[0]), 1)
            self.assertNotIn("__FD_CATALOG_EXPECTED_REVISION__", ms3)

            # Resident assembly inherits the MS3 body, replaces the audience payload, and
            # must replace the already-substituted trusted literal rather than trusting it.
            old_value = "var FD_ROTATION_EDITION_CATALOG=" + json.dumps(
                ms3_projection, ensure_ascii=False, sort_keys=True
            ) + ";"
            new_value = "var FD_ROTATION_EDITION_CATALOG=" + json.dumps(
                resident_projection, ensure_ascii=False, sort_keys=True
            ) + ";"
            self.assertEqual(ms3.count(old_value), 1)
            page.seek(0)
            page.truncate()
            page.write(ms3.replace(old_value, new_value))
            page.flush()
            assert_catalog_resolver_injected(page.name, revisions[1])
            with open(page.name, encoding="utf-8") as rendered_page:
                resident = rendered_page.read()
            self.assertEqual(resident.count("var EXPECTED_REVISION='%s';" % revisions[1]), 1)
            self.assertNotIn("var EXPECTED_REVISION='%s';" % revisions[0], resident)

    def test_real_curator_source_can_be_reinjected_without_ms3_payload_residue(self):
        repo = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
        source = os.path.join(
            repo, "13_Faculty_Resources", "Rotation_Curation", "rotation-curator.html"
        )
        with open(os.path.join(repo, "curriculum.json"), encoding="utf-8") as fh:
            curriculum = json.load(fh)
        refs = {
            ref for column in curriculum["libraryColumns"] for ref in column["refs"]
        }
        refs.update(
            ref
            for addition in curriculum["siteLibrary"]["resident"]["additions"]
            for ref in addition["refs"]
        )
        catalog = _catalog(sorted(refs))
        ms3 = build_frontdoor_payload("ms3", curriculum, catalog, "a" * 40)
        resident = build_frontdoor_payload("resident", curriculum, catalog, "b" * 40)

        with tempfile.NamedTemporaryFile("w+", suffix=".html", encoding="utf-8") as page:
            with open(source, encoding="utf-8") as source_page:
                page.write(source_page.read())
            page.flush()
            inject_frontdoor_payload(page.name, ms3, {"site": "ms3"}, {"tools": []})
            inject_frontdoor_payload(
                page.name, resident, {"site": "resident"}, {"tools": []}
            )
            with open(page.name, encoding="utf-8") as rendered_page:
                rendered = rendered_page.read()

        self.assertIn('var FD_AUDIENCE="resident";', rendered)
        self.assertIn('var FD_CORE_REVISION="' + "b" * 40 + '";', rendered)
        self.assertIn('"id": "resident-four-week"', rendered)
        self.assertNotIn('var FD_AUDIENCE="ms3";', rendered)
        self.assertNotIn('"id": "ms3-six-week"', rendered)
        self.assertNotIn("a" * 40, rendered)
        for needle in (
            "FD_CURRICULUM", "FD_TOPIC_META", "FD_TOOL_REGISTRY",
            "FD_SITE_MANIFEST", "FD_ROLES", "FD_AUDIENCE", "FD_CORE_REVISION", "FD_ROTATION_EDITION_CATALOG",
        ):
            self.assertEqual(rendered.count("var %s=" % needle), 1, needle)


class ReachableRefsTest(unittest.TestCase):
    """reachable_refs feeds common.build_search_index; it must equal the manifest."""

    def test_returns_every_manifest_ref(self):
        payload = {"manifest": {
            "tools": [["", "mse.html", "MSE", {}]],
            "md": [["", "t_sleep.md", "Sleep", {}], ["", "a.md", "A", {}]],
        }}
        self.assertEqual(reachable_refs(payload), {"mse.html", "t_sleep.md", "a.md"})

    def test_tolerates_a_missing_or_empty_manifest(self):
        self.assertEqual(reachable_refs({}), set())
        self.assertEqual(reachable_refs({"manifest": {}}), set())


if __name__ == "__main__":
    unittest.main()
