#!/usr/bin/env python3
"""Validate scheduled-maintenance workflow contracts from parsed YAML."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_DIR = Path(".github/workflows")
EXPECTED_CRONS = {
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
PINNED_ACTIONS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-python": "5fda3b95a4ea91299a34e894583c3862153e4b97",
    "actions/setup-node": "820762786026740c76f36085b0efc47a31fe5020",
    "actions/upload-artifact": "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    "actions/cache": "55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
    "lycheeverse/lychee-action": "e7477775783ea5526144ba13e8db5eec57747ce8",
}
PIN_TAGS = {
    "actions/checkout": "v7",
    "actions/setup-python": "v7",
    "actions/setup-node": "v7",
    "actions/upload-artifact": "v7",
    "actions/cache": "v6",
    "lycheeverse/lychee-action": "v2",
}
MAINTENANCE_FILES = {
    name for name in EXPECTED_CRONS if name.startswith("maintenance-")
}
SURVEILLANCE_FILES = {
    "surveillance-link-monitor.yml",
    "surveillance-citations.yml",
    "surveillance-guideline.yml",
    "surveillance-resource-intake.yml",
}
SCOPED_FILES = set(EXPECTED_CRONS) | {"surveillance-resource-intake.yml"}
EXPECTED_PERMISSIONS = {
    "ci.yml": {"contents": "read"},
    "maintenance-sp-health-monitor.yml": {"contents": "read"},
    "maintenance-production-canary.yml": {"contents": "read"},
    "maintenance-heartbeat.yml": {"actions": "read", "contents": "read"},
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
    **{
        name: {
            "contents": "write",
            "issues": "write",
            "pull-requests": "write",
        }
        for name in SURVEILLANCE_FILES
    },
}
SP_STATUS_URL = "https://sp-interview-proxy.netlify.app/api/sp/health-status"
MS3_URL = "https://une-ms3-psychiatry.netlify.app"
RES_URL = "https://mmc-psychiatry-residents-sanford.netlify.app"
EXPECTED_CONCURRENCY = {
    "ci.yml": {
        "group": "ci-${{ github.event_name }}-${{ github.ref }}",
        "cancel-in-progress": "${{ github.event_name != 'schedule' }}",
    },
    "maintenance-governance-digest.yml": {
        "group": "maintenance-governance",
        "cancel-in-progress": "false",
    },
    "maintenance-monthly-review.yml": {
        "group": "maintenance-monthly",
        "cancel-in-progress": "false",
    },
    "maintenance-rotation-readiness.yml": {
        "group": "maintenance-rotation",
        "cancel-in-progress": "false",
    },
}
EXPECTED_JOB_IDS = {
    "ci.yml": {"build-test-validate", "smoke-tests"},
    "maintenance-sp-health-monitor.yml": {"monitor"},
    "maintenance-production-canary.yml": {"production-canary"},
    "maintenance-heartbeat.yml": {"heartbeat"},
    "maintenance-governance-digest.yml": {"governance"},
    "maintenance-monthly-review.yml": {"monthly"},
    "maintenance-rotation-readiness.yml": {"rotation"},
    "surveillance-citations.yml": {"citation-check"},
    "surveillance-guideline.yml": {"guideline-delta"},
    "surveillance-link-monitor.yml": {"link-audit"},
    "surveillance-resource-intake.yml": {"resource-intake"},
}
EXPECTED_STEP_INVENTORIES = {
    "ci.yml": {
        "build-test-validate": (
            ("uses", "actions/checkout"),
            ("name", "Agent docs parity — AGENTS.md must equal CLAUDE.md"),
            ("uses", "actions/setup-python"),
            ("name", "Install — registry schema validation dependencies"),
            ("name", "Unit — scheduled maintenance"),
            ("name", "Validate — scheduled workflow contracts"),
            ("name", "Lint — no hard-coded machine paths in tracked Python"),
            ("name", "Unit — media guard"),
            ("name", "Unit — evidence registry"),
            ("name", "Validate — evidence registry and generated views"),
            ("name", "Unit — citation surveillance"),
            ("name", "Validate — topic_meta.json contract"),
            ("name", "Validate — longitudinal case contract"),
            ("name", "Unit — shelf/COMAT question bank data-quality gate"),
            ("name", "Validate — family systems scenarios contract"),
            ("name", "Test — registry schema gate"),
            ("name", "Validate — registry schemas"),
            ("name", "Test — ReConnect snapshot provenance"),
            ("name", "Validate — ReConnect snapshot provenance"),
            ("name", "Unit — tool governance"),
            ("name", "Validate — tool governance"),
            ("uses", "actions/setup-node"),
            ("name", "Unit — root node regression tests (tests/*.test.mjs)"),
            ("name", "Validate — WCAG AA contrast tokens"),
            ("name", "Install — managed SP proxy dependencies"),
            ("name", "Test — SP Interview and managed proxy"),
            ("name", "Build + static QA gate (ms3)"),
            ("name", "Build + static QA gate (res)"),
        ),
        "smoke-tests": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Install — registry schema validation dependencies"),
            ("uses", "actions/setup-node"),
            ("name", "Build sites (ms3 + res)"),
            ("uses", "actions/cache"),
            ("name", "Install Playwright + Chromium"),
            ("name", "Start local review servers"),
            ("name", "Check 1: nav crawl — ms3 + res"),
            ("name", "Check 1a: Interview Room acceptance — ms3"),
            ("name", "Check 1b: Unified faculty attestation workspace"),
            ("name", "Check 2: LFS integrity — Netlify deploy preview"),
            ("name", "Check 3: visual regression — resident site"),
            ("uses", "actions/upload-artifact"),
        ),
    },
    "maintenance-governance-digest.yml": {
        "governance": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("uses", "actions/setup-node"),
            ("name", "Build faculty governance digest"),
            ("uses", "actions/upload-artifact"),
            ("name", "Route faculty governance review"),
            ("name", "Preserve governance gate result"),
        ),
    },
    "maintenance-heartbeat.yml": {
        "heartbeat": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Install workflow parser"),
            ("name", "Evaluate scheduled workflow freshness"),
            ("uses", "actions/upload-artifact"),
        ),
    },
    "maintenance-monthly-review.yml": {
        "monthly": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Install evidence validation dependencies"),
            ("name", "Build evidence and operations review"),
            ("uses", "actions/upload-artifact"),
            ("name", "Route evidence and operations review"),
            ("name", "Preserve monthly gate result"),
        ),
    },
    "maintenance-production-canary.yml": {
        "production-canary": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("uses", "actions/setup-node"),
            ("name", "Install Playwright and Chromium"),
            ("name", "Crawl both public learner sites"),
            ("name", "Build content-free release twin"),
            ("uses", "actions/upload-artifact"),
        ),
    },
    "maintenance-rotation-readiness.yml": {
        "rotation": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Build rotation readiness passport"),
            ("uses", "actions/upload-artifact"),
            ("name", "Route due rotation review"),
            ("name", "Translate rotation routing result"),
        ),
    },
    "maintenance-sp-health-monitor.yml": {
        "monitor": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Check public content-free Interview Room receipt"),
            ("uses", "actions/upload-artifact"),
        ),
    },
    "surveillance-citations.yml": {
        "citation-check": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Install dependencies"),
            ("name", "Prepare run directory"),
            ("name", "Hydrate rolling surveillance inbox"),
            ("name", "Check source URLs and cited identifiers"),
            ("name", "Sync findings into issues and reports"),
            ("name", "Rebuild faculty status page from live issue state"),
            ("uses", "actions/upload-artifact"),
            ("name", "Publish rolling surveillance inbox"),
        ),
    },
    "surveillance-guideline.yml": {
        "guideline-delta": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Install dependencies"),
            ("name", "Prepare run directory"),
            ("name", "Hydrate rolling surveillance inbox"),
            ("name", "Crawl and diff sources"),
            ("name", "Sync findings into issues and reports"),
            ("name", "Rebuild faculty status page from live issue state"),
            ("uses", "actions/upload-artifact"),
            ("name", "Publish rolling surveillance inbox"),
            ("name", "Open attestation update PRs"),
        ),
    },
    "surveillance-link-monitor.yml": {
        "link-audit": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Prepare run directory"),
            ("name", "Hydrate rolling surveillance inbox"),
            ("uses", "lycheeverse/lychee-action"),
            ("name", "Parse lychee report into findings"),
            ("name", "Sync findings into issues and reports"),
            ("name", "Rebuild faculty status page from live issue state"),
            ("uses", "actions/upload-artifact"),
            ("name", "Publish rolling surveillance inbox"),
        ),
    },
    "surveillance-resource-intake.yml": {
        "resource-intake": (
            ("uses", "actions/checkout"),
            ("uses", "actions/setup-python"),
            ("name", "Install dependencies"),
            ("name", "Prepare run directory"),
            ("name", "Hydrate rolling surveillance inbox"),
            ("name", "Crawl candidate resources"),
            ("name", "Sync findings into digest and report"),
            ("name", "Rebuild faculty status page from live issue state"),
            ("uses", "actions/upload-artifact"),
            ("name", "Publish rolling surveillance inbox"),
        ),
    },
}
# SHA-256 of each BaseLoader-parsed workflow serialized canonically. These
# reviewed semantic fingerprints lock every allowed trigger, job, and step
# key/value. Source-text action-pin comments are validated separately.
EXPECTED_WORKFLOW_CONTRACT_DIGESTS = {
    "ci.yml": "6957ba096dc9512f4126d0894ac833921448d3fd14044bea76f72a37231f877e",
    "maintenance-governance-digest.yml": (
        "70f57a5662cfd03aa978bde7582f716ae174ee6e992467c067d02508e349eb62"
    ),
    "maintenance-heartbeat.yml": (
        "7e23746edc01a56129500d8334648ec6c098f578b09c3c99ec1a25f887c146c6"
    ),
    "maintenance-monthly-review.yml": (
        "26d91cfb13af4e4d095a2d1488b5d59cea5e6b5c59aa2686dccc65e48a97007a"
    ),
    "maintenance-production-canary.yml": (
        "fb0cf7f7ff6f37fef89237f2cb1a5a7447b971e2f08cf90aec0e0aecee76ece3"
    ),
    "maintenance-rotation-readiness.yml": (
        "f2479c8da0fa76b70397cb89fabca5992138b6556fba65def1dcc7cc4cceeb08"
    ),
    "maintenance-sp-health-monitor.yml": (
        "37235ac00ed3ea15d226fae7269ba90c2c78a7ef5c1b2e83875221d77d65b3db"
    ),
    "surveillance-citations.yml": (
        "70994985fe3aecc4fc4fa711de9eabbba0a7845de6787e5357abcd8096009639"
    ),
    "surveillance-guideline.yml": (
        "9db487d116a4040514a1c11c9acc502b904e6e95537bff04ea4dccce791347da"
    ),
    "surveillance-link-monitor.yml": (
        "a936748032e04aeb852e6d3e2727ab5692d431584bbe8ee9fb7e43d39abd178e"
    ),
    "surveillance-resource-intake.yml": (
        "680b952fb7ebb7f79d8c200f6a4b9e9cc490225a3238b83ada466d0816cf989d"
    ),
}
CRITICAL_STEPS = {
    "ci.yml": {
        "build-test-validate": (
            (
                "Unit — scheduled maintenance",
                "python3 -m unittest discover -s tests/maintenance "
                "-p 'test_*.py' -v",
                None,
                "required CI gate",
            ),
            (
                "Validate — scheduled workflow contracts",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                "validate_scheduled_workflows.py",
                None,
                "required CI gate",
            ),
            (
                "Unit — root node regression tests (tests/*.test.mjs)",
                "node --test tests/*.test.mjs",
                None,
                "required CI gate",
            ),
            (
                "Build + static QA gate (ms3)",
                "bash 13_Faculty_Resources/_automation/site_build/"
                "build_and_check.sh ms3",
                None,
                "required CI build gate",
            ),
            (
                "Build + static QA gate (res)",
                "bash 13_Faculty_Resources/_automation/site_build/"
                "build_and_check.sh res",
                None,
                "required CI build gate",
            ),
        ),
        "smoke-tests": (
            (
                "Build sites (ms3 + res)",
                "bash 13_Faculty_Resources/_automation/site_build/"
                "build_and_check.sh ms3\n"
                "bash 13_Faculty_Resources/_automation/site_build/"
                "build_and_check.sh res",
                None,
                "required CI smoke build",
            ),
            (
                "Check 1: nav crawl — ms3 + res",
                "cd tests/smoke\n"
                "npx playwright test --project=nav-ms3 --project=nav-res",
                None,
                "required CI navigation gate",
            ),
            (
                "Check 2: LFS integrity — Netlify deploy preview",
                """cd tests/smoke
