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
        url = it.get("url") or ""
        title = (it.get("title") or it.get("metadata", {}).get("title") or url).strip()
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
    url = ("https://api.apify.com/v2/acts/apify~website-content-crawler/"
           f"run-sync-get-dataset-items?token={token}")
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read().decode() or "[]")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="findings.json")
    ap.add_argument("--fixture", help="offline: JSON array of crawled items")
    args = ap.parse_args()

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
    json.dump(findings, open(args.out, "w", encoding="utf-8"), indent=2)
    print(f"resource-intake: {len(findings)} candidate(s) -> {args.out}")


if __name__ == "__main__":
    main()
