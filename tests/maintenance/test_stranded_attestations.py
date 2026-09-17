"""The attestation-branch steward, and the drift pin that keeps it honest.

The detection rule lives in two languages: the console computes it in
`faculty-console/netlify/functions/attest.mjs` for what it displays, and
`stranded_attestations.py` computes it on a schedule for what it reports. Two
implementations of one rule is a drift hazard, so the first test class asserts on
the console's OWN SOURCE TEXT rather than on a hand-copied restatement of it.
Change a constant on the console side and that test goes red until this side is
updated deliberately — which is the whole point of writing it down twice.
"""

import json
import re
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.receipt_summary import (  # noqa: E402
    DEFERRED_ROW_STATES,
    HEALTHY_ROW_STATE,
    classify,
)
from maintenance.stranded_attestations import (  # noqa: E402
    DELEGATED_STATES,
    STATE_BASE_LAG,
    STATE_OK,
    STATE_STRANDED,
    StrandedAttestationError,
    evaluate,
    load_settings,
)


NOW = datetime(2026, 9, 15, 12, tzinfo=timezone.utc)
CONSOLE = ROOT / "faculty-console" / "netlify" / "functions" / "attest.mjs"
SETTINGS = {"branch": "attest/pending", "baseBranch": "main", "lagAlarmThreshold": 3}


def compare(*, ahead, behind):
    return {"ahead_by": ahead, "behind_by": behind}


class ConsoleParityTest(unittest.TestCase):
    """This steward's configuration must match the console's own constants."""

    def setUp(self):
        self.source = CONSOLE.read_text(encoding="utf-8")
        self.config = load_settings(ROOT)

    def _const(self, name):
        match = re.search(
            rf"^const {name} = (?:'([^']*)'|(\d+));$", self.source, re.MULTILINE
        )
        self.assertIsNotNone(match, f"{name} not found in attest.mjs")
        return match.group(1) if match.group(1) is not None else int(match.group(2))

    def test_branch_matches_the_console(self):
        self.assertEqual(self.config["branch"], self._const("DEFAULT_BRANCH"))

    def test_base_branch_matches_the_console(self):
        self.assertEqual(self.config["baseBranch"], self._const("DEFAULT_BASE_BRANCH"))

    def test_lag_threshold_matches_the_console(self):
        self.assertEqual(
            self.config["lagAlarmThreshold"], self._const("DEFAULT_BASE_LAG_ALARM")
        )

    def test_the_console_still_computes_both_signatures(self):
        # If the console stops emitting one of these, the shared rule has changed
        # and this steward's states no longer describe the same world. Asserting
        # on the source keeps that from passing silently.
        self.assertIn("reasons.push('stranded-no-pr')", self.source)
        self.assertIn("reasons.push('base-lag')", self.source)

    def test_the_ahead_precondition_still_guards_both(self):
        # Both console signatures require ahead_by > 0. That precondition is the
        # reason a merely-behind branch is healthy here too; if it disappears
        # from the console this steward's `ahead == 0` shortcut is wrong.
        self.assertIn("if (aheadBy > 0 && !rollingPr)", self.source)
        self.assertIn("if (aheadBy > 0 && behindBy >= threshold)", self.source)


