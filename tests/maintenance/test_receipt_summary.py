import io
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.receipt_summary import (  # noqa: E402
    FAILED_MARKER,
    HEALTHY_ROW_STATE,
    MAX_ROWS,
    report,
    summarize,
)


class SummarizeFlatReceiptTests(unittest.TestCase):
    """sp_health_monitor's receipt carries the cause in a flat `state` field."""

    def test_names_the_failure_code_not_just_the_gate(self):
        # This is the whole point: on 2026-09-03 the escalation issue could say
        # no more than "exit code 2" about a failing Interview Room monitor.
        line = summarize(
            {"schemaVersion": 1, "gate": "blocked", "state": "actor_timeout"},
            "sp-health",
        )
        self.assertEqual(line, "sp-health failed: gate=blocked state=actor_timeout")

    def test_healthy_receipt_still_reports(self):
        line = summarize({"gate": "ready", "state": "ok"}, "sp-health")
        self.assertEqual(line, "sp-health: gate=ready state=ok")

    def test_each_distinct_failure_code_is_distinguishable(self):
        # The four causes that collapse into exit code 2 must read differently.
        seen = {
            summarize({"gate": "blocked", "state": code}, "sp-health")
            for code in ("http_status", "content_type", "invalid_json", "actor_budget")
        }
        self.assertEqual(len(seen), 4)


class SummarizeTabularReceiptTests(unittest.TestCase):
    """workflow_heartbeat's receipt carries one row per watched workflow."""

    def _receipt(self, rows, gate="blocked"):
        return {"schemaVersion": 1, "gate": gate, "workflows": rows}

    def test_names_only_the_unhealthy_rows(self):
        line = summarize(
            self._receipt(
                [
                    {"workflowFile": "ci.yml", "state": HEALTHY_ROW_STATE},
                    {"workflowFile": "maintenance-production-canary.yml", "state": "stale"},
                ]
            ),
            "heartbeat",
        )
        self.assertIn("unhealthy=maintenance-production-canary.yml:stale", line)
        self.assertNotIn("ci.yml", line)

    def test_says_none_rather_than_going_quiet_when_all_rows_are_healthy(self):
        line = summarize(
            self._receipt(
                [{"workflowFile": "ci.yml", "state": HEALTHY_ROW_STATE}], gate="ready"
            ),
            "heartbeat",
        )
        self.assertEqual(line, "heartbeat: gate=ready unhealthy=none")

    def test_blocking_rows_are_named_before_the_merely_not_yet_fresh_ones(self):
        # The 2026-09-03 line, verbatim in shape: rows came out alphabetical, so two
        # NON-blocking pending_first_run rows took half the four-row cap and pushed a
        # genuinely blocking row into "+1 more". The reader could not tell which named
        # row had actually stopped the gate.
        line = summarize(
            self._receipt(
                [
                    {"workflowFile": "ci.yml", "state": "pending_first_run"},
                    {
                        "workflowFile": "maintenance-governance-digest.yml",
                        "state": "pending_first_run",
                    },
                    {"workflowFile": "maintenance-production-canary.yml", "state": "failed"},
                    {"workflowFile": "surveillance-citations.yml", "state": "failed"},
                    {"workflowFile": "surveillance-links.yml", "state": "stale"},
                ]
            ),
            "heartbeat",
        )
        # Every blocking row survives the cap...
        for expected in (
            "maintenance-production-canary.yml:failed",
            "surveillance-citations.yml:failed",
            "surveillance-links.yml:stale",
        ):
            self.assertIn(expected, line)
        # ...and a non-blocking row is what gets dropped into the overflow instead.
        self.assertNotIn("maintenance-governance-digest.yml", line)
        self.assertIn("+1 more", line)
        # Blocking rows lead the list.
        self.assertLess(
            line.index("maintenance-production-canary.yml:failed"),
            line.index("ci.yml:pending_first_run"),
        )

    def test_an_unrecognized_state_ranks_as_blocking_not_deferred(self):
        # Failing toward showing more: a state nobody taught this module about is
        # named FIRST, so a new failure mode cannot be crowded out by known-benign rows.
        line = summarize(
            self._receipt(
                [
                    {"workflowFile": "a.yml", "state": "pending_first_run"},
                    {"workflowFile": "b.yml", "state": "brand_new_state"},
                ]
            ),
            "heartbeat",
        )
        self.assertLess(line.index("b.yml:brand_new_state"), line.index("a.yml:pending_first_run"))

    def test_an_unrecognized_row_state_is_reported_not_dropped(self):
        # Listing the healthy value (rather than the unhealthy ones) means a new
        # failure state surfaces automatically instead of being silently omitted.
        line = summarize(
            self._receipt([{"workflowFile": "ci.yml", "state": "brand_new_state"}]),
            "heartbeat",
        )
        self.assertIn("ci.yml:brand_new_state", line)

    def test_long_row_lists_are_capped_with_a_remainder_count(self):
        rows = [
            {"workflowFile": f"w{i}.yml", "state": "missing"}
            for i in range(MAX_ROWS + 3)
        ]
        line = summarize(self._receipt(rows), "heartbeat")
        self.assertIn("+3 more", line)
        self.assertNotIn("w6.yml", line)


