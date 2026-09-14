#!/usr/bin/env python3
"""Contract tests for the queue runner's refused-pull-request fallback."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"))

import queue_pr_fallback as fb  # noqa: E402

WORKFLOW = ROOT / ".github" / "workflows" / "maintenance-queue-runner.yml"

# The refusal as GitHub actually worded it, taken verbatim from the failing run of
# 2026-09-13. Every other test that asserts "recognised" is worthless if this string
# drifts from the real one, so it is quoted once, here.
REAL_REFUSAL = (
    "pull request create failed: GraphQL: GitHub Actions is not permitted to "
    "create or approve pull requests (createPullRequest)"
)
BRANCH = "automation/queue-isbn-derive-2026-09-13"


def event(**kw):
    base = {
        "branch": BRANCH,
        "task": "isbn-derive",
        "repository": "jmoss333/psychiatry-clerkship",
        "base": "main",
        "run_url": "https://github.com/o/r/actions/runs/1",
        "at": "2026-09-13T04:44:00Z",
        "error": REAL_REFUSAL,
    }
    base.update(kw)
    return base


def issue(body, number=11):
    return {"number": number, "body": body}


def _fake_credential(*prefix_parts):
    """A token-shaped string built at runtime, so the source carries no literal.

    The prefix arrives in pieces on purpose: a secret scanner reads the file, not
    the value this returns, and a redaction test that cannot ship is worthless.
    """
    return "%s_%s" % ("".join(prefix_parts), "A1b2C3d4E5f6G7h8I9j0K1l2")


def workflow_steps():
    document = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    return document, document["jobs"]["queue-runner"]["steps"]


def step_named(name):
    _, steps = workflow_steps()
    matches = [s for s in steps if s.get("name") == name]
    assert len(matches) == 1, name
    return matches[0]


class ClassifyTests(unittest.TestCase):
    def test_the_real_refusal_is_recognised(self):
        self.assertEqual(fb.classify(REAL_REFUSAL), fb.PR_CREATION_DISABLED)

    def test_an_unrecognised_failure_is_reported_not_dropped(self):
        # Subtractive: the interesting case is the one nobody wrote a row for.
        self.assertEqual(fb.classify("fatal: could not read Username"), fb.UNKNOWN)
        self.assertEqual(fb.classify(""), fb.UNKNOWN)
        self.assertEqual(fb.classify(None), fb.UNKNOWN)

    def test_the_table_actually_discriminates(self):
        # Guards against a pattern so loose that everything looks recognised --
        # which would report the permission remedy for an unrelated outage.
        for other in (
            "HTTP 502: Bad gateway",
            "pull request create failed: GraphQL: No commits between main and x",
            "error: failed to push some refs",
        ):
            self.assertEqual(fb.classify(other), fb.UNKNOWN, other)

    def test_every_reason_has_a_remedy(self):
        for reason, _pattern in fb.REASONS:
            self.assertIn(reason, fb.REMEDIES)
        self.assertIn(fb.UNKNOWN, fb.REMEDIES)


class ErrorTextTests(unittest.TestCase):
    def test_first_meaningful_line_is_bounded_and_single_line(self):
        cleaned = fb.clean_error("\n\n2026-09-13T04:44:00.1Z  boom\nsecond line\n")
        self.assertEqual(cleaned, "boom")
        long = fb.clean_error("x" * 5000)
        self.assertLessEqual(len(long), fb.MAX_ERROR_CHARS)
        self.assertNotIn("\n", long)

    def test_a_credential_never_reaches_the_issue_body(self):
        # The body is world readable on a public repository.
        #
        # The fixtures are ASSEMBLED, never written out. A literal token-shaped
        # string anywhere in the tree trips Netlify's secret scanner and fails the
        # deploy of both learner sites with exit 2 -- which is exactly how this
        # test first landed (PR #641, deploy 6aa7cf93). The test that proves a
        # credential never reaches an issue body must not itself read as one.
        for token in (_fake_credential("gh", "p"), _fake_credential("gh", "s"),
                      _fake_credential("github", "_", "pat")):
            cleaned = fb.clean_error("fatal: auth failed using %s" % token)
            self.assertNotIn(token, cleaned)
            self.assertIn("[redacted]", cleaned)
            body = fb.render_body(
                fb.apply_event({}, event(error="fatal: auth failed using %s" % token)),
                "o/r", "main")
            self.assertNotIn(token, body)

    def test_non_text_degrades_to_empty(self):
        self.assertEqual(fb.clean_error(None), "")
        self.assertEqual(fb.clean_error(b"bytes"), "")


class OwnershipTests(unittest.TestCase):
    def test_marker_must_be_the_first_line(self):
        self.assertTrue(fb.has_ownership_marker(f"{fb.MARKER}\nrest"))
        self.assertFalse(fb.has_ownership_marker(f"preamble\n{fb.MARKER}"))
        self.assertFalse(fb.has_ownership_marker(""))
        self.assertFalse(fb.has_ownership_marker(None))

    def test_ambiguous_marker_fails_closed(self):
        with self.assertRaises(fb.FallbackError):
            fb.select_issue([issue(fb.MARKER, 1), issue(fb.MARKER, 2)])

    def test_unowned_issues_are_ignored(self):
        self.assertIsNone(fb.select_issue([issue("someone else's issue")]))

    def test_the_marker_is_not_the_escalation_marker(self):
        # Two rolling issues with one marker would fold this module's rows into the
        # deadman's issue and make both ambiguous.
        import escalation_issue as esc

        self.assertNotEqual(fb.MARKER, esc.MARKER)
        self.assertNotEqual(fb.TITLE, esc.TITLE)


class StateTests(unittest.TestCase):
    def test_state_round_trips_through_the_rendered_body(self):
        branches = fb.apply_event({}, event())
        recovered = fb.parse_state(fb.render_body(branches, "o/r", "main"))
        self.assertEqual(recovered, branches)

    def test_malformed_state_block_degrades_to_empty(self):
        self.assertEqual(fb.parse_state(f"{fb.STATE_BEGIN}\n```json\n{{\n```\n{fb.STATE_END}"), {})
        self.assertEqual(fb.parse_state("no state here"), {})
        self.assertEqual(fb.parse_state(None), {})

    def test_repeat_nights_accumulate_on_one_row(self):
        branches = fb.apply_event({}, event())
        branches = fb.apply_event(branches, event(at="2026-09-14T04:44:00Z"))
        self.assertEqual(len(branches), 1)
        row = branches[BRANCH]
        self.assertEqual(row["occurrences"], 2)
        self.assertEqual(row["first_seen_at"], "2026-09-13T04:44:00Z")
        self.assertEqual(row["last_seen_at"], "2026-09-14T04:44:00Z")

    def test_a_second_branch_gets_its_own_row(self):
        branches = fb.apply_event({}, event())
        other = "automation/queue-isbn-derive-2026-09-14"
        branches = fb.apply_event(branches, event(branch=other))
        self.assertEqual(sorted(branches), sorted([BRANCH, other]))


class InputBoundaryTests(unittest.TestCase):
    def test_a_branch_the_runner_did_not_make_is_refused(self):
        for bad in (
            "main",
            "automation/queue-isbn-derive",
            "automation/queue-isbn-derive-2026-09-13; rm -rf /",
            "../../etc/passwd",
            "",
        ):
            with self.assertRaises(fb.FallbackError, msg=bad):
                fb.apply_event({}, event(branch=bad))

    def test_an_unsafe_task_key_is_refused(self):
        with self.assertRaises(fb.FallbackError):
            fb.apply_event({}, event(task="isbn derive|evil"))

    def test_the_table_is_bounded(self):
        branches = {"automation/queue-t-2026-01-%02d" % (n + 1): {} for n in range(fb.MAX_BRANCHES)}
        with self.assertRaises(fb.FallbackError):
            fb.apply_event(branches, event())


class RenderTests(unittest.TestCase):
    def test_body_starts_with_the_marker_and_keeps_the_manual_close_rule(self):
        body = fb.render_body(fb.apply_event({}, event()), "o/r", "main")
        self.assertTrue(body.startswith(fb.MARKER))
        self.assertIn("never resolves", body)

    def test_a_pipe_in_an_error_cannot_break_the_table(self):
        body = fb.render_body(
            fb.apply_event({}, event(error="boom | not a column")), "o/r", "main"
        )
        row = next(line for line in body.splitlines() if line.startswith("| [`automation/"))
        self.assertEqual(row.count("|") - row.count("\\|"), 6)

    def test_the_row_offers_a_prefilled_pull_request(self):
        body = fb.render_body(fb.apply_event({}, event()), "jmoss333/psychiatry-clerkship", "main")
        self.assertIn(
            "https://github.com/jmoss333/psychiatry-clerkship/compare/main...%s?expand=1" % BRANCH,
            body,
        )

    def test_an_untrustworthy_repository_yields_no_link_rather_than_a_bad_one(self):
        self.assertEqual(fb.compare_url("not a repo", "main", BRANCH), "")
        self.assertEqual(fb.compare_url("o/r", "main", "evil branch"), "")
        self.assertEqual(fb.compare_url("o/r", "main;evil", BRANCH), "")
        body = fb.render_body(fb.apply_event({}, event()), "", "")
        self.assertIn("`%s`" % BRANCH, body)

    def test_an_unknown_refusal_still_renders_a_row_and_says_it_is_unknown(self):
        body = fb.render_body(
            fb.apply_event({}, event(error="HTTP 502: Bad gateway")), "o/r", "main"
        )
        self.assertIn(BRANCH, body)
        self.assertIn(fb.UNKNOWN, body)
        self.assertIn("Bad gateway", body)

    def test_the_body_says_the_run_stays_red(self):
        body = fb.render_body(fb.apply_event({}, event()), "o/r", "main")
        self.assertIn("stays red", body)


class DecisionTests(unittest.TestCase):
    def test_no_existing_issue_creates_one(self):
        result = fb.build([], event())
        self.assertEqual(result["decision"], fb.CREATE)
        self.assertIsNone(result["issue_number"])
        self.assertEqual(result["title"], fb.TITLE)

    def test_an_existing_issue_is_updated_in_place(self):
        first = fb.build([], event())
        result = fb.build([issue(first["body"], 42)], event(at="2026-09-14T04:44:00Z"))
        self.assertEqual(result["decision"], fb.UPDATE)
        self.assertEqual(result["issue_number"], 42)
        self.assertEqual(fb.parse_state(result["body"])[BRANCH]["occurrences"], 2)

    def test_there_is_no_decision_that_records_nothing(self):
        # Every call happens because a branch was stranded. A "none" path would be a
        # silent drop of exactly the event this module exists for.
        self.assertEqual({fb.CREATE, fb.UPDATE}, {fb.build([], event())["decision"],
                                                  fb.build([issue(fb.MARKER + "\n")],
                                                           event())["decision"]})

    def test_module_exposes_no_close_capability(self):
        source = (ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"
                  / "queue_pr_fallback.py").read_text(encoding="utf-8")
        self.assertNotIn("issue close", source)
        self.assertNotIn('"close"', source)
        self.assertNotIn('"state": "closed"', source)


class CliTests(unittest.TestCase):
    def test_cli_writes_the_body_and_the_step_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "issues.json").write_text("[]", encoding="utf-8")
            (tmp / "err.txt").write_text(REAL_REFUSAL, encoding="utf-8")
            code = fb.main([
                "--issues", str(tmp / "issues.json"),
                "--branch", BRANCH,
                "--task", "isbn-derive",
                "--repository", "jmoss333/psychiatry-clerkship",
                "--base", "main",
                "--run-url", "https://github.com/o/r/actions/runs/1",
                "--at", "2026-09-13T04:44:00Z",
                "--error", str(tmp / "err.txt"),
                "--body-out", str(tmp / "body.md"),
                "--output", str(tmp / "out.env"),
            ])
            self.assertEqual(code, 0)
            body = (tmp / "body.md").read_text(encoding="utf-8")
            self.assertTrue(body.startswith(fb.MARKER))
            out = (tmp / "out.env").read_text(encoding="utf-8")
            self.assertIn("decision=create", out)
            self.assertIn("issue_number=\n", out)

    def test_missing_inputs_degrade_rather_than_crash(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            code = fb.main([
                "--issues", str(tmp / "absent.json"),
                "--branch", BRANCH,
                "--task", "isbn-derive",
                "--run-url", "https://github.com/o/r/actions/runs/1",
                "--at", "2026-09-13T04:44:00Z",
                "--error", str(tmp / "absent.txt"),
                "--body-out", str(tmp / "body.md"),
            ])
            self.assertEqual(code, 0)
            self.assertIn(BRANCH, (tmp / "body.md").read_text(encoding="utf-8"))

    def test_a_branch_outside_the_contract_fails_the_step(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            code = fb.main([
                "--branch", "main",
                "--task", "isbn-derive",
                "--run-url", "https://github.com/o/r/actions/runs/1",
                "--at", "2026-09-13T04:44:00Z",
                "--body-out", str(tmp / "body.md"),
            ])
            self.assertEqual(code, 1)


class WorkflowWiringTests(unittest.TestCase):
    def test_the_pull_request_step_is_addressable(self):
        # The fallback's `if` names this id; without it the gate silently never fires.
        self.assertEqual(step_named("Open the draft pull request").get("id"), "pr")

    def test_the_fallback_fires_only_for_a_refused_pull_request(self):
        condition = step_named("Record the pushed branch that has no pull request")["if"]
        self.assertIn("failure()", condition)
        self.assertIn("steps.pr.conclusion == 'failure'", condition)

    def test_the_fallback_never_rescues_the_run(self):
        # A green run with no pull request would tell the heartbeat and the
        # escalation deadman that the runner did its job. It did not.
        source = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("continue-on-error", source)
        _, steps = workflow_steps()
        names = [s.get("name") or s.get("uses", "") for s in steps]
        self.assertLess(
            names.index("Open the draft pull request"),
            names.index("Record the pushed branch that has no pull request"),
        )

    def test_the_workflow_and_the_module_agree_on_the_issue_title(self):
        run = step_named("Record the pushed branch that has no pull request")["run"]
        self.assertIn('--title "%s"' % fb.TITLE, run)

    def test_the_workflow_may_file_an_issue(self):
        document, _ = workflow_steps()
        self.assertEqual(document["permissions"].get("issues"), "write")

    def test_no_step_can_close_an_issue(self):
        _, steps = workflow_steps()
        for step in steps:
            self.assertNotIn("issue close", step.get("run", ""))

    def test_the_refusal_is_captured_as_evidence(self):
        # The uploaded artifact is the only copy once the run's logs expire.
        run = step_named("Open the draft pull request")["run"]
        self.assertIn("pr-create.err", run)
        _, steps = workflow_steps()
        upload = next(s for s in steps if str(s.get("uses", "")).startswith("actions/upload-artifact"))
        self.assertEqual(upload.get("if"), "always()")


FAKE_GH = """#!/bin/bash
case "$1 $2" in
  "pr list")   exit 0 ;;
  "pr create") echo "%s" >&2; exit 1 ;;
  "issue list") cat "$FAKE_ISSUES" ;;
  "issue create"|"issue edit") printf '%%s\\n' "$*" >> "$FAKE_LOG"; echo "https://github.com/o/r/issues/99" ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 64 ;;