# Derive the deploy-preview URL from the PR number (if this is a PR run).
# Netlify deploy previews use the pattern:
#   https://deploy-preview-{PR}--{site-slug}.netlify.app
# Probe first; skip gracefully if the deploy isn't live yet.
PR_NUM="${{ github.event.pull_request.number }}"
if [ "${{ github.event_name }}" = "pull_request" ] && [ -n "$PR_NUM" ]; then
  MS3_CANDIDATE="https://deploy-preview-${PR_NUM}--une-ms3-psychiatry.netlify.app"
  RES_CANDIDATE="https://deploy-preview-${PR_NUM}--mmc-psychiatry-residents-sanford.netlify.app"
  if curl -sf --head --max-time 8 "$MS3_CANDIDATE" >/dev/null 2>&1; then
    export MS3_DEPLOY_URL="$MS3_CANDIDATE"
    export RES_DEPLOY_URL="$RES_CANDIDATE"
    echo "Deploy preview ready — LFS check will run against $MS3_CANDIDATE"
  else
    echo "Deploy preview not yet live — LFS check will be skipped (set MS3_DEPLOY_URL manually to force)"
  fi
else
  export MS3_DEPLOY_URL="https://une-ms3-psychiatry.netlify.app"
  export RES_DEPLOY_URL="https://mmc-psychiatry-residents-sanford.netlify.app"
  echo "Scheduled/manual release rehearsal — LFS check will run against production learner sites"
