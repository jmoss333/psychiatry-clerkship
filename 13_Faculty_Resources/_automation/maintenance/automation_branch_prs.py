#!/usr/bin/env python3
"""Read-only deadman for owned automation branches without an open PR.

Receipts contain only grammar-checked owned branch names and fixed states.
Incomplete or ambiguous evidence must never become an empty healthy result.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import HTTPRedirectHandler, Request, build_opener

try:  # package and standalone workflow entry points
    from .queue_pr_fallback import BRANCH as QUEUE_BRANCH_RE
    from .stranded_prs import API_TIMEOUT_SECONDS, MAX_API_BYTES, SAFE_REPOSITORY
except ImportError:
    from queue_pr_fallback import BRANCH as QUEUE_BRANCH_RE
    from stranded_prs import API_TIMEOUT_SECONDS, MAX_API_BYTES, SAFE_REPOSITORY


MAX_TRACKED_BRANCHES = 64
# Local evidence bound: matching-refs is one nonpaginated response and may
# contain up to this many refs. A tenth full PR page is still incomplete.
MAX_LIST_ENTRIES = 1000
SURVEILLANCE_BRANCH = "automation/surveillance-inbox"
SAFE_BRANCH = re.compile(r"[A-Za-z0-9_./-]{1,255}")


class AutomationBranchPRError(RuntimeError):
    """Remote evidence cannot support a complete, unambiguous result."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _utc_now():
    return datetime.now(timezone.utc)


def _timestamp(value):
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise AutomationBranchPRError("timestamp is invalid")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_branch(value):
    if (not isinstance(value, str) or SAFE_BRANCH.fullmatch(value) is None
            or ".." in value or "//" in value
            or any(part.startswith(".") or part.endswith((".", ".lock"))
                   for part in value.split("/"))
            or value.startswith("/") or value.endswith("/")):
        raise AutomationBranchPRError("branch is malformed")
    return value


def _ref_branch(item):
    if not isinstance(item, dict) or not isinstance(item.get("ref"), str):
        raise AutomationBranchPRError("ref entry is malformed")
    if not item["ref"].startswith("refs/heads/"):
        raise AutomationBranchPRError("ref entry is malformed")
    return _safe_branch(item["ref"][len("refs/heads/"):])


def _pull_head(item):
    if (not isinstance(item, dict) or not isinstance(item.get("head"), dict)
            or item.get("state") not in ("open", "closed")):
        raise AutomationBranchPRError("pull request entry is malformed")
    repo = item["head"].get("repo")
    if not isinstance(repo, dict):
        raise AutomationBranchPRError("pull request repository is unavailable")
    repository = _repository(repo.get("full_name"))
    return _safe_branch(item["head"].get("ref")), item["state"], repository


def _repository(value):
    if not isinstance(value, str) or SAFE_REPOSITORY.fullmatch(value) is None:
        raise AutomationBranchPRError("repository is invalid")
    return value


def _owned(branch):
    return branch == SURVEILLANCE_BRANCH or QUEUE_BRANCH_RE.fullmatch(branch) is not None


def evaluate(refs, pulls, *, checked_at, repository):
    """Normalize complete raw listings and emit exception-only bounded rows."""
    timestamp = _timestamp(checked_at)
    repository = _repository(repository)
    if (not isinstance(refs, list) or len(refs) > MAX_LIST_ENTRIES
            or not isinstance(pulls, list) or len(pulls) >= MAX_LIST_ENTRIES):
        raise AutomationBranchPRError("listing is malformed or incomplete")
    branches = set()
    seen_refs = set()
    for item in refs:
        branch = _ref_branch(item)
        if branch in seen_refs:
            raise AutomationBranchPRError("refs are ambiguous")
        seen_refs.add(branch)
        if not _owned(branch):
            continue
        if len(branches) >= MAX_TRACKED_BRANCHES:
            raise AutomationBranchPRError("owned refs are over limit")
        branches.add(branch)
    open_heads = set()
    for item in pulls:
        head, state, head_repository = _pull_head(item)
        if state != "open" or head_repository != repository or not _owned(head):
            continue
        if head in open_heads:
            raise AutomationBranchPRError("open pull request heads are ambiguous")
        open_heads.add(head)
    rows = [{"branch": branch, "state": "missing_open_pr"}
            for branch in sorted(branches - open_heads)]
    return {"schemaVersion": 1, "checkedAt": timestamp,
            "gate": "blocked" if rows else "ready", "branches": rows}


def _fetch_list(repository, *, token, endpoint, normalize, max_entries, opener):
    repository = _repository(repository)
    if (not isinstance(token, str) or not token or len(token) > 4096
            or any(ord(char) < 33 or ord(char) > 126 for char in token)):
        raise AutomationBranchPRError("token is unavailable or invalid")
    client = opener or build_opener(_NoRedirect())
    request = Request(
        f"https://api.github.com/repos/{repository}/{endpoint}",
        method="GET",
        headers={"Accept": "application/vnd.github+json",
                 "Authorization": f"Bearer {token}",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    try:
        response = client.open(request, timeout=API_TIMEOUT_SECONDS)
        try:
            if getattr(response, "status", None) != 200:
                raise AutomationBranchPRError("API response failed")
            raw = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except Exception as exc:
        raise AutomationBranchPRError("API is unavailable") from exc
    if not isinstance(raw, bytes) or len(raw) > MAX_API_BYTES:
        raise AutomationBranchPRError("API response is invalid or over limit")
    try:
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object,
                             parse_constant=_reject_json_constant)
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise AutomationBranchPRError("API response is malformed") from exc
    if not isinstance(payload, list) or len(payload) > max_entries:
        raise AutomationBranchPRError("API list is malformed or over limit")
    for item in payload:
        normalize(item)
    return payload


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise AutomationBranchPRError("API object is ambiguous")
        result[key] = value
    return result


def _reject_json_constant(_value):
    raise AutomationBranchPRError("API response is not JSON")


def fetch_automation_refs(repository, *, token, opener=None):
    """Read one nonpaginated matching-refs list, bounded to 1,000 entries."""
    return _fetch_list(repository, token=token,
                       endpoint="git/matching-refs/heads/automation/",
                       normalize=_ref_branch, max_entries=MAX_LIST_ENTRIES, opener=opener)


def fetch_open_pulls(repository, *, token, opener=None):
    """Read the PR listing without interpreting or rendering its content."""
    result = []
    for page in range(1, 11):
        payload = _fetch_list(repository, token=token,
                              endpoint=f"pulls?state=open&per_page=100&page={page}",
                              normalize=_pull_head, max_entries=100, opener=opener)
        result.extend(payload)
        if len(payload) < 100:
            return result
    raise AutomationBranchPRError("API scan is incomplete")


def main(argv=None, *, opener=None, now=_utc_now):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    checked_at = now()
    try:
        repository, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
        refs = fetch_automation_refs(repository, token=token, opener=opener)
        pulls = fetch_open_pulls(repository, token=token, opener=opener)
        receipt = evaluate(refs, pulls, checked_at=checked_at, repository=repository)
    except AutomationBranchPRError:
        receipt = {"schemaVersion": 1, "checkedAt": _timestamp(checked_at),
                   "gate": "blocked", "state": "unavailable", "branches": []}
    try:
        args.out.write_text(json.dumps(receipt, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError):
        print("automation-branch-prs failed: receipt unavailable", file=sys.stderr)
        return 2
    if receipt["gate"] != "ready":
        print("automation-branch-prs failed: gate=blocked", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
