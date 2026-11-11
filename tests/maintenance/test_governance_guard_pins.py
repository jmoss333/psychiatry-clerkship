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
text. This file pins what the text has to MEAN — that both tools are still invoked, that
the literal the shell compares `$HEAD_BRANCH` against is the same string the tool
compares against, and that the base both separation guards measure from is the
merge-base of the base branch and the checkout rather than the event's `base.sha` (which
GitHub refreshes only when the merge-base moves: on 2026-11-10 #1119's build went red on
L1 over 26 commits of main it never touched) — so a rewrite that keeps the digest honest
still cannot quietly drop half the guard or hand it a stale range.
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
POLICY_STEP_NAME = "Guard — policy/content separation"
JOB = "build-test-validate"
FALLBACK_LINE = 'BASE_SHA="$EVENT_BASE_SHA"'
MERGE_BASE_LINE = ('if MERGE_BASE="$(git merge-base "origin/$BASE_REF" HEAD 2>/dev/null)"; '
                   'then BASE_SHA="$MERGE_BASE"; fi')


def _step(name):
    workflow = yaml.safe_load(CI.read_text(encoding="utf-8"))
    steps = workflow["jobs"][JOB]["steps"]
    matches = [s for s in steps if isinstance(s, dict) and s.get("name") == name]
    assert len(matches) == 1, f"{name!r} appears {len(matches)} times in {JOB}"
    return matches[0]


def _guard_step():
    return _step(STEP_NAME)


class PRBaseIsTheMergeBase(unittest.TestCase):
    """Both separation guards measure from merge-base(origin/<base_ref>, HEAD).

    The event's `base.sha` is kept as the fallback for a checkout with no base ref, never
    handed to a tool directly: on a PR held open while main advances it points at the old
    merge-base, and a diff from there to the PR merge commit carries every commit main took
    since, so L1 reddens on governance files the PR never touched.
    """

    def check(self, name):
        step = _step(name)
        env, run = step.get("env") or {}, step.get("run") or ""
        self.assertEqual(env.get("BASE_REF"), "${{ github.base_ref }}")
        self.assertEqual(env.get("EVENT_BASE_SHA"), "${{ github.event.pull_request.base.sha }}")
        self.assertNotIn("BASE_SHA", env, "the pointer must reach the shell only as the fallback")
        self.assertIn(MERGE_BASE_LINE, run)
        self.assertIn(FALLBACK_LINE, run)
        # The pointer is the default the merge-base overrides, so it is assigned first.
        self.assertLess(run.index(FALLBACK_LINE), run.index(MERGE_BASE_LINE))
        # No step may mask a failure with "|| true" (ci-build-contract.test.mjs F25); the
        # fallback is an `if` on the command substitution instead.
        self.assertNotIn("|| true", run)
        self.assertNotIn('--base "$EVENT_BASE_SHA"', run)
        self.assertIn('echo "::error::no base sha"; exit 2', run)

    def test_the_governance_guard(self):
        self.check(STEP_NAME)

    def test_the_policy_guard(self):
        self.check(POLICY_STEP_NAME)

    def test_the_policy_guard_still_runs_both_commands(self):
        run = _step(POLICY_STEP_NAME).get("run") or ""
        self.assertIn("python3 bin/check_policy_content_separation.py --self-test", run)
        self.assertIn('python3 bin/check_policy_content_separation.py --base "$BASE_SHA"', run)


class GuardStepCallsBothTools(unittest.TestCase):
    """The step is two checks, and the second one is easy to lose in a rewrite."""

    def setUp(self):
        self.step = _guard_step()
        self.run = self.step.get("run") or ""

    def test_it_runs_the_separation_gate(self):
        self.assertIn("bin/check_governance_separation.py", self.run)

    def test_deck_history_uses_the_same_pr_base(self):
        self.assertIn('python3 bin/check_deck_card_stability.py --base "$BASE_SHA"', self.run)
        self.assertIn(MERGE_BASE_LINE, self.run)

    def test_it_runs_the_strict_attestation_hash_check(self):
        # Diff-scoped --strict is what binds a console promotion to the text it
        # attests. Without it the console's own branch is the one branch no hash
        # check covers, which is exactly backwards.
        self.assertIn("bin/check_attestation_hashes.py --strict", self.run)

    def test_it_is_a_pull_request_step(self):
        # `github.base_ref` and `github.event.pull_request.base.sha` are PR-only; on a push
        # the step would exit 2, and exit 2 is a failure, not a skip.
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
