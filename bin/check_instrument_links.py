#!/usr/bin/env python3
"""DEV-ONLY sweep: re-check that every recorded instrument route still resolves.

The live sweep is NOT part of the build and NOT part of CI. Two reasons, both deliberate:

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
    python3 bin/check_instrument_links.py --self-test  # hermetic: a local stub server, no egress

Reports; only --stamp writes, and it writes nothing but the `verified` date and
`verifiedVia`. A route that 404s is a content decision (find the custodian's new URL),
never a reason to delete the route and leave the page pointing nowhere — and never a
reason to touch `status`, which changes only with a decisionRef.

WHAT THE SELF-TEST IS FOR. bin/verify.sh runs `--self-test` and nothing else from this file
(the same posture as check_source_integrity.py and check_review_cadence.py: the real run
needs egress, the falsification does not). It stands up a loopback HTTP server and proves,
against a fixture registry, that a dead route exits 1, that a custodian who refuses HEAD but
serves GET is NOT a false alarm, that a redirect is reported rather than hidden, that a
registry with nothing to check is exit 2 rather than a vacuous pass, and that --stamp writes
`verified` only onto an instrument whose every route passed. Without it this file was a
sweep nobody had falsified in a month: it could have stopped detecting dead links and no
gate would have noticed.

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


def probe(url, timeout=TIMEOUT):
    """Return (ok, detail). A HEAD that is refused is retried as a ranged GET.

    Some custodians answer HEAD with 403 or 405 while serving GET perfectly well, so a
    HEAD failure alone is not evidence the route is broken.
    """
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
        if method == "GET":
            req.add_header("Range", "bytes=0-2047")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
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


def run(registry, only_id=None, stamp=False, timeout=TIMEOUT, out=sys.stdout, err=sys.stderr):
    """The sweep, parameterised so the self-test can aim it at a fixture. Returns the exit code."""
    try:
        rights = json.loads(registry.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read {registry.name}: {exc}", file=err)
        return 2

    checked = list(routes(rights, only_id))
    if not checked:
        where = f" for id={only_id!r}" if only_id else ""
        print(f"no recorded routes{where} — nothing to check", file=err)
        return 2

    failures = []
    passed_ids = set()
    failed_ids = set()
    for entry, field, url in checked:
        ok, detail = probe(url, timeout=timeout)
        mark = "ok  " if ok else "FAIL"
        print(f"{mark} {entry['id']:<14} {field:<12} {url}\n     {detail}", file=out)
        (passed_ids if ok else failed_ids).add(entry["id"])
        if not ok:
            failures.append((entry, field, url, detail))

    print(file=out)
    if failures:
        print(f"{len(failures)} of {len(checked)} route(s) failed:", file=out)
        for entry, field, url, detail in failures:
            print(f"  · {entry['instrument']} ({field}): {detail}", file=out)
        print("\nFind the custodian's current URL and update officialSource. Do NOT delete the",
              file=out)
        print("route — a page pinned requireOfficialSourceLink will fail the build, which is the",
              file=out)
        print("gate working: a rights page with no route is the dead end it exists to prevent.",
              file=out)
    else:
        print(f"all {len(checked)} recorded route(s) reachable", file=out)

    if stamp:
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
            registry.write_text(json.dumps(rights, indent=2, ensure_ascii=False) + "\n",
                                encoding="utf-8")
            print(f"\nstamped {touched} entr(y/ies) verified {today}", file=out)
            print("Re-run validate_registry_schemas.py before committing.", file=out)
        else:
            print("\nnothing stamped — no instrument had all its routes pass", file=out)

    return 1 if failures else 0


# --- self-test — hermetic: a loopback stub server stands in for every custodian ------------

def self_test():
    import io
    import tempfile
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class Custodian(BaseHTTPRequestHandler):
        """Four behaviours real custodians have shown: plain 200, HEAD-refused-GET-ok,
        a redirect to the current URL, and a page that is simply gone."""

        def log_message(self, *_):  # keep the self-test's output to its own lines
            pass

        def _answer(self, method):
            if self.path == "/form.pdf":
                self.send_response(200)
                self.end_headers()
            elif self.path == "/head-refused":
                # 405 on HEAD, 200 on GET — the fallback this tool exists to get right.
                self.send_response(405 if method == "HEAD" else 200)
                self.end_headers()
            elif self.path == "/moved":
                self.send_response(302)
                self.send_header("Location", "/form.pdf")
                self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()

        def do_HEAD(self):
            self._answer("HEAD")

        def do_GET(self):
            self._answer("GET")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Custodian)
    base = f"http://127.0.0.1:{server.server_address[1]}"
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def registry(instruments):
        return {"schemaVersion": 1, "instruments": instruments}

    def inst(iid, form, training=None):
        src = {"formUrl": base + form}
        if training:
            src["trainingUrl"] = base + training
        return {"id": iid, "instrument": iid.upper(), "status": "retired", "officialSource": src}

    failures = []
    total = []

    def check(name, got, want):
        total.append(name)
        if got != want:
            failures.append(f"{name}: got {got!r}, want {want!r}")

    def sweep(payload, **kw):
        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            reg = Path(tmp) / "instrument_rights.json"
            reg.write_text(payload if isinstance(payload, str) else json.dumps(payload),
                           encoding="utf-8")
            code = run(reg, out=out, err=err, timeout=5, **kw)
            after = reg.read_text(encoding="utf-8")
        return code, out.getvalue(), err.getvalue(), after

    try:
        # 1. Every route reachable → 0, and the summary says so.
        code, out, _, _ = sweep(registry([inst("a", "/form.pdf", "/head-refused")]))
        check("all reachable exits 0", code, 0)
        check("all reachable says so", "all 2 recorded route(s) reachable" in out, True)

        # 2. The falsification: one dead route among live ones → 1, named by instrument+field.
        code, out, _, _ = sweep(registry([inst("a", "/form.pdf"), inst("b", "/form.pdf", "/gone")]))
        check("a dead route exits 1", code, 1)
        check("the dead route is named", "B (trainingUrl): HTTP 404" in out, True)
        check("the live routes still pass", out.count("ok  ") == 2, True)
        check("deletion is refused in the advice", "Do NOT delete the" in out, True)

        # 3. HEAD refused, GET served: a false alarm this tool must not raise.
        ok, detail = probe(base + "/head-refused", timeout=5)
        check("HEAD 405 + GET 200 is reachable", ok, True)
        check("…and reports the GET's code", detail, "HTTP 200")

        # 4. A redirect passes but is reported, so a moved custodian is visible to --stamp readers.
        ok, detail = probe(base + "/moved", timeout=5)
        check("redirect is reachable", ok, True)
        check("redirect is reported", "→" in detail and detail.endswith("/form.pdf"), True)

        # 5. A dead end is a dead end.
        ok, detail = probe(base + "/gone", timeout=5)
        check("404 is unreachable", ok, False)
        check("404 is reported as HTTP 404", detail.startswith("HTTP 404"), True)

        # 6. A refused connection (nothing listening) is a failure, not an exception.
        dead_server = ThreadingHTTPServer(("127.0.0.1", 0), Custodian)
        dead_port = dead_server.server_address[1]
        dead_server.server_close()
        ok, detail = probe(f"http://127.0.0.1:{dead_port}/form.pdf", timeout=5)
        check("connection refused is unreachable", ok, False)
        check("connection refused says why", detail.startswith("unreachable:"), True)

        # 7. Nothing to check is exit 2 — never a vacuous pass over an empty registry.
        code, _, err, _ = sweep(registry([]))
        check("empty registry exits 2", code, 2)
        check("empty registry says why", "nothing to check" in err, True)
        code, _, err, _ = sweep(registry([inst("a", "/form.pdf")]), only_id="zzz")
        check("unknown --id exits 2", code, 2)
        code, _, err, _ = sweep("{not json")
        check("unparseable registry exits 2", code, 2)
        check("unparseable registry says why", "cannot read" in err, True)

        # 8. --stamp writes `verified` onto the clean instrument only; a half-failed one keeps
        #    its old date, and nothing else in the record moves.
        stale = inst("clean", "/form.pdf")
        stale["officialSource"]["verified"] = "2000-01-01"
        half = inst("half", "/form.pdf", "/gone")
        half["officialSource"]["verified"] = "2000-01-01"
        code, out, _, after = sweep(registry([stale, half]), stamp=True)
        stamped = {e["id"]: e for e in json.loads(after)["instruments"]}
        check("stamp run still exits 1 on the dead route", code, 1)
        check("clean instrument is stamped today",
              stamped["clean"]["officialSource"]["verified"], date.today().isoformat())
        check("clean instrument records how",
              stamped["clean"]["officialSource"]["verifiedVia"],
              "live fetch, bin/check_instrument_links.py")
        check("half-failed instrument keeps its old date",
              stamped["half"]["officialSource"]["verified"], "2000-01-01")
        check("status is never touched by --stamp", stamped["clean"]["status"], "retired")
        check("stamp reports its count", "stamped 1 entr(y/ies)" in out, True)

        # 9. Without --stamp the registry is byte-identical afterwards.
        payload = json.dumps(registry([inst("a", "/form.pdf")]))
        _, _, _, after = sweep(payload)
        check("no --stamp, no write", after, payload)

        # 10. The live registry is still the shape routes() reads — a renamed field would turn
        #     the real sweep into "nothing to check" and this proves that cannot happen quietly.
        live = json.loads(REGISTRY.read_text(encoding="utf-8"))
        check("live registry yields routes", len(list(routes(live))) > 0, True)
    finally:
        server.shutdown()
        server.server_close()

    for line in failures:
        print("FAIL  " + line, file=sys.stderr)
    if failures:
        print(f"self-test: {len(failures)}/{len(total)} failed", file=sys.stderr)
        return 1
    print(f"self-test: {len(total)}/{len(total)} passed")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--id", help="check a single instrument id (e.g. cssrs)")
    ap.add_argument("--stamp", action="store_true",
                    help="rewrite `verified`/`verifiedVia` on routes that pass")
    ap.add_argument("--registry", type=Path, default=REGISTRY,
                    help="registry to sweep (default: instrument_rights.json; fixtures for tests)")
    ap.add_argument("--self-test", action="store_true",
                    help="prove the sweep can fail, against a loopback stub — no egress")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    return run(args.registry, only_id=args.id, stamp=args.stamp)


if __name__ == "__main__":
    sys.exit(main())
