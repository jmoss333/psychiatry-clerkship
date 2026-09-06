#!/usr/bin/env python3
"""DEV-ONLY: report which external hosts this repo's own tooling can actually reach.

NOT a gate, NOT in CI, and it never exits non-zero for a blocked host. A blocked host is a
fact about the environment the session is running in, not a defect in the repository, so
failing on one would be meaningless — the same reasoning that keeps bin/check_instrument_links.py
out of CI, one step further.

WHY THIS EXISTS: every sandboxed session rediscovers its own network the expensive way — by
choosing a task, working it for an hour, and only then finding that the host it needed was
never reachable. Three separate sessions have now paid that cost on this repo: the podcast/book
link check (blocked), the Netlify deploy verification (blocked), and an "egress is blocked
except web search" note that was simply wrong — api.github.com answers 200 here, and Google
Books answers 429 rather than nothing. Egress is an ALLOWLIST, and which side of it a host
falls on decides which repo tasks are possible today.

So this reports capability in the repo's own terms. It does not say "itunes.apple.com is
unreachable"; it says the podcast canonical backfill cannot run here. That is the difference
between a network diagnostic and a work plan.

    python3 bin/probe_egress.py              # human table
    python3 bin/probe_egress.py --json       # machine-readable, for a script or an agent
    python3 bin/probe_egress.py --vitals     # compact lines for the SessionStart hook
    python3 bin/probe_egress.py --targets    # list what would be probed, probe nothing
    python3 bin/probe_egress.py --refresh    # ignore the cache and re-probe

Results are cached (default 6h) outside the repository, so a session start costs nothing when
the cache is warm and the working tree is never dirtied. The cache is invalidated automatically
when the proxy configuration changes, because that is exactly when the answers change.

Set CLERKSHIP_SKIP_EGRESS_PROBE=1 to disable it entirely, including from the hook.

Requests are HEAD-equivalent ranged GETs against public, unauthenticated endpoints the repo
already talks to. Nothing is uploaded and no credential is sent.

Exit codes: 0 the probe ran (whatever it found) · 2 usage or parse error.
"""

import argparse
import json
import os
import socket
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RIGHTS = ROOT / "instrument_rights.json"

UA = "Mozilla/5.0 (compatible; psychiatry-clerkship-egress-probe/1.0)"
CACHE_NAME = "clerkship-egress-probe.json"
DEFAULT_TTL_HOURS = 6
DEFAULT_TIMEOUT = 3.0
DEFAULT_BUDGET = 4.5

# Reachability status, most-capable first. Ordering matters for the summary lines.
OPEN, QUOTA, AUTH, BLOCKED, SLOW, ERROR = "open", "quota", "auth", "blocked", "slow", "error"

