import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance import release_train as train  # noqa: E402

BTV, SMOKE = train.REQUIRED_CHECKS
WORKFLOW = ROOT / ".github" / "workflows" / "production-release-train.yml"
VERIFIER = ROOT / ".github" / "workflows" / "production-release-verification.yml"


def runs(*entries):
    return {"check_runs": [
        {"name": name, "conclusion": conclusion, "started_at": started}
        for name, conclusion, started in entries
    ]}


class CheckConclusionTests(unittest.TestCase):
    def test_both_required_success_is_green(self):
        payload = runs((BTV, "success", "t1"), (SMOKE, "success", "t1"),
                       ("Pages changed - une-ms3-psychiatry", "neutral", "t1"))
        got = train.check_conclusions("o/r", "a" * 40, "tok", fetch=lambda u, t: payload)
        self.assertTrue(train.is_green(got))

    def test_a_missing_required_check_is_never_green(self):
        payload = runs((BTV, "success", "t1"))
        got = train.check_conclusions("o/r", "a" * 40, "tok", fetch=lambda u, t: payload)
        self.assertIsNone(got[SMOKE])
        self.assertFalse(train.is_green(got))

    def test_the_newest_rerun_wins(self):
        # A flaky smoke run re-run to green must count as green, and the reverse.
        payload = runs((BTV, "success", "t1"), (SMOKE, "failure", "t1"), (SMOKE, "success", "t2"))
        got = train.check_conclusions("o/r", "a" * 40, "tok", fetch=lambda u, t: payload)
        self.assertTrue(train.is_green(got))
        payload = runs((BTV, "success", "t1"), (SMOKE, "success", "t1"), (SMOKE, "failure", "t2"))
        got = train.check_conclusions("o/r", "a" * 40, "tok", fetch=lambda u, t: payload)
        self.assertFalse(train.is_green(got))

    def test_unreadable_payload_is_could_not_check_not_red(self):
        with self.assertRaises(train.CouldNotCheck):
            train.check_conclusions("o/r", "a" * 40, "tok", fetch=lambda u, t: {"message": "x"})


class ChooseTargetTests(unittest.TestCase):
    GREEN = {BTV: "success", SMOKE: "success"}
    RUNNING = {BTV: "success", SMOKE: None}
    RED = {BTV: "failure", SMOKE: "success"}

    def test_newest_green_ships(self):
        target, skipped = train.choose_target(["c3", "c2"], lambda s: self.GREEN)
        self.assertEqual((target, skipped), ("c3", []))

    def test_walks_back_past_running_and_red_commits(self):
        table = {"c3": self.RUNNING, "c2": self.RED, "c1": self.GREEN}
        target, skipped = train.choose_target(["c3", "c2", "c1"], table.__getitem__)
        self.assertEqual(target, "c1")
        self.assertEqual([sha for sha, _ in skipped], ["c3", "c2"])

    def test_nothing_green_publishes_nothing(self):
        target, _ = train.choose_target(["c2", "c1"], lambda s: self.RED)
        self.assertIsNone(target)


class WorkflowWiringTests(unittest.TestCase):
    def setUp(self):
        self.train = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        self.verifier = yaml.safe_load(VERIFIER.read_text(encoding="utf-8"))

    def trigger(self, doc):
        return doc.get("on", doc.get(True))

    def test_train_is_scheduled_and_has_a_publish_now_button(self):
        on = self.trigger(self.train)
        self.assertEqual([e["cron"] for e in on["schedule"]], ["5 9,15,21 * * *"])
        self.assertIn("workflow_dispatch", on)
        self.assertNotIn("push", on)

    def test_train_can_push_release_and_dispatch_the_verifier_only(self):
        self.assertEqual(self.train["permissions"], {"actions": "write", "contents": "write"})

    def test_verifier_no_longer_waits_on_every_merge_to_main(self):
        # A merge to main no longer deploys the learner sites, so a push-triggered
        # verifier would wait an hour for a deploy that never comes and then fail.
        on = self.trigger(self.verifier)
        self.assertNotIn("push", on)
        self.assertIn("workflow_dispatch", on)
        steps = self.train["jobs"]["promote"]["steps"]
        dispatch = [s for s in steps if "gh workflow run production-release-verification.yml" in s.get("run", "")]
        self.assertEqual(len(dispatch), 1)
        self.assertIn("steps.promote.outputs.promoted == 'true'", dispatch[0]["if"])


if __name__ == "__main__":
    unittest.main()
