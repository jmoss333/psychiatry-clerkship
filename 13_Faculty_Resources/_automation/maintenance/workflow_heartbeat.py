#!/usr/bin/env python3
"""Evaluate freshness of scheduled GitHub Actions without assessing itself."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
EXPECTATIONS = {
    "maintenance-sp-health-monitor.yml": 10,
    "maintenance-production-canary.yml": 30,
    "maintenance-rotation-readiness.yml": 30,
    "ci.yml": 8 * 24,
    "maintenance-governance-digest.yml": 8 * 24,
    "surveillance-link-monitor.yml": 8 * 24,
    "surveillance-citations.yml": 8 * 24,
    "maintenance-monthly-review.yml": 35 * 24,
    "surveillance-guideline.yml": 35 * 24,
}
SAFE_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
SAFE_WORKFLOW = re.compile(r"^[A-Za-z0-9_.-]{1,128}\.ya?ml$")
MAX_API_BYTES = 2_000_000
API_TIMEOUT_SECONDS = 20


class HeartbeatError(RuntimeError):
    """A workflow run or activation record could not be trusted."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _utc_now():
    return datetime.now(timezone.utc)


def _as_utc(value):
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise HeartbeatError("timestamp is not timezone-aware")
    return value.astimezone(timezone.utc)


