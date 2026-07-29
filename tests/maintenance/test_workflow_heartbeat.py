import os
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.workflow_heartbeat import (  # noqa: E402
    EXPECTATIONS,
    HeartbeatError,
    derive_schedule_activation,
    evaluate_runs,
    fetch_runs,
)


NOW = datetime(2026, 7, 28, 12, tzinfo=timezone.utc)


def run_record(
    *,
    age_hours=1,
    conclusion="success",
    status="completed",
    event="schedule",
    run_id=101,
):
    updated = NOW - timedelta(hours=age_hours)
    created = updated - timedelta(minutes=5)
    return {
        "id": run_id,
        "html_url": f"https://github.com/example/repo/actions/runs/{run_id}",
        "event": event,
        "status": status,
        "conclusion": conclusion,
        "created_at": created.isoformat().replace("+00:00", "Z"),
        "updated_at": updated.isoformat().replace("+00:00", "Z"),
        "private": "PRIVATE SECRET SENTINEL",
    }


class WorkflowHeartbeatTests(unittest.TestCase):
    def test_failed_scheduled_run_blocks(self):
        receipt = evaluate_runs(
            {"maintenance-production-canary.yml": 30},
            {
                "maintenance-production-canary.yml": [
                    run_record(conclusion="failure")
                ]
            },
            now=NOW,
            activation_times={},
        )
        self.assertEqual(receipt["gate"], "blocked")
        self.assertEqual(receipt["workflows"][0]["state"], "failed")

    def test_expectation_list_is_exact_and_excludes_heartbeat_itself(self):
        self.assertEqual(
            EXPECTATIONS,
            {
                "maintenance-sp-health-monitor.yml": 10,
                "maintenance-production-canary.yml": 30,
                "maintenance-rotation-readiness.yml": 30,
                "ci.yml": 8 * 24,
                "maintenance-governance-digest.yml": 8 * 24,
                "surveillance-link-monitor.yml": 8 * 24,
                "surveillance-citations.yml": 8 * 24,
                "maintenance-monthly-review.yml": 35 * 24,
                "surveillance-guideline.yml": 35 * 24,
            },
        )
        self.assertNotIn("maintenance-heartbeat.yml", EXPECTATIONS)

    def test_fresh_success_is_ready_and_normalized(self):
        receipt = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record()]},
            now=NOW,
            activation_times={},
        )
        self.assertEqual(receipt["gate"], "ready")
        workflow = receipt["workflows"][0]
        self.assertEqual(
            set(workflow),
            {
                "workflowFile",
                "runId",
                "runUrl",
                "createdAt",
                "updatedAt",
                "status",
                "conclusion",
                "ageHours",
                "state",
            },
        )
        self.assertEqual(workflow["state"], "success")
        self.assertEqual(workflow["ageHours"], 1.0)
        self.assertNotIn("PRIVATE SECRET SENTINEL", str(receipt))

    def test_exact_freshness_boundary_passes_but_older_success_is_stale(self):
        exact = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record(age_hours=192)]},
            now=NOW,
            activation_times={},
        )
        stale = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record(age_hours=192.01)]},
            now=NOW,
            activation_times={},
        )
        self.assertEqual(exact["gate"], "ready")
        self.assertEqual(exact["workflows"][0]["state"], "success")
        self.assertEqual(stale["gate"], "blocked")
        self.assertEqual(stale["workflows"][0]["state"], "stale")

    def test_failure_cancelled_and_malformed_runs_block(self):
        cases = (
            ([run_record(conclusion="failure")], "failed"),
            ([run_record(conclusion="cancelled")], "failed"),
            ([{**run_record(), "html_url": "javascript:alert(1)"}], "unavailable"),
            (
                [
                    {
                        **run_record(),
                        "html_url": (
                            "https://github.com/example/repo/actions/runs/1"
                            "?token=PRIVATE_SECRET_SENTINEL"
                        ),
                    }
                ],
                "unavailable",
            ),
            ([{**run_record(), "updated_at": "not-a-date"}], "unavailable"),
        )
        for runs, state in cases:
            with self.subTest(state=state):
                receipt = evaluate_runs(
                    {"ci.yml": 192},
                    {"ci.yml": runs},
                    now=NOW,
                    activation_times={},
                )
                self.assertEqual(receipt["gate"], "blocked")
                self.assertEqual(receipt["workflows"][0]["state"], state)

    def test_manual_runs_do_not_satisfy_scheduled_freshness(self):
        activation = NOW - timedelta(hours=3)
        receipt = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record(event="workflow_dispatch")]},
            now=NOW,
            activation_times={"ci.yml": activation},
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(receipt["workflows"][0]["state"], "pending_first_run")
        self.assertIsNone(receipt["workflows"][0]["runId"])

    def test_first_run_grace_uses_activation_and_exact_boundary(self):
        exact = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": []},
            now=NOW,
            activation_times={"ci.yml": NOW - timedelta(hours=192)},
        )
        expired = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": []},
            now=NOW,
            activation_times={
                "ci.yml": NOW - timedelta(hours=192, microseconds=1)
            },
        )
        self.assertEqual(exact["gate"], "ready")
        self.assertEqual(exact["workflows"][0]["state"], "pending_first_run")
        self.assertEqual(expired["gate"], "blocked")
        self.assertEqual(expired["workflows"][0]["state"], "missing")

    def test_api_unavailable_and_missing_activation_provenance_block(self):
        unavailable = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": None},
            now=NOW,
            activation_times={"ci.yml": NOW},
        )
        no_provenance = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": []},
            now=NOW,
            activation_times={},
        )
        self.assertEqual(unavailable["workflows"][0]["state"], "unavailable")
        self.assertEqual(unavailable["gate"], "blocked")
        self.assertEqual(
            no_provenance["workflows"][0]["state"],
            "provenance_unavailable",
        )
        self.assertEqual(no_provenance["gate"], "blocked")

    def test_latest_completed_scheduled_run_wins(self):
        receipt = evaluate_runs(
            {"ci.yml": 192},
            {
                "ci.yml": [
                    run_record(
                        run_id=103,
                        age_hours=0.5,
                        status="in_progress",
                        conclusion=None,
                    ),
                    run_record(run_id=102, age_hours=2, conclusion="success"),
                    run_record(run_id=101, age_hours=3, conclusion="failure"),
                ]
            },
            now=NOW,
            activation_times={},
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(receipt["workflows"][0]["runId"], 102)

    def test_actions_api_query_is_schedule_only_and_token_is_not_returned(self):
        class Response:
            status = 200
            headers = {"Content-Type": "application/json"}

            def read(self, size):
                self.assertion = size
                return json.dumps({"workflow_runs": [run_record()]}).encode()

            def close(self):
                self.closed = True

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        class Opener:
            def __init__(self):
                self.requests = []

            def open(self, request, timeout):
                self.requests.append((request, timeout))
                return Response()

        opener = Opener()
        result = fetch_runs(
            "example/repo",
            "maintenance-production-canary.yml",
            token="PRIVATE TOKEN SENTINEL",
            opener=opener,
        )
        self.assertEqual(len(result), 1)
        request, _timeout = opener.requests[0]
        self.assertEqual(
            request.full_url,
            (
                "https://api.github.com/repos/example/repo/actions/workflows/"
                "maintenance-production-canary.yml/runs"
                "?event=schedule&per_page=10"
            ),
        )
        self.assertNotIn("PRIVATE TOKEN SENTINEL", json.dumps(result))

    def test_activation_is_schedule_change_commit_not_file_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(
                ["git", "-C", str(root), "config", "user.name", "Fixture"],
                check=True,
            )
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(root),
                    "config",
                    "user.email",
                    "fixture@example.invalid",
                ],
                check=True,
            )
            workflows = root / ".github" / "workflows"
            workflows.mkdir(parents=True)
            ci = workflows / "ci.yml"

            self._commit(
                root,
                ci,
                "name: CI\non:\n  workflow_dispatch:\n",
                "create old workflow",
                "2026-06-01T00:00:00+00:00",
            )
            self._commit(
                root,
                ci,
                (
                    "name: CI\non:\n  workflow_dispatch:\n  schedule:\n"
                    "    - cron: \"0 8 * * 0\"\n"
                ),
                "add schedule",
                "2026-07-28T10:00:00-04:00",
            )
            note = root / "note.txt"
            self._commit(
                root,
                note,
                "unrelated\n",
                "unrelated change",
                "2026-07-28T11:00:00+00:00",
            )

            activation = derive_schedule_activation(
                root,
                "ci.yml",
                "0 8 * * 0",
            )
            self.assertEqual(
                activation,
                datetime(2026, 7, 28, 14, tzinfo=timezone.utc),
            )

    def test_malformed_ancestral_yaml_invalidates_activation_provenance(self):
        malformed_sources = (
            "name: CI\non:\n  schedule: [\n",
            "name: CI\non:\n  schedule: {}\n",
        )
        for malformed in malformed_sources:
            with self.subTest(malformed=malformed):
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    subprocess.run(["git", "init", "-q", str(root)], check=True)
                    subprocess.run(
                        ["git", "-C", str(root), "config", "user.name", "Fixture"],
                        check=True,
                    )
                    subprocess.run(
                        [
                            "git",
                            "-C",
                            str(root),
                            "config",
                            "user.email",
                            "fixture@example.invalid",
                        ],
                        check=True,
                    )
                    workflows = root / ".github" / "workflows"
                    workflows.mkdir(parents=True)
                    ci = workflows / "ci.yml"
                    self._commit(
                        root,
                        ci,
                        "name: CI\non:\n  workflow_dispatch:\n",
                        "create old workflow",
                        "2026-06-01T00:00:00+00:00",
                    )
                    self._commit(
                        root,
                        ci,
                        malformed,
                        "malformed schedule history",
                        "2026-07-20T00:00:00+00:00",
                    )
                    self._commit(
                        root,
                        ci,
                        (
                            "name: CI\non:\n  workflow_dispatch:\n  schedule:\n"
                            "    - cron: \"0 8 * * 0\"\n"
                        ),
                        "restore scheduled workflow",
                        "2026-07-28T10:00:00+00:00",
                    )

                    with self.assertRaisesRegex(HeartbeatError, "malformed"):
                        derive_schedule_activation(root, "ci.yml", "0 8 * * 0")

    def _commit(self, root, path, content, message, timestamp):
        path.write_text(content, encoding="utf-8")
        subprocess.run(["git", "-C", str(root), "add", str(path)], check=True)
        environment = {
            **os.environ,
            "GIT_AUTHOR_DATE": timestamp,
            "GIT_COMMITTER_DATE": timestamp,
        }
        subprocess.run(
            ["git", "-C", str(root), "commit", "-q", "-m", message],
            check=True,
            env=environment,
        )


if __name__ == "__main__":
    unittest.main()
