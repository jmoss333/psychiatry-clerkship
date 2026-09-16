#!/usr/bin/env python3
"""
run_link_monitor.py — convert a lychee JSON report into surveillance findings.

lychee (https://github.com/lycheeverse/lychee) checks every link in the repo's
markdown/html. This parser is tolerant of lychee's version differences: it reads
`fail_map` or `error_map` (source-file -> list of failed link entries) and emits
one finding per broken link, keyed to the curriculum page that contains it.

Severity: broken link on a high-traffic page (00_START_HERE/**, 04_Acute_and_Safety/**,
index.html) is P0; otherwise P1. (Acute paths are also auto-escalated in sync.)

Usage:
  python3 run_link_monitor.py --lychee lychee.json --out findings.json
"""
import os, sys, json, argparse
import urllib.error
import urllib.request
from urllib.parse import urlparse
import lib_surveillance as L


def _norm_path(p):
    p = (p or "").strip()
    for pre in ("./", os.sep):
        if p.startswith(pre):
            p = p[len(pre):]
    return p


def _entries(report):
    """Yield (source_file, url, code, text) across lychee schema variants."""
    for key in ("fail_map", "error_map"):
        fmap = report.get(key)
        if not isinstance(fmap, dict):
            continue
        for src, items in fmap.items():
            for it in items or []:
                if isinstance(it, str):
                    yield src, it, None, ""
                    continue
                url = it.get("url") or it.get("uri") or ""
                status = it.get("status") or {}
                if isinstance(status, dict):
                    code = status.get("code")
                    text = status.get("text") or status.get("details") or ""
                else:
                    code, text = None, str(status)
                yield src, url, code, text


# Mirrors lychee.toml's `accept` list: publisher/DOI 403 and auth-gated 401 are
# bot-blocks reachable by humans, not dead links. 405/406 join them here -- a server
# refusing this client's method is the same class, and two P1s (#436/#437) were
# exactly that, both answering 200 to a plain GET fourteen days later.
ACCEPTED_CODES = {200, 201, 202, 203, 204, 206, 401, 403, 405, 406, 429, 503}
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def probe(url, timeout=15):
    """Fetch `url` once and return its status code, or None if it never answered.

    Second opinion only. lychee checks thousands of links from one CI IP behind
    caches; this asks again, directly, about the handful that failed.
    """
    request = urllib.request.Request(url, method="GET")
    request.add_header("User-Agent", BROWSER_UA)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.getcode()
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:
        return None


def confirm(findings, probe=probe):
    """Split candidates into (still failing, reachable after all).

    A finding is filed only if a second, independent request also fails. lychee
    reports cached errors -- today's run carried `Error (cached)` for two FDA
    drug-safety pages that answer 200 to a direct GET -- and a single probe from
    one CI IP cannot tell a dead link from a WAF, a rate limit, or a blip. The
    unconfirmed are not discarded silently: they are returned so the caller can
    report the count, because a rising environment rate is itself a signal.
    """
    confirmed, unconfirmed = [], []
    for finding in findings:
        code = probe(finding["source_url"])
        if code in ACCEPTED_CODES:
            finding["evidence"]["confirm_status"] = code
            unconfirmed.append(finding)
            continue
        finding["evidence"]["confirm_status"] = code
        confirmed.append(finding)
    return confirmed, unconfirmed


def to_findings(report):
    findings, seen = [], set()
    for src, url, code, text in _entries(report):
        if not url:
            continue
        src = _norm_path(src)
        domain = urlparse(url).netloc or "unknown"
        change_type = "redirect" if (code and 300 <= int(code) < 400) else "broken-link"
        severity = "P0" if src.startswith(L.HIGH_TRAFFIC_P0) else "P1"
        source_id = f"link:{domain}"
        fp = L.fingerprint(source_id, change_type, url)
        if fp in seen:
            continue
        seen.add(fp)
        findings.append({
            "finding_id": fp,
            "fingerprint": fp,
            "job": "link-source-monitor",
            "source_id": source_id,
            "source_name": domain,
            "source_url": url,
            "source_type": "html",
            "detected_at": L.utcnow(),
            "change_type": change_type,
            "severity": severity,
            "summary": f"{'Redirect' if change_type=='redirect' else 'Broken link'} "
                       f"({code if code is not None else 'no response'}) on {src}: {url}",
            "evidence": {"http_status": int(code) if code is not None else None},
            "affects": [src] if src else [],
            "recommended_action": f"Fix or replace the link in `{src}`; if the source moved, "
                                  f"update the citation and re-stamp reviewed.json.",
            "status": "new",
        })
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lychee", required=True, help="lychee --format json output file")
    ap.add_argument("--out", default="findings.json")
    ap.add_argument("--checked-out", default="checked-sources.json")
    ap.add_argument("--no-confirm", action="store_true",
                    help="skip the second-opinion probe (offline runs and tests)")
    args = ap.parse_args()

    try:
        with open(args.lychee, encoding="utf-8") as fh:
            raw = fh.read().strip()
    except FileNotFoundError:
        sys.exit(f"ERROR: lychee report is missing: {args.lychee}")
    except Exception as e:
        sys.exit(f"ERROR: lychee report is unreadable: {e}")

    if not raw:
        sys.exit("ERROR: lychee report is empty")
    try:
        report = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.exit(f"ERROR: lychee report is not valid JSON: {e}")
    if not isinstance(report, dict):
        sys.exit("ERROR: lychee report must be a JSON object")
    recognized = [
        key for key in ("fail_map", "error_map")
        if key in report and isinstance(report[key], dict)
    ]
    if not recognized:
        sys.exit("ERROR: lychee report has no recognized fail_map/error_map object")

    findings = to_findings(report)
    unconfirmed = []
    if not args.no_confirm:
        findings, unconfirmed = confirm(findings)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(findings, fh, indent=2)
    with open(args.checked_out, "w", encoding="utf-8") as fh:
        json.dump(L.validate_checked_sources(["link-monitor"]), fh, indent=2)
    print(f"link-monitor: {len(findings)} broken/redirect link finding(s) -> {args.out}")
    if unconfirmed:
        print(f"link-monitor: {len(unconfirmed)} candidate(s) reachable on a second "
              f"request, not filed:")
        for finding in unconfirmed:
            print(f"    {finding['evidence']['confirm_status']}  {finding['source_url']}")


if __name__ == "__main__":
    main()
