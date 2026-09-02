#!/usr/bin/env python3
"""Contract tests for the rolling automation-failure escalation issue."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"))

import escalation_issue as esc  # noqa: E402

WORKFLOW = ROOT / ".github" / "workflows" / "automation-failure-escalation.yml"


def event(workflow="Maintenance — Workflow Heartbeat", conclusion="failure", **kw):
    base = {
        "workflow": workflow,
        "conclusion": conclusion,
        "run_url": "https://github.com/o/r/actions/runs/1",
        "at": "2026-09-02T10:00:00Z",
        "error": "",
    }
    base.update(kw)
    return base


def issue(body, number=7):
    return {"number": number, "body": body}


class OwnershipTests(unittest.TestCase):
    def test_marker_must_be_the_first_line(self):
        self.assertTrue(esc.has_ownership_marker(f"{esc.MARKER}\nrest"))
        self.assertFalse(esc.has_ownership_marker(f"preamble\n{esc.MARKER}"))
        self.assertFalse(esc.has_ownership_marker(""))
        self.assertFalse(esc.has_ownership_marker(None))

    def test_ambiguous_marker_fails_closed(self):
        owned = issue(f"{esc.MARKER}\na")
        with self.assertRaises(esc.EscalationError):
            esc.select_issue([owned, issue(f"{esc.MARKER}\nb", number=8)])

    def test_unowned_issues_are_ignored(self):
        self.assertIsNone(esc.select_issue([issue("<!-- maintenance:governance -->\nx")]))


class StateTests(unittest.TestCase):
    def test_state_round_trips_through_the_rendered_body(self):
        workflows = esc.apply_event({}, event())
        parsed = esc.parse_state(esc.render_body(workflows))
        self.assertEqual(parsed, workflows)

    def test_malformed_state_block_degrades_to_empty(self):
        body = f"{esc.MARKER}\n{esc.STATE_BEGIN}\n```json\n{{not json\n```\n{esc.STATE_END}"
        self.assertEqual(esc.parse_state(body), {})
        self.assertEqual(esc.parse_state("no state at all"), {})

    def test_consecutive_failures_accumulate(self):
        workflows = esc.apply_event({}, event())
        self.assertEqual(workflows["Maintenance — Workflow Heartbeat"]["consecutive_failures"], 1)
        workflows = esc.apply_event(workflows, event(at="2026-09-02T11:00:00Z"))
        row = workflows["Maintenance — Workflow Heartbeat"]
        self.assertEqual(row["consecutive_failures"], 2)
        self.assertEqual(row["first_failed_at"], "2026-09-02T10:00:00Z")
        self.assertEqual(row["last_event_at"], "2026-09-02T11:00:00Z")

    def test_success_after_failure_records_recovery_and_resets_the_streak(self):
        workflows = esc.apply_event({}, event())
        workflows = esc.apply_event(workflows, event(conclusion="success"))
        row = workflows["Maintenance — Workflow Heartbeat"]
        self.assertEqual(row["status"], esc.RECOVERED)
        self.assertEqual(row["consecutive_failures"], 0)
        self.assertEqual(row["recovered_after"], 1)

    def test_first_error_line_is_cleaned_and_bounded(self):
        raw = "\n\n2026-09-02T10:00:00.1Z ModuleNotFoundError: no module named 'jsonschema'\ntrailing\n"
        workflows = esc.apply_event({}, event(error=raw))
        self.assertEqual(
            workflows["Maintenance — Workflow Heartbeat"]["error"],
            "ModuleNotFoundError: no module named 'jsonschema'",
        )
        long = esc.apply_event({}, event(error="x" * 900))
        self.assertLessEqual(
            len(long["Maintenance — Workflow Heartbeat"]["error"]), esc.MAX_ERROR_CHARS
        )


class DecisionTests(unittest.TestCase):
    def test_first_failure_without_an_issue_creates_one(self):
        result = esc.build([], event())
        self.assertEqual(result["decision"], esc.CREATE)
        self.assertIsNone(result["issue_number"])
        self.assertEqual(result["title"], esc.TITLE)

    def test_success_with_nothing_tracked_writes_nothing(self):
        self.assertEqual(esc.build([], event(conclusion="success"))["decision"], esc.NONE)

    def test_success_on_an_unrelated_green_row_writes_nothing(self):
        body = esc.render_body(esc.apply_event({}, event(workflow="Surveillance — Link Monitor")))
        result = esc.build([issue(body)], event(conclusion="success"))
        self.assertEqual(result["decision"], esc.NONE)

    def test_recovery_updates_the_existing_issue(self):
        body = esc.render_body(esc.apply_event({}, event()))
        result = esc.build([issue(body)], event(conclusion="success"))
        self.assertEqual(result["decision"], esc.UPDATE)
        self.assertEqual(result["issue_number"], 7)

    def test_no_input_ever_yields_a_close_decision(self):
        allowed = {esc.CREATE, esc.UPDATE, esc.NONE}
        bodies = [None, esc.render_body(esc.apply_event({}, event()))]
        for body in bodies:
            for conclusion in ("failure", "success", "cancelled", "timed_out"):
                issues = [issue(body)] if body else []
                decision = esc.build(issues, event(conclusion=conclusion))["decision"]
                with self.subTest(body=bool(body), conclusion=conclusion):
                    self.assertIn(decision, allowed)
                    self.assertNotIn("close", decision)

    def test_module_exposes_no_close_capability(self):
        source = (
            ROOT / "13_Faculty_Resources" / "_automation" / "maintenance" / "escalation_issue.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("issue close", source)
        self.assertNotIn("--state closed", source)


class BodyTests(unittest.TestCase):
    def test_body_starts_with_the_marker_and_keeps_the_manual_close_rule(self):
        body = esc.render_body(esc.apply_event({}, event()))
        self.assertEqual(body.splitlines()[0], esc.MARKER)
        self.assertIn("never resolves this row", body)
        self.assertIn("Close it by hand", body)

    def test_failing_row_reports_the_run_and_the_streak(self):
        body = esc.render_body(esc.apply_event({}, event(error="boom")))
        self.assertIn("Maintenance — Workflow Heartbeat", body)
        self.assertIn("https://github.com/o/r/actions/runs/1", body)
        self.assertIn("boom", body)

    def test_all_green_body_says_so(self):
        workflows = esc.apply_event({}, event())
        workflows = esc.apply_event(workflows, event(conclusion="success"))
        body = esc.render_body(workflows)
        self.assertIn("has reported green", body)
        self.assertIn("Recovered since the last failure", body)

    def test_pipe_in_an_error_cannot_break_the_table(self):
        body = esc.render_body(esc.apply_event({}, event(error="a | b")))
        table = [line for line in body.splitlines() if line.startswith("| Maintenance")]
        self.assertEqual(len(table), 1)
        # The literal pipe survives as an escaped cell, so the row still has
        # exactly five real delimiters and the table cannot gain a column.
        self.assertIn(r"a \| b", table[0])
        self.assertEqual(table[0].replace(r"\|", "").count("|"), 5)


class CliTests(unittest.TestCase):
    def test_cli_writes_the_body_and_the_step_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            issues = root / "issues.json"
            issues.write_text("[]", encoding="utf-8")
            body_out = root / "body.md"
            output = root / "out.txt"
            code = esc.main(
                [
                    "--issues", str(issues),
                    "--workflow", "Surveillance — Link Monitor",
                    "--conclusion", "failure",
                    "--run-url", "https://example.invalid/run/2",
                    "--at", "2026-09-02T12:00:00Z",
                    "--body-out", str(body_out),
                    "--output", str(output),
                ]
            )
            self.assertEqual(code, 0)
            self.assertTrue(body_out.read_text(encoding="utf-8").startswith(esc.MARKER))
            self.assertIn("decision=create", output.read_text(encoding="utf-8"))

    def test_missing_inputs_degrade_rather_than_crash(self):
        self.assertEqual(esc._read_json("/nonexistent/x.json", []), [])
        self.assertEqual(esc._read_text("/nonexistent/x.log"), "")


class WorkflowWiringTests(unittest.TestCase):
    """`workflow_run` matches on a workflow's `name:`, never its filename."""

    def setUp(self):
        self.document = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        # PyYAML parses the bare key `on` as boolean True.
        self.triggers = self.document.get("on") or self.document.get(True)

    def test_every_scheduled_workflow_name_is_watched(self):
        watched = set(self.triggers["workflow_run"]["workflows"])
        expected = set()
        for path in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            if not path.name.startswith(("maintenance-", "surveillance-")):
                continue
            document = yaml.safe_load(path.read_text(encoding="utf-8"))
            expected.add(document["name"])
        self.assertEqual(watched, expected)

    def test_the_escalation_workflow_never_watches_itself(self):
        self.assertNotIn(self.document["name"], set(self.triggers["workflow_run"]["workflows"]))

    def test_permissions_are_least_privilege(self):
        self.assertEqual(
            self.document["permissions"],
            {"actions": "read", "contents": "read", "issues": "write"},
        )

    def test_no_step_can_close_an_issue(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("issue close", source)


if __name__ == "__main__":
    unittest.main()
