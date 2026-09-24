import unittest
from pathlib import Path
import re

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "production-release-verification.yml"
SMOKE_CONFIG = REPO_ROOT / "tests" / "smoke" / "production-release.config.js"
SMOKE_SPEC = REPO_ROOT / "tests" / "smoke" / "production-release.spec.js"


class ProductionReleaseWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WORKFLOW.exists(), "the production release workflow must exist")
        self.source = WORKFLOW.read_text(encoding="utf-8")
        self.workflow = yaml.safe_load(self.source)
        # PyYAML 1.1 resolves bare `on` as True; normalize that parser quirk.
        self.trigger = self.workflow.get("on", self.workflow.get(True))
        self.job = self.workflow["jobs"]["verify-release"]
        self.steps = self.job["steps"]

    def test_push_and_manual_triggers_are_both_reachable(self):
        self.assertEqual(self.trigger["push"]["branches"], ["main"])
        self.assertIn("workflow_dispatch", self.trigger)
        revision = self.trigger["workflow_dispatch"]["inputs"]["revision"]
        self.assertFalse(revision["required"])
        self.assertEqual(revision["type"], "string")
        checkout = next(step for step in self.steps if str(step.get("uses", "")).startswith("actions/checkout@"))
        self.assertEqual(
            checkout["with"]["ref"],
            "${{ github.sha }}",
            "manual rechecks must use current verifier code while targeting the requested release SHA",
        )

    def test_permissions_are_least_privilege_for_evidence_and_pr_comment(self):
        self.assertEqual(
            self.workflow["permissions"],
            {"actions": "read", "contents": "read", "pull-requests": "write"},
        )

    def test_workflow_waits_collects_journeys_uploads_comments_then_gates(self):
        names = [step.get("name", "") for step in self.steps]
        expected_order = [
            "Resolve exact release revision",
            "Collect exact CI, deploy, revision, and canary evidence",
            "Run focused production browser journeys",
            "Build consolidated release receipt",
            "Upload production release receipt",
            "Attach receipt to merged pull request",
            "Enforce consolidated verdict",
        ]
        positions = [names.index(name) for name in expected_order]
        self.assertEqual(positions, sorted(positions))

        collect = self.steps[positions[1]]["run"]
        wait_match = re.search(r"--wait-seconds\s+(\d+)", collect)
        self.assertIsNotNone(wait_match)
        wait_seconds = int(wait_match.group(1))
        self.assertGreaterEqual(
            wait_seconds,
            3600,
            "serialized main CI can require a full hour before exact-SHA evidence is ready",
        )
        self.assertGreaterEqual(
            self.job["timeout-minutes"] * 60,
            wait_seconds + 600,
            "the job must leave time after evidence collection for journeys and receipt upload",
        )
        self.assertIn("NETLIFY_AUTH_TOKEN", self.steps[positions[1]]["env"])
        self.assertIn("GITHUB_TOKEN", self.steps[positions[1]]["env"])
        self.assertIn('--verifier-sha "$GITHUB_SHA"', collect)
        self.assertIn(".permalinkUrl", collect)
        self.assertIn("ms3_url", collect)
        self.assertIn("res_url", collect)

        journeys = self.steps[positions[2]]["run"]
        self.assertIn("production-release.config.js", journeys)
        journey_env = self.steps[positions[2]]["env"]
        self.assertIn("steps.core.outputs.ms3_url", journey_env["MS3_BASE_URL"])
        self.assertIn("steps.core.outputs.res_url", journey_env["RES_BASE_URL"])

        upload = self.steps[positions[4]]
        self.assertEqual(upload["if"], "always()")
        self.assertEqual(upload["with"]["retention-days"], 90)
        self.assertEqual(upload["with"]["if-no-files-found"], "error")
        self.assertIn("artifact-url", self.steps[positions[5]]["env"]["RECEIPT_ARTIFACT_URL"])

        gate = self.steps[positions[6]]["run"]
        self.assertIn("steps.receipt.outputs.exit_code", gate)

    def test_actions_are_immutable_and_browser_journey_files_exist(self):
        for step in self.steps:
            uses = step.get("uses")
            if uses:
                action, separator, revision = uses.partition("@")
                self.assertTrue(separator, action)
                self.assertRegex(revision.split()[0], r"^[0-9a-f]{40}$", uses)
        self.assertTrue(SMOKE_CONFIG.exists())
        self.assertTrue(SMOKE_SPEC.exists())
        smoke_source = SMOKE_CONFIG.read_text(encoding="utf-8")
        self.assertNotIn("|| 'https://une-ms3-psychiatry.netlify.app'", smoke_source)
        self.assertNotIn("|| 'https://mmc-psychiatry-residents-sanford.netlify.app'", smoke_source)


if __name__ == "__main__":
    unittest.main()