class EvaluateTest(unittest.TestCase):
    def test_nothing_ahead_is_healthy_however_far_behind(self):
        # The case that must NOT alarm. main moves fast; a branch 200 commits
        # behind with nothing on it fast-forwards on the next write. A steward
        # that fired here would fire every day and be muted within a week.
        receipt = evaluate(compare(ahead=0, behind=200), None, SETTINGS, now=NOW)
        self.assertEqual(receipt["state"], STATE_OK)
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(receipt["reasons"], [])

    def test_ahead_with_no_open_request_is_stranded(self):
        # The defect this exists for: attestations saved, no route to main.
        receipt = evaluate(compare(ahead=6, behind=125), 0, SETTINGS, now=NOW)
        self.assertEqual(receipt["state"], STATE_STRANDED)
        self.assertEqual(receipt["gate"], "blocked")
        self.assertEqual(receipt["aheadBy"], 6)
        self.assertEqual(receipt["openRequests"], 0)

    def test_ahead_with_an_open_request_and_small_lag_is_healthy(self):
        receipt = evaluate(compare(ahead=2, behind=1), 1, SETTINGS, now=NOW)
        self.assertEqual(receipt["state"], STATE_OK)
        self.assertEqual(receipt["gate"], "ready")

    def test_ahead_with_a_request_but_a_deep_base_lag_alarms(self):
        receipt = evaluate(compare(ahead=2, behind=3), 1, SETTINGS, now=NOW)
        self.assertEqual(receipt["state"], STATE_BASE_LAG)
        self.assertEqual(receipt["gate"], "blocked")

    def test_both_signatures_report_both_reasons_and_rank_no_route_first(self):
        receipt = evaluate(compare(ahead=6, behind=125), 0, SETTINGS, now=NOW)
        self.assertEqual(receipt["reasons"], [STATE_STRANDED, STATE_BASE_LAG])
        # A flat receipt carries one state; having no route at all is the worse
        # fact, so it is the one the exit code and the log line follow.
        self.assertEqual(receipt["state"], STATE_STRANDED)

    def test_a_missing_branch_is_not_an_alarm(self):
        # The next console write recreates the branch from the base, so nothing
        # is stranded. The VERDICT is healthy; "there was no branch" is a fact
        # carried in its own field. Conflating the two is what made the first
        # live post-merge run print `gate=ready` and still exit 2.
        receipt = evaluate(None, None, SETTINGS, now=NOW)
        self.assertEqual(receipt["state"], STATE_OK)
        self.assertEqual(receipt["gate"], "ready")
        self.assertIs(receipt["branchMissing"], True)

    def test_branch_missing_is_reported_on_every_receipt(self):
        # Present and False when the branch exists, so its absence from a receipt
        # is never mistaken for "the branch was there".
        for comparison in (compare(ahead=0, behind=0), compare(ahead=6, behind=125)):
            receipt = evaluate(comparison, 0, SETTINGS, now=NOW)
            self.assertIs(receipt["branchMissing"], False)

    def test_looked_and_never_looked_stay_distinguishable(self):
        # openRequests is None when nothing could be stranded, 0 when the lookup
        # ran and found none. Collapsing these would make "no route" and "did not
        # check" read identically in the receipt.
        healthy = evaluate(compare(ahead=0, behind=4), None, SETTINGS, now=NOW)
        stranded = evaluate(compare(ahead=1, behind=0), 0, SETTINGS, now=NOW)
        self.assertIsNone(healthy["openRequests"])
        self.assertEqual(stranded["openRequests"], 0)

    def test_an_ahead_branch_without_a_count_refuses_to_guess(self):
        with self.assertRaises(StrandedAttestationError):
            evaluate(compare(ahead=3, behind=0), None, SETTINGS, now=NOW)

    def test_malformed_comparisons_are_refused(self):
        for bad in ({"ahead_by": "6", "behind_by": 1}, {"ahead_by": 6}, {},
                    {"ahead_by": True, "behind_by": 1}, {"ahead_by": -1, "behind_by": 1}):
            with self.assertRaises(StrandedAttestationError):
                evaluate(bad, 0, SETTINGS, now=NOW)

    def test_a_naive_timestamp_is_refused(self):
        with self.assertRaises(StrandedAttestationError):
            evaluate(compare(ahead=0, behind=0), None, SETTINGS,
                     now=datetime(2026, 9, 15, 12))


class GateExitAgreementTest(unittest.TestCase):
    """A receipt must not disagree with its own exit code.

    receipt_summary.classify is deliberately subtractive: any state that is not
    `success` and not deferred is this steward's failure and drives the exit
    code. So `gate` and `classify` can drift apart the moment someone adds a
    state to carry a fact rather than a verdict — which is exactly what happened
    on the first live run after the six attestations merged (`gate=ready
    state=branch_missing`, exit 2). This pins the invariant over EVERY receipt
    this module can produce, so the next such state cannot pass review."""

    def _receipts(self):
        return [
            ("no branch", evaluate(None, None, SETTINGS, now=NOW)),
            ("nothing ahead", evaluate(compare(ahead=0, behind=200), None, SETTINGS, now=NOW)),
            ("ahead, routed", evaluate(compare(ahead=2, behind=1), 1, SETTINGS, now=NOW)),
            ("ahead, no route", evaluate(compare(ahead=6, behind=125), 0, SETTINGS, now=NOW)),
            ("ahead, base lag", evaluate(compare(ahead=2, behind=3), 1, SETTINGS, now=NOW)),
        ]

    def test_gate_ready_exactly_when_classify_owns_nothing(self):
        for label, receipt in self._receipts():
            own, _ = classify(receipt, delegated=DELEGATED_STATES)
            self.assertEqual(
                receipt["gate"] == "ready", not own,
                f"{label}: gate={receipt['gate']} but classify owns {own}",
            )

    def test_every_gate_is_a_value_the_fleet_recognises(self):
        for label, receipt in self._receipts():
            self.assertIn(receipt["gate"], {"ready", "blocked"}, label)