# Host classes this repository's own tooling depends on. `gates` is written in terms of the
# repo task that stops working, because that is the useful half of the answer.
TARGETS = [
    {
        "key": "github-api",
        "url": "https://api.github.com/rate_limit",
        "gates": "read-only GitHub scripts + the curl fallback when the GitHub MCP drops; 200 unauth does NOT mean a token-bearing script will work",
    },
    {
        "key": "package-index",
        "url": "https://pypi.org/simple/",
        "gates": "pip install -r requirements.txt — without it 'python deps: missing' is unfixable here",
    },
    {
        "key": "github-git",
        "url": "https://github.com/jmoss333/psychiatry-clerkship.git/info/refs?service=git-upload-pack",
        "gates": "git fetch/push AND all Git-LFS media transfer — invisible from api.github.com, and LFS bandwidth is metered per account (10 GB/mo)",
    },
    {
        "key": "npm",
        "url": "https://registry.npmjs.org/-/ping",
        "gates": "tests/smoke npm ci (bin/verify-smoke.sh:61) — a blocked registry is swallowed there and resurfaces later as a Playwright failure",
    },
    {
        "key": "doi",
        "url": "https://doi.org/10.1001/jama.2020.1585",
        "gates": "run_citation_check.py DOI resolution — 645 distinct DOIs/PMIDs cited across the curriculum (86 of evidence_registry.json's citation.urls are DOIs; a raw grep says 102 because 16 are prose mentioning a DOI, not resolvable citation URLs)",
    },
    {
        "key": "apify",
        "url": "https://api.apify.com/v2/acts",
        "gates": "guideline surveillance and resource intake (lib_surveillance.py:138); the crawler fetches source hosts server-side, so THEIR local reachability is meaningless",
    },
    {
        "key": "netlify-sites",
        "url": "https://une-ms3-psychiatry.netlify.app/",
        "gates": "the production learner canary; deploy-verifier falls back to the Netlify MCP deploy record",
    },
    {
        "key": "netlify-api",
        "url": "https://api.netlify.com/api/v1/user",
        "gates": "bin/redteam-live.sh token diagnosis (401 here means reachable, not blocked)",
    },
    {
        "key": "pubmed-direct",
        "url": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi",
        "gates": "direct E-utilities fetches; the PubMed MCP server is a SEPARATE path and may work anyway",
    },
    {
        "key": "books",
        "url": "https://www.googleapis.com/books/v1/volumes?q=test",
        "gates": "ISBN backfill for the 51 book-library entries (none is edition-identifiable today)",
    },
    {
        "key": "podcast",
        "url": "https://itunes.apple.com/search?term=psychiatry&entity=podcast&limit=1",
        "gates": "RSS/Apple canonical backfill beside the podcast page's YouTube links",
    },
]


def custodian_target():
    """Probe one real instrument custodian, read from the registry rather than hard-coded.

    Three reasons this is dynamic. instrument_rights.json declares routes as data that may be
    "refreshed freely" while statuses move only with a decisionRef; bin/check_instrument_links.py
    already reads the same registry the same way, so a hard-coded host would fork the source of
    truth with nothing to catch the drift; and the roster is actively churning, which makes a
    newly added route the one whose reachability matters most.

    One representative host is enough: this asks only whether check_instrument_links.py could
    run here at all, not whether each route resolves — that is what check_instrument_links.py
    itself is for.
    """
    try:
        rights = json.loads(RIGHTS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    hosts = []
    for entry in rights.get("instruments", []):
        source = entry.get("officialSource") or {}
        for field in ("formUrl", "trainingUrl"):
            url = source.get(field)
            if url and url.startswith("https://"):
                host = urllib.parse.urlsplit(url).netloc
                if host and host not in hosts:
                    hosts.append(host)
    if not hosts:
        return None
    return {
        "key": "instrument-custodians",
        "url": "https://%s/" % hosts[0],
        "gates": "bin/check_instrument_links.py — re-checking that retired instruments still route to their custodian",
        "note": "representative of %d custodian host(s) in instrument_rights.json; probing %s"
                % (len(hosts), hosts[0]),
    }


def targets():
    out = list(TARGETS)
    custodian = custodian_target()
    if custodian:
        out.append(custodian)
    return out


def status_for_http(code):
    """Map an HTTP status to a capability class. Pure — unit-testable without a network.

    Any HTTP response at all means the host was REACHED, so only 429 (reachable but not
    usable) and 401/403 (reachable but needs credentials) are demoted. A 404 or a 500 still
    proves egress works, which is the only question this script asks.
    """
    if code == 429:
        return QUOTA, "HTTP 429 rate/quota limited — reachable, but not usable without a key or a fresh window"
    if code in (401, 403):
        return AUTH, "HTTP %d — reachable; needs credentials" % code
    return OPEN, "HTTP %d" % code


def status_for_failure(reason, timeout):
    """Map a connection failure to a capability class. Pure — unit-testable without a network.

    The signatures are measured, not assumed. Through this environment's agent proxy a
    policy-denied host fails the CONNECT tunnel and surfaces as
    URLError(OSError('Tunnel connection failed: 403 Forbidden')) — categorically different
    from the host itself answering 403, and the two must never be conflated: one means "you
    cannot get there", the other means "you got there and need credentials". Collapsing them
    is how a session concludes it has no egress when in fact it has a key problem.
    """
    if isinstance(reason, (socket.timeout, TimeoutError)):
        return SLOW, "timed out after %gs" % timeout
    text = str(reason)
    if "Tunnel connection failed" in text or "CONNECT" in text:
        return BLOCKED, "proxy policy denied the CONNECT tunnel"
    return BLOCKED, text[:120]


def classify(url, timeout):
    """Probe one URL with a small ranged GET. Returns (status, detail)."""
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA})
    req.add_header("Range", "bytes=0-1023")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return OPEN, "HTTP %d" % resp.getcode()
    except urllib.error.HTTPError as exc:
        return status_for_http(exc.code)
    except urllib.error.URLError as exc:
        return status_for_failure(exc.reason, timeout)
    except (socket.timeout, TimeoutError):
        return SLOW, "timed out after %gs" % timeout
    except OSError as exc:  # pragma: no cover - defensive
        return ERROR, "%s: %s" % (type(exc).__name__, exc)


