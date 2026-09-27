"""Prepared evidence must never turn a skipped probe into an attestation."""

import sys
import subprocess
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from unittest import mock

AUTOMATION = Path(__file__).resolve().parents[2] / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))
sys.path.insert(0, str(AUTOMATION.parents[1] / "bin"))
from _git_env import scrub_inherited_git_env  # noqa: E402

scrub_inherited_git_env()

from maintenance.red_team_deploys import EvidenceUnavailable  # noqa: E402
import maintenance.red_team_preflight as preflight  # noqa: E402
from maintenance.red_team_preflight import prepare, run_tier1  # noqa: E402

PACK = b'{"version":"fixture","engine":{"modelPinned":"model-a"}}'


def snapshot():
    return {
        "deployments": {key: {"siteId": key, "deployId": key,
                             "commitRef": "1" * 40, "deployUrl": f"https://{key}.example",
                             "publishedAt": "2026-09-27T01:00:00Z"}
                        for key in ("proxy", "ms3", "res")},
        "packSha256": sha256(PACK).hexdigest(), "packVersion": "fixture", "model": "model-a",
        "packSourceCommit": "4" * 40,
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
        def pack_loader(commit):
            self.assertEqual(commit, "4" * 40)
            return pack
        def tier1_runner(data, commit):
            self.assertEqual(data, pack)
            self.assertEqual(commit, "1" * 40)
            return tier1 or {"state": "passed", "passes": 30, "total": 30,
                             "sourceCommit": commit}
        return prepare(
            snap or snapshot(),
            tier1_runner,
            lambda endpoint: live_result or live(),
            pack_loader=pack_loader,
        )

    def test_prepared_work_has_exact_revisions_and_no_pass_verdict(self):
        work = self.run_prepare()
        self.assertEqual(work["state"], "prepared")
        self.assertEqual(work["deployments"], snapshot()["deployments"])
        self.assertEqual(work["runtime"]["actorModel"], "model-a")
        self.assertEqual(work["packSourceCommit"], "4" * 40)
        self.assertEqual(work["mechanical"]["tier1"]["passes"], 30)
        self.assertEqual(work["mechanical"]["tier1"]["sourceCommit"], "1" * 40)

    def test_tier1_runs_gate_code_and_probes_from_the_proxy_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runner = root / "bin" / "redteam-offline.mjs"
            engine = root / "sp-proxy" / "netlify" / "functions" / "sp.mjs"
            shared = engine.parent / "_shared" / "helper.mjs"
            for path in (runner, engine, shared):
                path.parent.mkdir(parents=True, exist_ok=True)
            (root / "sp-proxy" / "node_modules").mkdir()
            runner.write_text("import {value} from '../sp-proxy/netlify/functions/sp.mjs';\n"
                              "console.log(`${value}/${value} deterministic probes pass`);\n")
            engine.write_text("export const value = 1;\n")
            shared.write_text("export const helper = true;\n")
            for command in (["git", "init", "-q"],
                            ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                             "add", "."],
                            ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                             "commit", "-qm", "fixture"]):
                subprocess.run(command, cwd=root, check=True, capture_output=True)
            commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root,
                                             text=True).strip()
            engine.write_text("throw new Error('working tree code must not run');\n")
            with mock.patch.object(preflight, "ROOT", root):
                result = run_tier1(PACK, commit)
            self.assertEqual(result, {"state": "passed", "passes": 1,
                                      "total": 1, "sourceCommit": commit})

    def test_skip_fail_or_zero_probe_is_blocked(self):
        result = live()
        result["checks"][-1]["status"] = "skipped"
        with self.assertRaisesRegex(EvidenceUnavailable, "Tier 2 failed or skipped"):
            self.run_prepare(live_result=result)
        with self.assertRaisesRegex(EvidenceUnavailable, "Tier 1 failed or empty"):
            self.run_prepare(tier1={"state": "passed", "passes": 0, "total": 0})

    def test_current_main_pack_and_served_manifest_must_match(self):
        with self.assertRaisesRegex(EvidenceUnavailable, "main pack source hash mismatch"):
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
