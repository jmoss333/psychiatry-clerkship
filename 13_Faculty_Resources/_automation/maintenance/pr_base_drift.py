#!/usr/bin/env python3
"""Publish a nonblocking Check Run when current main drifts under an open PR.

The workflow runs trusted code from ``main`` after ``main`` moves. It fetches PR
objects for analysis only: it never checks out, rebases, pushes, merges, labels, or
comments on a contributor branch. A conflict, material overlap, superseded change,
or unavailable scan is reported with the neutral conclusion so this advisory cannot
become an accidental merge gate.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bin"))
from pr_preflight import analyse, changed_files, git  # noqa: E402


CHECK_NAME = "PR base drift (advisory)"
API_VERSION = "2022-11-28"
API_TIMEOUT_SECONDS = 20
MAX_API_BYTES = 2_000_000
MAX_OPEN_PULLS = 200
MAX_RENDERED_PATHS = 12
SAFE_REPOSITORY = re.compile(r"[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}")
SAFE_SHA = re.compile(r"[0-9a-f]{40}")


class DriftError(RuntimeError):
    """The advisory could not obtain a complete, trustworthy result."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _repository(value):
    if not isinstance(value, str) or SAFE_REPOSITORY.fullmatch(value) is None:
        raise DriftError("repository is invalid")
    return value


def _token(value):
    if (not isinstance(value, str) or not value or len(value) > 4096
            or any(ord(char) < 33 or ord(char) > 126 for char in value)):
        raise DriftError("token is unavailable or invalid")
    return value


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise DriftError("API object is ambiguous")
        result[key] = value
    return result


def _reject_constant(_value):
    raise DriftError("API response is not JSON")


def _api_json(repository, token, endpoint, *, method="GET", payload=None,
              opener=None, expected=(200,)):
    repository = _repository(repository)
    token = _token(token)
    if (not isinstance(endpoint, str) or not endpoint or endpoint.startswith("/")
            or "\n" in endpoint or "\r" in endpoint):
        raise DriftError("API endpoint is invalid")
    body = None
    if payload is not None:
        try:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise DriftError("API payload is invalid") from exc
    request = Request(
        f"https://api.github.com/repos/{repository}/{endpoint}",
        data=body,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "Content-Type": "application/json",
        },
    )
    client = opener or build_opener(_NoRedirect())
    try:
        response = client.open(request, timeout=API_TIMEOUT_SECONDS)
        try:
            if getattr(response, "status", None) not in expected:
                raise DriftError("API response failed")
            raw = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except DriftError:
        raise
    except Exception as exc:
        raise DriftError("API is unavailable") from exc
    if not isinstance(raw, bytes) or len(raw) > MAX_API_BYTES:
        raise DriftError("API response is invalid or over limit")
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object,
                          parse_constant=_reject_constant)
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise DriftError("API response is malformed") from exc


def _pull(item):
    if (not isinstance(item, dict) or not isinstance(item.get("number"), int)
            or isinstance(item.get("number"), bool)
            or not 1 <= item["number"] <= 1_000_000_000
            or item.get("state") != "open"
            or not isinstance(item.get("base"), dict)
            or item["base"].get("ref") != "main"
            or not isinstance(item.get("head"), dict)
            or not isinstance(item["head"].get("sha"), str)
            or SAFE_SHA.fullmatch(item["head"]["sha"]) is None):
        raise DriftError("pull request entry is malformed")
    return {"number": item["number"], "headSha": item["head"]["sha"]}


def fetch_open_pulls(repository, token, *, opener=None):
    """Return a complete, bounded inventory of open PR numbers and head SHAs."""
    rows = []
    seen = set()
    for page in range(1, 4):
        endpoint = "pulls?" + urlencode({
            "state": "open", "base": "main", "per_page": 100, "page": page,
        })
        payload = _api_json(repository, token, endpoint, opener=opener)
        if not isinstance(payload, list) or len(payload) > 100:
            raise DriftError("pull request listing is malformed")
        normalized = [_pull(item) for item in payload]
        if page == 3:
            if normalized:
                raise DriftError("more than 200 open pull requests; scan would be partial")
            return rows
        for row in normalized:
            if row["number"] in seen:
                raise DriftError("pull request listing is ambiguous")
            seen.add(row["number"])
            rows.append(row)
        if len(normalized) < 100:
            return rows
    raise DriftError("pull request scan is incomplete")