fi
npx playwright test --project=lfs""",
                None,
                "required CI LFS gate",
            ),
        ),
    },
    "maintenance-sp-health-monitor.yml": {
        "monitor": (
            (
                "Check public content-free Interview Room receipt",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                "sp_health_monitor.py --url "
                "https://sp-interview-proxy.netlify.app/api/sp/health-status "
                '--out "$RUNNER_TEMP/sp-health-monitor.json"',
                None,
                "required SP health gate",
            ),
        ),
    },
    "maintenance-production-canary.yml": {
        "production-canary": (
            (
                "Install Playwright and Chromium",
                "cd tests/smoke\nnpm ci\n"
                "npx playwright install chromium --with-deps",
                None,
                "required production canary install",
            ),
            (
                "Crawl both public learner sites",
                "cd tests/smoke\n"
                "npx playwright test --project=nav-ms3 --project=nav-res",
                None,
                "required production navigation gate",
            ),
            (
                "Build content-free release twin",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                "production_canary.py --config "
                "13_Faculty_Resources/_automation/maintenance/"
                'maintenance_config.json --source-sha "$GITHUB_SHA" '
                '--out "$RUNNER_TEMP/release-twin.json"',
                "always()",
                "required production release-twin gate",
            ),
        ),
    },
    "maintenance-heartbeat.yml": {
        "heartbeat": (
            (
                "Install workflow parser",
                "python3 -m pip install PyYAML==6.0.2",
                None,
                "required heartbeat parser install",
            ),
            (
                "Evaluate scheduled workflow freshness",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                'workflow_heartbeat.py --out "$RUNNER_TEMP/'
                'workflow-heartbeat.json"',
                None,
                "required heartbeat gate",
            ),
        ),
    },
    "maintenance-governance-digest.yml": {
        "governance": (
            (
                "Build faculty governance digest",
                """mkdir -p "$RUN_DIR"
