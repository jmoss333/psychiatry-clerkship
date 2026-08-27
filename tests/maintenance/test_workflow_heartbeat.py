import os
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance import workflow_heartbeat as heartbeat_module  # noqa: E402
from maintenance.workflow_heartbeat import (  # noqa: E402
    EXPECTATIONS,
    HeartbeatError,
    _cron_present,
    derive_schedule_activation,
    evaluate_runs,
    fetch_runs,
)


NOW = datetime(2026, 7, 28, 12, tzinfo=timezone.utc)
RUN_SHA = "3" * 40
ACTIVATION_SHA = "2" * 40
WORKFLOW_BLOB_SHA = "1" * 40


def run_record(
    *,
    age_hours=1,
    conclusion="success",
    status="completed",
    event="schedule",
    run_id=101,
    head_sha=RUN_SHA,
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
        "head_sha": head_sha,
        "private": "PRIVATE SECRET SENTINEL",
    }


def activation_record(*, activated_at, commit_sha=ACTIVATION_SHA):
    return {
        "activated_at": activated_at,
        "commit_sha": commit_sha,
        "blob_sha": WORKFLOW_BLOB_SHA,
    }


def provenance_for(
    workflow_file,
    *,
    activated_at=NOW - timedelta(days=365),
    run_shas=(RUN_SHA,),
):
    return {
        "activation_records": {
            workflow_file: activation_record(activated_at=activated_at),
        },
        "run_provenance": {
            workflow_file: {head_sha: True for head_sha in run_shas},
        },
    }


