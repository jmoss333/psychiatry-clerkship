#!/usr/bin/env python3
"""Find faculty attestations saved to the review branch that no one will ever merge.

Why this exists
---------------
Three times now, saved attestations have accumulated on `attest/pending` with no
open pull request carrying them to `main`:

  * 2026-08-23 — three attestations stranded; landed as PR #415.
  * 2026-09-04 — five attestations stranded; landed as PR #568.
  * 2026-09-08 → 09-14 — six attestations stranded, found by a content review
    rather than by any alarm, with the branch 125 commits behind `main`.

Each time the fix was a merge and the cause survived. The console opens a rolling
pull request when it writes, but once that request MERGES nothing opens the next
one, so the following attestation starts a fresh divergence with no route to the
base. The faculty member has done their part — the work is saved and signed — and
it simply never arrives.

What this is NOT
----------------
It is **not** a second implementation of the detection rule. The console already
computes it, in `faculty-console/netlify/functions/attest.mjs`:

    if (aheadBy > 0 && !rollingPr) reasons.push('stranded-no-pr');
    if (aheadBy > 0 && behindBy >= threshold) reasons.push('base-lag');

That code is correct and is the authority for what the console displays. The
defect it cannot fix is that **it only runs when a human opens the console**, and
the human opens the console when they are about to attest — which is exactly the
moment they are adding to the pile, not the moment they would act on it. A
condition computed and rendered to nobody is not a monitor. This module runs on a
schedule and routes the same finding to a person who is not already mid-task.

Because the rule lives in two languages, `tests/maintenance/test_stranded_attestations.py`
pins this module's configuration against `attest.mjs`'s own source text, so the
two cannot drift apart silently. Change the console's constants and that test goes
red until this side is updated deliberately.

What counts as stranded
-----------------------
Only an AHEAD branch can strand — a merely-behind branch fast-forwards on the next
write, which is why `ahead_by == 0` is healthy no matter how far behind it sits.
That mirrors the console's reasoning exactly, and it is load-bearing: alarming on
"behind" would fire constantly on a fast-moving base and teach everyone to ignore
this check.

Two signatures, both requiring unmerged attestations:

    stranded_no_pr : ahead of the base with no open pull request at all.
    base_lag       : ahead, with a route, but the base has moved so far that the
                     queue below the review is meaningfully stale (#380's mode).

`stranded_no_pr` outranks `base_lag` when both hold: having no route at all is the
worse fact, and a flat receipt carries one state. Both are still listed in
`reasons` so the human sees everything that is true.

Safety
------
Branch names and pull request titles are attacker-controlled on a public repo.
None are read from the API response: the branch names come from this repository's
own `maintenance_config.json`, the only value taken from a pull request is its
integer `number`, and every state in the receipt is drawn from this module's own
enum. That is the same guarantee `stranded_prs` and `receipt_summary` document —
a log line and a receipt are places untrusted text must not reach.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

# Dual-mode: this module runs both as a package (tests) and as a script (workflows).
try:  # package
    from .receipt_summary import BLOCKED_EXIT, classify, report
except ImportError:  # script - siblings are on sys.path
    from receipt_summary import BLOCKED_EXIT, classify, report


SAFE_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
# Branch names are config-supplied, not remote, but a malformed one would build a
# malformed URL. Git's own rules are looser than this; this is deliberately the
# narrow shape the two branches in this repository actually take.
SAFE_BRANCH = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")
MAX_API_BYTES = 2_000_000
API_TIMEOUT_SECONDS = 20

CONFIG_RELATIVE = Path("13_Faculty_Resources/_automation/maintenance/maintenance_config.json")

# States. `success` must equal receipt_summary.HEALTHY_ROW_STATE — that module
# lists by exception, so the healthy value is the one it skips.
STATE_OK = "success"
STATE_STRANDED = "stranded_no_pr"
STATE_BASE_LAG = "base_lag"
# No branch yet: the next console write creates it from the base. The console
# treats this as un-alarming and so does this module.
STATE_NO_BRANCH = "branch_missing"
# A monitor that could not look must never report "nothing wrong".
STATE_UNAVAILABLE = "unavailable"

# Precedence when both signatures hold. First match wins.
STATE_PRECEDENCE = (STATE_STRANDED, STATE_BASE_LAG)

# Nothing else in the fleet watches the attestation branch, so there is no one to
# hand a row to. Declaring the empty set says that on purpose rather than by
# omission — same reasoning as stranded_prs.
DELEGATED_STATES = frozenset()


class StrandedAttestationError(RuntimeError):
    """The attestation branch's state could not be trusted."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _utc_now():
    return datetime.now(timezone.utc)


