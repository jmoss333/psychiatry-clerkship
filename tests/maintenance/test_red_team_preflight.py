"""Prepared evidence must never turn a skipped probe into an attestation."""

import sys
import unittest
from hashlib import sha256
from pathlib import Path

AUTOMATION = Path(__file__).resolve().parents[2] / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance.red_team_deploys import EvidenceUnavailable  # noqa: E402
from maintenance.red_team_preflight import prepare  # noqa: E402

PACK = b'{"version":"fixture","engine":{"modelPinned":"model-a"}}'


def snapshot():
    return {
        "deployments": {key: {"siteId": key, "deployId": key,
                             "commitRef": "1" * 40, "deployUrl": f"https://{key}.example",
                             "publishedAt": "2026-09-27T01:00:00Z"}
                        for key in ("proxy", "ms3", "res")},
        "packSha256": sha256(PACK).hexdigest(), "packVersion": "fixture", "model": "model-a",
    }


def live():
    return {"schemaVersion": 1, "tier": "live", "state": "passed",
            "checks": [{"id": key, "status": "pass"} for key in
                       ("D0", "D1", "D1b", "D5", "B5")],
            "actorModel": "model-a", "evaluatorModel": "model-a",
            "packVersion": "fixture", "packSha256": sha256(PACK).hexdigest(),
            "realtimeEnabled": False, "realtimeModel": None,
            "transcriptionModel": None, "managedVoiceEnabled": False,
            "managedVoiceStack": None}


class PreflightTests(unittest.TestCase):
    def run_prepare(self, live_result=None, snap=None, pack=PACK, tier1=None):
        return prepare(
            snap or snapshot(),
            lambda data: tier1 or {"state": "passed", "passes": 30, "total": 30},
            lambda endpoint: live_result or live(),
            pack_loader=lambda commit: pack,
        )

    def test_prepared_work_has_exact_revisions_and_no_pass_verdict(self):
        work = self.run_prepare()
        self.assertEqual(work["state"], "prepared")
        self.assertEqual(work["deployments"], snapshot()["deployments"])
        self.assertEqual(work["runtime"]["actorModel"], "model-a")
        self.assertEqual(work["mechanical"]["tier1"]["passes"], 30)

    def test_skip_fail_or_zero_probe_is_blocked(self):
        result = live()
        result["checks"][-1]["status"] = "skipped"
        with self.assertRaisesRegex(EvidenceUnavailable, "Tier 2 failed or skipped"):
            self.run_prepare(live_result=result)
        with self.assertRaisesRegex(EvidenceUnavailable, "Tier 1 failed or empty"):
            self.run_prepare(tier1={"state": "passed", "passes": 0, "total": 0})

    def test_exact_commit_pack_and_served_manifest_must_match(self):
        with self.assertRaisesRegex(EvidenceUnavailable, "proxy commit pack hash mismatch"):
            self.run_prepare(pack=b"different")
        result = live()
        result["packSha256"] = "0" * 64
        with self.assertRaisesRegex(EvidenceUnavailable, "served pack hash mismatch"):
            self.run_prepare(live_result=result)
        result = live()
        result["actorModel"] = "model-b"
        with self.assertRaisesRegex(EvidenceUnavailable, "runtime model mismatch"):
            self.run_prepare(live_result=result)

    def test_unknown_voice_activation_cannot_be_prepared(self):
        result = live()
        result["realtimeEnabled"] = None
        with self.assertRaisesRegex(EvidenceUnavailable, "voice activation unverified"):
            self.run_prepare(live_result=result)


if __name__ == "__main__":
    unittest.main()
