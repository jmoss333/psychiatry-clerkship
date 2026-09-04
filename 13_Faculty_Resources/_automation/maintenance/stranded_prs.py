#!/usr/bin/env python3
"""Find pull requests that auto-merge has armed but will never actually merge.

Why this exists
---------------
On 2026-09-04 PR #480 sat green and unmerged for nine hours. Nothing was wrong
with it: CI had passed on four consecutive heads, both required checks were
green, auto-merge was enabled, and every branch-protection requirement was
satisfied. It simply never fired.

Auto-merge is *event-driven*. GitHub re-evaluates a pull request when something
happens to it -- a push, a check completing, a review. Relaxing a branch rule is
none of those: it changes whether the PR *may* merge without emitting anything
that makes GitHub look again. A PR already parked in a settled state is
therefore never reconsidered, and stays armed forever.

The signature is precise and cheap to test for:

    open + not draft + auto_merge armed + untouched for hours
    + mergeable_state that is NOT naming a real blocker

`mergeable_state` of "clean" means "ready to merge" and "unknown" means "GitHub
has not recomputed this" -- both are consistent with an armed PR that nobody is
going to merge. "dirty", "blocked" and "behind" name a genuine reason to wait,
so those are reported but do not block the gate: someone still has work to do.

Deliberately NOT watched: PRs without auto-merge armed. An open PR sitting for a
week is ordinary backlog and belongs to whoever opened it. This steward makes
exactly one claim -- "you asked GitHub to merge this and GitHub has forgotten"
-- and a monitor that also editorialises about backlog is one people mute.

Safety
------
Pull request titles, branch names and author logins are attacker-controlled text
(anyone can open a PR on a public repo). None of them are read. Rows carry the
PR *number* as an int and a state drawn from this module's own enum, so nothing
remote reaches a log line or a receipt -- the same guarantee `receipt_summary`
documents for the heartbeat's workflow names.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import HTTPRedirectHandler, Request, build_opener

# Dual-mode: this module runs both as a package (tests) and as a script (workflows).
try:  # package
    from .receipt_summary import report
except ImportError:  # script - siblings are on sys.path
    from receipt_summary import report


SAFE_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
MAX_API_BYTES = 2_000_000
API_TIMEOUT_SECONDS = 20

# How long an armed PR may sit untouched before it is called stranded. Auto-merge
# normally fires within seconds of its last blocker clearing, so hours of silence
# is not slowness -- it means no event is coming. Two hours is comfortably longer
# than the ~13 minute CI cycle plus any queueing, so a PR mid-run never trips it.
DEFAULT_MAX_IDLE_HOURS = 2

# mergeable_state values that are consistent with "armed and forgotten". Anything
# else names a real reason the PR is waiting and is the author's to resolve.
# `None` appears when GitHub has not computed mergeability at all, which is the
# strongest form of "nobody has looked at this".
STRANDED_MERGE_STATES = frozenset({"clean", "unknown", None})

# Must match receipt_summary.HEALTHY_ROW_STATE: that module lists rows by
# exception, so the healthy value is the one it skips.
ROW_OK = "success"
ROW_STRANDED = "stranded"
ROW_WAITING = "armed_waiting"


class StrandedPRError(RuntimeError):
    """A pull request listing could not be trusted."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _utc_now():
    return datetime.now(timezone.utc)


def _as_utc(value):
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise StrandedPRError("timestamp is not timezone-aware")
    return value.astimezone(timezone.utc)


