#!/usr/bin/env python3
"""DEV-ONLY: re-check that every recorded instrument route still resolves.

NOT part of the build and NOT part of CI. Two reasons, both deliberate:

  1. External link checks are flaky by nature — a custodian's WAF, a rate limit or a
     transient 503 would turn a red PR into noise, and a gate that cries wolf gets
     disabled. The routes matter too much for that.
  2. Netlify build egress and the agent sandbox both block these hosts outright, so a
     gate here would fail for reasons that have nothing to do with the links.

What IS gated, in instrument-rights-gate.mjs (INV-IR2), is the half that can be checked
offline: that a pinned page ships the recorded formUrl, and that a link-only route points
at the custodian rather than a copy hosted here. This script covers the other half — that
the far end is still there. A rotted route turns a rights stub back into a dead end, which
is the failure the routes exist to prevent.

    python3 bin/check_instrument_links.py            # check every recorded route
    python3 bin/check_instrument_links.py --id cssrs # one instrument
    python3 bin/check_instrument_links.py --stamp    # rewrite `verified` on the ones that pass

Reports; only --stamp writes, and it writes nothing but the `verified` date and
`verifiedVia`. A route that 404s is a content decision (find the custodian's new URL),
never a reason to delete the route and leave the page pointing nowhere — and never a
reason to touch `status`, which changes only with a decisionRef.

Exit codes: 0 all routes reachable · 1 at least one route failed · 2 usage/parse error.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "instrument_rights.json"

# Custodian sites are ordinary institutional web servers; several 403 a bare urllib agent.
UA = "Mozilla/5.0 (compatible; psychiatry-clerkship-linkcheck/1.0)"
TIMEOUT = 25


def routes(rights, only_id=None):
    """Yield (entry, field, url) for every recorded route, in registry order."""
    for entry in rights.get("instruments", []):
        if only_id and entry.get("id") != only_id:
            continue
        src = entry.get("officialSource")
        if not src:
            continue
        for field in ("formUrl", "trainingUrl"):
            url = src.get(field)
            if url:
                yield entry, field, url


def probe(url):
    """Return (ok, detail). A HEAD that is refused is retried as a ranged GET.

    Some custodians answer HEAD with 403 or 405 while serving GET perfectly well, so a
    HEAD failure alone is not evidence the route is broken.
    """
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
        if method == "GET":
            req.add_header("Range", "bytes=0-2047")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                code = resp.getcode()
                if 200 <= code < 400:
                    final = resp.geturl()
                    moved = "" if final.rstrip("/") == url.rstrip("/") else f" → {final}"
                    return True, f"HTTP {code}{moved}"
                if method == "GET":
                    return False, f"HTTP {code}"
        except urllib.error.HTTPError as exc:
            if method == "GET" or exc.code not in (403, 405, 501):
                return False, f"HTTP {exc.code} {exc.reason}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            if method == "GET":
                return False, f"unreachable: {reason}"
    return False, "unreachable"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--id", help="check a single instrument id (e.g. cssrs)")
    ap.add_argument("--stamp", action="store_true",
                    help="rewrite `verified`/`verifiedVia` on routes that pass")
    args = ap.parse_args()

    try:
        rights = json.loads(REGISTRY.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read {REGISTRY.name}: {exc}", file=sys.stderr)
        return 2

    checked = list(routes(rights, args.id))
    if not checked:
        where = f" for id={args.id!r}" if args.id else ""
        print(f"no recorded routes{where} — nothing to check", file=sys.stderr)
        return 2

    failures = []
    passed_ids = set()
    failed_ids = set()
    for entry, field, url in checked:
        ok, detail = probe(url)
        mark = "ok  " if ok else "FAIL"
        print(f"{mark} {entry['id']:<14} {field:<12} {url}\n     {detail}")
        (passed_ids if ok else failed_ids).add(entry["id"])
        if not ok:
            failures.append((entry, field, url, detail))

    print()
    if failures:
        print(f"{len(failures)} of {len(checked)} route(s) failed:")
        for entry, field, url, detail in failures:
            print(f"  · {entry['instrument']} ({field}): {detail}")
        print("\nFind the custodian's current URL and update officialSource. Do NOT delete the")
        print("route — a page pinned requireOfficialSourceLink will fail the build, which is the")
        print("gate working: a rights page with no route is the dead end it exists to prevent.")
    else:
        print(f"all {len(checked)} recorded route(s) reachable")

    if args.stamp:
        # Stamp only instruments whose every route passed — a half-verified entry should
        # not carry today's date.
        clean = passed_ids - failed_ids
        note = "live fetch, bin/check_instrument_links.py"
        today = date.today().isoformat()
        touched = 0
        for entry in rights.get("instruments", []):
            if entry.get("id") in clean and entry.get("officialSource"):
                entry["officialSource"]["verified"] = today
                entry["officialSource"]["verifiedVia"] = note
                touched += 1
        if touched:
            REGISTRY.write_text(json.dumps(rights, indent=2, ensure_ascii=False) + "\n",
                                encoding="utf-8")
            print(f"\nstamped {touched} entr(y/ies) verified {today}")
            print("Re-run validate_registry_schemas.py before committing.")
        else:
            print("\nnothing stamped — no instrument had all its routes pass")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