def _as_utc(value):
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise StrandedAttestationError("timestamp is not timezone-aware")
    return value.astimezone(timezone.utc)


def load_settings(root):
    """Read branch, base and lag threshold from maintenance_config.json.

    Deliberately not defaulted. A missing or malformed block raises rather than
    falling back to 'attest/pending', because a silent default would let this
    steward keep watching a branch the console had stopped writing to — which is
    the stranding failure wearing a different hat.
    """
    path = Path(root) / CONFIG_RELATIVE
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StrandedAttestationError("maintenance config is unavailable") from exc
    block = config.get("attestation") if isinstance(config, dict) else None
    if not isinstance(block, dict):
        raise StrandedAttestationError("attestation config is missing")
    branch = block.get("branch")
    base_branch = block.get("baseBranch")
    threshold = block.get("lagAlarmThreshold")
    for value in (branch, base_branch):
        if not isinstance(value, str) or SAFE_BRANCH.fullmatch(value) is None:
            raise StrandedAttestationError("attestation branch is invalid")
    if (
        not isinstance(threshold, int)
        or isinstance(threshold, bool)
        or threshold < 1
    ):
        raise StrandedAttestationError("attestation lag threshold is invalid")
    return {"branch": branch, "baseBranch": base_branch, "lagAlarmThreshold": threshold}


def _api(url, *, token, opener=None, allow_404=False):
    if not isinstance(token, str) or not token:
        raise StrandedAttestationError("GITHUB_TOKEN is unavailable")
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
            if status == 404 and allow_404:
                return None
            if status != 200:
                raise StrandedAttestationError("GitHub API returned a failure")
            raw = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except StrandedAttestationError:
        raise
    except Exception as exc:
        # urllib raises on 404 rather than returning it; a caller that tolerates
        # a missing resource needs that distinguished from a transport failure.
        if allow_404 and getattr(exc, "code", None) == 404:
            return None
        raise StrandedAttestationError("GitHub API is unavailable") from exc
    if not isinstance(raw, bytes) or len(raw) > MAX_API_BYTES:
        raise StrandedAttestationError("GitHub API response is too large")
    try:
        return json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StrandedAttestationError("GitHub API response is malformed") from exc


def fetch_comparison(repository, settings, *, token, opener=None):
    """Compare base...branch. Returns None when the branch does not exist yet."""
    if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
        raise StrandedAttestationError("GitHub repository is invalid")
    url = (
        f"https://api.github.com/repos/{repository}/compare/"
        f"{quote(settings['baseBranch'], safe='')}...{quote(settings['branch'], safe='')}"
    )
    payload = _api(url, token=token, opener=opener, allow_404=True)
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise StrandedAttestationError("GitHub compare response is malformed")
    return payload


def fetch_open_request_count(repository, settings, *, token, opener=None):
    """Count open pull requests whose head is the attestation branch.

    Only the LENGTH of the listing is used. Titles, branch labels and author
    logins never leave this function.
    """
    if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
        raise StrandedAttestationError("GitHub repository is invalid")
    owner = repository.split("/", 1)[0]
    # GitHub's head filter is "owner:branch"; the colon is a separator, not data.
    head = quote(owner + ":" + settings["branch"], safe=":")
    url = (
        f"https://api.github.com/repos/{repository}/pulls"
        f"?state=open&head={head}&per_page=100"
    )
    payload = _api(url, token=token, opener=opener)
    if not isinstance(payload, list):
        raise StrandedAttestationError("GitHub pulls response is malformed")
    for item in payload:
        if not isinstance(item, dict):
            raise StrandedAttestationError("pull request entry is malformed")
    return len(payload)