def _parse_timestamp(value):
    if not isinstance(value, str) or not value or len(value) > 40:
        raise StrandedPRError("timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise StrandedPRError("timestamp is invalid") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise StrandedPRError("timestamp is not UTC")
    return parsed.astimezone(timezone.utc)


def fetch_open_pulls(repository, *, token, opener=None):
    """Fetch open pull requests targeting the default branch."""
    if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
        raise StrandedPRError("GitHub repository is invalid")
    if not isinstance(token, str) or not token:
        raise StrandedPRError("GITHUB_TOKEN is unavailable")
    url = (
        f"https://api.github.com/repos/{repository}/pulls"
        "?state=open&sort=updated&direction=asc&per_page=100"
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
                raise StrandedPRError("GitHub pulls API returned a failure")
            raw = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except StrandedPRError:
        raise
    except Exception as exc:
        raise StrandedPRError("GitHub pulls API is unavailable") from exc
    if not isinstance(raw, bytes) or len(raw) > MAX_API_BYTES:
        raise StrandedPRError("GitHub pulls API response is too large")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StrandedPRError("GitHub pulls API response is malformed") from exc
    if not isinstance(payload, list):
        raise StrandedPRError("GitHub pulls API response is malformed")
    return payload


def evaluate_pulls(pulls, *, now, max_idle_hours=DEFAULT_MAX_IDLE_HOURS):
    """Classify each open PR. Returns a steward receipt.

    The listing endpoint does not populate `mergeable_state`, so a caller that
    only lists will see `None` for every PR -- which this module treats as
    "not computed", the stranded-consistent case. `enrich_merge_states` fills
    the field in when the caller can afford one extra request per armed PR.
    """
    checked_at = _as_utc(now)
    if not isinstance(pulls, list):
        raise StrandedPRError("pull request listing is malformed")
    cutoff = timedelta(hours=max_idle_hours)
    rows = []
    gate = "ready"
    for item in pulls:
        if not isinstance(item, dict):
            raise StrandedPRError("pull request entry is malformed")
        number = item.get("number")
        if not isinstance(number, int) or isinstance(number, bool) or number <= 0:
            raise StrandedPRError("pull request number is invalid")
        # Drafts are not asking to merge, and a PR without auto-merge armed has
        # made no claim this steward can falsify.
        if item.get("draft") is True or item.get("auto_merge") is None:
            rows.append({"pullRequest": number, "state": ROW_OK, "idleHours": None})
            continue
        idle = checked_at - _parse_timestamp(item.get("updated_at"))
        idle_hours = round(idle.total_seconds() / 3600.0, 1)
        if idle < cutoff:
            rows.append(
                {"pullRequest": number, "state": ROW_OK, "idleHours": idle_hours}
            )
            continue
        merge_state = item.get("mergeable_state")
        if merge_state is not None and not isinstance(merge_state, str):
            raise StrandedPRError("mergeable_state is invalid")
        if merge_state in STRANDED_MERGE_STATES:
            rows.append(
                {"pullRequest": number, "state": ROW_STRANDED, "idleHours": idle_hours}
            )
            gate = "blocked"
        else:
            # Armed and idle, but GitHub is naming a real blocker (behind, dirty,
            # blocked). Someone owes this PR work; that is not this steward's
            # alarm to raise, so it is reported without blocking the gate.
            rows.append(
                {"pullRequest": number, "state": ROW_WAITING, "idleHours": idle_hours}
            )
    rows.sort(key=lambda row: row["pullRequest"])
    return {
        "schemaVersion": 1,
        "checkedAt": checked_at.isoformat().replace("+00:00", "Z"),
        "maxIdleHours": max_idle_hours,
        "gate": gate,
        "pullRequests": rows,
    }


def enrich_merge_states(repository, pulls, *, token, opener=None):
    """Populate `mergeable_state` for armed, non-draft PRs.

    GitHub omits mergeability from the *list* endpoint and computes it lazily on
    the single-PR endpoint, so without this every armed PR looks like `None`.
    Only armed non-drafts are fetched: that is at most a handful of requests,
    and it keeps this steward's cost proportional to what it actually watches.
    A PR whose detail fetch fails is left as-is rather than dropped -- failing
    toward "look at this" is the right direction for a monitor.
    """
    if not isinstance(pulls, list):
        raise StrandedPRError("pull request listing is malformed")
    enriched = []
    for item in pulls:
        if not isinstance(item, dict):
            raise StrandedPRError("pull request entry is malformed")
        if item.get("draft") is True or item.get("auto_merge") is None:
            enriched.append(item)
            continue
        number = item.get("number")
        if not isinstance(number, int) or isinstance(number, bool) or number <= 0:
            raise StrandedPRError("pull request number is invalid")
        try:
            detail = _fetch_pull(repository, number, token=token, opener=opener)
        except StrandedPRError:
            enriched.append(item)
            continue
        merged = dict(item)
        merged["mergeable_state"] = detail.get("mergeable_state")
        enriched.append(merged)
    return enriched


def _fetch_pull(repository, number, *, token, opener=None):
    if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
        raise StrandedPRError("GitHub repository is invalid")
    if not isinstance(number, int) or isinstance(number, bool) or number <= 0:
        raise StrandedPRError("pull request number is invalid")
    if not isinstance(token, str) or not token:
        raise StrandedPRError("GITHUB_TOKEN is unavailable")
    url = f"https://api.github.com/repos/{repository}/pulls/{number}"
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
            if getattr(response, "status", None) != 200:
                raise StrandedPRError("GitHub pull API returned a failure")
            raw = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except StrandedPRError:
        raise
    except Exception as exc:
        raise StrandedPRError("GitHub pull API is unavailable") from exc
    if not isinstance(raw, bytes) or len(raw) > MAX_API_BYTES:
        raise StrandedPRError("GitHub pull API response is too large")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StrandedPRError("GitHub pull API response is malformed") from exc
    if not isinstance(payload, dict):
        raise StrandedPRError("GitHub pull API response is malformed")
    return payload


def main(argv=None, *, opener=None, now=_utc_now):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--max-idle-hours", type=float, default=DEFAULT_MAX_IDLE_HOURS
    )
    args = parser.parse_args(argv)
    checked_at = _as_utc(now())
    repository = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    try:
        pulls = fetch_open_pulls(repository, token=token, opener=opener)
        pulls = enrich_merge_states(repository, pulls, token=token, opener=opener)
        receipt = evaluate_pulls(
            pulls, now=checked_at, max_idle_hours=args.max_idle_hours
        )
    except StrandedPRError:
        # Unavailable is not healthy: a monitor that cannot look must not report
        # "nothing wrong". Mirrors the heartbeat's `unavailable` handling.
        receipt = {
            "schemaVersion": 1,
            "checkedAt": checked_at.isoformat().replace("+00:00", "Z"),
            "maxIdleHours": args.max_idle_hours,
            "gate": "blocked",
            "state": "unavailable",
            "pullRequests": [],
        }
    report(receipt, "stranded-prs", stream=sys.stderr)
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except OSError:
        print("stranded-prs failed: receipt write failed", file=sys.stderr)
        return 2
    return 0 if receipt["gate"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