def proxy_fingerprint():
    """Identify the egress configuration so a changed proxy invalidates the cache."""
    for var in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        value = os.environ.get(var)
        if value:
            return urllib.parse.urlsplit(value).netloc or value
    return "direct"


def cache_path():
    """A writable location OUTSIDE the repository, so probing never dirties the tree."""
    base = os.environ.get("XDG_CACHE_HOME") or tempfile.gettempdir()
    return Path(base) / CACHE_NAME


def read_cache(ttl_hours):
    if ttl_hours <= 0:
        return None
    try:
        blob = json.loads(cache_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if blob.get("proxy") != proxy_fingerprint():
        return None
    try:
        age_days = (date.today() - date.fromisoformat(blob["probed"])).days
    except (KeyError, ValueError):
        return None
    # Day granularity is deliberate: the answers change when the environment changes, not by
    # the hour, and a date needs no clock read to stay reproducible.
    if age_days * 24 > ttl_hours:
        return None
    return blob


def write_cache(blob):
    try:
        cache_path().write_text(json.dumps(blob, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass  # a read-only or full cache dir must never break a session start


def probe_all(items, timeout, budget):
    """Probe concurrently against a single wall-clock DEADLINE.

    The budget is for the whole sweep, not per host. Waiting on each future for `budget`
    seconds in turn would make the worst case len(items) * budget — which is precisely how a
    hook overruns its ceiling and gets killed, taking the rest of the vitals block with it.

    Anything unfinished at the deadline is reported as unknown rather than waited on: this runs
    inside a hook with a hard timeout, and a partial answer delivered on time is worth more than
    a complete one that costs the caller everything else it was going to say.
    """
    results = {}
    with ThreadPoolExecutor(max_workers=min(10, len(items) or 1)) as pool:
        futures = {pool.submit(classify, item["url"], timeout): item for item in items}
        deadline = time.monotonic() + budget
        for future, item in futures.items():
            left = deadline - time.monotonic()
            try:
                status, detail = future.result(timeout=max(0.0, left))
            except Exception:
                status, detail = ERROR, "no answer within the %gs sweep budget" % budget
            results[item["key"]] = {"status": status, "detail": detail}
    return results


def collect(ttl_hours, timeout, budget, refresh):
    items = targets()
    if not refresh:
        cached = read_cache(ttl_hours)
        if cached and set(cached.get("results", {})) >= {i["key"] for i in items}:
            cached["cached"] = True
            return items, cached
    blob = {
        "probed": date.today().isoformat(),
        "proxy": proxy_fingerprint(),
        "results": probe_all(items, timeout, budget),
        "cached": False,
    }
    write_cache(blob)
    return items, blob


VITALS_DETAIL_CAP = 3
VITALS_QUOTA_CAP = 2

MARK = {OPEN: "open", QUOTA: "quota", AUTH: "auth", BLOCKED: "BLOCKED", SLOW: "slow", ERROR: "?"}


def render_table(items, blob):
    results = blob["results"]
    width = max(len(i["key"]) for i in items)
    lines = [
        "egress probe — %s%s (proxy: %s)"
        % (blob["probed"], " [cached]" if blob.get("cached") else "", blob["proxy"]),
        "",
    ]
    for item in items:
        row = results.get(item["key"], {"status": ERROR, "detail": "not probed"})
        lines.append("%-7s %-*s  %s" % (MARK[row["status"]], width, item["key"], row["detail"]))
        lines.append("%-7s %-*s  gates: %s" % ("", width, "", item["gates"]))
        if item.get("note"):
            lines.append("%-7s %-*s  %s" % ("", width, "", item["note"]))
        lines.append("")
    blocked = [i["key"] for i in items if results.get(i["key"], {}).get("status") == BLOCKED]
    if blocked:
        lines.append("Blocked here, so these repo tasks cannot run in this environment:")
        for item in items:
            if item["key"] in blocked:
                lines.append("  · %s" % item["gates"])
    return "\n".join(lines)


def render_vitals(items, blob):
    """Two-to-four compact lines for the SessionStart hook. Never longer."""
    results = blob["results"]
    by_status = {}
    for item in items:
        status = results.get(item["key"], {}).get("status", ERROR)
        by_status.setdefault(status, []).append(item)
    reachable = len(by_status.get(OPEN, [])) + len(by_status.get(QUOTA, [])) + len(by_status.get(AUTH, []))

    out = [
        "egress: %d/%d reachable, probed %s%s — open: %s"
        % (
            reachable,
            len(items),
            blob["probed"],
            " (cached)" if blob.get("cached") else "",
            ", ".join(i["key"] for i in by_status.get(OPEN, [])) or "none",
        )
    ]
    quota = by_status.get(QUOTA, [])
    for item in quota[:VITALS_QUOTA_CAP]:
        out.append("        quota-capped: %s — %s" % (item["key"], item["gates"]))
    if len(quota) > VITALS_QUOTA_CAP:
        out.append("        quota-capped: +%d more" % (len(quota) - VITALS_QUOTA_CAP))
    blocked = by_status.get(BLOCKED, []) + by_status.get(SLOW, [])
    if blocked:
        out.append("        BLOCKED: %s" % ", ".join(i["key"] for i in blocked))
        # Name the gated tasks, but cap the list: this lands in every session's context, and
        # a hook that costs more to read than it saves gets ignored.
        for item in blocked[:VITALS_DETAIL_CAP]:
            out.append("          · cannot run here: %s" % item["gates"])
        extra = len(blocked) - VITALS_DETAIL_CAP
        if extra > 0:
            out.append("          · +%d more — python3 bin/probe_egress.py for the full table" % extra)
    out.append("        (re-probe: python3 bin/probe_egress.py --refresh)")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--json", action="store_true", help="machine-readable output")
    mode.add_argument("--vitals", action="store_true", help="compact lines for the SessionStart hook")
    mode.add_argument("--targets", action="store_true", help="list what would be probed, probe nothing")
    ap.add_argument("--refresh", action="store_true", help="ignore the cache")
    ap.add_argument("--ttl", type=float, default=DEFAULT_TTL_HOURS, help="cache lifetime in hours (0 disables)")
    ap.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT, help="per-host timeout in seconds")
    ap.add_argument("--budget", type=float, default=DEFAULT_BUDGET, help="total wall-clock budget in seconds")
    args = ap.parse_args()

    if os.environ.get("CLERKSHIP_SKIP_EGRESS_PROBE"):
        if not args.vitals:
            print("egress probe disabled (CLERKSHIP_SKIP_EGRESS_PROBE is set)")
        return 0

    items = targets()
    if args.targets:
        for item in items:
            print("%-22s %s\n%-22s gates: %s" % (item["key"], item["url"], "", item["gates"]))
        return 0

    items, blob = collect(args.ttl, args.timeout, args.budget, args.refresh)

    if args.json:
        print(json.dumps({"probed": blob["probed"], "proxy": blob["proxy"],
                          "cached": blob.get("cached", False),
                          "targets": {i["key"]: {"url": i["url"], "gates": i["gates"],
                                                 **blob["results"].get(i["key"], {})}
                                      for i in items}}, indent=2))
    elif args.vitals:
        print(render_vitals(items, blob))
    else:
        print(render_table(items, blob))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(2)
