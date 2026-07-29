import sys
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.validate_scheduled_workflows import (  # noqa: E402
    EXPECTED_CRONS,
    PINNED_ACTIONS,
    validate_repository,
)


EXPECTED = {
    "ci.yml": "0 8 * * 0",
    "surveillance-link-monitor.yml": "0 6 * * 1",
    "surveillance-citations.yml": "0 7 * * 1",
    "surveillance-guideline.yml": "0 6 1 * *",
    "maintenance-sp-health-monitor.yml": "15 */6 * * *",
    "maintenance-production-canary.yml": "20 9 * * *",
    "maintenance-heartbeat.yml": "45 10 * * *",
    "maintenance-governance-digest.yml": "30 12 * * 1",
    "maintenance-monthly-review.yml": "0 13 1 * *",
    "maintenance-rotation-readiness.yml": "15 13 * * *",
}


def load_workflow(name):
    return yaml.load(
        (ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8"),
        Loader=yaml.BaseLoader,
    )


def steps(name):
    workflow = load_workflow(name)
    return [
        step
        for job in workflow["jobs"].values()
        for step in job.get("steps", [])
    ]


def cron_for(name):
    schedules = load_workflow(name)["on"]["schedule"]
    return [entry["cron"] for entry in schedules]


class ScheduledWorkflowTests(unittest.TestCase):
    def test_repository_workflow_contract_is_valid(self):
        self.assertEqual(validate_repository(ROOT), [])

    def test_exact_schedule_map_is_parsed_with_base_loader(self):
        self.assertEqual(EXPECTED_CRONS, EXPECTED)
        self.assertEqual(
            {name: cron_for(name)[0] for name in EXPECTED},
            EXPECTED,
        )
        for name in EXPECTED:
            self.assertEqual(len(cron_for(name)), 1)

    def test_all_action_references_are_immutable_approved_pins(self):
        expected_pins = {
            "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
            "actions/setup-python": "5fda3b95a4ea91299a34e894583c3862153e4b97",
            "actions/setup-node": "820762786026740c76f36085b0efc47a31fe5020",
            "actions/upload-artifact": "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
            "actions/cache": "55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
            "lycheeverse/lychee-action": "e7477775783ea5526144ba13e8db5eec57747ce8",
        }
        self.assertEqual(PINNED_ACTIONS, expected_pins)
        names = [
            *EXPECTED,
            "surveillance-resource-intake.yml",
        ]
        for name in names:
            for step in steps(name):
                uses = step.get("uses")
                if not uses or uses.startswith("./"):
                    continue
                action, separator, revision = uses.partition("@")
                self.assertEqual(separator, "@", name)
                self.assertEqual(revision, expected_pins[action], name)

    def test_artifact_retention_is_bounded_and_maintenance_evidence_is_90_days(self):
        names = [
            *EXPECTED,
            "surveillance-resource-intake.yml",
        ]
        for name in names:
            for step in steps(name):
                if not step.get("uses", "").startswith("actions/upload-artifact@"):
                    continue
                retention = int(step["with"]["retention-days"])
                self.assertLessEqual(retention, 90, name)
                if name != "ci.yml":
                    self.assertEqual(retention, 90, name)
                else:
                    self.assertEqual(retention, 14, name)
                self.assertEqual(step.get("if"), "always()", name)

    def test_permissions_are_least_privilege(self):
        expected = {
            "ci.yml": {"contents": "read"},
            "maintenance-sp-health-monitor.yml": {"contents": "read"},
            "maintenance-production-canary.yml": {"contents": "read"},
            "maintenance-heartbeat.yml": {
                "actions": "read",
                "contents": "read",
            },
            "maintenance-governance-digest.yml": {
                "contents": "read",
                "issues": "write",
            },
            "maintenance-monthly-review.yml": {
                "contents": "read",
                "issues": "write",
            },
            "maintenance-rotation-readiness.yml": {
                "contents": "read",
                "issues": "write",
            },
        }
        for name, permissions in expected.items():
            self.assertEqual(load_workflow(name)["permissions"], permissions, name)

    def test_ci_schedule_reaches_both_authoritative_jobs_and_release_gates(self):
        ci = load_workflow("ci.yml")
        self.assertIn("schedule", ci["on"])
        jobs = ci["jobs"]
        self.assertIn("build-test-validate", jobs)
        self.assertIn("smoke-tests", jobs)
        self.assertEqual(jobs["smoke-tests"]["needs"], "build-test-validate")
        self.assertNotIn("if", jobs["build-test-validate"])
        self.assertNotIn("if", jobs["smoke-tests"])

        build_steps = jobs["build-test-validate"]["steps"]
        ms3_index = next(
            index
            for index, step in enumerate(build_steps)
            if "build_and_check.sh ms3" in step.get("run", "")
        )
        res_index = next(
            index
            for index, step in enumerate(build_steps)
            if "build_and_check.sh res" in step.get("run", "")
        )
        self.assertLess(ms3_index, res_index)

        smoke_runs = "\n".join(
            step.get("run", "") for step in jobs["smoke-tests"]["steps"]
        )
        self.assertLess(
            smoke_runs.index("build_and_check.sh ms3"),
            smoke_runs.index("build_and_check.sh res"),
        )
        self.assertIn("github.event_name", smoke_runs)
        self.assertIn(
            "https://une-ms3-psychiatry.netlify.app",
            smoke_runs,
        )
        self.assertIn(
            "https://mmc-psychiatry-residents-sanford.netlify.app",
            smoke_runs,
        )

        build_runs = "\n".join(
            step.get("run", "") for step in build_steps
        )
        self.assertIn(
            "python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v",
            build_runs,
        )
        self.assertIn("validate_scheduled_workflows.py", build_runs)
        self.assertIn("node --test tests/*.test.mjs", build_runs)

    def test_production_canary_runs_both_public_nav_projects(self):
        runs = "\n".join(
            step.get("run", "")
            for step in steps("maintenance-production-canary.yml")
        )
        self.assertIn("--project=nav-ms3", runs)
        self.assertIn("--project=nav-res", runs)
        self.assertIn("production_canary.py", runs)
        env_values = json_values(load_workflow("maintenance-production-canary.yml"))
        self.assertIn("https://une-ms3-psychiatry.netlify.app", env_values)
        self.assertIn(
            "https://mmc-psychiatry-residents-sanford.netlify.app",
            env_values,
        )

    def test_sp_monitor_calls_only_public_content_free_status_route(self):
        runs = "\n".join(
            step.get("run", "")
            for step in steps("maintenance-sp-health-monitor.yml")
        )
        self.assertIn(
            "https://sp-interview-proxy.netlify.app/api/sp/health-status",
            runs,
        )
        scrubbed = runs.replace(
            "https://sp-interview-proxy.netlify.app/api/sp/health-status",
            "",
        )
        self.assertNotIn("/api/sp", scrubbed)
        self.assertNotIn("passcode", runs.lower())
        self.assertNotIn("student-key", runs.lower())

    def test_review_workflows_upload_then_route_then_restore_exit_code(self):
        for name, step_id in (
            ("maintenance-governance-digest.yml", "governance"),
            ("maintenance-monthly-review.yml", "monthly"),
        ):
            workflow_steps = steps(name)
            upload_index = next(
                index
                for index, step in enumerate(workflow_steps)
                if step.get("id") == "upload"
            )
            route_index = next(
                index
                for index, step in enumerate(workflow_steps)
                if "maintenance_issue.py" in step.get("run", "")
            )
            enforce_index = next(
                index
                for index, step in enumerate(workflow_steps)
                if step.get("id") == "enforce"
            )
            self.assertLess(upload_index, route_index, name)
            self.assertLess(route_index, enforce_index, name)
            self.assertEqual(workflow_steps[upload_index].get("if"), "always()")
            self.assertEqual(workflow_steps[route_index].get("if"), "always()")
            route_values = json_values(workflow_steps[route_index])
            self.assertIn("${{ steps.upload.outputs.artifact-url }}", route_values)
            self.assertTrue(
                any(
                    f"${{{{ steps.{step_id}.outputs.exit_code }}}}" in str(value)
                    for value in json_values(workflow_steps[enforce_index])
                ),
                name,
            )

    def test_rotation_captures_ten_routes_after_upload_and_translates_exit(self):
        workflow_steps = steps("maintenance-rotation-readiness.yml")
        rotation_index = next(
            index for index, step in enumerate(workflow_steps)
            if step.get("id") == "rotation"
        )
        upload_index = next(
            index for index, step in enumerate(workflow_steps)
            if step.get("id") == "upload"
        )
        route_index = next(
            index for index, step in enumerate(workflow_steps)
            if "maintenance_issue.py" in step.get("run", "")
        )
        enforce_index = next(
            index for index, step in enumerate(workflow_steps)
            if step.get("id") == "enforce"
        )
        self.assertLess(rotation_index, upload_index)
        self.assertLess(upload_index, route_index)
        self.assertLess(route_index, enforce_index)
        self.assertIn("set +e", workflow_steps[rotation_index]["run"])
        self.assertIn("exit_code", workflow_steps[rotation_index]["run"])
        self.assertIn(
            "steps.rotation.outputs.exit_code == '10'",
            workflow_steps[route_index]["if"],
        )
        enforce_run = workflow_steps[enforce_index]["run"]
        self.assertIn('"0"|"10"', enforce_run)
        self.assertIn("exit", enforce_run)

    def test_workflows_contain_no_forbidden_mutation_or_baseline_commands(self):
        forbidden = (
            "--update-snapshots",
            "update-baselines",
            "git push origin main",
            "git push main",
            "issue close",
            "gh issue close",
            "reviewed.json",
            "question_bank.json",
        )
        for name in [*EXPECTED, "surveillance-resource-intake.yml"]:
            runs = "\n".join(
                step.get("run", "") for step in steps(name)
            ).lower()
            for token in forbidden:
                self.assertNotIn(token.lower(), runs, f"{name}: {token}")


def json_values(value):
    if isinstance(value, dict):
        return [
            item
            for nested in value.values()
            for item in json_values(nested)
        ]
    if isinstance(value, list):
        return [item for nested in value for item in json_values(nested)]
    return [value]


if __name__ == "__main__":
    unittest.main()