esac
""" % REAL_REFUSAL


def _step_script(name, workdir):
    """The step's real `run:` body, with the runner's ${{ }} expansion applied."""
    body = step_named(name)["run"]
    body = (body.replace("${{ github.event.repository.default_branch }}", "main")
                .replace("${{ github.repository }}", "jmoss333/psychiatry-clerkship"))
    path = workdir / ("step-%s.sh" % abs(hash(name)))
    path.write_text(body, encoding="utf-8")
    return path


@unittest.skipUnless(shutil.which("bash"), "bash is required")
class ShellPathTests(unittest.TestCase):
    """Drive the shell that otherwise only ever runs at 04:40 UTC.

    Every defect this fallback exists for lived in a code path nobody executed
    until a scheduled run hit it, so the path is executed here instead.
    """

    def _env(self, workdir):
        evidence = workdir / "queue-runner"
        evidence.mkdir(exist_ok=True)
        (workdir / "bin").mkdir(exist_ok=True)
        gh = workdir / "bin" / "gh"
        gh.write_text(FAKE_GH, encoding="utf-8")
        gh.chmod(0o755)
        (evidence / "pr-body.md").write_text("body", encoding="utf-8")
        (workdir / "issues.json").write_text("[]", encoding="utf-8")
        env = dict(os.environ)
        env.update({
            "PATH": "%s%s%s" % (workdir / "bin", os.pathsep, env["PATH"]),
            "RUNNER_TEMP": str(workdir),
            "EVIDENCE": str(evidence),
            "BRANCH": BRANCH,
            "TASK": "isbn-derive",
            "TITLE": "chore(queue): x",
            "BODY_FILE": str(evidence / "pr-body.md"),
            "RUN_URL": "https://github.com/o/r/actions/runs/1",
            "GH_TOKEN": "fake",
            "FAKE_LOG": str(workdir / "gh.log"),
            "FAKE_ISSUES": str(workdir / "issues.json"),
        })
        return env, evidence

    def test_a_refused_pull_request_keeps_the_step_red_and_the_error_on_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            env, evidence = self._env(tmp)
            proc = subprocess.run(
                ["bash", str(_step_script("Open the draft pull request", tmp))],
                env=env, cwd=str(ROOT), capture_output=True, text=True)
            self.assertNotEqual(proc.returncode, 0, "the run must stay red")
            self.assertIn("not permitted", (evidence / "pr-create.err").read_text())

    def test_two_consecutive_nights_create_once_then_edit_that_issue(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            env, evidence = self._env(tmp)
            (evidence / "pr-create.err").write_text(REAL_REFUSAL, encoding="utf-8")
            script = _step_script("Record the pushed branch that has no pull request", tmp)

            first = subprocess.run(["bash", str(script)], env=env, cwd=str(ROOT),
                                   capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)

            # Night two: the issue this just filed is now open.
            Path(env["FAKE_ISSUES"]).write_text(json.dumps(
                [{"number": 99, "body": (evidence / "fallback-body.md").read_text()}]),
                encoding="utf-8")
            second = subprocess.run(["bash", str(script)], env=env, cwd=str(ROOT),
                                    capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)

            calls = Path(env["FAKE_LOG"]).read_text().splitlines()
            self.assertEqual(len(calls), 2, calls)
            self.assertTrue(calls[0].startswith("issue create "), calls[0])
            # The regression this pins: the module appends to --output, so a file
            # that is not truncated yields "create\nupdate" and a number with a
            # newline in it. One run's evidence directory is reused here on purpose.
            self.assertTrue(calls[1].startswith("issue edit 99 "), calls[1])
            state = fb.parse_state((evidence / "fallback-body.md").read_text())
            self.assertEqual(state[BRANCH]["occurrences"], 2)


if __name__ == "__main__":
    unittest.main()
