#!/usr/bin/env python3
"""Contract tests for the site-specific Front Door catalog projection."""
import copy
import json
import os
import subprocess
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

        ms3 = build_frontdoor_payload("ms3", curriculum, ms3_catalog)
        resident = build_frontdoor_payload("resident", curriculum, resident_catalog)
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
                    build_frontdoor_payload("ms3", self.curriculum, catalog)

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

        with self.assertRaisesRegex(ValueError, RESIDENT_EXTRAS[-1]):
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

    def test_inline_json_escapes_html_and_javascript_line_separators(self):
        payload = build_frontdoor_payload("resident", self.curriculum, self.resident_catalog)
        hostile = "</script><!--&\u2028\u2029"
        with tempfile.NamedTemporaryFile("w+", encoding="utf-8") as page:
            page.write("\n".join([
                "var FD_CURRICULUM={};",
                "var FD_TOPIC_META={};",
                "var FD_TOOL_REGISTRY={};",
                "var FD_SITE_MANIFEST={};",
                "var FD_ROLES=[];",
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
        payload = build_frontdoor_payload("resident", curriculum, self.resident_catalog)
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
        ms3 = build_frontdoor_payload("ms3", curriculum, catalog)
        resident = build_frontdoor_payload("resident", curriculum, catalog)
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

        self.assertEqual(sum(len(column["refs"]) for column in ms3["curriculum"]["libraryColumns"]), 81)
        self.assertEqual(sum(len(column["refs"]) for column in resident["curriculum"]["libraryColumns"]), 90)
        self.assertEqual(resident_additions, RESIDENT_EXTRAS)
        self.assertTrue(set(RESIDENT_EXTRAS).issubset(resident_placed))
        self.assertTrue(set(RESIDENT_EXTRAS).isdisjoint(resident_excluded))


if __name__ == "__main__":
    unittest.main()
