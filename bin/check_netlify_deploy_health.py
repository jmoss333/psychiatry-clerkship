#!/usr/bin/env python3
"""The production-deploy alarm, moved out of Netlify's email and into a gate.

THE DEFECT CLASS. Netlify has exactly one built-in alarm for "your production deploy
broke": a per-site "Deploy failed" email. It was added after the 2026-08-31 GitHub-LFS
budget outage, when every production deploy failed for a day and a half, both learner sites
kept serving their last good publish, and nobody was told. A deploy FREEZE is invisible from
the outside -- the site is up, it is just frozen -- so a liveness crawl cannot see it and the
email was the only thing that could.

That email has a fatal flaw: Netlify records a build-ignore SKIP as a failed deploy, with
state "error" and the message "Canceled build due to no content change". So the moment any
site uses a build-ignore rule, the alarm rings on routine no-ops and stops meaning anything.
Between 2026-09-03 and 2026-09-10 the repo resolved that by never skipping -- every satellite
site carried `ignore = "/bin/false"` -- which made the email trustworthy and cost about
$110/month, because a Netlify PRODUCTION DEPLOY is 15 credits (~$0.10) flat while build
minutes, deploy previews, branch deploys and cancelled deploys are all free.

WHAT THIS DOES INSTEAD. It reads production deploy state straight from the Netlify API and
discards exactly the benign cancel, so the sites can skip no-op builds and still have an
alarm. Cheap to say, easy to get wrong in the direction that matters: an alarm that silently
matches nothing is worse than no alarm, because it looks like coverage.

SO THE RULES ARE ASYMMETRIC.
  - A deploy in state "error" is a finding UNLESS its message is the no-content-change
    cancel. The benign pattern is matched narrowly, on that documented sentence.
  - A state this tool does not recognise is a FINDING, not a pass. Netlify can add states;
    an unknown one must surface as "look at this", never as silence.
  - An unreachable or unparseable API is exit 2 -- "the checker could not determine" -- never
    exit 0. A checker that cannot read its source must say so rather than pass over an empty
    set. (Same convention as bin/check_vacuity.py.)
  - A missing NETLIFY_AUTH_TOKEN is "skipped", exit 0, with a loud GitHub warning
    annotation. It CANNOT be a hard failure: the token is a repository secret only the owner
    can add, and a daily workflow that goes red before then trains everyone to ignore it.
    The receipt records status "skipped" so the gap is legible in the artifact rather than
    indistinguishable from a clean run.

USAGE
  python3 bin/check_netlify_deploy_health.py                # exit 1 on a real failed deploy
  python3 bin/check_netlify_deploy_health.py --out FILE     # also write the receipt JSON
  python3 bin/check_netlify_deploy_health.py --hours 48     # widen the lookback window
  python3 bin/check_netlify_deploy_health.py --self-test    # prove it can fail; no network

EXIT CODES. 0 clean or skipped, 1 a real failed production deploy, 2 the checker could not
determine (transport, HTTP status, malformed JSON).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = "https://api.netlify.com/api/v1"
TIMEOUT_SECONDS = 20
PER_PAGE = 30
DEFAULT_LOOKBACK_HOURS = 36

# The one message that means "we skipped this build on purpose". Netlify wraps it as
# "Failed during stage 'checking build content for changes': Canceled build due to no
# content change", so match the sentence, not the whole string.
BENIGN_CANCEL = re.compile(r"canceled build due to no content change", re.IGNORECASE)

HEALTHY_STATES = frozenset({"ready", "current"})
IN_FLIGHT_STATES = frozenset(
    {
        "new",
        "pending_review",
        "accepted",
        "enqueued",
        "building",
        "preparing",
        "prepared",
        "processing",
        "uploading",
        "uploaded",
        "retrying",
    }
)
FAILED_STATE = "error"

# The five Netlify projects built from this repository. `scope` is the repo-relative path
# whose changes gate that site's production build -- None means "the whole repository", which
# is why the two learner sites keep building on every merge to main. `toml` is the file that
# has to agree with `scope`; tests/maintenance/test_netlify_ignore_scoped.py asserts it does,
# so a future edit cannot move a site's scope in one place only.
SITES = (
    {
        "slug": "une-ms3-psychiatry",
        "siteId": "94717a39-679b-4c78-ae02-7b19e809592e",
        "scope": None,
        "toml": "netlify.toml",
    },
    {
        "slug": "mmc-psychiatry-residents-sanford",
        "siteId": "af64d5d4-e0b5-4f03-9857-be40e3b48329",
        "scope": None,
        "toml": "netlify.toml",
    },
    {
        "slug": "sp-interview-proxy",
        "siteId": "455d2740-4020-4d9c-b9f8-82f72f4b2897",
        "scope": "sp-proxy",
        "toml": "sp-proxy/netlify.toml",
    },
    {
        "slug": "clerkship-faculty-attest",
        "siteId": "295ae8dd-412c-47ad-aac3-7e7cd4b3110d",
        "scope": "faculty-console",
        "toml": "faculty-console/netlify.toml",
    },
    {
        "slug": "psychiatry-workforce-tour",
        "siteId": "89d110aa-c3b2-488e-8180-ebc9687c4b4e",
        "scope": "13_Faculty_Resources/Outreach/alex-tour",
        "toml": "13_Faculty_Resources/Outreach/alex-tour/netlify.toml",
    },
)


class CheckerError(RuntimeError):
    """The checker could not determine the answer. Never a pass."""


def _parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _message(deploy):
    for key in ("error_message", "title", "summary"):
        value = deploy.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def classify_site(slug, deploys, now, lookback_hours=DEFAULT_LOOKBACK_HOURS):
    """Pure classification: deploy records in, findings out. No network, no clock.

    Returns (findings, counts). A finding is a dict the report and the receipt share.
    """
    horizon = now - timedelta(hours=lookback_hours)
    findings = []
    counts = {"production": 0, "in_window": 0, "benign_cancels": 0, "healthy": 0}
    for deploy in deploys:
        if not isinstance(deploy, dict):
            findings.append(
                {
                    "site": slug,
                    "kind": "malformed_deploy",
                    "detail": "deploy record is not an object",
                }
            )
            continue
        if deploy.get("context") != "production":
            continue
        counts["production"] += 1
        created = _parse_time(deploy.get("created_at"))
        if created is None:
            findings.append(
                {
                    "site": slug,
                    "kind": "malformed_deploy",
                    "deployId": deploy.get("id"),
                    "detail": "created_at is missing or unparseable",
                }
            )
            continue
        if created < horizon:
            continue
        counts["in_window"] += 1
        state = deploy.get("state")
        message = _message(deploy)
        if state in HEALTHY_STATES:
            counts["healthy"] += 1
            continue
        if state in IN_FLIGHT_STATES:
            continue
        if state == FAILED_STATE:
            if BENIGN_CANCEL.search(message):
                counts["benign_cancels"] += 1
                continue
            findings.append(
                {
                    "site": slug,
                    "kind": "failed_production_deploy",
                    "deployId": deploy.get("id"),
                    "createdAt": deploy.get("created_at"),
                    "detail": message or "no error message reported",
                }
            )
            continue
        findings.append(
            {
                "site": slug,
                "kind": "unknown_state",
                "deployId": deploy.get("id"),
                "createdAt": deploy.get("created_at"),
                "detail": "unrecognised deploy state %r" % (state,),
            }
        )
    return findings, counts


def _fetch(site_id, token):
    url = "%s/sites/%s/deploys?per_page=%d" % (API_ROOT, site_id, PER_PAGE)
    request = Request(url, headers={"Authorization": "Bearer %s" % token})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise CheckerError("HTTP %s from %s" % (response.status, url))
            payload = response.read()
    except HTTPError as exc:  # pragma: no cover - network
        raise CheckerError("HTTP %s from %s" % (exc.code, url)) from exc
    except (URLError, TimeoutError, OSError) as exc:  # pragma: no cover - network
        raise CheckerError("transport failure for %s: %s" % (url, exc)) from exc
    try:
        deploys = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CheckerError("unparseable JSON from %s: %s" % (url, exc)) from exc
    if not isinstance(deploys, list):
        raise CheckerError("expected a list of deploys from %s" % url)
    return deploys


def run(token, now, lookback_hours):
    findings = []
    sites = []
    for site in SITES:
        deploys = _fetch(site["siteId"], token)
        site_findings, counts = classify_site(
            site["slug"], deploys, now, lookback_hours
        )
        findings.extend(site_findings)
        sites.append({"slug": site["slug"], "counts": counts})
    return findings, sites


def _self_test():
    now = datetime(2026, 9, 11, 12, 0, tzinfo=timezone.utc)
    recent = "2026-09-10T09:00:00.000Z"
    old = "2026-08-01T09:00:00.000Z"

    benign = {
        "id": "a",
        "context": "production",
        "state": "error",
        "created_at": recent,
        "error_message": (
            "Failed during stage 'checking build content for changes': "
            "Canceled build due to no content change"
        ),
    }
    real = {
        "id": "b",
        "context": "production",
        "state": "error",
        "created_at": recent,
        "error_message": "Build script returned non-zero exit code: 2",
    }
    ok = {"id": "c", "context": "production", "state": "ready", "created_at": recent}
    preview = {"id": "d", "context": "deploy-preview", "state": "error",
               "created_at": recent, "error_message": "whatever"}
    stale = dict(real, id="e", created_at=old)
    weird = {"id": "f", "context": "production", "state": "quantum",
             "created_at": recent}
    broken = {"id": "g", "context": "production", "state": "ready",
              "created_at": "not-a-date"}

    checks = []

    def expect(label, condition):
        checks.append((label, bool(condition)))

    found, counts = classify_site("t", [benign, ok], now)
    expect("a no-content-change cancel is not a finding", found == [])
    expect("benign cancels are counted", counts["benign_cancels"] == 1)
    expect("healthy deploys are counted", counts["healthy"] == 1)

    found, _ = classify_site("t", [real], now)
    expect("a real build failure IS a finding", len(found) == 1)
    expect(
        "a real failure is labelled",
        found and found[0]["kind"] == "failed_production_deploy",
    )

    found, _ = classify_site("t", [preview], now)
    expect("a failed deploy preview is not a finding", found == [])

    found, _ = classify_site("t", [stale], now)
    expect("a failure outside the window is not a finding", found == [])

    found, _ = classify_site("t", [weird], now)
    expect(
        "an unrecognised state is a finding, not a pass",
        len(found) == 1 and found[0]["kind"] == "unknown_state",
    )

    found, _ = classify_site("t", [broken], now)
    expect(
        "an unparseable timestamp is a finding, not a pass",
        len(found) == 1 and found[0]["kind"] == "malformed_deploy",
    )

    found, _ = classify_site("t", ["not-an-object"], now)
    expect("a malformed record is a finding, not a pass", len(found) == 1)

    expect("every declared site has an id", all(s["siteId"] for s in SITES))
    expect(
        "the two learner sites are whole-repo scoped",
        [s["scope"] for s in SITES if s["scope"] is None] == [None, None],
    )

    failed = [label for label, passed in checks if not passed]
    for label, passed in checks:
        print("%s %s" % ("ok  " if passed else "FAIL", label))
    if failed:
        print("\nself-test FAILED: %d of %d" % (len(failed), len(checks)))
        return 1
    print("\nself-test passed: %d checks" % len(checks))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--hours", type=int, default=DEFAULT_LOOKBACK_HOURS)
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    token = os.environ.get("NETLIFY_AUTH_TOKEN", "").strip()
    now = datetime.now(timezone.utc)
    if not token:
        print(
            "::warning title=Netlify deploy alarm is not armed::"
            "NETLIFY_AUTH_TOKEN is not set, so production deploy state was not read. "
            "Add the repository secret to arm this alarm."
        )
        _write(args.out, {
            "schemaVersion": 1,
            "status": "skipped",
            "reason": "NETLIFY_AUTH_TOKEN is not set",
            "checkedAt": now.isoformat(),
        })
        return 0

    try:
        findings, sites = run(token, now, args.hours)
    except CheckerError as exc:
        print("netlify-deploy-health: COULD NOT DETERMINE — %s" % exc, file=sys.stderr)
        _write(args.out, {
            "schemaVersion": 1,
            "status": "undetermined",
            "reason": str(exc),
            "checkedAt": now.isoformat(),
        })
        return 2

    status = "failed" if findings else "success"
    _write(args.out, {
        "schemaVersion": 1,
        "status": status,
        "lookbackHours": args.hours,
        "checkedAt": now.isoformat(),
        "sites": sites,
        "findings": findings,
    })
    for site in sites:
        counts = site["counts"]
        print(
            "%-34s window=%d healthy=%d skipped=%d"
            % (
                site["slug"],
                counts["in_window"],
                counts["healthy"],
                counts["benign_cancels"],
            )
        )
    if not findings:
        print("\nnetlify-deploy-health: clean over the last %d hours" % args.hours)
        return 0
    print("\nnetlify-deploy-health: %d finding(s)" % len(findings), file=sys.stderr)
    for finding in findings:
        print(
            "  %s  %s  %s" % (finding["site"], finding["kind"], finding["detail"]),
            file=sys.stderr,
        )
    return 1


def _write(path, payload):
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
