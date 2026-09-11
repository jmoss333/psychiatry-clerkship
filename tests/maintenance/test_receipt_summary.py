import io
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.receipt_summary import (  # noqa: E402
    BLOCKED_EXIT,
    DEFERRED_ROW_STATES,
    FAILED_MARKER,
    HEALTHY_ROW_STATE,
    MAX_ROWS,
    classify,
    deferral,
    render_rows,
    report,
    summarize,
)
from maintenance import sp_health_monitor, stranded_prs, workflow_heartbeat  # noqa: E402

# Every steward that derives its exit code from a receipt. The fleet contract is
# only worth having if it is the same contract in each of them.
STEWARDS = (sp_health_monitor, stranded_prs, workflow_heartbeat)


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


class ClassifyTests(unittest.TestCase):
    """`classify` decides whose failure a row is, subtractively.

    The direction is the whole design. A row is this steward's UNLESS it is
    healthy, deferred, or explicitly delegated — so a state nobody has taught
    this module about goes red rather than exiting 0 in silence. Enumerating the
    owned states instead is the shape workflow_heartbeat shipped in #531, and it
    had exactly that hole.
    """

    def _rows(self, *pairs, key="workflows", id_key="workflowFile"):
        return {
            "gate": "blocked",
            key: [{id_key: name, "state": state} for name, state in pairs],
        }

    def test_an_unrecognized_state_belongs_to_this_steward(self):
        own, elsewhere = classify(self._rows(("ci.yml", "quota_exhausted")))
        self.assertEqual(own, [("ci.yml", "quota_exhausted")])
        self.assertEqual(elsewhere, [])

    def test_an_unrecognized_state_is_not_rescued_by_a_delegation(self):
        # Declaring a delegation must narrow what this steward owns, never widen
        # what it ignores.
        own, elsewhere = classify(
            self._rows(("ci.yml", "quota_exhausted")), delegated=frozenset({"failed"})
        )
        self.assertEqual([state for _, state in own], ["quota_exhausted"])
        self.assertEqual(elsewhere, [])

    def test_healthy_and_deferred_rows_are_neither(self):
        rows = [("a.yml", HEALTHY_ROW_STATE)]
        rows += [(f"{state}.yml", state) for state in sorted(DEFERRED_ROW_STATES)]
        self.assertEqual(classify(self._rows(*rows)), ([], []))

    def test_a_delegated_state_lands_in_the_second_list(self):
        own, elsewhere = classify(
            self._rows(("a.yml", "failed"), ("b.yml", "stale")),
            delegated=frozenset({"failed"}),
        )
        self.assertEqual(own, [("b.yml", "stale")])
        self.assertEqual(elsewhere, [("a.yml", "failed")])

    def test_an_empty_delegation_keeps_everything(self):
        own, elsewhere = classify(self._rows(("a.yml", "failed")))
        self.assertEqual(own, [("a.yml", "failed")])
        self.assertEqual(elsewhere, [])

    def test_a_flat_receipt_is_one_implicit_row(self):
        self.assertEqual(
            classify({"gate": "blocked", "state": "actor_timeout"}),
            ([(None, "actor_timeout")], []),
        )
        self.assertEqual(classify({"gate": "ready", "state": HEALTHY_ROW_STATE}), ([], []))

    def test_a_receipt_carrying_both_shapes_is_read_whole(self):
        # stranded_prs' unavailable receipt: a flat state AND an empty row list.
        # Reading only the rows would call a monitor that could not look healthy.
        own, _ = classify(
            {"gate": "blocked", "state": "unavailable", "pullRequests": []}
        )
        self.assertEqual(own, [(None, "unavailable")])

    def test_pull_request_rows_are_classified_by_their_own_key(self):
        own, _ = classify(
            self._rows((480, "stranded"), key="pullRequests", id_key="pullRequest")
        )
        self.assertEqual(own, [(480, "stranded")])

    def test_receipt_order_is_preserved_within_each_list(self):
        own, elsewhere = classify(
            self._rows(
                ("z.yml", "failed"),
                ("y.yml", "stale"),
                ("a.yml", "failed"),
                ("b.yml", "missing"),
            ),
            delegated=frozenset({"failed"}),
        )
        self.assertEqual([name for name, _ in own], ["y.yml", "b.yml"])
        self.assertEqual([name for name, _ in elsewhere], ["z.yml", "a.yml"])

    def test_malformed_input_names_no_blockers_rather_than_raising(self):
        for receipt in (
            None,
            "not-a-receipt",
            {},
            {"workflows": "not-a-list"},
            {"workflows": [None, 7]},
        ):
            with self.subTest(receipt=receipt):
                self.assertEqual(classify(receipt), ([], []))

    def test_an_unhashable_state_does_not_raise(self):
        # Frozenset membership on a list would explode, in the one module whose
        # contract is that it never turns a real exit code into a traceback.
        own, _ = classify(
            {"workflows": [{"workflowFile": "a.yml", "state": ["boom"]}]},
            delegated=frozenset({"failed"}),
        )
        self.assertEqual(len(own), 1)


