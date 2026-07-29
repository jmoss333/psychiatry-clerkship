#!/usr/bin/env python3
"""Validate scheduled-maintenance workflow contracts from parsed YAML."""

from __future__ import annotations

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
            if "build_and_check.sh ms3" in step.get("run", "")
        )
        res = next(
            index
            for index, step in enumerate(build_steps)
            if "build_and_check.sh res" in step.get("run", "")
        )
        if ms3 >= res:
            raise ValueError
    except (StopIteration, ValueError, AttributeError):
        _error(errors, name, "build-test-validate must build ms3 then res")

    smoke_run = _runs(smoke_steps)
    if (
        "build_and_check.sh ms3" not in smoke_run
        or "build_and_check.sh res" not in smoke_run
        or smoke_run.index("build_and_check.sh ms3")
        > smoke_run.index("build_and_check.sh res")
    ):
        _error(errors, name, "smoke-tests must build ms3 then res")
    for required in (
        "python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v",
        "validate_scheduled_workflows.py",
        "node --test tests/*.test.mjs",
    ):
        if required not in _runs(build_steps):
            _error(errors, name, f"required gate is missing: {required}")
    for required in ("github.event_name", MS3_URL, RES_URL, "--project=lfs"):
        if required not in smoke_run:
            _error(errors, name, f"scheduled/manual LFS contract is missing: {required}")


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
    if re.search(r"passcode|student-key|authorization", run, re.IGNORECASE):
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
        "direct push to main": r"\bgit\s+push[^\n]*(?:origin\s+)?main\b",
        "clinical registry mutation": (
            r"(?:>|>>|tee|cp|mv)\s+[^\n]*"
            r"(?:question_bank\.json|reviewed\.json|topic_meta\.json)"
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
        _validate_actions(name, sources[name], steps, errors)
        _validate_uploads(name, steps, errors)
        _validate_permissions(name, workflow, errors)
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