def fetch_pull(repository, number, token, *, opener=None):
    if not isinstance(number, int) or isinstance(number, bool) or not 1 <= number <= 1_000_000_000:
        raise DriftError("pull request number is invalid")
    return _pull(_api_json(repository, token, f"pulls/{number}", opener=opener))


def _safe_path(value):
    if not isinstance(value, str):
        return "[invalid path]"
    cleaned = re.sub(r"[\x00-\x1f\x7f`]", "?", value)
    return cleaned[:160] + ("..." if len(cleaned) > 160 else "")


def _behind_phrase(count):
    count = count if isinstance(count, int) and count >= 0 else 0
    return f"{count} commit{'s' if count != 1 else ''} behind main"


def build_check_output(report):
    """Map a preflight report to a bounded, nonblocking GitHub check result."""
    if not isinstance(report, dict):
        raise DriftError("analysis report is malformed")
    verdict = report.get("verdict")
    behind = report.get("commitsBehindBase", 0)
    if verdict == "DIVERGENT" and report.get("mergeConflicts") is True:
        return {
            "conclusion": "neutral",
            "title": "Merge conflict with main",
            "summary": (
                f"Advisory only: this PR is {_behind_phrase(behind)} and no longer "
                "merges cleanly with main. Update the branch before relying on its CI "
                "or deploy preview."
            ),
            "text": "No branch was changed. This check never rebases, pushes, merges, or comments.",
        }
    if verdict == "DIVERGENT":
        paths = report.get("materialDivergence")
        if not isinstance(paths, list):
            raise DriftError("material divergence is malformed")
        shown = [_safe_path(path) for path in paths[:MAX_RENDERED_PATHS]]
        lines = [f"- `{path}`" for path in shown]
        if len(paths) > MAX_RENDERED_PATHS:
            lines.append(f"- ... and {len(paths) - MAX_RENDERED_PATHS} more")
        return {
            "conclusion": "neutral",
            "title": "Base drift touches this PR's files or tests",
            "summary": (
                f"Advisory only: this PR is {_behind_phrase(behind)}, and main changed "
                "a file owned by the PR or a test that can alter its signal. The merge "
                "is currently clean, but CI and branch-head previews may differ."
            ),
            "text": "\n".join(lines) or "No renderable path was returned.",
        }
    if verdict == "SUPERSEDED":
        return {
            "conclusion": "neutral",
            "title": "Changes may already be on main",
            "summary": (
                "Advisory only: every file changed by this PR now has the same blob on "
                "main. Review whether the PR has been superseded before merging."
            ),
            "text": "No branch was changed.",
        }
    if verdict == "STALE":
        return {
            "conclusion": "success",
            "title": f"Mergeable; {_behind_phrase(behind)}",
            "summary": (
                f"The branch is {_behind_phrase(behind)}, but this scan found no overlap "
                "with the PR's files or test files. This does not replace review or "
                "required checks."
            ),
            "text": "No branch was changed.",
        }
    if verdict == "CURRENT":
        return {
            "conclusion": "success",
            "title": "Current with main",
            "summary": (
                "The PR head is current with the examined main revision. This does not "
                "replace review or required checks."
            ),
            "text": "No branch was changed.",
        }
    raise DriftError("analysis verdict is unknown")


def unavailable_output():
    return {
        "conclusion": "neutral",
        "title": "Base-drift evidence unavailable",
        "summary": (
            "Advisory only: the scan could not obtain complete evidence. Treat the PR's "
            "relationship to main as unknown and inspect it manually."
        ),
        "text": "No branch was changed.",
    }


