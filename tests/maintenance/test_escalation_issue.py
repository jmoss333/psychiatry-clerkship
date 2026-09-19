#!/usr/bin/env python3
"""Contract tests for the rolling automation-failure escalation issue."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"))

import escalation_issue as esc  # noqa: E402

WORKFLOW = ROOT / ".github" / "workflows" / "automation-failure-escalation.yml"
QUEUE = "Maintenance — Autonomous Queue Runner"


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
    def test_queue_success_without_did_work_retains_the_entire_failure_row(self):
        prior = esc.apply_event({}, event(workflow=QUEUE, error="publication failed"))
        body = esc.render_body(prior)
        for outcome in (None, "", "nothing-to-do", "unknown", "did-work\nextra", "DID-WORK"):
            with self.subTest(outcome=outcome):
                completion = event(workflow=QUEUE, conclusion="success", at="2026-09-03T10:00:00Z")
                if outcome is not None:
                    completion["outcome"] = outcome
                result = esc.build([issue(body)], completion)
                self.assertEqual(esc.parse_state(result["body"]), prior)
                self.assertEqual(result["decision"], esc.NONE)

    def test_queue_did_work_success_recovers_a_failure(self):
        body = esc.render_body(esc.apply_event({}, event(workflow=QUEUE)))
        result = esc.build([issue(body)], event(workflow=QUEUE, conclusion="success", outcome="did-work"))
        row = esc.parse_state(result["body"])[QUEUE]
        self.assertEqual(row["status"], esc.RECOVERED)
        self.assertEqual(row["recovered_after"], 1)
        self.assertEqual(result["decision"], esc.UPDATE)

    def test_queue_failure_records_failure_regardless_of_outcome(self):
        for outcome in (None, "nothing-to-do", "did-work"):
            with self.subTest(outcome=outcome):
                result = esc.build([], event(workflow=QUEUE, outcome=outcome))
                self.assertEqual(esc.parse_state(result["body"])[QUEUE]["status"], esc.FAILING)
                self.assertEqual(result["decision"], esc.CREATE)

    def test_non_queue_success_ignores_queue_outcome(self):
        for name in ("Maintenance — Workflow Heartbeat", QUEUE + " copy"):
            body = esc.render_body(esc.apply_event({}, event(workflow=name)))
            result = esc.build([issue(body)], event(workflow=name, conclusion="success", outcome="nothing-to-do"))
            self.assertEqual(esc.parse_state(result["body"])[name]["status"], esc.RECOVERED)
            self.assertEqual(result["decision"], esc.UPDATE)

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
    def test_optional_outcome_file_is_safe_and_controls_queue_recovery(self):
        for content, expected in ((b"did-work\n", esc.UPDATE), (b"nothing-to-do\n", esc.NONE),
                                  (b"", esc.NONE), (b"unknown\n", esc.NONE),
                                  (b"\xff", esc.NONE), (None, esc.NONE), ("directory", esc.NONE)):
            with self.subTest(content=content), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                prior = esc.apply_event({}, event(workflow=QUEUE))
                issues = root / "issues.json"
                issues.write_text(json.dumps([issue(esc.render_body(prior))]), encoding="utf-8")
                outcome = root / "outcome.txt"
                if isinstance(content, bytes):
                    outcome.write_bytes(content)
                elif content == "directory":
                    outcome.mkdir()
                body_out, output = root / "body.md", root / "output.txt"
                code = esc.main([
                    "--issues", str(issues), "--workflow", QUEUE, "--conclusion", "success",
                    "--run-url", "https://example.invalid/run/2", "--at", "2026-09-03T10:00:00Z",
                    "--outcome-file", str(outcome), "--body-out", str(body_out), "--output", str(output),
                ])
                self.assertEqual(code, 0)
                self.assertIn(f"decision={expected}\n", output.read_text(encoding="utf-8"))
                if expected == esc.NONE:
                    self.assertEqual(esc.parse_state(body_out.read_text(encoding="utf-8")), prior)

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
        self.assertNotIn("permissions", self.document["jobs"]["escalate"])

    def queue_outcome_step(self):
        matches = [step for step in self.document["jobs"]["escalate"]["steps"]
                   if step.get("id") == "queue_outcome"]
        self.assertEqual(len(matches), 1, "successful queue runs need one outcome download step")
        return matches[0]

    def test_queue_download_only_runs_for_successful_exact_queue_name(self):
        step = self.queue_outcome_step()
        condition = " ".join(step["if"].split())
        self.assertEqual(condition,
                         "${{ github.event.workflow_run.name == 'Maintenance — Autonomous Queue Runner' && "
                         "github.event.workflow_run.conclusion == 'success' }}")
        self.assertEqual(step["env"]["RUN_ID"], "${{ github.event.workflow_run.id }}")
        self.assertEqual(step["env"]["GH_TOKEN"], "${{ secrets.GITHUB_TOKEN }}")

    def test_workflow_download_and_renderer_preserve_or_recover_with_real_outcome(self):
        step = self.queue_outcome_step()
        render = next(step for step in self.document["jobs"]["escalate"]["steps"]
                      if step.get("id") == "render")
        for mode, expected in (("did-work", esc.UPDATE), ("nothing-to-do", esc.NONE),
                               ("missing", esc.NONE), ("missing-file", esc.NONE), ("partial-failure", esc.NONE)):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                gh = root / "gh"
                gh.write_text(
                    f"#!{sys.executable}\n"
                    "import os, sys\nfrom pathlib import Path\n"
                    "args = sys.argv[1:]\n"
                    "assert args[:3] == ['run', 'download', '314159'], args\n"
                    "assert args[3:5] == ['--name', 'maintenance-queue-runner-314159'], args\n"
                    "assert args[5] == '--dir' and len(args) == 7, args\n"
                    "mode = os.environ['ARTIFACT_MODE']\n"
                    "if mode == 'missing': sys.exit(1)\n"
                    "dest = Path(args[6]); dest.mkdir(parents=True, exist_ok=True)\n"
                    "if mode != 'missing-file': (dest / 'outcome.txt').write_text(('did-work' if mode == 'partial-failure' else mode) + '\\n')\n"
                    "sys.exit(1 if mode == 'partial-failure' else 0)\n",
                    encoding="utf-8",
                )
                gh.chmod(0o700)
                prior = esc.apply_event({}, event(workflow=QUEUE))
                (root / "open-issues.json").write_text(json.dumps([issue(esc.render_body(prior))]), encoding="utf-8")
                env = dict(os.environ, PATH=f"{root}{os.pathsep}{os.environ['PATH']}",
                           RUNNER_TEMP=str(root), RUN_ID="314159", ARTIFACT_MODE=mode,
                           RUN_WORKFLOW=QUEUE, RUN_CONCLUSION="success", RUN_URL="https://example.invalid/run/2",
                           RUN_AT="2026-09-03T10:00:00Z", GITHUB_OUTPUT=str(root / "output.txt"))
                download = subprocess.run(["bash", "-c", step["run"]], env=env, cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(download.returncode, 0, download.stderr)
                result = subprocess.run(["bash", "-c", render["run"]], env=env, cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f"decision={expected}\n", (root / "output.txt").read_text(encoding="utf-8"))
                if expected == esc.NONE:
                    self.assertEqual(esc.parse_state((root / "escalation-body.md").read_text(encoding="utf-8")), prior)

    def test_no_step_can_close_an_issue(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("issue close", source)


if __name__ == "__main__":
    unittest.main()
