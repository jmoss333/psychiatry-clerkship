#!/usr/bin/env python3
"""Behavior tests for validate_therapies.py: each check is proved by BREAKING it.

The committed therapies.json must pass (it is empty until G0-E) and so must a synthetic
two-record fixture; then one mutation per check must fail with that check's own tag
(SILENT_SHRINK §F).
"""

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import validate_therapies as vt  # noqa: E402
from registry_checks import j_hash  # noqa: E402

try:
    import jsonschema
except ImportError:  # pragma: no cover
    jsonschema = None

ROOT = vt.ROOT
FIELDMAP = json.loads(vt.FIELDMAP.read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "therapies.schema.json").read_text(encoding="utf-8"))
EVIDENCE_ID = json.loads((ROOT / "evidence_registry.json").read_text(encoding="utf-8"))["sources"][0]["id"]
QBANK_ID = json.loads((ROOT / "question_bank.json").read_text(encoding="utf-8"))["items"][0]["id"]
DRUG_ID = json.loads((ROOT / "pharmacy.json").read_text(encoding="utf-8"))["records"][0]["id"]
COMMITTED = json.loads(vt.REGISTRY.read_text(encoding="utf-8"))


def record(rid, name, guideline):
    return {
        "id": rid, "shortName": name, "fullName": "Fixture %s" % name, "domain": "depression",
        "audienceTier": ["ms3", "resident"], "safetyLevel": "moderate",
        "evidence": {"guideline": guideline, "level": "I", "keyEvidenceIds": [EVIDENCE_ID]},
        "format": {"typicalSessions": "12-20", "modalities": ["individual", "group"]},
        "description": {"keyComponents": "Fixture components, no figures."},
        "guidance": {"whenToUse": "Fixture indication prose.", "cautions": "Fixture caution."},
        "familyExplainer": {"text": "This is talk therapy. It happens once a week. It helps people change habits of thought."},
        "attendingAsks": ["When would you choose this over medication alone?"],
        "retrieval": [{"id": "ask1", "askIndex": 0, "revealFrom": ["guidance.whenToUse"]}],
        "evidenceIds": [], "qbankIds": [QBANK_ID], "relatedDrugIds": [DRUG_ID], "relatedScaleIds": [],
        "facultyReview": {"status": "pending"},
        "provenance": {
            "reconnectRecords": ["ebp_reference[name=%s]" % name],
            "carried": {"typical_sessions": "12-20", "source": guideline,
                        "when_to_use": "First-line for mild to moderate depression in the fixture."},
            "fieldClasses": {"evidence.guideline": "V", "format.typicalSessions": "V", "description.keyComponents": "J",
                             "guidance.whenToUse": "J", "guidance.cautions": "J", "familyExplainer.text": "J"},
            "jSources": {"guidance.whenToUse": [{"page": "reconnect:when_to_use",
                                                  "quote": "First-line for mild to moderate depression in the fixture."}]},
            "authoredFields": ["description.keyComponents", "guidance.cautions", "familyExplainer.text"],
        },
    }


def fixture():
    return {**{k: v for k, v in COMMITTED.items() if k != "records"},
            "records": [record("cbt", "CBT", "NICE NG222"), record("fpe", "FPE", "NICE CG178")]}


def run(registry):
    findings, _ = vt.check(registry, FIELDMAP)
    return findings


class ValidateTherapiesTest(unittest.TestCase):
    def assertTagged(self, findings, tag):
        self.assertTrue(findings, "mutation produced no finding")
        self.assertTrue(any(f.startswith(tag) for f in findings), findings)

    def test_committed_registry_is_clean_and_schema_valid(self):
        self.assertEqual(run(COMMITTED), [])
        if jsonschema:
            jsonschema.Draft7Validator(SCHEMA).validate(COMMITTED)

    def test_fixture_is_clean_and_schema_valid(self):
        data = fixture()
        self.assertEqual(run(data), [])
        if jsonschema:
            jsonschema.Draft7Validator(SCHEMA).validate(data)

    def test_denylisted_key_fails(self):
        data = fixture(); data["records"][0]["maine_availability"] = "x"
        self.assertTagged(run(data), "AC13")

    def test_dose_literal_fails(self):
        data = fixture(); data["records"][0]["guidance"]["cautions"] = "Hold above 300 mg."
        self.assertTagged(run(data), "AC4'")

    def test_unknown_ids_fail(self):
        data = fixture(); data["records"][0]["evidence"]["keyEvidenceIds"] = ["nope"]
        self.assertTagged(run(data), "KEY")
        data = fixture(); data["records"][0]["qbankIds"] = ["nope"]
        self.assertTagged(run(data), "AC5")
        data = fixture(); data["records"][0]["relatedDrugIds"] = ["nope"]
        self.assertTagged(run(data), "LINK")
        data = fixture(); data["records"][0]["relatedScaleIds"] = ["nope"]
        self.assertTagged(run(data), "LINK")

    def test_quote_must_equal_carried(self):
        data = fixture(); data["records"][0]["provenance"]["carried"]["when_to_use"] = "changed upstream"
        self.assertTagged(run(data), "SPAN")

    def test_unsourced_judgment_field_fails(self):
        data = fixture(); data["records"][0]["provenance"]["authoredFields"] = []
        self.assertTagged(run(data), "COVER")

    def test_hard_family_text_fails(self):
        data = fixture()
        data["records"][0]["familyExplainer"]["text"] = ("Psychotherapeutic interventions necessitate comprehensive "
            "collaborative conceptualization of multidimensional interpersonal functioning utilizing standardized methodologies.")
        self.assertTagged(run(data), "AC7")

    def test_review_hash_binds_j_fields(self):
        data = fixture(); rec = data["records"][0]
        rec["facultyReview"] = {"status": "reviewed", "reviewer": "Fixture, MD", "lastReviewed": "2026-09-30",
                                "reviewedFieldsHash": j_hash(rec)}
        self.assertEqual(run(data), [])
        rec["guidance"]["cautions"] = "Edited after review."
        self.assertTagged(run(data), "AC6")

    def test_guideline_must_match_sources(self):
        data = fixture(); data["records"][0]["evidence"]["guideline"] = "NICE CG113"
        self.assertTagged(run(data), "GL")
        data = fixture(); data["records"][0]["id"] = "not-a-roster-modality"
        self.assertTagged(run(data), "GL")
        data = fixture(); data["records"][0]["evidence"]["guideline"] = "NG222"  # the guideline id alone also resolves
        self.assertEqual([f for f in run(data) if f.startswith("GL")], [])

    def test_bare_percentage_needs_an_evidence_id(self):
        data = fixture(); rec = data["records"][0]
        rec["description"]["keyComponents"] = "60-70% positive response rates."
        rec["evidenceIds"], rec["evidence"]["keyEvidenceIds"] = [], []
        self.assertTagged(run(data), "BARE")
        rec["evidence"]["keyEvidenceIds"] = [EVIDENCE_ID]
        self.assertEqual([f for f in run(data) if f.startswith("BARE")], [])

    def test_gate_never_imports_the_dev_only_sync(self):
        source = (HERE / "validate_therapies.py").read_text(encoding="utf-8")
        self.assertNotIn("sync_from_reconnect", source)
        for key in ("maine_availability", "patient_profile"):
            self.assertNotIn('"%s"' % key, source, "the gate must not restate the denylist")


if __name__ == "__main__":
    unittest.main(verbosity=2)