set +e
node 13_Faculty_Resources/_automation/maintenance/governance_digest.mjs \\
  --out-json "$RUN_DIR/governance.json" \\
  --out-md "$RUN_DIR/governance.md"
code=$?
set -e
echo "exit_code=$code" >> "$GITHUB_OUTPUT"
exit 0""",
                None,
                "required governance capture",
            ),
            (
                "Route faculty governance review",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                "maintenance_issue.py --kind governance "
                '--report "$RUN_DIR/governance.json" --run-url "$RUN_URL" '
                '--artifact-url "$ARTIFACT_URL"',
                "always()",
                "required governance router",
            ),
            (
                "Preserve governance gate result",
                """code="${{ steps.governance.outputs.exit_code }}"
case "$code" in
  "0") exit 0 ;;
  "1"|"2") exit "$code" ;;
  *) exit 2 ;;
esac""",
                "always()",
                "governance finalizer",
            ),
        ),
    },
    "maintenance-monthly-review.yml": {
        "monthly": (
            (
                "Build evidence and operations review",
                """mkdir -p "$RUN_DIR"
set +e
python3 tools/evidence_registry/validate.py --check-generated
evidence_code=$?
python3 13_Faculty_Resources/_automation/maintenance/monthly_review.py \\
  --out-json "$RUN_DIR/monthly.json" \\
  --out-md "$RUN_DIR/monthly.md"
review_code=$?
set -e
if [ "$evidence_code" -ne 0 ] && [ "$review_code" -eq 0 ]; then
  review_code=2
fi
echo "exit_code=$review_code" >> "$GITHUB_OUTPUT"
exit 0""",
                None,
                "required monthly capture",
            ),
            (
                "Route evidence and operations review",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                "maintenance_issue.py --kind monthly "
                '--report "$RUN_DIR/monthly.json" --run-url "$RUN_URL" '
                '--artifact-url "$ARTIFACT_URL"',
                "always()",
                "required monthly router",
            ),
            (
                "Preserve monthly gate result",
                """code="${{ steps.monthly.outputs.exit_code }}"
case "$code" in
  "0") exit 0 ;;
  "1"|"2") exit "$code" ;;
  *) exit 2 ;;
