"""A visual-baseline refresh must land as a mergeable head, and must not open a way around the guard.

`.github/workflows/refresh-baselines.yml` regenerates `tests/smoke/baseline/*.png` and
pushes them back to the dispatching branch. Until 2026-09-25 it committed with a CI-skip
token. The PR head then carried none of the checks main's ruleset requires, and #669 needed
two extra commits to merge (both empty; the first quoted the token in its own body, so it
skipped again). The workflow now does five things, and this file pins each one, because
each fails silently:

  * The commit carries no skip token. GitHub reads the whole head message, and Netlify
    honours the same tokens, so a token anywhere in the file can reach a head and cost
    the required checks and the deploy previews at once.
  * A push made with the workflow's own GITHUB_TOKEN starts no workflow. So after pushing
    it starts ci.yml with `gh workflow run` (workflow_dispatch is the one event that token
    may start), which needs `actions: write`. The run's build-test-validate and
    smoke-tests jobs are the head's required checks, so ci.yml must keep accepting
    workflow_dispatch, and neither job may be skipped under it.
  * ci.yml runs the governance/content guard only on pull_request events, so that
    dispatched run cannot run it. The workflow therefore runs the guard itself, over each
    open PR's range with the new commit as the head, BEFORE it pushes. Without that, a
    refresh dispatched on a branch whose own PR CI never judged it would put green
    required checks on an unguarded head.
  * The commit may carry baseline images and nothing else.
  * It refuses the branches it must never write to. attest/pending is the one branch whose
    CI also runs check_attestation_hashes, which this flow does not, so the literal must be
    the guard's own ATTEST_BRANCH.
"""

import re
import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin"))
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

import check_governance_separation as GS  # noqa: E402
from maintenance.validate_scheduled_workflows import PINNED_ACTIONS  # noqa: E402

REFRESH = ROOT / ".github" / "workflows" / "refresh-baselines.yml"
CI = ROOT / ".github" / "workflows" / "ci.yml"
JOB = "refresh-baselines"
COMMIT_STEP = "Commit, guard, push, and start CI on the new commit"
REFUSE_STEP = "Refuse branches a refresh must never write to"

# Every spelling GitHub Actions or Netlify treats as "do not build this commit".
SKIP_TOKEN = re.compile(
    r"\[\s*(skip|no)[ -](ci|actions|netlify)\s*\]"
    r"|\[\s*(ci|actions|netlify)[ -]skip\s*\]"
    r"|skip-checks\s*:",
    re.IGNORECASE,
)


def _load(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _triggers(config):
    # PyYAML reads the bare key `on` as the boolean True.
    return config.get("on", config.get(True))


def _steps():
    return _load(REFRESH)["jobs"][JOB]["steps"]


def _step(name):
    matches = [s for s in _steps() if s.get("name") == name]
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one step named {name!r}, found {len(matches)}")
    return matches[0]


class RefreshBaselinesPins(unittest.TestCase):
    def test_no_ci_skip_token_anywhere_in_the_workflow(self):
        text = REFRESH.read_text(encoding="utf-8")
        found = SKIP_TOKEN.findall(text)
        self.assertEqual(found, [], "a CI-skip token in this file can reach the head commit")
        # Self-check: the pattern really catches the spellings that shipped or could.
        for token in ("[skip ci]", "[ci skip]", "[no ci]", "[skip actions]",
                      "[skip netlify]", "skip-checks: true", "[Skip CI]"):
            self.assertRegex(token, SKIP_TOKEN)

    def test_permissions_are_exactly_what_the_flow_needs(self):
        self.assertEqual(
            _load(REFRESH)["permissions"],
            {"contents": "write", "actions": "write", "pull-requests": "read"},
        )

    def test_only_dispatch_starts_it(self):
        self.assertEqual(set(_triggers(_load(REFRESH))), {"workflow_dispatch"})

    def test_the_first_step_refuses_protected_branches_and_tags(self):
        steps = _steps()
        self.assertEqual(steps[0].get("name"), REFUSE_STEP, "refusal must run before any build")
        step = steps[0]
        self.assertEqual(step["env"]["BRANCH"], "${{ github.ref_name }}")
        self.assertEqual(step["env"]["REF_TYPE"], "${{ github.ref_type }}")
        run = step["run"]
        self.assertIn('"$REF_TYPE" != "branch"', run)
        case = re.search(r'case "\$BRANCH" in\s*\n\s*([^)]+)\)', run)
        self.assertIsNotNone(case, "the refusal must be a case over $BRANCH")
        refused = {b.strip() for b in case.group(1).split("|")}
        self.assertEqual(refused, {"main", "release", GS.ATTEST_BRANCH, "attestations"})
        self.assertRegex(run[case.end():], r"^\s*echo[^\n]*\n?[^\n]*exit 1", "a refused branch must exit 1")

    def test_checkout_fetches_full_history_for_the_guard(self):
        checkout = [s for s in _steps() if str(s.get("uses", "")).startswith("actions/checkout@")]
        self.assertEqual(len(checkout), 1)
        self.assertEqual(checkout[0]["with"].get("fetch-depth"), 0)

    def test_every_action_is_pinned_to_an_approved_sha(self):
        for step in _steps():
            uses = step.get("uses")
            if not uses:
                continue
            action, _, rev = uses.partition("@")
            self.assertEqual(PINNED_ACTIONS.get(action), rev, f"{uses} is not the approved pin")

    def test_commit_guard_push_dispatch_in_that_order(self):
        step = _step(COMMIT_STEP)
        self.assertEqual(step["env"]["BRANCH"], "${{ github.ref_name }}")
        self.assertEqual(step["env"]["GH_TOKEN"], "${{ github.token }}")
        run = step["run"]
        self.assertTrue(run.lstrip().startswith("set -euo pipefail"),
                        "a red guard must stop the step before the push")
        order = [
            "git add tests/smoke/baseline/",
            "git commit",
            "grep -v '^tests/smoke/baseline/'",
            "gh pr list --head \"$BRANCH\" --state open",
            'python3 bin/check_governance_separation.py --base "$base" --head HEAD --head-branch "$BRANCH"',
            'git push origin "HEAD:$BRANCH"',
            'gh workflow run ci.yml --ref "$BRANCH"',
        ]
        positions = []
        for needle in order:
            self.assertEqual(run.count(needle), 1, f"expected exactly one {needle!r}")
            positions.append(run.index(needle))
        self.assertEqual(positions, sorted(positions), "commit → path check → guard → push → start CI")
        # Only the baseline directory is ever staged.
        self.assertEqual(re.findall(r"git add\s+(\S+)", run), ["tests/smoke/baseline/"])
        # A commit touching anything else exits before the guard and the push.
        path_check = run.index("grep -v '^tests/smoke/baseline/'")
        self.assertIn("exit 1", run[path_check:run.index("gh pr list")])

    def test_ci_still_accepts_the_dispatch_and_runs_both_required_jobs_under_it(self):
        ci = _load(CI)
        self.assertIn("workflow_dispatch", _triggers(ci))
        jobs = ci["jobs"]
        for job in ("build-test-validate", "smoke-tests"):
            self.assertIn(job, jobs)
            self.assertNotIn("if", jobs[job], f"{job} must not be skipped under workflow_dispatch")
        self.assertEqual(jobs["smoke-tests"].get("needs"), "build-test-validate")


if __name__ == "__main__":
    unittest.main()
