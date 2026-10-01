#!/usr/bin/env python3
"""Behavior tests for validate_screening_tools.py: each check is proved by BREAKING it.

The committed screening_tools.json must pass (it is empty until G0-S) and so must a synthetic
two-record fixture that exercises every field; then one mutation per check must fail with that
check's own tag. A check that cannot be made to fail is not a check (SILENT_SHRINK §F).
"""

import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import validate_screening_tools as vs  # noqa: E402
from registry_checks import j_hash  # noqa: E402

try:
    import jsonschema
except ImportError:  # pragma: no cover
    jsonschema = None

ROOT = vs.ROOT
FIELDMAP = json.loads(vs.FIELDMAP.read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "screening_tools.schema.json").read_text(encoding="utf-8"))
EVIDENCE_ID = json.loads((ROOT / "evidence_registry.json").read_text(encoding="utf-8"))["sources"][0]["id"]
QBANK_ID = json.loads((ROOT / "question_bank.json").read_text(encoding="utf-8"))["items"][0]["id"]
DRUG_ID = json.loads((ROOT / "pharmacy.json").read_text(encoding="utf-8"))["records"][0]["id"]
COMMITTED = json.loads(vs.REGISTRY.read_text(encoding="utf-8"))


def record(rid, name, url, *, rights_id=None, link_only=False):
    rec = {
        "id": rid, "shortName": name, "fullName": "Fixture %s" % name, "domain": "mood",
        "audienceTier": ["ms3", "resident"], "safetyLevel": "high",
        "administration": {"itemCount": 9, "timeToComplete": "1-5 min", "administeredBy": "self-report"},
        "scoring": {"cutoffs": [{"range": "0-4", "label": "minimal"}, {"range": "10+", "label": "moderate or worse"}],
                    "whatANegativeMisses": "A low score does not rule out risk in a guarded patient."},
        "psychometrics": {"sensitivity": {"value": "88%", "qualifier": "at cutoff >=10, primary care"},
                          "specificity": {"value": "88%", "qualifier": "at cutoff >=10, primary care"},
                          "evidenceIds": [EVIDENCE_ID]},
        "rights": {"costStatement": "Free", "custodianUrl": url, "linkOnly": link_only},
        "attribution": {"custodian": "Fixture custodian", "evidenceLevel": "II"},
        "guidance": {"whenToUse": "Fixture guidance on when to give it.", "cadence": "Baseline and weekly."},
        "familyExplainer": {"text": "This is a short form. It asks how you have felt. The score helps the team plan care."},
        "attendingAsks": ["What does a score of 12 tell you?"],
        "retrieval": [{"id": "ask1", "askIndex": 0, "revealFrom": ["scoring.cutoffs[1].label"]}],
        "evidenceIds": [EVIDENCE_ID], "qbankIds": [QBANK_ID], "monitoringFor": [DRUG_ID],
        "facultyReview": {"status": "pending"},
        "provenance": {
            "reconnectRecords": ["screening_tools[name=%s]" % name],
            "carried": {"clinical_cutoffs": "0-4 Minimal; 10+ Moderate"},
            "fieldClasses": {"scoring.cutoffs": "V", "psychometrics": "V", "guidance.whenToUse": "J",
                             "guidance.cadence": "J", "scoring.whatANegativeMisses": "J", "familyExplainer.text": "J"},
            "jSources": {"guidance.whenToUse": [{"page": "reconnect:clinical_cutoffs", "quote": "0-4 Minimal; 10+ Moderate"}]},
            "authoredFields": ["guidance.cadence", "scoring.whatANegativeMisses", "familyExplainer.text"],
        },
    }
    if rights_id:
        rec["rights"]["rightsId"] = rights_id
    return rec


def fixture():
    return {**{k: v for k, v in COMMITTED.items() if k != "records"},
            "records": [record("phq-9", "PHQ-9", "https://www.phqscreeners.com/", rights_id="phq9-gad7", link_only=True),
                        record("pcl-5", "PCL-5", "https://www.ptsd.va.gov/professional/assessment/adult-sr/ptsd-checklist.asp")]}


def run(registry):
    findings, _ = vs.check(registry, FIELDMAP)
    return findings


