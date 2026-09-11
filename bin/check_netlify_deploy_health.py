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
  - A missing NETLIFY_AUTH_TOKEN was "skipped", exit 0, with a loud GitHub warning. That
    was right while the secret did not exist: it is a repository secret only the owner can
    add, and a daily workflow going red before then trains everyone to ignore it. THAT
    WINDOW CLOSED at 2026-09-11T00:13:55Z when the secret was added, and the exemption
    then inverted from protection into the exact hazard this file exists to prevent -- a
    revoked or rotated token would silently return the alarm to passing while reading
    nothing, behind a green check. A missing token is now exit 2, "could not determine".
  - A run that examined FEWER SITES THAN IT DECLARES is exit 2. Reaching the report proves
    the API answered for every site (transport failures raise), but an empty or short
    site list would still print a confident "clean" over nothing. Note the assertion is on
    SITES EXAMINED, not on deploys found: five sites with zero deploys in the window is a
    quiet weekend, which is data, not blindness.

USAGE
  python3 bin/check_netlify_deploy_health.py                # exit 1 on a real failed deploy
  python3 bin/check_netlify_deploy_health.py --out FILE     # also write the receipt JSON
  python3 bin/check_netlify_deploy_health.py --hours 48     # widen the lookback window
  python3 bin/check_netlify_deploy_health.py --self-test    # prove it can fail; no network

EXIT CODES. 0 clean, 1 a real failed production deploy, 2 the checker could not determine
(no token, transport, HTTP status, malformed JSON, or fewer sites examined than declared).
There is no longer an exit code that means "did not look".
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
PER_PAGE = 100
DEFAULT_LOOKBACK_HOURS = 36
# Page back this far before giving up. 10 x 100 = 1000 deploys per site, far past any
# plausible 36-hour burst; reaching it means something is wrong, so it raises rather
# than quietly reporting a truncated window.
MAX_PAGES = 10

# The one message that means "we skipped this build on purpose". Netlify wraps it as
# "Failed during stage 'checking build content for changes': Canceled build due to no
# content change", so match the sentence, not the whole string.
BENIGN_CANCEL = re.compile(r"canceled build due to no content change", re.IGNORECASE)

# The SECOND benign shape, found the first time this alarm ever ran with a token
# (2026-09-11): Netlify's own superseded-commit skip. When a newer commit lands while a
# build is still queued, Netlify abandons the older one and files it as state "error"
# with error_message "Skipped". It is not a failure and the repo cannot prevent it --
# `clerkship-deploy` trap 4 already says so.
#
# Discriminated on the API's BOOLEAN `skipped`, never on the word "Skipped". The message
# is a bare, generic word that a genuine failure could plausibly contain; the boolean is
# set only when Netlify chose not to run the build at all, which no real failure does.
# Matching the string here would be the same mistake as matching a log line.
def _is_superseded_skip(deploy):
    return deploy.get("skipped") is True

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
    counts = {
        "production": 0,
        "in_window": 0,
        "benign_cancels": 0,
        "superseded_skips": 0,
        "healthy": 0,
    }
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
            if _is_superseded_skip(deploy):
                counts["superseded_skips"] += 1
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


def _fetch_page(site_id, token, page):
    url = "%s/sites/%s/deploys?per_page=%d&page=%d" % (
        API_ROOT,
        site_id,
        PER_PAGE,
        page,
    )
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


def _fetch(site_id, token, horizon):
    """Page back until the window is actually covered, or say it could not be.

    WHY THIS PAGINATES. The first version fetched ONE page of 30 and filtered it to the
    36-hour window. That list is not production-only -- it is every deploy including
    deploy previews -- so on a busy day the page is eaten by previews and the window is
    truncated without a word. Measured on psychiatry-workforce-tour, 2026-09-11:

        per_page=30  -> 30 records, 13 production, oldest record 1.9h old
        ground truth -> 31 production deploys inside the 36h window

    The checker examined 13 of 31 and printed "clean over the last 36 hours". A real
    failure three hours old was outside its data while inside its claimed window -- the
    most dangerous shape a monitor can take, because the coverage claim was confident
    and wrong rather than absent.

    Stops when a page reaches past the horizon, when a page comes back short (the end),
    or at MAX_PAGES. Hitting MAX_PAGES without reaching the horizon raises, because a
    partially covered window must never be reported as a covered one.
    """
    collected = []
    for page in range(1, MAX_PAGES + 1):
        batch = _fetch_page(site_id, token, page)
        collected.extend(batch)
        if len(batch) < PER_PAGE:
            return collected  # ran out of deploys: the window is fully covered
        oldest = min(
            (t for t in (_parse_time(d.get("created_at"))
                         for d in batch if isinstance(d, dict)) if t is not None),
            default=None,
        )
        if oldest is not None and oldest < horizon:
            return collected
    raise CheckerError(
        "site %s still had deploys newer than the %s window after %d pages; "
        "the lookback could not be covered"
        % (site_id, horizon.isoformat(), MAX_PAGES)
    )