class DelegableRowTests(unittest.TestCase):
    """A steward may only defer what it can prove someone else is holding.

    `delegated` says which STATES another watcher owns; `delegable` says which
    ROWS that watcher actually covers. Both are needed, because the first
    delegation shipped was true of the state and false of one row: the heartbeat
    handed a failed `ci.yml` to automation-failure-escalation.yml, whose
    `workflow_run` list has never included CI. Green job, silent escalation,
    nobody watching the weekly release rehearsal.
    """

    def _receipt(self, *pairs):
        return {
            "gate": "blocked",
            "workflows": [
                {"workflowFile": name, "state": state} for name, state in pairs
            ],
        }

    FAILED = frozenset({"failed"})

    def test_a_row_outside_the_delegable_set_stays_this_steward_s(self):
        own, elsewhere = classify(
            self._receipt(("ci.yml", "failed")),
            delegated=self.FAILED,
            delegable=frozenset({"surveillance-citations.yml"}),
        )
        self.assertEqual(own, [("ci.yml", "failed")])
        self.assertEqual(elsewhere, [])

    def test_a_row_inside_the_delegable_set_is_still_handed_over(self):
        own, elsewhere = classify(
            self._receipt(("surveillance-citations.yml", "failed")),
            delegated=self.FAILED,
            delegable=frozenset({"surveillance-citations.yml"}),
        )
        self.assertEqual(own, [])
        self.assertEqual(elsewhere, [("surveillance-citations.yml", "failed")])

    def test_one_receipt_can_split_both_ways(self):
        own, elsewhere = classify(
            self._receipt(("ci.yml", "failed"), ("surveillance-links.yml", "failed")),
            delegated=self.FAILED,
            delegable=frozenset({"surveillance-links.yml"}),
        )
        self.assertEqual([name for name, _ in own], ["ci.yml"])
        self.assertEqual([name for name, _ in elsewhere], ["surveillance-links.yml"])

    def test_an_empty_delegable_set_delegates_nothing(self):
        # Not the same as delegating nothing by state: the state IS delegated,
        # but no row can prove a holder, so every row stays ours.
        own, elsewhere = classify(
            self._receipt(("a.yml", "failed")),
            delegated=self.FAILED,
            delegable=frozenset(),
        )
        self.assertEqual(len(own), 1)
        self.assertEqual(elsewhere, [])

    def test_omitting_delegable_keeps_the_previous_behaviour(self):
        own, elsewhere = classify(
            self._receipt(("anything.yml", "failed")), delegated=self.FAILED
        )
        self.assertEqual(own, [])
        self.assertEqual(len(elsewhere), 1)

    def test_delegable_never_promotes_a_row_that_is_not_delegated_by_state(self):
        # Listing a row as delegable must not hand over a state nobody delegated.
        own, elsewhere = classify(
            self._receipt(("a.yml", "stale")),
            delegated=self.FAILED,
            delegable=frozenset({"a.yml"}),
        )
        self.assertEqual(own, [("a.yml", "stale")])
        self.assertEqual(elsewhere, [])

    def test_an_unhashable_row_id_is_not_delegable_and_does_not_raise(self):
        own, elsewhere = classify(
            {"workflows": [{"workflowFile": ["boom"], "state": "failed"}]},
            delegated=self.FAILED,
            delegable=frozenset({"a.yml"}),
        )
        self.assertEqual(len(own), 1)
        self.assertEqual(elsewhere, [])

    def test_a_flat_receipt_row_has_no_id_so_it_cannot_be_delegated(self):
        # Failing toward "mine": a flat receipt names no row, so a restricted
        # delegation cannot prove a holder for it.
        own, elsewhere = classify(
            {"gate": "blocked", "state": "failed"},
            delegated=self.FAILED,
            delegable=frozenset({"a.yml"}),
        )
        self.assertEqual(own, [(None, "failed")])
        self.assertEqual(elsewhere, [])


