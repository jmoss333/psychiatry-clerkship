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


NOW = train.datetime(2026, 9, 25, 12, 0, tzinfo=train.timezone.utc)
SITES = [{"slug": "une-ms3-psychiatry", "siteId": "ms3"},
         {"slug": "sp-interview-proxy", "siteId": "sp"}]


def counts(ms3=0, res=0, proxy=0, console=0, tour=0):
    """A full five-site count, as billable_deploys_24h returns it."""
    return {"une-ms3-psychiatry": ms3, "mmc-psychiatry-residents-sanford": res,
            "sp-interview-proxy": proxy, "clerkship-faculty-attest": console,
            "psychiatry-workforce-tour": tour}


def deploy(hours_ago, context="production", state="ready"):
    created = (NOW - train.timedelta(hours=hours_ago)).isoformat().replace("+00:00", "Z")
    return {"created_at": created, "context": context, "state": state}


class SpendTripwireTests(unittest.TestCase):
    def test_counts_only_billable_production_deploys_inside_24_hours(self):
        table = {
            "ms3": [deploy(1), deploy(5, state="building"), deploy(23.9),
                    deploy(2, context="deploy-preview"),     # previews are free
                    deploy(3, state="error"),                # skipped/failed are free
                    deploy(24.5)],                           # outside the window
            "sp": [deploy(4, context="branch-deploy")],
        }
        got = train.billable_deploys_24h("tok", now=NOW, sites=SITES,
                                         fetch=lambda sid, tok, since: table[sid])
        self.assertEqual(got, {"une-ms3-psychiatry": 3, "sp-interview-proxy": 0})

    def test_a_missing_token_is_could_not_check_never_zero(self):
        with self.assertRaises(train.CouldNotCheck):
            train.billable_deploys_24h("", now=NOW, sites=SITES, fetch=lambda *a: [])

    def test_the_real_site_list_is_all_five_projects(self):
        # The guard is only as wide as the list it reads; a short list would
        # under-count the very runaway it exists to catch.
        slugs = {s["slug"] for s in train._deploy_health_module().SITES}
        self.assertEqual(len(slugs), 5)
        self.assertTrue({"une-ms3-psychiatry", "mmc-psychiatry-residents-sanford"} <= slugs)

    def test_the_learner_slugs_are_the_sites_built_from_the_whole_repo(self):
        # The learner rule is only as right as this set. The deploy-health table
        # marks the two learner sites as the ones with no scope; pin them together
        # so a renamed or added site cannot fall out of the learner count silently.
        unscoped = {s["slug"] for s in train._deploy_health_module().SITES
                    if s.get("scope") is None}
        self.assertEqual(set(train.LEARNER_SLUGS), unscoped)
        self.assertEqual(train.LEARNER_SITES, len(train.LEARNER_SLUGS))

    def test_2026_09_27_satellite_work_does_not_hold_the_learner_sites(self):
        # The run that motivated the split: the learner sites had deployed 4 times
        # (two train slots) and the satellites 8 (Interview Room + console merges,
        # #844 #845 #847). The old all-sites budget of 12 held the 09:05 slot and
        # stranded 14 green merges; none of that spend was the train's doing.
        ok, _ = train.spend_gate("schedule", lambda: counts(
            ms3=2, res=2, proxy=4, console=4))
        self.assertTrue(ok)

    def test_2026_09_25_learner_merge_storm_still_holds(self):
        # The pattern the tripwire exists for: learner sites deploying far more
        # often than three slots a day allow (here, still publishing per merge).
        ok, lines = train.spend_gate("schedule", lambda: counts(
            ms3=25, res=25, proxy=2, console=4))
        self.assertFalse(ok)
        self.assertTrue(any("HELD" in line and "learner" in line for line in lines))

    def test_learner_budget_boundary(self):
        at_limit = train.LEARNER_BUDGET_24H - train.LEARNER_SITES
        ok, _ = train.spend_gate("schedule", lambda: counts(
            ms3=at_limit // 2, res=at_limit - at_limit // 2))
        self.assertTrue(ok)
        over = at_limit + 1
        ok, _ = train.spend_gate("schedule", lambda: counts(
            ms3=over // 2, res=over - over // 2))
        self.assertFalse(ok)

    def test_an_account_wide_runaway_still_holds_and_goes_red(self):
        # The train cannot stop a satellite storm, but a red run is the owner's
        # only alarm short of the invoice -- so a runaway anywhere still holds.
        at_limit = train.ACCOUNT_BUDGET_24H - train.LEARNER_SITES
        ok, _ = train.spend_gate("schedule", lambda: counts(proxy=at_limit))
        self.assertTrue(ok)
        ok, lines = train.spend_gate("schedule", lambda: counts(proxy=at_limit + 1))
        self.assertFalse(ok)
        self.assertTrue(any("HELD" in line and "all five" in line for line in lines))

    def test_the_summary_names_the_learner_count_and_the_account_count(self):
        _, lines = train.spend_gate("schedule", lambda: counts(ms3=2, res=2, proxy=4))
        text = "\n".join(lines)
        self.assertIn(f"learner sites 4 of {train.LEARNER_BUDGET_24H}", text)
        self.assertIn(f"all five sites 8 of {train.ACCOUNT_BUDGET_24H}", text)
        self.assertIn("sp-interview-proxy 4", text)

    def test_a_count_missing_a_learner_site_is_could_not_check_never_zero(self):
        # A partial count would read as "learner sites quiet" and wave through
        # exactly the storm this rule is for.
        partial = {"une-ms3-psychiatry": 0, "sp-interview-proxy": 0}
        with self.assertRaises(train.CouldNotCheck):
            train.spend_gate("schedule", lambda: partial)
        ok, lines = train.spend_gate("workflow_dispatch", lambda: partial)
        self.assertTrue(ok)
        self.assertTrue(any("WARNING" in line for line in lines))

    def test_a_local_run_with_no_event_is_as_strict_as_a_scheduled_one(self):
        ok, _ = train.spend_gate("", lambda: counts(ms3=99))
        self.assertFalse(ok)

    def test_scheduled_run_that_cannot_read_netlify_does_not_publish_blind(self):
        def broken():
            raise train.CouldNotCheck("HTTP 401")
        with self.assertRaises(train.CouldNotCheck):
            train.spend_gate("schedule", broken)

    def test_manual_publish_now_is_never_blocked_by_cost(self):
        # A safety fix outranks $0.10: over budget or unreadable, it proceeds.
        ok, lines = train.spend_gate("workflow_dispatch", lambda: counts(ms3=99, proxy=99))
        self.assertTrue(ok)
        self.assertTrue(any("WARNING" in line for line in lines))

        def broken():
            raise train.CouldNotCheck("HTTP 401")
        ok, _ = train.spend_gate("workflow_dispatch", broken)
        self.assertTrue(ok)

    def test_learner_budget_covers_the_schedule_under_cron_jitter_plus_one_publish_now(self):
        # GitHub's schedule drifts by minutes, so a trailing 24 h window can hold
        # all three previous slots; one publish-now a day must not hold the next
        # slot either: 3 slots + 1 publish-now + this promotion, 2 deploys each.
        self.assertGreaterEqual(train.LEARNER_BUDGET_24H, (3 + 1 + 1) * train.LEARNER_SITES)

    def test_account_budget_leaves_a_busy_satellite_day_on_top_of_the_learner_budget(self):
        # 8 satellite deploys in 24 h was an ordinary day of Interview Room work
        # (2026-09-27); it must not be what holds the learner sites.
        self.assertGreaterEqual(train.ACCOUNT_BUDGET_24H, train.LEARNER_BUDGET_24H + 8)


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

    def test_promote_step_can_read_netlify_for_the_spend_tripwire(self):
        promote = [s for s in self.train["jobs"]["promote"]["steps"] if s.get("id") == "promote"][0]
        self.assertEqual(promote["env"]["NETLIFY_AUTH_TOKEN"], "${{ secrets.NETLIFY_AUTH_TOKEN }}")

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
