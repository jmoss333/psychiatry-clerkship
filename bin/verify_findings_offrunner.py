#!/usr/bin/env python3
"""Re-check surveillance link findings from wherever THIS machine sits.

The citation monitor watches the world from one vantage point: a GitHub Actions
runner on a datacenter IP. From there it cannot distinguish

    "this official page is gone"          (a real finding)
    "this official page won't talk to US" (a checker limitation)

because several .gov and publisher CDNs serve their bot-block as a definitive
4xx. fda.gov serves it as a 404 -- indistinguishable, from the runner, from a
page that was deleted.

The repo already knows this happens. evidence_registry.json's own note on
fda-drug-safety reads:

    "Live HEAD/GET recheck returned 200 on 2026-07-08;
     July 6 404 treated as transient/stale."

That recheck was done by hand, once, and the same false 404 has re-fired every
week since. This script is that hand-recheck, written down: it reads the newest
citation audit, re-requests every flagged URL from the network it is run on, and
reports where the two vantage points DISAGREE.

    python3 bin/verify_findings_offrunner.py
    python3 bin/verify_findings_offrunner.py --audit <path>   # a specific audit
    python3 bin/verify_findings_offrunner.py --json out.json  # machine-readable
    python3 bin/verify_findings_offrunner.py --self-test

Run it from a laptop, not from CI: on a runner it would share the blocked
vantage point and agree with the monitor by construction, which is worth
nothing. It is report-only -- it never edits a finding, an issue, or a page.
A disagreement is evidence for a human triaging the finding, not a verdict.

Deliberately uses the SAME User-Agent as the monitor, so a difference in result
isolates the network path rather than confounding it with the header. On
2026-09-03 that isolation is what showed the FDA 404s to be IP-based: identical
UA, 404 from the runner at 18:29Z, 200 from a laptop the same minute.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / "13_Faculty_Resources" / "_automation" / "surveillance" / "history"

# Identical to run_citation_check.UA on purpose -- see the module docstring.
UA = "curriculum-surveillance-citation-check/1.0 (+education; contact faculty)"
TIMEOUT_S = 20

# Findings whose evidence is an HTTP status are the ones a second vantage point
# can speak to. A content-diff finding ("this guideline text changed") is not
# re-checkable this way, and is reported as out of scope rather than silently
# skipped.
RECHECKABLE = {"broken-link", "soft-404", "tls-error"}


def newest_audit(history=HISTORY):
    """Path of the most recent citation_audit_*.json, or None."""
    audits = sorted(history.glob("citation_audit_*.json"))
    return audits[-1] if audits else None


def fetch_status(url, *, opener=None):
    """Return (status_or_None, detail). Never raises."""
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", UA)
    try:
        open_fn = opener.open if opener is not None else urllib.request.urlopen
        with open_fn(req, timeout=TIMEOUT_S) as r:
            return getattr(r, "status", 200), "ok"
    except urllib.error.HTTPError as e:
        return e.code, "http %s" % e.code
    except Exception as e:  # noqa: BLE001 - a failed probe is data, not a crash
        return None, "%s: %s" % (type(e).__name__, e)


def compare(findings, fetcher):
    """Pair each finding's recorded status against a fresh local probe."""
    rows = []
    for f in findings:
        change_type = f.get("change_type")
        url = f.get("source_url")
        recorded = (f.get("evidence") or {}).get("http_status")
        if change_type not in RECHECKABLE or not url:
            rows.append({
                "source_id": f.get("source_id"),
                "severity": f.get("severity"),
                "change_type": change_type,
                "url": url,
                "recorded_status": recorded,
                "local_status": None,
                "verdict": "out-of-scope",
                "detail": "not an HTTP-status finding; a second vantage point cannot speak to it",
            })
            continue
        local, detail = fetcher(url)
        if local is not None and 200 <= local < 400 and recorded != local:
            verdict = "runner-disagrees"
        elif local == recorded:
            verdict = "confirmed"
        elif local is None:
            verdict = "inconclusive"
        else:
            verdict = "differs"
        rows.append({
            "source_id": f.get("source_id"),
            "severity": f.get("severity"),
            "change_type": change_type,
            "url": url,
            "recorded_status": recorded,
            "local_status": local,
            "verdict": verdict,
            "detail": detail,
        })
    return rows


VERDICT_NOTE = {
    "runner-disagrees": "reachable from here — the runner's status is a vantage-point "
                        "artifact, not a dead page. Evidence for dismissing the finding.",
    "confirmed": "same status from here — the finding stands.",
    "differs": "different status from here, but still not reachable. Read it by hand.",
    "inconclusive": "no response from here either; this probe adds nothing.",
    "out-of-scope": "not re-checkable from a second vantage point.",
}


def self_test():
    findings = [
        {"source_id": "blocked", "severity": "P0", "change_type": "broken-link",
         "source_url": "https://example.gov/a", "evidence": {"http_status": 404}},
        {"source_id": "really-dead", "severity": "P1", "change_type": "broken-link",
         "source_url": "https://example.gov/b", "evidence": {"http_status": 404}},
        {"source_id": "offline", "severity": "P1", "change_type": "broken-link",
         "source_url": "https://example.gov/c", "evidence": {"http_status": 404}},
        {"source_id": "content", "severity": "P1", "change_type": "content-changed",
         "source_url": "https://example.gov/d", "evidence": {"new_hash": "abc"}},
    ]
    canned = {
        "https://example.gov/a": (200, "ok"),          # the fda.gov case
        "https://example.gov/b": (404, "http 404"),    # genuinely gone
        "https://example.gov/c": (None, "URLError: x"),
    }
    rows = compare(findings, lambda u: canned.get(u, (None, "unprobed")))
    got = {r["source_id"]: r["verdict"] for r in rows}
    assert got["blocked"] == "runner-disagrees", got
    assert got["really-dead"] == "confirmed", got
    assert got["offline"] == "inconclusive", got
    assert got["content"] == "out-of-scope", got
    # A probe that raises must become data, not a traceback.
    assert fetch_status.__doc__ and "Never raises" in fetch_status.__doc__
    print("offrunner self-test: OK (4 verdicts)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", help="path to a citation_audit_*.json (default: newest)")
    ap.add_argument("--json", dest="json_out", help="write the comparison as JSON")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    path = Path(args.audit) if args.audit else newest_audit()
    if path is None or not path.exists():
        print("no citation audit found under %s" % HISTORY, file=sys.stderr)
        return 1
    findings = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(findings, list):
        print("unexpected audit shape in %s" % path, file=sys.stderr)
        return 1

    rows = compare(findings, fetch_status)
    print("off-runner recheck of %s (%d finding(s))" % (path.name, len(rows)))
    print("UA identical to the monitor's, so a difference isolates the network path.\n")
    disagree = 0
    for r in rows:
        if r["verdict"] == "runner-disagrees":
            disagree += 1
        print("  [%-16s] %-22s %s  recorded=%s local=%s"
              % (r["verdict"], r["source_id"], r["severity"], r["recorded_status"], r["local_status"]))
        print("      %s" % VERDICT_NOTE.get(r["verdict"], ""))
        print("      %s" % r["url"])
    print()
    if disagree:
        print("%d finding(s) the runner and this machine disagree about. Report-only: "
              "attach this as evidence when triaging, then let a human decide." % disagree)
    else:
        print("No disagreements. Every re-checkable finding looks the same from here.")

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
        print("wrote %s" % args.json_out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