esac""",
                "always()",
                "monthly finalizer",
            ),
        ),
    },
    "maintenance-rotation-readiness.yml": {
        "rotation": (
            (
                "Build rotation readiness passport",
                """mkdir -p "$RUN_DIR"
set +e
python3 13_Faculty_Resources/_automation/maintenance/rotation_readiness.py \\
  --config 13_Faculty_Resources/_automation/maintenance/rotation_blocks.json \\
  --out-json "$RUN_DIR/rotation.json" \\
  --out-md "$RUN_DIR/rotation.md"
code=$?
set -e
echo "exit_code=$code" >> "$GITHUB_OUTPUT"
exit 0""",
                None,
                "required rotation capture",
            ),
            (
                "Route due rotation review",
                "python3 13_Faculty_Resources/_automation/maintenance/"
                "maintenance_issue.py --kind rotation "
                '--report "$RUN_DIR/rotation.json" --run-url "$RUN_URL" '
                '--artifact-url "$ARTIFACT_URL"',
                "${{ always() && steps.rotation.outputs.exit_code == '10' }}",
                "required rotation router",
            ),
            (
                "Translate rotation routing result",
                """code="${{ steps.rotation.outputs.exit_code }}"
case "$code" in
  "0"|"10") exit 0 ;;
  "1"|"2") exit "$code" ;;
  *) exit 2 ;;