class ReceiptContractTest(unittest.TestCase):
    """The steward must agree with the fleet's shared receipt reader."""

    def test_healthy_state_is_the_value_receipt_summary_skips(self):
        self.assertEqual(STATE_OK, HEALTHY_ROW_STATE)

    def test_alarm_states_are_not_silently_deferred(self):
        # DEFERRED_ROW_STATES rows do not block the gate. If one of these ever
        # landed in that set the steward would go quiet without anyone deciding.
        for state in (STATE_STRANDED, STATE_BASE_LAG):
            self.assertNotIn(state, DEFERRED_ROW_STATES)

    def test_classify_owns_the_alarm_and_skips_the_healthy_case(self):
        stranded = evaluate(compare(ahead=6, behind=125), 0, SETTINGS, now=NOW)
        own, delegated = classify(stranded, delegated=DELEGATED_STATES)
        self.assertEqual([state for _id, state in own], [STATE_STRANDED])
        self.assertEqual(delegated, [])

        healthy = evaluate(compare(ahead=0, behind=9), None, SETTINGS, now=NOW)
        own, delegated = classify(healthy, delegated=DELEGATED_STATES)
        self.assertEqual(own, [])
        self.assertEqual(delegated, [])

    def test_the_receipt_carries_no_remote_text(self):
        # Every value in the receipt is an int, a bool, None, an ISO timestamp,
        # or a state drawn from this module's own enum. Nothing from a pull
        # request title or a branch label may reach a log line or an artifact.
        receipt = evaluate(compare(ahead=6, behind=125), 0, SETTINGS, now=NOW)
        allowed_strings = {
            STATE_OK, STATE_STRANDED, STATE_BASE_LAG,
            "ready", "blocked", receipt["checkedAt"],
        }
        for key, value in receipt.items():
            if isinstance(value, str):
                self.assertIn(value, allowed_strings, f"{key} carries free text")
            if isinstance(value, list):
                for item in value:
                    self.assertIn(item, allowed_strings, f"{key} carries free text")

    def test_the_receipt_serializes(self):
        receipt = evaluate(compare(ahead=6, behind=125), 0, SETTINGS, now=NOW)
        json.loads(json.dumps(receipt))


class LoadSettingsTest(unittest.TestCase):
    def test_the_repository_config_loads(self):
        settings = load_settings(ROOT)
        self.assertEqual(set(settings), {"branch", "baseBranch", "lagAlarmThreshold"})

    def test_a_missing_block_refuses_rather_than_defaulting(self):
        # A silent default would keep this steward watching a branch the console
        # had stopped writing to — the stranding failure in another costume.
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "13_Faculty_Resources/_automation/maintenance"
            path.mkdir(parents=True)
            (path / "maintenance_config.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(StrandedAttestationError):
                load_settings(tmp)

    def test_a_malformed_block_is_refused(self):
        bad_blocks = [
            {"branch": "", "baseBranch": "main", "lagAlarmThreshold": 3},
            {"branch": "attest/pending", "baseBranch": "main", "lagAlarmThreshold": 0},
            {"branch": "attest/pending", "baseBranch": "main", "lagAlarmThreshold": True},
            {"branch": "attest/pending", "baseBranch": "main"},
            {"branch": "a b", "baseBranch": "main", "lagAlarmThreshold": 3},
        ]
        for block in bad_blocks:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "13_Faculty_Resources/_automation/maintenance"
                path.mkdir(parents=True)
                (path / "maintenance_config.json").write_text(
                    json.dumps({"attestation": block}), encoding="utf-8"
                )
                with self.assertRaises(StrandedAttestationError):
                    load_settings(tmp)


if __name__ == "__main__":
    unittest.main()