class ValidateScreeningToolsTest(unittest.TestCase):
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
        data = fixture(); data["records"][0]["patient_profile"] = "x"
        self.assertTagged(run(data), "AC13")

    def test_dose_literal_fails(self):
        data = fixture(); data["records"][0]["guidance"]["whenToUse"] = "Give 20 mg first."
        self.assertTagged(run(data), "AC4'")

    def test_unknown_evidence_and_qbank_ids_fail(self):
        data = fixture(); data["records"][0]["evidenceIds"] = ["nope"]
        self.assertTagged(run(data), "AC5")
        data = fixture(); data["records"][0]["qbankIds"] = ["nope"]
        self.assertTagged(run(data), "AC5")
        data = fixture(); data["records"][0]["psychometrics"]["evidenceIds"] = ["nope"]
        self.assertTagged(run(data), "PSY")

    def test_quote_must_equal_carried_or_be_verbatim(self):
        data = fixture(); data["records"][0]["provenance"]["carried"]["clinical_cutoffs"] = "changed"
        self.assertTagged(run(data), "SPAN")
        data = fixture()
        data["records"][0]["provenance"]["jSources"]["guidance.whenToUse"] = [{"page": "no/such/page.md", "quote": "x"}]
        self.assertTagged(run(data), "SPAN")

    def test_unsourced_judgment_field_fails(self):
        data = fixture(); data["records"][0]["provenance"]["authoredFields"] = []
        self.assertTagged(run(data), "COVER")

    def test_hard_family_text_fails(self):
        data = fixture()
        data["records"][0]["familyExplainer"]["text"] = ("Psychometric instrumentation necessitates comprehensive "
            "interpretation of multidimensional symptomatology within heterogeneous populations utilizing standardized methodologies.")
        self.assertTagged(run(data), "AC7")

    def test_retrieval_must_point_at_classified_fields(self):
        data = fixture(); data["records"][0]["retrieval"][0]["revealFrom"] = ["rights.costStatement"]
        self.assertTagged(run(data), "RET")

    def test_review_hash_binds_j_fields(self):
        data = fixture(); rec = data["records"][0]
        rec["facultyReview"] = {"status": "reviewed", "reviewer": "Fixture, MD", "lastReviewed": "2026-09-30",
                                "reviewedFieldsHash": j_hash(rec)}
        self.assertEqual(run(data), [])
        rec["guidance"]["whenToUse"] = "Edited after review."
        self.assertTagged(run(data), "AC6")
        rec["scoring"]["cutoffs"][0]["label"] = "none"  # a V-field edit does not reopen review
        rec["guidance"]["whenToUse"] = "Fixture guidance on when to give it."
        self.assertEqual([f for f in run(data) if f.startswith("AC6")], [])

    def test_custodian_url_must_match_sources_and_be_verified(self):
        data = fixture(); data["records"][1]["rights"]["custodianUrl"] = "https://example.invalid/"
        self.assertTagged(run(data), "SRC")
        data = fixture(); data["records"][1]["id"] = "not-a-roster-scale"
        self.assertTagged(run(data), "SRC")

    def test_rights_bound_instrument_is_bound(self):
        data = fixture(); del data["records"][0]["rights"]["rightsId"]
        self.assertTagged(run(data), "RIGHTS")
        data = fixture(); data["records"][0]["rights"]["linkOnly"] = False
        self.assertTagged(run(data), "RIGHTS")
        data = fixture(); data["records"][0]["rights"]["rightsId"] = "no-such-rights"
        self.assertTagged(run(data), "RIGHTS")

    def test_instrument_text_fails(self):
        data = fixture(); data["records"][1]["items"] = ["Little interest or pleasure in doing things"]
        self.assertTagged(run(data), "ITEMS")
        data = fixture()
        data["records"][1]["guidance"]["whenToUse"] = ("1. Little interest in things. 2. Feeling down most days. "
                                                       "3. Trouble sleeping at night. 4. Feeling tired.")
        self.assertTagged(run(data), "ITEMS")

    def test_bare_percentage_in_judgment_field_fails(self):
        data = fixture(); data["records"][1]["guidance"]["whenToUse"] = "Catches 88% of cases."
        self.assertTagged(run(data), "PSY")
        data = fixture(); data["records"][1]["guidance"]["whenToUse"] = "Catches 88% of cases at cutoff 10."
        self.assertEqual([f for f in run(data) if f.startswith("PSY")], [])

    def test_monitoring_links_resolve(self):
        data = fixture(); data["records"][0]["monitoringFor"] = ["no-such-drug"]
        self.assertTagged(run(data), "MON")

    def test_gate_never_imports_the_dev_only_sync(self):
        source = (HERE / "validate_screening_tools.py").read_text(encoding="utf-8")
        self.assertNotIn("sync_from_reconnect", source)
        for key in ("item_stems", "anchor_text", "patient_profile"):
            self.assertNotIn('"%s"' % key, source, "the gate must not restate the denylist")


if __name__ == "__main__":
    unittest.main(verbosity=2)
