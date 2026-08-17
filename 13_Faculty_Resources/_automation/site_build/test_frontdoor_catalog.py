#!/usr/bin/env python3
"""Contract tests for the site-specific Front Door catalog projection."""
import copy
import json
import os
import sys
import tempfile
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from frontdoor_catalog import build_frontdoor_payload, inject_frontdoor_payload  # noqa: E402


RESIDENT_EXTRAS = [
    "rp-agitation.html",
    "rp-brief-psych.html",
    "rp-canon-quiz.html",
    "rotation.md",
    "adv_psychopharm.md",
    "systems_medlegal.md",
    "supervision_teaching.md",
    "canon_200.md",
    "cl_reference.md",
]


def _catalog(refs):
    """Final-nav-shaped catalog fixture; titles/kinds live here, never in curriculum."""
    return [{"section": "Library", "items": [
        {"f": ref, "t": "Title for " + ref,
         "k": "tool" if ref.endswith(".html") else "md"}
        for ref in refs
    ]}]


def _curriculum():
    shared = ["shared-%02d.md" % number for number in range(1, 82)]
    return {
        "weeks": [],
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
        ms3 = build_frontdoor_payload("ms3", self.curriculum, self.ms3_catalog)
        resident = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog)

        self.assertEqual(sum(len(column["refs"]) for column in ms3["curriculum"]["libraryColumns"]), 81)
        self.assertEqual(sum(len(column["refs"]) for column in resident["curriculum"]["libraryColumns"]), 90)
        self.assertEqual(ms3["roles"], self.curriculum["roles"]["ms3"])
        self.assertEqual(resident["roles"], self.curriculum["roles"]["resident"])
        self.assertNotEqual(ms3["roles"], resident["roles"])
        self.assertTrue(all(isinstance(ref, str)
                            for column in resident["curriculum"]["libraryColumns"]
                            for ref in column["refs"]))

    def test_resident_extra_titles_and_kinds_come_from_final_catalog(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog)
        entries = payload["manifest"]["tools"] + payload["manifest"]["md"]
        resolved = {entry[1]: entry[2] for entry in entries}

        self.assertEqual(set(RESIDENT_EXTRAS), set(RESIDENT_EXTRAS) & set(resolved))
        for ref in RESIDENT_EXTRAS:
            self.assertEqual(resolved[ref], "Title for " + ref)
        self.assertEqual({entry[1] for entry in payload["manifest"]["tools"]},
                         {ref for ref in self.shared + RESIDENT_EXTRAS if ref.endswith(".html")})

    def test_every_emitted_ref_resolves_and_input_is_not_mutated(self):
        original = copy.deepcopy(self.curriculum)
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog)
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
            build_frontdoor_payload("resident", duplicate, self.resident_catalog)

    def test_unplaced_ref_fails_when_final_catalog_has_no_entry(self):
        unplaced_catalog = _catalog(self.shared + RESIDENT_EXTRAS[:-1])

        with self.assertRaisesRegex(ValueError, "cl_reference.md"):
            build_frontdoor_payload("resident", self.curriculum, unplaced_catalog)

    def test_resident_replacement_consumes_a_json_value_with_semicolons(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog)
        previous = '{"_note":"old; MS3 payload"}'
        with tempfile.NamedTemporaryFile("w+", encoding="utf-8") as page:
            page.write("\n".join([
                "var FD_CURRICULUM=" + previous + ";",
                "var FD_TOPIC_META={};",
                "var FD_TOOL_REGISTRY={};",
                "var FD_SITE_MANIFEST={};",
                "var FD_ROLES=[];",
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


if __name__ == "__main__":
    unittest.main()