class RenderAndDeferralTests(unittest.TestCase):
    """A deferral must be visible, bounded, and safe — or it is just silence."""

    def test_rows_are_capped_with_a_remainder_count(self):
        entries = [(f"w{i}.yml", "failed") for i in range(MAX_ROWS + 2)]
        rendered = render_rows(entries)
        self.assertIn("+2 more", rendered)
        self.assertNotIn(f"w{MAX_ROWS}.yml", rendered)

    def test_a_row_without_an_identity_still_names_its_state(self):
        self.assertEqual(render_rows([(None, "unavailable")]), "?:unavailable")

    def test_hostile_values_are_replaced_not_echoed(self):
        rendered = render_rows([("a\nb", "ok\n##[error]fake")])
        self.assertEqual(rendered, "?:?")

    def test_an_empty_deferral_is_empty_string(self):
        self.assertEqual(deferral("heartbeat", [], watcher="other.yml"), "")

    def test_a_deferral_counts_names_and_points_somewhere(self):
        line = deferral(
            "heartbeat",
            [("a.yml", "failed"), ("b.yml", "failed")],
            watcher="automation-failure-escalation.yml",
            note="schedule is alive",
        )
        self.assertIn("heartbeat: schedule is alive;", line)
        self.assertIn("2 blocked row(s)", line)
        self.assertIn("automation-failure-escalation.yml", line)
        self.assertIn("a.yml:failed", line)
        self.assertNotIn("\n", line)

    def test_a_hostile_note_or_watcher_is_dropped_or_replaced(self):
        line = deferral(
            "heartbeat",
            [("a.yml", "failed")],
            watcher="x\ny",
            note="alive\n##[error]fabricated",
        )
        self.assertNotIn("\n", line)
        self.assertNotIn("fabricated", line)
        self.assertIn("tracked by ?,", line)

    def test_a_deferral_is_capped_like_every_other_row_list(self):
        line = deferral(
            "heartbeat",
            [(f"w{i}.yml", "failed") for i in range(MAX_ROWS + 3)],
            watcher="other.yml",
        )
        self.assertIn("+3 more", line)
        self.assertLess(len(line), 240)


class FleetContractTests(unittest.TestCase):
    """One contract, three stewards — checked here rather than per job.

    Each steward declares exactly one thing: the states another watcher owns.
    Everything else follows from `classify`, so "red means something changed and
    it is mine" is a property of the fleet, not a fix applied one job at a time.
    """

    def test_every_steward_declares_what_it_delegates(self):
        for module in STEWARDS:
            with self.subTest(module=module.__name__):
                self.assertIsInstance(module.DELEGATED_STATES, frozenset)

    def test_a_steward_never_delegates_a_state_that_is_merely_deferred(self):
        # Deferred and delegated are different claims: "nothing is wrong yet"
        # versus "it is wrong and someone else already has it". A state in both
        # is a contradiction, and would silently win as deferred.
        for module in STEWARDS:
            with self.subTest(module=module.__name__):
                self.assertEqual(
                    module.DELEGATED_STATES & DEFERRED_ROW_STATES, frozenset()
                )

    def test_a_steward_never_delegates_the_healthy_state(self):
        for module in STEWARDS:
            with self.subTest(module=module.__name__):
                self.assertNotIn(HEALTHY_ROW_STATE, module.DELEGATED_STATES)

    def test_no_steward_still_derives_its_exit_code_from_the_gate(self):
        # The idiom this module exists to replace. `gate` records every unclean
        # row, including rows another watcher owns; exiting on it is what made
        # the heartbeat permanently red. This list may only shrink.
        for module in STEWARDS:
            source = Path(module.__file__).read_text(encoding="utf-8")
            with self.subTest(module=module.__name__):
                self.assertNotIn('receipt["gate"] == ', source)

    def test_the_fleet_agrees_on_what_a_blocked_exit_code_is(self):
        # escalation_issue quotes it; rotation_readiness reserves 10 for routing.
        self.assertEqual(BLOCKED_EXIT, 2)


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