def run(token, now, lookback_hours):
    findings = []
    sites = []
    horizon = now - timedelta(hours=lookback_hours)
    for site in SITES:
        deploys = _fetch(site["siteId"], token, horizon)
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

    # Netlify's own superseded-commit skip. Real shape, observed on
    # psychiatry-workforce-tour the first time this alarm ran with a token:
    # state "error", error_message "Skipped", skipped True.
    superseded = {
        "id": "d-superseded",
        "context": "production",
        "state": "error",
        "error_message": "Skipped",
        "skipped": True,
        "created_at": recent,
    }
    found, counts = classify_site("t", [superseded], now)
    expect("a superseded-commit skip is not a finding", found == [])
    expect("superseded skips are counted separately",
           counts["superseded_skips"] == 1 and counts["benign_cancels"] == 0)

    # The discriminator is the BOOLEAN, not the word. A real failure whose message
    # merely contains "Skipped" must still ring.
    worded = dict(superseded, id="d-worded", skipped=None,
                  error_message="Build failed: Skipped 3 tests, then exit 1")
    found, counts = classify_site("t", [worded], now)
    expect("a real failure is NOT excused by the word 'Skipped'", len(found) == 1)
    expect("that failure is not miscounted as a skip",
           counts["superseded_skips"] == 0)
    # And skipped must be the literal True, not any truthy value smuggled in.
    for falsey in (None, False, 0, "", "true", 1):
        probe = dict(superseded, id="d-probe", skipped=falsey)
        found, _ = classify_site("t", [probe], now)
        expect("skipped=%r does not excuse a failure" % (falsey,), len(found) == 1)

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

    # --- COVERAGE. _fetch must page back until the window is genuinely covered. The
    # real defect: one page of 30 mixed-context deploys left the 36h window with 1.9h
    # of data on it, and the run still printed "clean over the last 36 hours".
    import tempfile

    horizon = now - timedelta(hours=DEFAULT_LOOKBACK_HOURS)

    def _paged(pages):
        """Fake _fetch_page over a list of pages; records how many were requested."""
        calls = []

        def fake(site_id, token, page):
            calls.append(page)
            return pages[page - 1] if page - 1 < len(pages) else []

        return fake, calls

    def _rec(hours_ago):
        stamp = now - timedelta(hours=hours_ago)
        return {"id": "x", "context": "production", "state": "ready",
                "created_at": stamp.isoformat().replace("+00:00", "Z")}

    real_page = sys.modules[__name__]._fetch_page
    try:
        # A full page that never reaches the horizon must pull the NEXT page.
        near = [_rec(1)] * PER_PAGE
        far = [_rec(90)] * PER_PAGE
        fake, calls = _paged([near, far])
        sys.modules[__name__]._fetch_page = fake
        got = _fetch("s", "t", horizon)
        expect("a page that stops short of the horizon pages again", calls == [1, 2])
        expect("paged results are concatenated", len(got) == 2 * PER_PAGE)

        # One page that already reaches past the horizon stops immediately.
        fake, calls = _paged([far, far])
        sys.modules[__name__]._fetch_page = fake
        _fetch("s", "t", horizon)
        expect("a page reaching past the horizon stops at one call", calls == [1])

        # A short page means the end of the list -- covered, stop.
        fake, calls = _paged([[_rec(1)] * (PER_PAGE - 1)])
        sys.modules[__name__]._fetch_page = fake
        _fetch("s", "t", horizon)
        expect("a short page ends paging without raising", calls == [1])

        # Never reaching the horizon must RAISE, not return a truncated window.
        fake, calls = _paged([near] * (MAX_PAGES + 3))
        sys.modules[__name__]._fetch_page = fake
        raised = False
        try:
            _fetch("s", "t", horizon)
        except CheckerError:
            raised = True
        expect("an uncoverable window raises instead of truncating", raised)
        expect("it gives up at MAX_PAGES", calls == list(range(1, MAX_PAGES + 1)))
    finally:
        sys.modules[__name__]._fetch_page = real_page

    # --- NEVER INERT. These drive main() end-to-end with a fake network, because the
    # failure they guard is "the whole run passed while reading nothing", which no
    # amount of classify_site() coverage can catch.

    def _main_with(env_token, fake_sites):
        """Run main() with a stubbed network, return (exit code, receipt dict)."""
        real_run, real_env = run_module.run, os.environ.get("NETLIFY_AUTH_TOKEN")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "receipt.json"
            try:
                if env_token is None:
                    os.environ.pop("NETLIFY_AUTH_TOKEN", None)
                else:
                    os.environ["NETLIFY_AUTH_TOKEN"] = env_token
                run_module.run = lambda *a, **k: ([], fake_sites)
                code = main(["--out", str(out)])
                return code, json.loads(out.read_text(encoding="utf-8"))
            finally:
                run_module.run = real_run
                if real_env is None:
                    os.environ.pop("NETLIFY_AUTH_TOKEN", None)
                else:
                    os.environ["NETLIFY_AUTH_TOKEN"] = real_env

    run_module = sys.modules[__name__]
    every_site = [
        {"slug": s["slug"], "counts": {"production": 0, "in_window": 0,
                                       "benign_cancels": 0, "superseded_skips": 0,
                                       "healthy": 0}}
        for s in SITES
    ]

    code, receipt = _main_with(None, every_site)
    expect("a missing token is exit 2, not a pass", code == 2)
    expect("a missing token is recorded as undetermined",
           receipt["status"] == "undetermined")

    code, receipt = _main_with("t0ken", every_site[:-1])
    expect("examining fewer sites than declared is exit 2", code == 2)
    expect("a short run says how short it was",
           "of %d declared sites" % len(SITES) in receipt["reason"])

    code, receipt = _main_with("t0ken", [])
    expect("examining NO sites is exit 2, not a clean pass", code == 2)

    code, receipt = _main_with("t0ken", every_site)
    expect("a full run with no findings is exit 0", code == 0)
    expect("a clean receipt states its own coverage",
           receipt["sitesExamined"] == len(SITES)
           and receipt["sitesDeclared"] == len(SITES)
           and receipt["deploysExamined"] == 0)
    expect("zero deploys in a quiet window is still clean, not undetermined",
           receipt["status"] == "success")

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
            "::error title=Netlify deploy alarm is not armed::"
            "NETLIFY_AUTH_TOKEN is not set, so production deploy state was not read. "
            "The secret exists as of 2026-09-11; if this fires, it was removed, renamed, "
            "revoked or expired. Nothing is watching production deploys until it is back."
        )
        _write(args.out, {
            "schemaVersion": 1,
            "status": "undetermined",
            "reason": "NETLIFY_AUTH_TOKEN is not set",
            "checkedAt": now.isoformat(),
        })
        return 2

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

    # Prove the run actually examined what it declares before it is allowed to report
    # anything at all. A short site list would otherwise print a confident "clean" over
    # a set it never read -- coverage that exists only in the exit code.
    if len(sites) != len(SITES):
        reason = "examined %d of %d declared sites" % (len(sites), len(SITES))
        print("netlify-deploy-health: COULD NOT DETERMINE — %s" % reason, file=sys.stderr)
        _write(args.out, {
            "schemaVersion": 1,
            "status": "undetermined",
            "reason": reason,
            "checkedAt": now.isoformat(),
            "sites": sites,
        })
        return 2

    status = "failed" if findings else "success"
    _write(args.out, {
        "schemaVersion": 1,
        "status": status,
        "lookbackHours": args.hours,
        "checkedAt": now.isoformat(),
        # What this run actually looked at, so a reader never has to infer coverage from
        # the absence of findings.
        "sitesDeclared": len(SITES),
        "sitesExamined": len(sites),
        "deploysExamined": sum(s["counts"]["in_window"] for s in sites),
        "sites": sites,
        "findings": findings,
    })
    for site in sites:
        counts = site["counts"]
        # Both discard reasons are printed separately. A single "skipped" column would
        # hide which benign shape fired, and the whole point of discarding anything is
        # that a reader can still see what was discarded and why.
        print(
            "%-34s window=%d healthy=%d no-content-change=%d superseded=%d"
            % (
                site["slug"],
                counts["in_window"],
                counts["healthy"],
                counts["benign_cancels"],
                counts["superseded_skips"],
            )
        )
    if not findings:
        # State the coverage in the same breath as the verdict. "Clean" on its own is
        # exactly what an inert check prints.
        print(
            "\nnetlify-deploy-health: clean over the last %d hours "
            "(%d site(s), %d production deploy(s) examined)"
            % (
                args.hours,
                len(sites),
                sum(s["counts"]["in_window"] for s in sites),
            )
        )
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
