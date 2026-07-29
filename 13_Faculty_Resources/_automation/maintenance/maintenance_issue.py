#!/usr/bin/env python3
"""Create or update one bounded, content-free maintenance review issue."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


DISCLAIMER = (
    "Faculty review remains required. This automation does not attest, approve, "
    "close, or modify content."
)
OPAQUE_ROTATION_ID = re.compile(
    r"^rot-[0-9]{4}-hx-(?=[a-f0-9]{16}$)(?=[a-f0-9]*[a-f])"
    r"(?=[a-f0-9]*[0-9])[a-f0-9]{16}$"
)
SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
SAFE_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
MAX_COUNT = 1_000_000
MAX_BODY = 16_000
MANUAL_CHECKLIST = (
    "issue a new non-identifying SP_ROTATION_ID",
    "rotate the learner passcode and separate operations credential",
    "preserve the prior content-free usage receipt",
    "run the Interview Room red-team checklist and golden transcript",
    "verify the latest production canary, release rehearsal, governance digest, and attestation gate",
    "confirm managed voice remains disabled unless all external faculty/privacy gates are recorded",
)


class IssueRoutingError(RuntimeError):
    """A report or GitHub issue boundary did not meet the safe contract."""


def _bounded_count(value, label):
    if type(value) is not int or value < 0 or value > MAX_COUNT:
        raise IssueRoutingError(f"{label} must be a bounded non-negative count")
    return value


def _safe_id(value, label):
    if not isinstance(value, str) or SAFE_ID.fullmatch(value) is None:
        raise IssueRoutingError(f"{label} must be a safe identifier")
    return value


def _safe_url(value, label, *, optional=False):
    if optional and value == "":
        return ""
    if not isinstance(value, str) or len(value) > 2048:
        raise IssueRoutingError(f"{label} URL is invalid")
    try:
        parsed = urlsplit(value)
    except ValueError as exc:
        raise IssueRoutingError(f"{label} URL is invalid") from exc
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not parsed.path.startswith("/")
    ):
        raise IssueRoutingError(f"{label} URL is invalid")
    return value


def _iso_date(value, label):
    if not isinstance(value, str) or value != value.strip():
        raise IssueRoutingError(f"{label} must be an ISO date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise IssueRoutingError(f"{label} must be an ISO date") from exc
    if parsed.isoformat() != value:
        raise IssueRoutingError(f"{label} must be an ISO date")
    return value


def _links(run_url, artifact_url):
    artifact = artifact_url if artifact_url else "unavailable"
    return [f"Run: {run_url}", f"Artifact: {artifact}"]


def _governance_body(report, run_url, artifact_url):
    gate = report.get("gate")
    if gate not in {"ready", "review", "blocked"}:
        raise IssueRoutingError("governance gate is invalid")
    if gate == "ready":
        return None, None, None
    qbank = report.get("qbank")
    if not isinstance(qbank, dict):
        raise IssueRoutingError("governance qbank summary is missing")
    counts = qbank.get("counts")
    expected_counts = {
        "total",
        "draft",
        "attested",
        "ready",
        "warning",
        "blocked",
    }
    if not isinstance(counts, dict) or set(counts) != expected_counts:
        raise IssueRoutingError("governance counts are invalid")
    normalized = {
        key: _bounded_count(counts[key], f"governance {key}")
        for key in sorted(expected_counts)
    }
    blocked_ids = qbank.get("blockedIds")
    if not isinstance(blocked_ids, list) or len(blocked_ids) > 256:
        raise IssueRoutingError("governance blocked IDs are invalid")
    blocked_ids = sorted(
        {_safe_id(value, "blocked question ID") for value in blocked_ids}
    )
    marker = "<!-- maintenance:governance -->"
    lines = [
        marker,
        "# Faculty governance maintenance review",
        "",
        f"Gate: {gate}",
        (
            "Question counts: "
            + ", ".join(f"{key}={normalized[key]}" for key in sorted(normalized))
        ),
        "Blocked question IDs: " + (", ".join(blocked_ids) or "none"),
        *_links(run_url, artifact_url),
        "",
        DISCLAIMER,
    ]
    return marker, "maintenance: faculty governance review", "\n".join(lines)


def _monthly_body(report, run_url, artifact_url):
    gate = report.get("gate")
    if gate not in {"ready", "review", "blocked"}:
        raise IssueRoutingError("monthly gate is invalid")
    if gate == "ready":
        return None, None, None
    evidence = report.get("evidence")
    media = report.get("media")
    operations = report.get("operations")
    if not all(isinstance(value, dict) for value in (evidence, media, operations)):
        raise IssueRoutingError("monthly summary is incomplete")
    total = _bounded_count(evidence.get("total"), "evidence total")
    identity = evidence.get("identity")
    cadence = evidence.get("cadence")
    runbooks = operations.get("runbooks")
    if not all(isinstance(value, dict) for value in (identity, cadence, runbooks)):
        raise IssueRoutingError("monthly count groups are invalid")
    identity_pending = _bounded_count(
        identity.get("pending"), "pending evidence identities"
    )
    identity_unknown = _bounded_count(
        identity.get("unknown"), "unknown evidence identities"
    )
    cadence_due = _bounded_count(cadence.get("due"), "evidence cadence due")
    cadence_overdue = _bounded_count(
        cadence.get("overdue"), "evidence cadence overdue"
    )
    served_missing = _bounded_count(
        media.get("servedMissingCount"), "served media missing alternatives"
    )
    new_regressions = media.get("newRegressions")
    if not isinstance(new_regressions, list) or len(new_regressions) > MAX_COUNT:
        raise IssueRoutingError("new accessibility regressions are invalid")
    stale_runbooks = _bounded_count(runbooks.get("stale"), "stale runbooks")
    unknown_runbooks = _bounded_count(runbooks.get("unknown"), "unknown runbooks")
    marker = "<!-- maintenance:monthly -->"
    lines = [
        marker,
        "# Evidence and operations maintenance review",
        "",
        f"Gate: {gate}",
        f"Evidence records: {total}",
        f"Pending or unknown identities: {identity_pending + identity_unknown}",
        f"Evidence cadence due or overdue: {cadence_due + cadence_overdue}",
        f"Served media missing alternatives: {served_missing}",
        f"New accessibility regressions: {len(new_regressions)}",
        f"Stale or unknown runbooks: {stale_runbooks + unknown_runbooks}",
        *_links(run_url, artifact_url),
        "",
        DISCLAIMER,
    ]
    return marker, "maintenance: evidence and operations review", "\n".join(lines)


def _rotation_body(report, run_url, artifact_url):
    state = report.get("state")
    if state in {
        "configuration_required",
        "not_due",
        "active",
        "complete",
        "ready",
    }:
        return None, None, None
    if state not in {"due", "overdue"}:
        raise IssueRoutingError("rotation state is invalid")
    block_id = report.get("blockId")
    if not isinstance(block_id, str) or OPAQUE_ROTATION_ID.fullmatch(block_id) is None:
        raise IssueRoutingError("rotation block ID is not a safe opaque ID")
    starts_on = _iso_date(report.get("startsOn"), "rotation startsOn")
    ends_on = _iso_date(report.get("endsOn"), "rotation endsOn")
    if ends_on < starts_on:
        raise IssueRoutingError("rotation dates are invalid")
    days = report.get("daysUntilStart")
    if type(days) is not int or days < -366 or days > 7:
        raise IssueRoutingError("rotation daysUntilStart is invalid")
    marker = f"<!-- maintenance:rotation:id={block_id} -->"
    lines = [
        marker,
        "# Rotation readiness review",
        "",
        f"State: {state}",
        f"Block ID: {block_id}",
        f"Starts: {starts_on}",
        f"Ends: {ends_on}",
        f"Days until start: {days}",
        *_links(run_url, artifact_url),
        "",
        "Manual checklist:",
        *(f"- {item}" for item in MANUAL_CHECKLIST),
        "",
        DISCLAIMER,
    ]
    return marker, f"maintenance: rotation readiness {block_id}", "\n".join(lines)


def route_issue(
    kind,
    report,
    *,
    run_url,
    artifact_url,
    list_issues,
    create_issue,
    update_issue,
):
    """Route one allow-listed report into at most one open review issue."""
    if not isinstance(report, dict):
        raise IssueRoutingError("report must be an object")
    run_url = _safe_url(run_url, "run")
    artifact_url = _safe_url(artifact_url, "artifact", optional=True)
    builders = {
        "governance": _governance_body,
        "monthly": _monthly_body,
        "rotation": _rotation_body,
    }
    if kind not in builders:
        raise IssueRoutingError("issue kind is invalid")
    marker, title, body = builders[kind](report, run_url, artifact_url)
    if marker is None:
        return {"action": "none"}
    if len(body) > MAX_BODY:
        raise IssueRoutingError("issue body exceeds the safe limit")

    issues = list_issues()
    if not isinstance(issues, list):
        raise IssueRoutingError("GitHub issue list is malformed")
    matches = []
    for issue in issues:
        if (
            isinstance(issue, dict)
            and issue.get("state") == "open"
            and "pull_request" not in issue
            and isinstance(issue.get("body"), str)
            and marker in issue["body"]
        ):
            number = issue.get("number")
            if type(number) is not int or number <= 0:
                raise IssueRoutingError("GitHub issue number is malformed")
            matches.append(number)
    if len(matches) > 1:
        raise IssueRoutingError("ambiguous maintenance issue marker")

    payload = {"title": title, "body": body}
    if matches:
        result = update_issue(matches[0], payload)
        action = "updated"
    else:
        result = create_issue({**payload, "labels": ["maintenance"]})
        action = "created"
    number = result.get("number") if isinstance(result, dict) else None
    if type(number) is not int or number <= 0:
        raise IssueRoutingError("GitHub issue response is malformed")
    return {"action": action, "number": number}


class _GitHubIssues:
    def __init__(self, repository, token):
        if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
            raise IssueRoutingError("GITHUB_REPOSITORY is invalid")
        if not isinstance(token, str) or not token:
            raise IssueRoutingError("GITHUB_TOKEN is unavailable")
        self.base = f"https://api.github.com/repos/{repository}/issues"
        self.token = token

    def _request(self, method, url, payload=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            url,
            data=body,
            method=method,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "X-GitHub-Api-Version": "2022-11-28",
                **({"Content-Type": "application/json"} if body is not None else {}),
            },
        )
        with urlopen(request, timeout=20) as response:
            raw = response.read(1_048_577)
        if len(raw) > 1_048_576:
            raise IssueRoutingError("GitHub response is too large")
        try:
            return json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise IssueRoutingError("GitHub response is malformed") from exc

    def list(self):
        issues = []
        for page in range(1, 11):
            query = urlencode(
                {
                    "state": "open",
                    "labels": "maintenance",
                    "per_page": 100,
                    "page": page,
                }
            )
            batch = self._request("GET", f"{self.base}?{query}")
            if not isinstance(batch, list):
                raise IssueRoutingError("GitHub issue list is malformed")
            issues.extend(batch)
            if len(batch) < 100:
                return issues
        raise IssueRoutingError("GitHub issue list exceeds the review bound")

    def create(self, payload):
        return self._request("POST", self.base, payload)

    def update(self, number, payload):
        return self._request("PATCH", f"{self.base}/{number}", payload)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("governance", "monthly", "rotation"), required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--artifact-url", default="")
    args = parser.parse_args(argv)
    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
        client = _GitHubIssues(
            os.environ.get("GITHUB_REPOSITORY"),
            os.environ.get("GITHUB_TOKEN"),
        )
        result = route_issue(
            args.kind,
            report,
            run_url=args.run_url,
            artifact_url=args.artifact_url,
            list_issues=client.list,
            create_issue=client.create,
            update_issue=client.update,
        )
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, json.JSONDecodeError, IssueRoutingError):
        print("maintenance issue routing failed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
