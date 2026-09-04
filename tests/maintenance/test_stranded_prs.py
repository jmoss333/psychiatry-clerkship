import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.receipt_summary import summarize  # noqa: E402
from maintenance.stranded_prs import (  # noqa: E402
    DEFAULT_MAX_IDLE_HOURS,
    ROW_OK,
    ROW_STRANDED,
    ROW_WAITING,
    StrandedPRError,
    evaluate_pulls,
    fetch_open_pulls,
)


NOW = datetime(2026, 9, 4, 12, tzinfo=timezone.utc)


def pull(
    *,
    number=480,
    idle_hours=9,
    auto_merge=True,
    draft=False,
    mergeable_state="clean",
):
    updated = NOW - timedelta(hours=idle_hours)
    return {
        "number": number,
        "draft": draft,
        "auto_merge": {"merge_method": "merge"} if auto_merge else None,
        "updated_at": updated.isoformat().replace("+00:00", "Z"),
        "mergeable_state": mergeable_state,
    }


class EvaluatePullsTests(unittest.TestCase):
    def test_armed_and_idle_and_clean_is_stranded(self):
        """The #480 case: green, armed, and forgotten."""
        receipt = evaluate_pulls([pull()], now=NOW)
        self.assertEqual(receipt["gate"], "blocked")
        row = receipt["pullRequests"][0]
        self.assertEqual(row["state"], ROW_STRANDED)
        self.assertEqual(row["pullRequest"], 480)
        self.assertEqual(row["idleHours"], 9.0)

    def test_unknown_mergeable_state_is_stranded(self):
        """`unknown` means GitHub never recomputed it -- the strongest signal."""
        receipt = evaluate_pulls([pull(mergeable_state="unknown")], now=NOW)
        self.assertEqual(receipt["pullRequests"][0]["state"], ROW_STRANDED)
        self.assertEqual(receipt["gate"], "blocked")

    def test_missing_mergeable_state_is_stranded(self):
        """The list endpoint omits the field; absence must not read as healthy."""
        receipt = evaluate_pulls([pull(mergeable_state=None)], now=NOW)
        self.assertEqual(receipt["pullRequests"][0]["state"], ROW_STRANDED)

    def test_real_blocker_is_reported_but_does_not_block_the_gate(self):
        """`behind`/`dirty` name work someone owes. Not this steward's alarm."""
        for state in ("behind", "dirty", "blocked"):
            with self.subTest(state=state):
                receipt = evaluate_pulls([pull(mergeable_state=state)], now=NOW)
                self.assertEqual(receipt["pullRequests"][0]["state"], ROW_WAITING)
                self.assertEqual(receipt["gate"], "ready")

    def test_recently_evaluated_pr_is_healthy(self):
        """A PR mid-CI must never trip the alarm."""
        receipt = evaluate_pulls([pull(idle_hours=0.25)], now=NOW)
        self.assertEqual(receipt["pullRequests"][0]["state"], ROW_OK)
        self.assertEqual(receipt["gate"], "ready")

    def test_cutoff_is_longer_than_a_ci_cycle(self):
        """~13 min of CI plus queueing must fit inside the window."""
        self.assertGreaterEqual(DEFAULT_MAX_IDLE_HOURS, 1)

    def test_pr_without_auto_merge_is_ignored(self):
        """Ordinary backlog is not this steward's business."""
        receipt = evaluate_pulls([pull(auto_merge=False, idle_hours=500)], now=NOW)
        self.assertEqual(receipt["pullRequests"][0]["state"], ROW_OK)
        self.assertEqual(receipt["gate"], "ready")

    def test_draft_is_ignored(self):
        receipt = evaluate_pulls([pull(draft=True, idle_hours=500)], now=NOW)
        self.assertEqual(receipt["pullRequests"][0]["state"], ROW_OK)
        self.assertEqual(receipt["gate"], "ready")

    def test_rows_are_sorted_by_number(self):
        receipt = evaluate_pulls(
            [pull(number=485), pull(number=480)], now=NOW
        )
        self.assertEqual(
            [r["pullRequest"] for r in receipt["pullRequests"]], [480, 485]
        )

    def test_malformed_entries_raise(self):
        for bad in ([{"number": "480"}], [{"number": -1}], ["nope"], "nope"):
            with self.subTest(bad=bad):
                with self.assertRaises(StrandedPRError):
                    evaluate_pulls(bad, now=NOW)

    def test_untrusted_text_never_reaches_the_receipt(self):
        """Titles and branches are attacker-controlled; rows carry ints only."""
        hostile = pull()
        hostile["title"] = "##[error] fake failure"
        hostile["head"] = {"ref": "$(rm -rf /)"}
        hostile["user"] = {"login": "../../etc/passwd"}
        receipt = evaluate_pulls([hostile], now=NOW)
        blob = json.dumps(receipt)
        self.assertNotIn("##[error]", blob)
        self.assertNotIn("rm -rf", blob)
        self.assertNotIn("passwd", blob)
        self.assertEqual(
            set(receipt["pullRequests"][0]), {"pullRequest", "state", "idleHours"}
        )


class SummaryTests(unittest.TestCase):
    def test_blocked_summary_names_the_prs_and_says_failed(self):
        """escalation_issue greps for error|Traceback|failed -- it must match."""
        receipt = evaluate_pulls(
            [pull(number=480), pull(number=485)], now=NOW
        )
        line = summarize(receipt, "stranded-prs")
        self.assertIn("failed", line)
        self.assertIn("gate=blocked", line)
        self.assertIn("#480:stranded", line)
        self.assertIn("#485:stranded", line)

    def test_healthy_summary_is_quiet(self):
        receipt = evaluate_pulls([pull(idle_hours=0.1)], now=NOW)
        line = summarize(receipt, "stranded-prs")
        self.assertIn("gate=ready", line)
        self.assertIn("unhealthy=none", line)
        self.assertNotIn("failed", line)

    def test_blocking_rows_rank_ahead_of_waiting_rows(self):
        """A real strand must not be pushed into '+N more' by deferred rows."""
        pulls = [pull(number=n, mergeable_state="behind") for n in range(1, 6)]
        pulls.append(pull(number=999, mergeable_state="clean"))
        receipt = evaluate_pulls(pulls, now=NOW)
        line = summarize(receipt, "stranded-prs")
        self.assertIn("#999:stranded", line)

    def test_heartbeat_summaries_are_unchanged(self):
        """The shared module still renders workflow rows exactly as before."""
        legacy = {
            "gate": "blocked",
            "workflows": [
                {"workflowFile": "ci.yml", "state": "failed"},
                {"workflowFile": "surveillance-citations.yml", "state": "success"},
            ],
        }
        line = summarize(legacy, "heartbeat")
        self.assertIn("heartbeat failed: gate=blocked", line)
        self.assertIn("unhealthy=ci.yml:failed", line)


class FetchTests(unittest.TestCase):
    def test_bad_repository_is_rejected(self):
        with self.assertRaises(StrandedPRError):
            fetch_open_pulls("not a repo", token="t")

    def test_missing_token_is_rejected(self):
        with self.assertRaises(StrandedPRError):
            fetch_open_pulls("jmoss333/psychiatry-clerkship", token="")


if __name__ == "__main__":
    unittest.main()
