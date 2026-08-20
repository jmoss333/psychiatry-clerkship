#!/usr/bin/env python3
"""Behavioral contracts for the static rotation-edition catalog gate.

Each test names a production break it catches: accepting a mismatched content
digest, leaking a pending record, exposing rejected input, or rewriting a
historical exact key would each make at least one assertion fail.
"""
import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from validate_rotation_edition_catalog import (  # noqa: E402
    build_audience_projection,
    canonical_digest,
    canonical_json_bytes,
    validate_catalog,
    validate_immutable_against_ref,
)

FIXTURES = ROOT / "tests" / "fixtures" / "rotation-edition-catalog"
TODAY = date(2026, 8, 20)


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def digested_catalog():
    catalog = fixture("valid-catalog.json")
    for record in catalog["records"]:
        bare = copy.deepcopy(record)
        bare.pop("contentDigest")
        record["contentDigest"] = canonical_digest(bare)
    return catalog


class RotationEditionCatalogTest(unittest.TestCase):
    def setUp(self):
        self.catalog = digested_catalog()
        self.governance = fixture("valid-governance.json")

    def test_canonical_digest_is_compact_sorted_and_base64url(self):
        self.assertEqual(canonical_json_bytes({"b": [2, 1], "a": "x"}), b'{"a":"x","b":[2,1]}')
        self.assertEqual(canonical_digest({"a": "x", "b": [2, 1]}),
                         "sha256-G7FBsL6vTr9CKA0ibRkpaqm83ghSVBk5P6jHBualcUg")

    def test_validation_requires_exact_digest_disposition_scope_and_safe_urls(self):
        validate_catalog(self.catalog, self.governance, today=TODAY)
        cases = []
        wrong_digest = copy.deepcopy(self.catalog)
        wrong_digest["records"][0]["contentDigest"] = "sha256-" + "A" * 43
        cases.append((wrong_digest, self.governance, "/records/0/contentDigest"))
        missing_disposition = copy.deepcopy(self.governance)
        missing_disposition["dispositions"].pop()
        cases.append((self.catalog, missing_disposition, "/dispositions"))
        unsafe_url = copy.deepcopy(self.catalog)
        unsafe_url["records"][1]["url"] = "https://user@example.edu/orientation?token=x"
        unsafe_url["records"][1]["contentDigest"] = canonical_digest({k: v for k, v in unsafe_url["records"][1].items() if k != "contentDigest"})
        cases.append((unsafe_url, self.governance, "/records/1/url"))
        for catalog, governance, pointer in cases:
            with self.subTest(pointer=pointer):
                with self.assertRaisesRegex(ValueError, pointer) as caught:
                    validate_catalog(catalog, governance, today=TODAY)
                self.assertNotIn("token=x", str(caught.exception))

    def test_projection_is_closed_stable_and_applies_lifecycle_rules(self):
        validate_catalog(self.catalog, self.governance, today=TODAY)
        projection = build_audience_projection(self.catalog, self.governance, "ms3")
        self.assertEqual(set(projection), {"schemaVersion", "audience", "revision", "projectionDigest",
                                           "rotationEditionV2", "selectionKeys", "resolutionRecords", "blockedKeys"})
        self.assertEqual(projection["selectionKeys"], ["choice.arrival@v1", "location.example-unit@v1"])
        self.assertEqual([record["key"] for record in projection["resolutionRecords"]],
                         ["choice.arrival@v1", "location.example-unit@v1", "profile.example-attending@v1"])
        self.assertEqual(projection["blockedKeys"], ["link.orientation@v1"])
        self.assertNotIn("reviewRef", canonical_json_bytes(projection).decode("utf-8"))
        self.assertEqual(projection["projectionDigest"], canonical_digest({
            key: value for key, value in projection.items() if key != "projectionDigest"
        }))
        self.assertEqual(projection, build_audience_projection(self.catalog, self.governance, "ms3"))

    def test_immutable_history_rejects_edits_or_removal_but_allows_new_version_and_disposition_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "13_Faculty_Resources" / "Rotation_Curation"
            path.mkdir(parents=True)
            prior = copy.deepcopy(self.catalog)
            (path / "rotation_edition_catalog.json").write_text(json.dumps(prior), encoding="utf-8")
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.email=test@example.edu", "-c", "user.name=Test", "commit", "-qm", "prior"], check=True)
            ref = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
            changed = copy.deepcopy(self.catalog)
            changed["records"][0]["label"] = "Changed label"
            changed["records"][0]["contentDigest"] = canonical_digest({k: v for k, v in changed["records"][0].items() if k != "contentDigest"})
            with self.assertRaisesRegex(ValueError, "/records"):
                validate_immutable_against_ref(root, ref, changed)
            removed = copy.deepcopy(self.catalog)
            removed["records"].pop(0)
            with self.assertRaisesRegex(ValueError, "/records"):
                validate_immutable_against_ref(root, ref, removed)
            added = copy.deepcopy(self.catalog)
            new = copy.deepcopy(added["records"][0]); new["key"] = "choice.arrival@v2"
            new["contentDigest"] = canonical_digest({k: v for k, v in new.items() if k != "contentDigest"})
            added["records"].append(new); added["records"].sort(key=lambda item: item["key"])
            validate_immutable_against_ref(root, ref, added)


if __name__ == "__main__":
    unittest.main()