def upsert_check(repository, head_sha, number, output, token, *, opener=None,
                 completed_at=None):
    """Create or refresh the latest same-name Check Run on one PR head."""
    _repository(repository)
    if not isinstance(head_sha, str) or SAFE_SHA.fullmatch(head_sha) is None:
        raise DriftError("head SHA is invalid")
    if not isinstance(number, int) or isinstance(number, bool) or not 1 <= number <= 1_000_000_000:
        raise DriftError("pull request number is invalid")
    if (not isinstance(output, dict) or output.get("conclusion") not in ("success", "neutral")
            or any(not isinstance(output.get(key), str) for key in ("title", "summary", "text"))):
        raise DriftError("check output is malformed")
    completed_at = completed_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    query = urlencode({"check_name": CHECK_NAME, "filter": "latest", "per_page": 100})
    listing = _api_json(
        repository, token, f"commits/{head_sha}/check-runs?{query}", opener=opener,
    )
    if (not isinstance(listing, dict) or not isinstance(listing.get("check_runs"), list)
            or len(listing["check_runs"]) > 100):
        raise DriftError("check run listing is malformed")
    ids = []
    for item in listing["check_runs"]:
        if (not isinstance(item, dict) or item.get("name") != CHECK_NAME
                or not isinstance(item.get("id"), int) or isinstance(item.get("id"), bool)
                or item["id"] <= 0):
            raise DriftError("check run entry is malformed")
        ids.append(item["id"])
    if len(ids) > 1:
        raise DriftError("latest check run listing is ambiguous")
    body = {
        "name": CHECK_NAME,
        "status": "completed",
        "conclusion": output["conclusion"],
        "completed_at": completed_at,
        "external_id": f"pr-base-drift:{number}",
        "output": {key: output[key] for key in ("title", "summary", "text")},
    }
    if ids:
        endpoint, method, expected = f"check-runs/{ids[0]}", "PATCH", (200,)
    else:
        body["head_sha"] = head_sha
        endpoint, method, expected = "check-runs", "POST", (200, 201)
    result = _api_json(
        repository, token, endpoint, method=method, payload=body, opener=opener,
        expected=expected,
    )
    if not isinstance(result, dict) or not isinstance(result.get("id"), int):
        raise DriftError("check run write response is malformed")


def _git_fetch(root, *refspecs):
    proc = subprocess.run(
        ["git", "fetch", "--quiet", "--no-tags", "origin", *refspecs],
        cwd=str(root), capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise DriftError("git fetch failed")


def _analyse_pull(root, base, pull, repository, token, *, opener=None):
    expected = pull["headSha"]
    for attempt in range(2):
        _git_fetch(root, f"pull/{pull['number']}/head")
        observed = git(["rev-parse", "FETCH_HEAD"], root)
        if observed == expected:
            break
        if attempt == 0:
            refreshed = fetch_pull(repository, pull["number"], token, opener=opener)
            expected = refreshed["headSha"]
    else:
        raise DriftError("pull request head changed during the scan")
    merge_base = git(["merge-base", base, observed], root)
    pr_files = changed_files(root, merge_base, observed)
    return observed, analyse(pr_files, observed, base, root)


def main(argv=None, *, opener=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=ROOT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--pr", type=int, action="append", default=[])
    args = parser.parse_args(argv)

    repository = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    try:
        _repository(repository)
        _token(token)
        root = args.repo_root.resolve()
        if not (root / ".git").exists():
            raise DriftError("repository checkout is unavailable")
        _git_fetch(root, "+refs/heads/main:refs/remotes/origin/main")
        base = "origin/main"
        pulls = fetch_open_pulls(repository, token, opener=opener)
        wanted = set(args.pr)
        if any(not isinstance(number, int) or not 1 <= number <= 1_000_000_000 for number in wanted):
            raise DriftError("pull request filter is invalid")
        if wanted:
            pulls = [pull for pull in pulls if pull["number"] in wanted]
            missing = wanted - {pull["number"] for pull in pulls}
            if missing:
                raise DriftError("requested pull request is not open against main")
    except DriftError as exc:
        print(f"pr-base-drift: unavailable: {exc}", file=sys.stderr)
        return 2

    failures = []
    for pull in pulls:
        head_sha = pull["headSha"]
        try:
            head_sha, report = _analyse_pull(
                root, base, pull, repository, token, opener=opener,
            )
            output = build_check_output(report)
        except Exception as exc:
            failures.append(pull["number"])
            output = unavailable_output()
            print(f"pr-base-drift: #{pull['number']} unavailable: {exc}", file=sys.stderr)
        if args.dry_run:
            print(json.dumps({"number": pull["number"], "headSha": head_sha, **output},
                             sort_keys=True))
            continue
        try:
            upsert_check(repository, head_sha, pull["number"], output, token, opener=opener)
        except DriftError as exc:
            failures.append(pull["number"])
            print(f"pr-base-drift: #{pull['number']} check write failed: {exc}", file=sys.stderr)
    if failures:
        print("pr-base-drift: incomplete for PR(s): "
              + ", ".join(f"#{number}" for number in sorted(set(failures))), file=sys.stderr)
        return 2
    print(f"pr-base-drift: examined {len(pulls)} open PR(s) against current main")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