class UntrustedValueTests(unittest.TestCase):
    """A log line is a place untrusted text must not reach."""

    def test_shell_and_newline_payloads_are_replaced_not_echoed(self):
        for hostile in (
            "ok\n##[error]fabricated failure",
            "$(rm -rf /)",
            "a" * 200,
            "state; echo pwned",
        ):
            line = summarize({"gate": "blocked", "state": hostile}, "sp-health")
            self.assertEqual(line, "sp-health failed: gate=blocked state=?")
            self.assertNotIn("\n", line)

    def test_a_hostile_workflow_name_is_replaced(self):
        line = summarize(
            {"gate": "blocked", "workflows": [{"workflowFile": "x\ny", "state": "stale"}]},
            "heartbeat",
        )
        self.assertIn("?:stale", line)
        self.assertNotIn("\n", line)

    def test_a_hostile_label_is_replaced(self):
        self.assertTrue(summarize({"gate": "ready"}, "lab el").startswith("?:"))

    def test_non_string_values_do_not_crash(self):
        line = summarize({"gate": None, "state": 42}, "sp-health")
        self.assertEqual(line, "sp-health failed: gate=? state=?")


class EscalationGrepContractTests(unittest.TestCase):
    """The summary is only useful if the escalation issue can actually quote it.

    `.github/workflows/automation-failure-escalation.yml` builds its "First error"
    row with:

        gh run view "$FAILED_RUN_ID" --log-failed | grep -aiE "error|Traceback|failed"

    and `escalation_issue._clean_error` keeps the FIRST match. The runner appends
    its own "##[error]Process completed with exit code 2" at step end, so a
    blocked summary that matches none of those words loses the race and the issue
    keeps quoting the bare exit code. That is the whole defect this module exists
    to fix, so the coupling is pinned here rather than left to a comment.
    """

    # Mirrors the workflow's grep -aiE pattern.
    ESCALATION_GREP = re.compile(r"error|Traceback|failed", re.IGNORECASE)

    def test_the_workflow_still_greps_for_the_words_we_assume(self):
        workflow = (
            Path(__file__).resolve().parents[2]
            / ".github"
            / "workflows"
            / "automation-failure-escalation.yml"
        ).read_text(encoding="utf-8")
        self.assertIn(
            'grep -aiE "error|Traceback|failed"',
            workflow,
            "the escalation workflow's grep changed; FAILED_MARKER must still match it",
        )

    def test_every_blocked_summary_matches_the_grep(self):
        blocked = [
            summarize({"gate": "blocked", "state": "actor_timeout"}, "sp-health"),
            summarize({"gate": "blocked", "state": "http_status"}, "sp-health"),
            summarize(
                {"gate": "blocked", "workflows": [{"workflowFile": "ci.yml", "state": "missing"}]},
                "heartbeat",
            ),
            summarize(None, "sp-health"),
        ]
        for line in blocked:
            with self.subTest(line=line):
                self.assertRegex(line, self.ESCALATION_GREP)

    def test_a_healthy_summary_does_not_match_the_grep(self):
        # A green run must not inject a line that looks like a failure.
        healthy = [
            summarize({"gate": "ready", "state": "ok"}, "sp-health"),
            summarize(
                {"gate": "ready", "workflows": [{"workflowFile": "ci.yml", "state": HEALTHY_ROW_STATE}]},
                "heartbeat",
            ),
        ]
        for line in healthy:
            with self.subTest(line=line):
                self.assertNotRegex(line, self.ESCALATION_GREP)

    def test_the_marker_is_the_word_the_grep_looks_for(self):
        self.assertRegex(FAILED_MARKER, self.ESCALATION_GREP)