class WorkflowHeartbeatTests(unittest.TestCase):
    def _evaluate_with_provenance(
        self,
        runs,
        *,
        activation,
        run_provenance,
    ):
        try:
            return evaluate_runs(
                {"ci.yml": 192},
                {"ci.yml": runs},
                now=NOW,
                activation_records={"ci.yml": activation},
                run_provenance={"ci.yml": run_provenance},
            )
        except TypeError as exc:
            self.fail(f"exact run provenance is unavailable: {exc}")

    def test_failed_scheduled_run_blocks(self):
        receipt = evaluate_runs(
            {"maintenance-production-canary.yml": 30},
            {
                "maintenance-production-canary.yml": [
                    run_record(conclusion="failure")
                ]
            },
            now=NOW,
            **provenance_for("maintenance-production-canary.yml"),
        )
        self.assertEqual(receipt["gate"], "blocked")
        self.assertEqual(receipt["workflows"][0]["state"], "failed")

    def test_expectation_list_is_exact_and_excludes_heartbeat_itself(self):
        self.assertEqual(
            EXPECTATIONS,
            {
                "maintenance-sp-health-monitor.yml": 16,
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
            **provenance_for("ci.yml"),
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
            **provenance_for("ci.yml"),
        )
        stale = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record(age_hours=192.01)]},
            now=NOW,
            **provenance_for("ci.yml"),
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
                    **provenance_for("ci.yml"),
                )
                self.assertEqual(receipt["gate"], "blocked")
                self.assertEqual(receipt["workflows"][0]["state"], state)

    def test_manual_runs_do_not_satisfy_scheduled_freshness(self):
        activation = NOW - timedelta(hours=3)
        receipt = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record(event="workflow_dispatch")]},
            now=NOW,
            **provenance_for("ci.yml", activated_at=activation),
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(receipt["workflows"][0]["state"], "pending_first_run")
        self.assertIsNone(receipt["workflows"][0]["runId"])

    def test_first_run_grace_uses_activation_and_exact_boundary(self):
        exact = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": []},
            now=NOW,
            **provenance_for(
                "ci.yml",
                activated_at=NOW - timedelta(hours=192),
            ),
        )
        expired = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": []},
            now=NOW,
            **provenance_for(
                "ci.yml",
                activated_at=NOW
                - timedelta(hours=192, microseconds=1),
            ),
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
            **provenance_for("ci.yml", activated_at=NOW),
        )
        no_provenance = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": []},
            now=NOW,
            activation_records={},
            run_provenance={},
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
            **provenance_for("ci.yml"),
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(receipt["workflows"][0]["runId"], 102)

    def test_success_before_current_activation_uses_first_run_grace(self):
        receipt = evaluate_runs(
            {"ci.yml": 192},
            {"ci.yml": [run_record(age_hours=6)]},
            now=NOW,
            **provenance_for(
                "ci.yml",
                activated_at=NOW - timedelta(minutes=5),
            ),
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(
            receipt["workflows"][0]["state"],
            "pending_first_run",
        )
        self.assertIsNone(receipt["workflows"][0]["runId"])

    def test_missing_and_malformed_head_sha_fail_closed(self):
        cases = (
            {key: value for key, value in run_record().items() if key != "head_sha"},
            run_record(head_sha="not-a-commit"),
            run_record(head_sha="A" * 40),
        )
        for run in cases:
            with self.subTest(head_sha=run.get("head_sha")):
                receipt = evaluate_runs(
                    {"ci.yml": 192},
                    {"ci.yml": [run]},
                    now=NOW,
                    **provenance_for(
                        "ci.yml",
                        activated_at=NOW - timedelta(days=1),
                        run_shas=(),
                    ),
                )
                self.assertEqual(receipt["gate"], "blocked")
                self.assertEqual(
                    receipt["workflows"][0]["state"],
                    "unavailable",
                )

    def test_run_head_without_activation_commit_does_not_satisfy_heartbeat(self):
        receipt = self._evaluate_with_provenance(
            [run_record()],
            activation=activation_record(
                activated_at=NOW - timedelta(hours=2),
            ),
            run_provenance={RUN_SHA: False},
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(
            receipt["workflows"][0]["state"],
            "pending_first_run",
        )

    def test_valid_descendant_run_satisfies_current_workflow_contract(self):
        receipt = self._evaluate_with_provenance(
            [run_record()],
            activation=activation_record(
                activated_at=NOW - timedelta(hours=2),
            ),
            run_provenance={RUN_SHA: True},
        )
        self.assertEqual(receipt["gate"], "ready")
        self.assertEqual(receipt["workflows"][0]["state"], "success")

    def test_main_derives_activation_even_when_completed_runs_exist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "heartbeat.json"
            current_activation = activation_record(
                activated_at=NOW - timedelta(minutes=5),
            )
            with (
                mock.patch.object(
                    heartbeat_module,
                    "EXPECTATIONS",
                    {"ci.yml": 192},
                ),
                mock.patch.object(
                    heartbeat_module,
                    "fetch_runs",
                    return_value=[run_record(age_hours=6)],
                ),
                mock.patch.object(
                    heartbeat_module,
                    "derive_schedule_activation",
                    return_value=current_activation,
                ) as derive,
                mock.patch.object(
                    heartbeat_module,
                    "_run_matches_activation",
                    return_value=True,
                ) as matcher,
                mock.patch.dict(
                    os.environ,
                    {
                        "GITHUB_REPOSITORY": "example/repo",
                        "GITHUB_TOKEN": "PRIVATE TOKEN SENTINEL",
                    },
                ),
            ):
                code = heartbeat_module.main(
                    [
                        "--out",
                        str(output),
                        "--repo-root",
                        str(root),
                    ],
                    now=lambda: NOW,
                )

            self.assertEqual(code, 0)
            derive.assert_called_once_with(root, "ci.yml", "0 8 * * 0")
            matcher.assert_called_once_with(
                root,
                "ci.yml",
                RUN_SHA,
                current_activation,
            )
            receipt = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(
                receipt["workflows"][0]["state"],
                "pending_first_run",
            )
            self.assertNotIn(RUN_SHA, output.read_text(encoding="utf-8"))

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
            activation_commit = self._commit(
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
                {
                    "activated_at": datetime(
                        2026,
                        7,
                        28,
                        14,
                        tzinfo=timezone.utc,
                    ),
                    "commit_sha": activation_commit,
                    "blob_sha": subprocess.run(
                        [
                            "git",
                            "-C",
                            str(root),
                            "rev-parse",
                            "HEAD:.github/workflows/ci.yml",
                        ],
                        check=True,
                        capture_output=True,
                        text=True,
                    ).stdout.strip(),
                },
            )

    def test_same_cron_workflow_change_restarts_exact_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._init_repo(root)
            workflows = root / ".github" / "workflows"
            workflows.mkdir(parents=True)
            ci = workflows / "ci.yml"
            scheduled = (
                "name: CI\non:\n  workflow_dispatch:\n  schedule:\n"
                "    - cron: \"0 8 * * 0\"\n"
            )
            self._commit(
                root,
                ci,
                scheduled,
                "add schedule",
                "2026-07-27T10:00:00+00:00",
            )
            current_commit = self._commit(
                root,
                ci,
                scheduled.replace("name: CI", "name: CI current contract"),
                "change workflow contract",
                "2026-07-28T10:00:00+00:00",
            )

            activation = derive_schedule_activation(
                root,
                "ci.yml",
                "0 8 * * 0",
            )
            self.assertIsInstance(
                activation,
                dict,
                "activation must bind the exact workflow contract",
            )
            self.assertEqual(
                activation["activated_at"],
                datetime(2026, 7, 28, 10, tzinfo=timezone.utc),
            )
            self.assertEqual(activation["commit_sha"], current_commit)

    def test_run_head_proof_requires_activation_ancestry_and_exact_blob(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._init_repo(root)
            workflows = root / ".github" / "workflows"
            workflows.mkdir(parents=True)
            ci = workflows / "ci.yml"
            old_commit = self._commit(
                root,
                ci,
                "name: CI\non:\n  workflow_dispatch:\n",
                "old workflow",
                "2026-07-27T09:00:00+00:00",
            )
            scheduled = (
                "name: CI\non:\n  workflow_dispatch:\n  schedule:\n"
                "    - cron: \"0 8 * * 0\"\n"
            )
            self._commit(
                root,
                ci,
                scheduled,
                "activate schedule",
                "2026-07-28T09:00:00+00:00",
            )
            note = root / "note.txt"
            descendant = self._commit(
                root,
                note,
                "descendant\n",
                "descendant",
                "2026-07-28T10:00:00+00:00",
            )
            activation = {
                "activated_at": datetime(
                    2026,
                    7,
                    28,
                    9,
                    tzinfo=timezone.utc,
                ),
                "commit_sha": subprocess.run(
                    ["git", "-C", str(root), "rev-parse", "HEAD^"],
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip(),
                "blob_sha": subprocess.run(
                    [
                        "git",
                        "-C",
                        str(root),
                        "rev-parse",
                        "HEAD:.github/workflows/ci.yml",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip(),
            }
            matcher = getattr(
                heartbeat_module,
                "_run_matches_activation",
                None,
            )
            self.assertIsNotNone(
                matcher,
                "workflow run ancestry proof is unavailable",
            )
            self.assertFalse(
                matcher(root, "ci.yml", old_commit, activation)
            )
            self.assertTrue(
                matcher(root, "ci.yml", descendant, activation)
            )
            changed = self._commit(
                root,
                ci,
                scheduled.replace("name: CI", "name: changed"),
                "change exact blob",
                "2026-07-28T11:00:00+00:00",
            )
            self.assertFalse(
                matcher(root, "ci.yml", changed, activation)
            )

    def test_remove_and_readd_exact_blob_restarts_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._init_repo(root)
            workflows = root / ".github" / "workflows"
            workflows.mkdir(parents=True)
            ci = workflows / "ci.yml"
            scheduled = (
                "name: CI\non:\n  workflow_dispatch:\n  schedule:\n"
                "    - cron: \"0 8 * * 0\"\n"
            )
            self._commit(
                root,
                ci,
                scheduled,
                "add schedule",
                "2026-07-27T10:00:00+00:00",
            )
            self._delete_and_commit(
                root,
                ci,
                "remove workflow",
                "2026-07-28T09:00:00+00:00",
            )
            readd_commit = self._commit(
                root,
                ci,
                scheduled,
                "readd workflow",
                "2026-07-28T10:00:00+00:00",
            )

            try:
                activation = derive_schedule_activation(
                    root,
                    "ci.yml",
                    "0 8 * * 0",
                )
            except HeartbeatError as exc:
                self.fail(
                    f"confirmed workflow removal must be a boundary: {exc}"
                )
            self.assertEqual(activation["commit_sha"], readd_commit)
            self.assertEqual(
                activation["activated_at"],
                datetime(2026, 7, 28, 10, tzinfo=timezone.utc),
            )

    def test_ancestral_blob_read_error_is_not_a_valid_boundary(self):
        workflow_file = "ci.yml"
        relative = ".github/workflows/ci.yml"
        current_commit = "c" * 40
        older_commit = "d" * 40
        current_blob = "a" * 40
        older_blob = "b" * 40
        scheduled = (
            "name: CI\non:\n  workflow_dispatch:\n  schedule:\n"
            "    - cron: \"0 8 * * 0\"\n"
        )
        responses = {
            ("show", f"HEAD:{relative}"): (0, scheduled),
            ("rev-parse", f"HEAD:{relative}"): (0, current_blob + "\n"),
            (
                "rev-list",
                "--first-parent",
                "HEAD",
                "--",
                relative,
            ): (0, f"{current_commit}\n{older_commit}\n"),
            ("rev-parse", f"{current_commit}:{relative}"): (
                0,
                current_blob + "\n",
            ),
            ("rev-parse", f"{older_commit}:{relative}"): (
                0,
                older_blob + "\n",
            ),
            ("show", f"{older_commit}:{relative}"): (128, ""),
            ("show", "-s", "--format=%cI", current_commit): (
                0,
                "2026-07-28T10:00:00+00:00\n",
            ),
        }

        def fake_run_git(_root, args, *, allow_failure=False):
            returncode, stdout = responses[tuple(args)]
            return subprocess.CompletedProcess(
                args,
                returncode,
                stdout=stdout,
                stderr="fixture read failure" if returncode else "",
            )

        with mock.patch.object(
            heartbeat_module,
            "_run_git",
            side_effect=fake_run_git,
        ):
            with self.assertRaisesRegex(HeartbeatError, "unavailable"):
                derive_schedule_activation(
                    Path("/fixture"),
                    workflow_file,
                    "0 8 * * 0",
                )

    def test_malformed_ancestral_yaml_invalidates_activation_provenance(self):
        malformed_sources = (
            "name: CI\non:\n  schedule: [\n",
            "name: CI\non:\n  schedule: {}\n",
            "name: CI\non: schedule\n",
            "name: CI\non: [push, schedule]\n",
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

    def test_valid_non_schedule_trigger_forms_remain_absent(self):
        expected = "0 8 * * 0"
        self.assertFalse(_cron_present("name: CI\non: push\n", expected))
        self.assertFalse(
            _cron_present(
                "name: CI\non: [push, pull_request]\n",
                expected,
            )
        )

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
        return subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def _init_repo(self, root):
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

    def _delete_and_commit(self, root, path, message, timestamp):
        path.unlink()
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
