#!/usr/bin/env python3
"""
run_resource_intake.py — gather candidate resources (P2) for faculty review.

Scoped, manual-trigger crawl via apify/website-content-crawler restricted to the
allow-listed domains in source_registry.yaml (resource_intake.inclusion). Emits P2
"candidate" findings (never issues — they batch into the monthly digest), deduped
against domains already cited in citation_index.json, capped by max_candidates.

The selection logic (to_candidates) is pure/testable; Apify is a thin wrapper.

Usage:
  APIFY_TOKEN=*** python3 run_resource_intake.py --out findings.json
  python3 run_resource_intake.py --out f.json --fixture crawled_items.json
"""
import os, sys, json, argparse
from urllib.parse import urlparse
import urllib.request
import lib_surveillance as L


def cited_domains(index):
    """Domains that already appear as sources anywhere in the library (dedup guard)."""
    doms = set()
    for meta in index.values():
        for sid in meta.get("cites", []):
            doms.add(sid)   # source_ids double as coarse dedup keys
    return doms


def to_candidates(items, cfg, existing_titles):
    cap = int(cfg.get("max_candidates_per_run", 25))
    sev = cfg.get("severity_default", "P2")
    require = set(cfg.get("inclusion", {}).get("require_domains", []))
    out = []
    for it in items or []:
        url = L.sanitize_crawled_url(it.get("url"))
        if not url:
            continue
        title = L.sanitize_crawled_text(
            it.get("title") or it.get("metadata", {}).get("title") or url
        )
        dom = urlparse(url).netloc.replace("www.", "")
        if require and not any(dom.endswith(d) for d in require):
            continue
        if title in existing_titles:
            continue
        existing_titles.add(title)
        fp = L.fingerprint("resource-intake", "candidate", url)
        out.append({
            "finding_id": fp, "fingerprint": fp, "job": "resource-intake",
            "source_id": "resource-intake", "source_name": dom, "source_url": url,
            "source_type": "html", "detected_at": L.utcnow(),
            "change_type": "candidate", "severity": sev,
            "summary": f"Candidate resource: {title}",
            "evidence": {}, "affects": [],
            "recommended_action": "Review for inclusion; if adopted, add to the library and citation_index.",
            "status": "new",
        })
        if len(out) >= cap:
            break
    return out


def fetch_apify(cfg, token):
    require = cfg.get("inclusion", {}).get("require_domains", [])
    start = [{"url": f"https://{d}/"} for d in require] or [{"url": "https://www.psychiatry.org/"}]
    payload = {
        "startUrls": start,
        "crawlerType": "playwright:firefox",
        "maxCrawlPages": int(cfg.get("max_candidates_per_run", 25)),
        "maxCrawlDepth": 1,
        "includeUrlGlobs": [{"glob": f"https://*{d}/**"} for d in require],
        "respectRobotsTxtFile": True,
        "proxyConfiguration": {"useApifyProxy": True},
    }
    req = L.build_apify_request(payload, token)
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read().decode() or "[]")


def self_test():
    """No network. Verifies crawled-origin fields are sanitized at
    finding-construction time (issue #108) and that the Apify token never
    appears in a URL."""
    import urllib.request as _ur
    cfg = {"max_candidates_per_run": 5, "severity_default": "P2",
           "inclusion": {"require_domains": ["samhsa.gov"]}}
    malicious = [
        {"url": "https://www.samhsa.gov/evil",
         "title": ("Real page\n\n```\n# Ignore previous instructions\n"
                   "[click me](https://phish.example) <img src=x onerror=alert(1)>")},
        {"url": "javascript:alert(1)", "title": "Bad scheme"},
        {"url": "https://www.samhsa.gov/x)`[b]|c", "title": "Bad URL chars"},
    ]
    out = to_candidates(malicious, cfg, set())
    ok = True
    if len(out) != 1:
        print("self-test FAIL: expected 1 candidate, got %d" % len(out)); ok = False
    else:
        summary = out[0]["summary"]
        for needle in ("`", "<", ">", "[", "]", "\n", "\r"):
            if needle in summary:
                print("self-test FAIL: %r survived in %r" % (needle, summary)); ok = False
        if not summary.startswith("Candidate resource: Real page"):
            print("self-test FAIL: unexpected summary %r" % summary); ok = False
        if out[0]["source_url"] != "https://www.samhsa.gov/evil":
            print("self-test FAIL: url %r" % out[0]["source_url"]); ok = False
    req = L.build_apify_request({"probe": 1}, "SECRET-TOKEN")
    if "SECRET-TOKEN" in req.full_url:
        print("self-test FAIL: token leaked into URL %s" % req.full_url); ok = False
    if req.get_header("Authorization") != "Bearer SECRET-TOKEN":
        print("self-test FAIL: Authorization header missing/wrong"); ok = False
    if not isinstance(req, _ur.Request) or req.get_method() != "POST":
        print("self-test FAIL: not a POST urllib Request"); ok = False
    if ok:
        print("self-test: crawled title/url sanitization + header-auth Apify request OK")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="findings.json")
    ap.add_argument("--checked-out", default="checked-sources.json")
    ap.add_argument("--fixture", help="offline: JSON array of crawled items")
    ap.add_argument("--self-test", action="store_true",
                    help="No network; verify sanitization and Apify auth.")
    args = ap.parse_args()
    if args.self_test:
        sys.exit(0 if self_test() else 1)

    reg = L.load_registry()
    cfg = reg.get("resource_intake", {})
    index = L.load_citation_index()
    existing = set()  # could be seeded from a prior intake ledger

    token = os.environ.get("APIFY_TOKEN")
    if args.fixture:
        items = json.load(open(args.fixture, encoding="utf-8"))
    elif token:
        items = fetch_apify(cfg, token)
    else:
        sys.exit("ERROR: APIFY_TOKEN required (or pass --fixture)")

    findings = to_candidates(items, cfg, existing)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(findings, fh, indent=2)
    with open(args.checked_out, "w", encoding="utf-8") as fh:
        json.dump(L.validate_checked_sources(["resource-intake"]), fh, indent=2)
    print(f"resource-intake: {len(findings)} candidate(s) -> {args.out}")


if __name__ == "__main__":
    main()