class ExplicitVerdictTests(unittest.TestCase):
    """`failed=` lets a steward whose exit code is not `gate != ready` say so.

    The heartbeat is the case: a blocked gate there can mean its own subject
    (a schedule stopped firing) or someone else's (a run fired on time and
    failed, which the escalation already tracks). The lead must match the exit
    code, or the log line lies about what happened.
    """

    def _blocked(self):
        return {
            "gate": "blocked",
            "workflows": [
                {"workflowFile": "surveillance-citations.yml", "state": "failed"}
            ],
        }

    def test_failed_false_keeps_the_lead_clean_on_a_blocked_gate(self):
        line = summarize(self._blocked(), "heartbeat", failed=False)
        self.assertTrue(line.startswith("heartbeat: gate=blocked"))
        self.assertNotIn(f"heartbeat {FAILED_MARKER}", line)

    def test_failed_true_marks_the_lead_on_a_ready_gate(self):
        line = summarize({"gate": "ready", "state": "ok"}, "sp-health", failed=True)
        self.assertTrue(line.startswith(f"sp-health {FAILED_MARKER}:"))

    def test_omitting_failed_still_follows_the_gate(self):
        self.assertEqual(
            summarize(self._blocked(), "heartbeat"),
            summarize(self._blocked(), "heartbeat", failed=True),
        )

    def test_the_row_states_are_still_named_when_the_lead_is_clean(self):
        # Suppressing the marker must not suppress the evidence: a human reading
        # a green heartbeat still needs to see which workflows are failing.
        line = summarize(self._blocked(), "heartbeat", failed=False)
        self.assertIn("surveillance-citations.yml:failed", line)

    def test_report_forwards_the_verdict(self):
        stream = io.StringIO()
        report(self._blocked(), "heartbeat", stream=stream, failed=False)
        self.assertTrue(stream.getvalue().startswith("heartbeat: gate=blocked"))


class RobustnessTests(unittest.TestCase):
    """A summary must never turn a steward's real exit code into a traceback."""

    def test_a_non_dict_receipt_is_described_not_raised(self):
        self.assertEqual(
            summarize(None, "sp-health"), "sp-health failed: receipt is unreadable"
        )

    def test_report_writes_one_line_to_the_given_stream(self):
        stream = io.StringIO()
        report({"gate": "ready", "state": "ok"}, "sp-health", stream=stream)
        self.assertEqual(stream.getvalue(), "sp-health: gate=ready state=ok\n")

    def test_report_swallows_a_broken_stream(self):
        class Exploding:
            def write(self, _):
                raise OSError("stream is gone")

        report({"gate": "ready"}, "sp-health", stream=Exploding())  # must not raise


if __name__ == "__main__":
    unittest.main()