esac""",
                "always()",
                "rotation finalizer",
            ),
        ),
    },
}


def _error(errors, name, message):
    errors.append(f"{name}: {message}")


def _load(root, name, errors):
    path = root / WORKFLOW_DIR / name
    try:
        source = path.read_text(encoding="utf-8")
        parsed = yaml.load(source, Loader=yaml.BaseLoader)
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        _error(errors, name, f"cannot parse workflow ({type(exc).__name__})")
        return None, ""
    if not isinstance(parsed, dict):
        _error(errors, name, "workflow root must be a mapping")
        return None, source
    return parsed, source


def _steps(workflow):
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict):
        return []
    result = []
    for job in jobs.values():
        if isinstance(job, dict) and isinstance(job.get("steps"), list):
            result.extend(
                step for step in job["steps"] if isinstance(step, dict)
            )
    return result


def _validate_job_boundaries(name, workflow, errors):
    if "defaults" in workflow:
        _error(errors, name, "workflow defaults override is forbidden")
    if "shell" in workflow:
        _error(errors, name, "workflow shell override is forbidden")
    if "continue-on-error" in workflow:
        _error(errors, name, "workflow continue-on-error is forbidden")
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict):
        return
    expected_job_ids = EXPECTED_JOB_IDS.get(name)
    if expected_job_ids is not None and set(jobs) != expected_job_ids:
        _error(errors, name, "job IDs do not match the exact workflow contract")
    for job_id, job in jobs.items():
        if not isinstance(job, dict):
            _error(errors, name, f"job {job_id!r} must be a mapping")
            continue
        if "uses" in job:
            _error(errors, name, f"job-level uses is forbidden for {job_id!r}")
        if "permissions" in job:
            _error(
                errors,
                name,
                f"job-level permissions override is forbidden for {job_id!r}",
            )
        if "defaults" in job:
            _error(errors, name, f"job defaults override is forbidden for {job_id!r}")
        if "shell" in job:
            _error(errors, name, f"job shell override is forbidden for {job_id!r}")
        if "continue-on-error" in job:
            _error(
                errors,
                name,
                f"job continue-on-error is forbidden for {job_id!r}",
            )
        if name in EXPECTED_CRONS and "if" in job:
            _error(
                errors,
                name,
                f"job {job_id!r} must not exclude schedule events",
            )


def _step_identity(step):
    uses = step.get("uses")
    if isinstance(uses, str):
        return "uses", uses.partition("@")[0]
    return "name", step.get("name")


def _validate_step_inventory(name, workflow, errors):
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict):
        return
    for job_id, expected in EXPECTED_STEP_INVENTORIES[name].items():
        job = jobs.get(job_id)
        raw_steps = job.get("steps") if isinstance(job, dict) else None
        if not isinstance(raw_steps, list) or any(
            not isinstance(step, dict) for step in raw_steps
        ):
            _error(errors, name, f"step inventory is malformed for job {job_id!r}")
            continue
        actual = tuple(_step_identity(step) for step in raw_steps)
        if actual != expected:
            _error(
                errors,
                name,
                f"step inventory does not match exact contract for job {job_id!r}",
            )


def _validate_execution_boundaries(name, workflow, errors):
    for step in _steps(workflow):
        if "defaults" in step:
            _error(errors, name, "step defaults override is forbidden")
        if "shell" in step:
            _error(errors, name, "step shell override is forbidden")
        if "continue-on-error" in step:
            _error(errors, name, "step continue-on-error is forbidden")


def _contract_digest(value):
    canonical = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _validate_exact_workflow_contract(name, workflow, errors):
    if _contract_digest(workflow) != EXPECTED_WORKFLOW_CONTRACT_DIGESTS[name]:
        _error(
            errors,
            name,
            "workflow contract, including job and step contract, "
            "does not match exact contract",
        )


def _normalized_run(step):
    run = step.get("run")
    return run.strip() if isinstance(run, str) else None


def _validate_critical_steps(name, workflow, errors):
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict):
        return
    for job_id, expected_steps in CRITICAL_STEPS.get(name, {}).items():
        job = jobs.get(job_id)
        if not isinstance(job, dict) or not isinstance(job.get("steps"), list):
            _error(errors, name, f"required job {job_id!r} is missing")
            continue
        steps = [step for step in job["steps"] if isinstance(step, dict)]
        for step_name, expected_run, expected_if, label in expected_steps:
            matches = [step for step in steps if step.get("name") == step_name]
            if len(matches) != 1:
                _error(
                    errors,
                    name,
                    f"{label} must appear exactly once",
                )
                continue
            step = matches[0]
            if _normalized_run(step) != expected_run.strip():
                _error(errors, name, f"{label} command structure is invalid")
            if expected_if is None:
                if "if" in step:
                    _error(errors, name, f"{label} must not exclude schedule events")
            elif step.get("if") != expected_if:
                _error(errors, name, f"{label} must not exclude schedule events")


def _runs(steps):
    return "\n".join(
        step.get("run", "") for step in steps if isinstance(step.get("run", ""), str)
    )


def _values(value):
    if isinstance(value, dict):
        return [item for nested in value.values() for item in _values(nested)]
    if isinstance(value, list):
        return [item for nested in value for item in _values(nested)]
    return [value]


def _validate_cron(name, workflow, errors):
    try:
        schedule = workflow["on"]["schedule"]
    except (KeyError, TypeError):
        _error(errors, name, "schedule trigger is missing")
        return
    expected = [{"cron": EXPECTED_CRONS[name]}]
    if schedule != expected:
        _error(errors, name, f"schedule must be exactly {expected!r}")


def _validate_actions(name, source, steps, errors):
    for step in steps:
        uses = step.get("uses")
        if not isinstance(uses, str) or uses.startswith("./"):
            continue
        action, separator, revision = uses.partition("@")
        if (
            separator != "@"
            or action not in PINNED_ACTIONS
            or revision != PINNED_ACTIONS[action]
        ):
            _error(errors, name, f"unapproved action reference {uses!r}")
            continue
        expected_line = re.compile(
            rf"uses:\s*{re.escape(action)}@{revision}\s+#\s*{PIN_TAGS[action]}\s*$",
            re.MULTILINE,
        )
        if expected_line.search(source) is None:
            _error(
                errors,
                name,
                f"{action} pin must retain semantic tag {PIN_TAGS[action]}",
            )


def _validate_uploads(name, steps, errors):
    for step in steps:
        uses = step.get("uses", "")
        if not isinstance(uses, str) or not uses.startswith(
            "actions/upload-artifact@"
        ):
            continue
        config = step.get("with")
        if not isinstance(config, dict):
            _error(errors, name, "artifact upload is missing configuration")
            continue
        try:
            retention = int(config["retention-days"])
        except (KeyError, TypeError, ValueError):
            _error(errors, name, "artifact retention is missing or malformed")
            continue
        if retention > 90 or retention <= 0:
            _error(errors, name, "artifact retention must be between 1 and 90 days")
        if name in MAINTENANCE_FILES | SURVEILLANCE_FILES and retention != 90:
            _error(errors, name, "maintenance evidence retention must be 90 days")
        if name == "ci.yml" and retention != 14:
            _error(errors, name, "existing CI smoke artifact retention must remain 14 days")
        if step.get("if") != "always()":
            _error(errors, name, "artifact uploads must run with if: always()")


def _validate_permissions(name, workflow, errors):
    if workflow.get("permissions") != EXPECTED_PERMISSIONS[name]:
        _error(errors, name, "permissions do not match the least-privilege contract")


def _validate_concurrency(name, workflow, errors):
    expected = EXPECTED_CONCURRENCY.get(name)
    if expected is not None and workflow.get("concurrency") != expected:
        _error(errors, name, "concurrency does not match the safe event contract")


def _validate_ci(workflow, errors):
    name = "ci.yml"
    trigger = workflow.get("on")
    jobs = workflow.get("jobs")
    if not isinstance(trigger, dict) or "schedule" not in trigger:
        _error(errors, name, "schedule trigger is not reachable")
    if not isinstance(jobs, dict):
        _error(errors, name, "jobs mapping is missing")
        return
    build = jobs.get("build-test-validate")
    smoke = jobs.get("smoke-tests")
    if not isinstance(build, dict) or not isinstance(smoke, dict):
        _error(errors, name, "authoritative CI jobs are missing")
        return
    if smoke.get("needs") != "build-test-validate":
        _error(errors, name, "smoke-tests must need build-test-validate")
    if "if" in build or "if" in smoke:
        _error(errors, name, "authoritative CI jobs may not exclude schedule events")

    build_steps = build.get("steps", [])
    smoke_steps = smoke.get("steps", [])
    if not isinstance(build_steps, list) or not isinstance(smoke_steps, list):
        _error(errors, name, "authoritative CI steps are malformed")
        return
    try:
        ms3 = next(
            index
            for index, step in enumerate(build_steps)
            if step.get("name") == "Build + static QA gate (ms3)"
        )
        res = next(
            index
            for index, step in enumerate(build_steps)
            if step.get("name") == "Build + static QA gate (res)"
        )
        if ms3 >= res:
            raise ValueError
    except (StopIteration, ValueError, AttributeError):
        _error(errors, name, "build-test-validate must build ms3 then res")

    smoke_builds = [
        step
        for step in smoke_steps
        if step.get("name") == "Build sites (ms3 + res)"
    ]
    if len(smoke_builds) != 1:
        _error(errors, name, "smoke-tests must build ms3 then res")


def _validate_production_canary(workflow, errors):
    name = "maintenance-production-canary.yml"
    steps = _steps(workflow)
    run = _runs(steps)
    values = _values(workflow)
    for required in (
        "--project=nav-ms3",
        "--project=nav-res",
        "production_canary.py",
    ):
        if required not in run:
            _error(errors, name, f"production canary step is missing: {required}")
    for url in (MS3_URL, RES_URL):
        if url not in values:
            _error(errors, name, f"production URL is missing: {url}")


def _validate_sp_monitor(workflow, errors):
    name = "maintenance-sp-health-monitor.yml"
    run = _runs(_steps(workflow))
    if SP_STATUS_URL not in run:
        _error(errors, name, "public status endpoint is missing")
    scrubbed = run.replace(SP_STATUS_URL, "")
    if "/api/sp" in scrubbed:
        _error(errors, name, "monitor calls a non-status Interview Room route")
    values = "\n".join(str(value) for value in _values(workflow))
    if re.search(
        r"passcode|student-key|authorization|x[-_ ]?key|"
        r"github\.token|secrets\.",
        values,
        re.IGNORECASE,
    ):
        _error(errors, name, "monitor workflow references a credential")


def _step_index(steps, predicate):
    for index, step in enumerate(steps):
        if predicate(step):
            return index
    return None


def _validate_review_workflow(name, workflow, step_id, errors):
    steps = _steps(workflow)
    capture = _step_index(steps, lambda step: step.get("id") == step_id)
    upload = _step_index(steps, lambda step: step.get("id") == "upload")
    route = _step_index(
        steps,
        lambda step: "maintenance_issue.py" in step.get("run", ""),
    )
    enforce = _step_index(steps, lambda step: step.get("id") == "enforce")
    if None in {capture, upload, route, enforce}:
        _error(errors, name, "capture/upload/route/enforce sequence is incomplete")
        return
    if not capture < upload < route < enforce:
        _error(errors, name, "artifact must upload before routing and gate restore")
    if steps[upload].get("if") != "always()" or steps[route].get("if") != "always()":
        _error(errors, name, "upload and issue routing must use if: always()")
    if "${{ steps.upload.outputs.artifact-url }}" not in _values(steps[route]):
        _error(errors, name, "issue router does not receive upload artifact-url")
    capture_run = steps[capture].get("run", "")
    if "set +e" not in capture_run or "exit_code" not in capture_run:
        _error(errors, name, "report exit code is not captured")
    enforce_values = _values(steps[enforce])
    if not any(
        f"${{{{ steps.{step_id}.outputs.exit_code }}}}" in str(value)
        for value in enforce_values
    ):
        _error(errors, name, "captured report exit code is not restored")
    if steps[enforce].get("if") != "always()":
        _error(errors, name, "gate restoration must use if: always()")
    if name == "maintenance-monthly-review.yml":
        if (
            "tools/evidence_registry/validate.py --check-generated"
            not in capture_run
            or capture_run.index("tools/evidence_registry/validate.py --check-generated")
            > capture_run.index("monthly_review.py")
        ):
            _error(errors, name, "evidence validation must precede monthly review")


def _validate_rotation(workflow, errors):
    name = "maintenance-rotation-readiness.yml"
    steps = _steps(workflow)
    capture = _step_index(steps, lambda step: step.get("id") == "rotation")
    upload = _step_index(steps, lambda step: step.get("id") == "upload")
    route = _step_index(
        steps,
        lambda step: "maintenance_issue.py" in step.get("run", ""),
    )
    enforce = _step_index(steps, lambda step: step.get("id") == "enforce")
    if None in {capture, upload, route, enforce}:
        _error(errors, name, "rotation capture/upload/route/enforce sequence is incomplete")
        return
    if not capture < upload < route < enforce:
        _error(errors, name, "rotation upload/routing order is invalid")
    if "set +e" not in steps[capture].get("run", ""):
        _error(errors, name, "rotation exit 10 is not captured")
    condition = steps[route].get("if", "")
    if "always()" not in condition or "exit_code == '10'" not in condition:
        _error(errors, name, "rotation issue routing is not limited to exit 10")
    if "${{ steps.upload.outputs.artifact-url }}" not in _values(steps[route]):
        _error(errors, name, "rotation router does not receive upload artifact-url")
    enforce_run = steps[enforce].get("run", "")
    if '"0"|"10"' not in enforce_run or 'exit "$code"' not in enforce_run:
        _error(errors, name, "rotation 0/10 exit translation is missing")
    if steps[enforce].get("if") != "always()":
        _error(errors, name, "rotation result translation must use if: always()")


def _validate_forbidden(name, steps, errors):
    run = _runs(steps)
    forbidden = {
        "visual baseline mutation": r"--update-snapshots|update-baselines",
        "automatic issue closure": r"\b(?:gh\s+)?issue\s+close\b",
        "direct GitHub issue API": (
            r"https://api\.github\.com/[^\s\"']*/issues(?:/[^\s\"']*)?"
            r"|\bgh\s+api\b[^\n]*(?:/issues\b|issues/)"
        ),
        "direct push to main": r"\bgit\s+push[^\n]*(?:origin\s+)?main\b",
        "clinical or attestation registry": (
            r"\b(?:question_bank|reviewed|topic_meta)\.json\b"
        ),
    }
    for label, pattern in forbidden.items():
        if re.search(pattern, run, re.IGNORECASE):
            _error(errors, name, f"forbidden {label} command")


def validate_repository(root=REPO_ROOT):
    """Return every parsed workflow contract error; an empty list is valid."""
    root = Path(root)
    errors = []
    documents = {}
    sources = {}
    for name in sorted(SCOPED_FILES):
        document, source = _load(root, name, errors)
        if document is not None:
            documents[name] = document
            sources[name] = source
    for name, workflow in documents.items():
        steps = _steps(workflow)
        _validate_job_boundaries(name, workflow, errors)
        _validate_step_inventory(name, workflow, errors)
        _validate_execution_boundaries(name, workflow, errors)
        _validate_exact_workflow_contract(name, workflow, errors)
        _validate_actions(name, sources[name], steps, errors)
        _validate_uploads(name, steps, errors)
        _validate_permissions(name, workflow, errors)
        _validate_concurrency(name, workflow, errors)
        _validate_critical_steps(name, workflow, errors)
        _validate_forbidden(name, steps, errors)
        if name in EXPECTED_CRONS:
            _validate_cron(name, workflow, errors)

    if "ci.yml" in documents:
        _validate_ci(documents["ci.yml"], errors)
    if "maintenance-production-canary.yml" in documents:
        _validate_production_canary(
            documents["maintenance-production-canary.yml"],
            errors,
        )
    if "maintenance-sp-health-monitor.yml" in documents:
        _validate_sp_monitor(documents["maintenance-sp-health-monitor.yml"], errors)
    for name, step_id in (
        ("maintenance-governance-digest.yml", "governance"),
        ("maintenance-monthly-review.yml", "monthly"),
    ):
        if name in documents:
            _validate_review_workflow(name, documents[name], step_id, errors)
    if "maintenance-rotation-readiness.yml" in documents:
        _validate_rotation(
            documents["maintenance-rotation-readiness.yml"],
            errors,
        )
    return sorted(errors)


def main():
    errors = validate_repository()
    if errors:
        for error in errors:
            print(f"scheduled-workflow: {error}", file=sys.stderr)
        return 1
    print(f"scheduled-workflow: {len(SCOPED_FILES)} workflow contracts OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
