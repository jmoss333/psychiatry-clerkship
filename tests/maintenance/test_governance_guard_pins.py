"""One branch name, four copies — the pin that keeps them one string.

`attest/pending` is the only branch that may carry an attestation promotion, and the
name is written down in four places that never see each other: the gate's own
`ATTEST_BRANCH` (`bin/check_governance_separation.py`), the CI step's shell
conditional (`.github/workflows/ci.yml`), the console function that writes the commit
(`faculty-console/netlify/functions/attest.mjs`), and the branch steward's config
(`maintenance_config.json`). Three agreeing while the fourth drifts is not a red build:
a typo in the CI conditional simply stops running the strict attestation-hash check on
the one branch that needs it, and the job still goes green.

`validate_scheduled_workflows.py`'s `CRITICAL_STEPS` pins that step's body as exact
text. This file pins what the text has to MEAN — that both tools are still invoked, and
that the literal the shell compares `$HEAD_BRANCH` against is the same string the tool
compares against — so a rewrite that keeps the digest honest still cannot quietly drop
half the guard.
"""

import json
import re
import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin"))

import check_governance_separation as GS  # noqa: E402

CI = ROOT / ".github" / "workflows" / "ci.yml"
CONSOLE = ROOT / "faculty-console" / "netlify" / "functions" / "attest.mjs"
CONFIG = (ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"
          / "maintenance_config.json")
STEP_NAME = "Guard — governance/content separation"
JOB = "build-test-validate"


def _guard_step():
    workflow = yaml.safe_load(CI.read_text(encoding="utf-8"))
    steps = workflow["jobs"][JOB]["steps"]
    matches = [s for s in steps if isinstance(s, dict) and s.get("name") == STEP_NAME]
    assert len(matches) == 1, f"{STEP_NAME!r} appears {len(matches)} times in {JOB}"
    return matches[0]


class GuardStepCallsBothTools(unittest.TestCase):
    """The step is two checks, and the second one is easy to lose in a rewrite."""

    def setUp(self):
        self.step = _guard_step()
        self.run = self.step.get("run") or ""

    def test_it_runs_the_separation_gate(self):
        self.assertIn("bin/check_governance_separation.py", self.run)

    def test_it_runs_the_strict_attestation_hash_check(self):
        # Diff-scoped --strict is what binds a console promotion to the text it
        # attests. Without it the console's own branch is the one branch no hash
        # check covers, which is exactly backwards.
        self.assertIn("bin/check_attestation_hashes.py --strict", self.run)

    def test_it_is_a_pull_request_step(self):
        # `github.event.pull_request.base.sha` is the one base a push event does not
        # carry; on a push the tool would exit 2, and exit 2 is a failure, not a skip.
        self.assertEqual(self.step.get("if"), "github.event_name == 'pull_request'")

    def test_the_head_branch_comes_from_the_pr_head_ref(self):
        # Named here because it is attacker-controlled on a fork PR: `github.head_ref`
        # is whatever the fork called its branch. See the Gate B bullet in CLAUDE.md —
        # this gate does not authenticate a fork's promotion, and is not claimed to.
        self.assertEqual((self.step.get("env") or {}).get("HEAD_BRANCH"),
                         "${{ github.head_ref }}")


class OneBranchLiteral(unittest.TestCase):
    """Four copies of `attest/pending`, asserted against each other."""

    def setUp(self):
        self.expected = GS.ATTEST_BRANCH

    def test_the_tool_still_names_a_branch(self):
        self.assertTrue(self.expected and "/" in self.expected, self.expected)

    def test_the_ci_conditional_uses_the_tool_s_literal(self):
        run = _guard_step().get("run") or ""
        match = re.search(r'\[\s*"\$HEAD_BRANCH"\s*=\s*"([^"]+)"\s*\]', run)
        self.assertIsNotNone(match, "no $HEAD_BRANCH comparison found in the step")
        self.assertEqual(match.group(1), self.expected)

    def test_the_console_default_branch_is_the_same_string(self):
        source = CONSOLE.read_text(encoding="utf-8")
        match = re.search(r"^const DEFAULT_BRANCH = '([^']*)';$", source, re.MULTILINE)
        self.assertIsNotNone(match, "DEFAULT_BRANCH not found in attest.mjs")
        self.assertEqual(match.group(1), self.expected)

    def test_the_steward_config_is_the_same_string(self):
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["attestation"]["branch"], self.expected)


if __name__ == "__main__":
    unittest.main()