def evaluate(comparison, open_requests, settings, *, now):
    """Decide whether the attestation branch is stranded. Returns a receipt.

    `comparison` is None when the branch does not exist. `open_requests` is the
    count of open pull requests from the branch, or None when nothing was looked
    up because nothing could be stranded — that distinction is kept in the
    receipt so "looked, found none" never reads the same as "never looked".
    """
    checked_at = _as_utc(now)
    base = {
        "schemaVersion": 1,
        "checkedAt": checked_at.isoformat().replace("+00:00", "Z"),
        "lagAlarmThreshold": settings["lagAlarmThreshold"],
    }

    if comparison is None:
        return {
            **base,
            "state": STATE_NO_BRANCH,
            "gate": "ready",
            "aheadBy": 0,
            "behindBy": 0,
            "openRequests": None,
            "reasons": [],
        }

    ahead = comparison.get("ahead_by")
    behind = comparison.get("behind_by")
    for value in (ahead, behind):
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise StrandedAttestationError("GitHub compare response is malformed")

    # Only an ahead branch can strand; a merely-behind one fast-forwards on the
    # next write. Mirrors the console's rule deliberately.
    if ahead == 0:
        return {
            **base,
            "state": STATE_OK,
            "gate": "ready",
            "aheadBy": ahead,
            "behindBy": behind,
            "openRequests": None,
            "reasons": [],
        }

    if open_requests is None:
        raise StrandedAttestationError("open pull requests were not counted")
    if not isinstance(open_requests, int) or isinstance(open_requests, bool) or open_requests < 0:
        raise StrandedAttestationError("open pull request count is invalid")

    reasons = []
    if open_requests == 0:
        reasons.append(STATE_STRANDED)
    if behind >= settings["lagAlarmThreshold"]:
        reasons.append(STATE_BASE_LAG)

    state = next((s for s in STATE_PRECEDENCE if s in reasons), STATE_OK)
    return {
        **base,
        "state": state,
        "gate": "ready" if state == STATE_OK else "blocked",
        "aheadBy": ahead,
        "behindBy": behind,
        "openRequests": open_requests,
        "reasons": reasons,
    }


def main(argv=None, *, opener=None, now=_utc_now):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[3],
        help="repository root (default: derived from this file)",
    )
    args = parser.parse_args(argv)
    checked_at = _as_utc(now())
    repository = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    try:
        settings = load_settings(args.root)
        comparison = fetch_comparison(repository, settings, token=token, opener=opener)
        open_requests = None
        if comparison is not None and comparison.get("ahead_by"):
            open_requests = fetch_open_request_count(
                repository, settings, token=token, opener=opener
            )
        receipt = evaluate(comparison, open_requests, settings, now=checked_at)
    except StrandedAttestationError:
        receipt = {
            "schemaVersion": 1,
            "checkedAt": checked_at.isoformat().replace("+00:00", "Z"),
            "lagAlarmThreshold": None,
            "state": STATE_UNAVAILABLE,
            "gate": "blocked",
            "aheadBy": None,
            "behindBy": None,
            "openRequests": None,
            "reasons": [],
        }
    own, _delegated = classify(receipt, delegated=DELEGATED_STATES)
    report(receipt, "stranded-attestations", stream=sys.stderr, failed=bool(own))
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except OSError:
        print("stranded-attestations failed: receipt write failed", file=sys.stderr)
        return BLOCKED_EXIT
    return BLOCKED_EXIT if own else 0


if __name__ == "__main__":
    raise SystemExit(main())