def _parse_timestamp(value):
    if not isinstance(value, str) or not value or len(value) > 40:
        raise HeartbeatError("timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HeartbeatError("timestamp is invalid") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise HeartbeatError("timestamp is not UTC")
    return parsed.astimezone(timezone.utc)


def _parse_git_timestamp(value):
    if not isinstance(value, str) or not value or len(value) > 40:
        raise HeartbeatError("git timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HeartbeatError("git timestamp is invalid") from exc
    if parsed.tzinfo is None:
        raise HeartbeatError("git timestamp is not timezone-aware")
    return parsed.astimezone(timezone.utc)


def _safe_run_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname == "github.com"
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
        and re.fullmatch(
            r"/[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}/actions/runs/[1-9][0-9]*",
            parsed.path,
        )
        is not None
    )


def _empty_workflow(workflow_file, state, age_hours=None):
    return {
        "workflowFile": workflow_file,
        "runId": None,
        "runUrl": None,
        "createdAt": None,
        "updatedAt": None,
        "status": None,
        "conclusion": None,
        "ageHours": age_hours,
        "state": state,
    }


def _normalize_run(workflow_file, raw, now):
    if not isinstance(raw, dict):
        raise HeartbeatError("workflow run is malformed")
    run_id = raw.get("id")
    status = raw.get("status")
    conclusion = raw.get("conclusion")
    run_url = raw.get("html_url")
    if (
        type(run_id) is not int
        or run_id <= 0
        or status != "completed"
        or not isinstance(conclusion, str)
        or not conclusion
        or len(conclusion) > 64
        or not _safe_run_url(run_url)
    ):
        raise HeartbeatError("workflow run is malformed")
    created = _parse_timestamp(raw.get("created_at"))
    updated = _parse_timestamp(raw.get("updated_at"))
    if updated < created or updated > now:
        raise HeartbeatError("workflow run timestamps are malformed")
    age = (now - updated).total_seconds() / 3600
    return {
        "workflowFile": workflow_file,
        "runId": run_id,
        "runUrl": run_url,
        "createdAt": raw["created_at"],
        "updatedAt": raw["updated_at"],
        "status": status,
        "conclusion": conclusion,
        "ageHours": round(age, 3),
        "state": "success",
    }, updated


def evaluate_runs(expectations, runs_by_workflow, *, now, activation_times):
    """Evaluate only completed scheduled runs and produce a bounded receipt."""
    now = _as_utc(now)
    if not isinstance(expectations, dict) or not isinstance(runs_by_workflow, dict):
        raise HeartbeatError("heartbeat inputs are malformed")
    if not isinstance(activation_times, dict):
        raise HeartbeatError("activation times are malformed")

    workflows = []
    gate = "ready"
    for workflow_file in sorted(expectations):
        limit = expectations[workflow_file]
        if (
            not isinstance(workflow_file, str)
            or SAFE_WORKFLOW.fullmatch(workflow_file) is None
            or type(limit) is not int
            or limit <= 0
        ):
            raise HeartbeatError("heartbeat expectation is malformed")
        runs = runs_by_workflow.get(workflow_file, [])
        if runs is None or not isinstance(runs, list):
            workflows.append(_empty_workflow(workflow_file, "unavailable"))
            gate = "blocked"
            continue

        completed = []
        malformed = False
        for raw in runs:
            if not isinstance(raw, dict):
                malformed = True
                break
            if raw.get("event") != "schedule":
                continue
            if raw.get("status") != "completed":
                continue
            try:
                normalized, updated = _normalize_run(workflow_file, raw, now)
            except HeartbeatError:
                malformed = True
                break
            completed.append((updated, normalized))
        if malformed:
            workflows.append(_empty_workflow(workflow_file, "unavailable"))
            gate = "blocked"
            continue
        if completed:
            latest_updated, latest = max(completed, key=lambda item: item[0])
            if latest["conclusion"] != "success":
                latest["state"] = "failed"
                gate = "blocked"
            elif (now - latest_updated).total_seconds() / 3600 > limit:
                latest["state"] = "stale"
                gate = "blocked"
            workflows.append(latest)
            continue

        activation = activation_times.get(workflow_file)
        if activation is None:
            workflows.append(
                _empty_workflow(workflow_file, "provenance_unavailable")
            )
            gate = "blocked"
            continue
        try:
            activation = _as_utc(activation)
        except HeartbeatError:
            workflows.append(
                _empty_workflow(workflow_file, "provenance_unavailable")
            )
            gate = "blocked"
            continue
        if activation > now:
            workflows.append(
                _empty_workflow(workflow_file, "provenance_unavailable")
            )
            gate = "blocked"
            continue
        raw_age = (now - activation).total_seconds() / 3600
        age = round(raw_age, 3)
        state = "pending_first_run" if raw_age <= limit else "missing"
        workflows.append(_empty_workflow(workflow_file, state, age))
        if state == "missing":
            gate = "blocked"

    return {
        "schemaVersion": 1,
        "generatedAt": now.isoformat(timespec="seconds"),
        "gate": gate,
        "workflows": workflows,
    }


def fetch_runs(repository, workflow_file, *, token, opener=None):
    """Fetch the schedule-only run page for one exact workflow file."""
    if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
        raise HeartbeatError("GitHub repository is invalid")
    if not isinstance(workflow_file, str) or SAFE_WORKFLOW.fullmatch(workflow_file) is None:
        raise HeartbeatError("workflow file is invalid")
    if not isinstance(token, str) or not token:
        raise HeartbeatError("GITHUB_TOKEN is unavailable")
    encoded = quote(workflow_file, safe="")
    url = (
        f"https://api.github.com/repos/{repository}/actions/workflows/{encoded}/runs"
        "?event=schedule&per_page=10"
    )
    request = Request(
        url,
        method="GET",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    client = opener or build_opener(_NoRedirect())
    try:
        response = client.open(request, timeout=API_TIMEOUT_SECONDS)
        try:
            status = getattr(response, "status", None)
            if status != 200:
                raise HeartbeatError("GitHub workflow API returned a failure")
            raw = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except HeartbeatError:
        raise
    except Exception as exc:
        raise HeartbeatError("GitHub workflow API is unavailable") from exc
    if not isinstance(raw, bytes) or len(raw) > MAX_API_BYTES:
        raise HeartbeatError("GitHub workflow API response is too large")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HeartbeatError("GitHub workflow API response is malformed") from exc
    if not isinstance(payload, dict) or not isinstance(
        payload.get("workflow_runs"), list
    ):
        raise HeartbeatError("GitHub workflow API response is malformed")
    return payload["workflow_runs"]


def _run_git(root, args, *, allow_failure=False):
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not allow_failure:
        raise HeartbeatError("git activation provenance is unavailable")
    return result


def _cron_present(source, expected_cron):
    try:
        parsed = yaml.load(source, Loader=yaml.BaseLoader)
        trigger = parsed["on"]
        schedule = trigger["schedule"]
    except (TypeError, KeyError, yaml.YAMLError) as exc:
        raise HeartbeatError("workflow schedule YAML is malformed") from exc
    if not isinstance(schedule, list):
        raise HeartbeatError("workflow schedule YAML is malformed")
    crons = []
    for item in schedule:
        if not isinstance(item, dict) or set(item) != {"cron"}:
            raise HeartbeatError("workflow schedule YAML is malformed")
        cron = item["cron"]
        if not isinstance(cron, str):
            raise HeartbeatError("workflow schedule YAML is malformed")
        crons.append(cron)
    return expected_cron in crons


def derive_schedule_activation(root, workflow_file, expected_cron):
    """Derive the start of the current contiguous expected-cron history."""
    root = Path(root)
    if SAFE_WORKFLOW.fullmatch(workflow_file or "") is None:
        raise HeartbeatError("workflow file is invalid")
    if not isinstance(expected_cron, str) or not expected_cron:
        raise HeartbeatError("expected cron is invalid")
    relative = f".github/workflows/{workflow_file}"

    head = _run_git(root, ["show", f"HEAD:{relative}"])
    if not _cron_present(head.stdout, expected_cron):
        raise HeartbeatError("expected schedule is not active at HEAD")
    history = _run_git(
        root,
        ["rev-list", "--first-parent", "HEAD", "--", relative],
    )
    commits = [line for line in history.stdout.splitlines() if line]
    if not commits:
        raise HeartbeatError("workflow schedule has no git provenance")

    candidate = None
    for commit in commits:
        shown = _run_git(
            root,
            ["show", f"{commit}:{relative}"],
            allow_failure=True,
        )
        if shown.returncode != 0:
            break
        try:
            present = _cron_present(shown.stdout, expected_cron)
        except HeartbeatError:
            present = False
        if not present:
            break
        candidate = commit
    if candidate is None:
        raise HeartbeatError("workflow schedule activation is unavailable")

    parent = _run_git(
        root,
        ["show", f"{candidate}^:{relative}"],
        allow_failure=True,
    )
    if parent.returncode == 0:
        try:
            if _cron_present(parent.stdout, expected_cron):
                raise HeartbeatError(
                    "workflow schedule activation boundary is ambiguous"
                )
        except HeartbeatError as exc:
            if "ambiguous" in str(exc):
                raise
    timestamp = _run_git(
        root,
        ["show", "-s", "--format=%cI", candidate],
    ).stdout.strip()
    return _parse_git_timestamp(timestamp)


def main(argv=None, *, opener=None, now=_utc_now):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    args = parser.parse_args(argv)
    checked_at = _as_utc(now())
    repository = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    runs = {}
    activations = {}
    for workflow_file in EXPECTATIONS:
        try:
            runs[workflow_file] = fetch_runs(
                repository,
                workflow_file,
                token=token,
                opener=opener,
            )
        except HeartbeatError:
            runs[workflow_file] = None
            continue
        if not any(
            isinstance(item, dict)
            and item.get("event") == "schedule"
            and item.get("status") == "completed"
            for item in runs[workflow_file]
        ):
            try:
                activations[workflow_file] = derive_schedule_activation(
                    args.repo_root,
                    workflow_file,
                    _expected_cron(workflow_file),
                )
            except HeartbeatError:
                pass
    receipt = evaluate_runs(
        EXPECTATIONS,
        runs,
        now=checked_at,
        activation_times=activations,
    )
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except OSError:
        return 2
    return 0 if receipt["gate"] == "ready" else 2


def _expected_cron(workflow_file):
    mapping = {
        "maintenance-sp-health-monitor.yml": "15 */6 * * *",
        "maintenance-production-canary.yml": "20 9 * * *",
        "maintenance-rotation-readiness.yml": "15 13 * * *",
        "ci.yml": "0 8 * * 0",
        "maintenance-governance-digest.yml": "30 12 * * 1",
        "surveillance-link-monitor.yml": "0 6 * * 1",
        "surveillance-citations.yml": "0 7 * * 1",
        "maintenance-monthly-review.yml": "0 13 1 * *",
        "surveillance-guideline.yml": "0 6 1 * *",
    }
    return mapping[workflow_file]


if __name__ == "__main__":
    raise SystemExit(main())
