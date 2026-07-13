#!/usr/bin/env python3
"""
run_guideline_surv.py — detect changes at authoritative guideline sources.

For each canonical evidence-registry source projected with job == guideline-surveillance:
  1. Fetch cleaned text via apify/website-content-crawler (run-sync-get-dataset-items).
  2. Normalize -> hash. Compare to the stored baseline (history/baselines/<id>.json).
  3. First time: establish baseline, emit nothing. Changed: emit a finding.
  4. 0 characters extracted (source down / scraper broken): emit a P1 "removed"
     health finding and do NOT overwrite the good baseline (silence != stability).

Copyright: signal_only sources (DSM, journals) store a HASH ONLY — never the text,
and their findings carry no diff_excerpt.

The diff logic (evaluate) is pure and unit-tested; Apify is a thin wrapper so the
job is testable offline with --fixture (JSON map: source_id -> extracted text).

Usage:
  APIFY_TOKEN=*** python3 run_guideline_surv.py --out findings.json
  python3 run_guideline_surv.py --out f.json --fixture fake_texts.json --baseline-dir /tmp/bl
"""
import os, sys, json, argparse, difflib
import urllib.request
import lib_surveillance as L


# ---------------------------------------------------------------- pure diff core
def _excerpt(old_norm, new_norm, max_lines=40):
    old = [s.strip() for s in old_norm.split(". ") if s.strip()]
    new = [s.strip() for s in new_norm.split(". ") if s.strip()]
    diff = [ln for ln in difflib.unified_diff(old, new, lineterm="", n=1)
            if ln and ln[0] in "+-" and not ln.startswith(("+++", "---"))]
    return "\n".join(diff[:max_lines])


def evaluate(source, raw_text, baseline_dir):
    """Return (finding_or_None, baseline_record_or_None).

    baseline_record is None => caller must NOT write a baseline (health alarm)."""
    sid = source["id"]
    signal_only = source.get("modality") == "signal_only"
    norm = L.normalize_text(raw_text)
    bpath = os.path.join(baseline_dir, f"{sid}.json")
    prev = json.load(open(bpath, encoding="utf-8")) if os.path.exists(bpath) else None

    # Dead-scraper / source-down guard.
    if len(norm) == 0:
        finding = _finding(source, "removed", "P1",
                           f"0 characters extracted from {source['name']} "
                           f"(source down or scraper broken).",
                           evidence={"new_hash": "", "prev_hash": (prev or {}).get("hash", "")},
                           signature="empty-content")
        return finding, None   # keep the old baseline intact

    new_hash = L.sha_full(norm)
    record = {"hash": new_hash, "chars": len(norm), "checked_at": L.utcnow()}
    if not signal_only:
        record["text"] = norm     # enables real diffs; withheld for copyrighted sources

    if prev is None:
        return None, record       # baseline established, nothing to report
    if prev.get("hash") == new_hash:
        return None, record       # unchanged

    ev = {"prev_hash": prev.get("hash"), "new_hash": new_hash,
          "prev_seen_at": prev.get("checked_at")}
    if not signal_only and prev.get("text"):
        ev["diff_excerpt"] = _excerpt(prev["text"], norm)
    summary = (f"Content changed at {source['name']}"
               + ("" if not signal_only else " (signal-only source; excerpt withheld for copyright)"))
    finding = _finding(source, "modified", source.get("severity_default", "P1"),
                       summary, evidence=ev, signature=new_hash)
    return finding, record


def _finding(source, change_type, severity, summary, evidence, signature):
    return {
        "finding_id": L.fingerprint(source["id"], change_type, signature),
        "fingerprint": L.fingerprint(source["id"], change_type, signature),
        "job": "guideline-surveillance",
        "source_id": source["id"],
        "source_name": source["name"],
        "source_url": source["url"],
        "source_type": source.get("type", "html"),
        "modality": source.get("modality", "full_text"),
        "detected_at": L.utcnow(),
        "change_type": change_type,
        "severity": severity,
        "summary": summary,
        "evidence": evidence,
        "affects": [],   # resolved by sync via citation_index
        "recommended_action": f"Review {source['name']}; if guidance changed, update the "
                              f"affected teaching page(s) and re-stamp reviewed.json.",
        "status": "new",
    }


# ---------------------------------------------------------------- apify wrapper
def fetch_apify(source, token):
    ctype = "cheerio" if source.get("type") == "html" else "playwright:firefox"
    payload = {
        "startUrls": [{"url": source["url"]}],
        "crawlerType": ctype,
        "maxCrawlPages": 1,
        "maxCrawlDepth": 0,
        "respectRobotsTxtFile": True,
        "proxyConfiguration": {"useApifyProxy": True},
    }
    url = ("https://api.apify.com/v2/acts/apify~website-content-crawler/"
           f"run-sync-get-dataset-items?token={token}")
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as r:
        items = json.loads(r.read().decode() or "[]")
    return "\n".join((it.get("text") or it.get("markdown") or "") for it in items)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="findings.json")
    ap.add_argument("--baseline-dir", default=L.BASELINES)
    ap.add_argument("--source", help="only this source_id")
    ap.add_argument("--fixture", help="offline: JSON map source_id -> extracted text")
    args = ap.parse_args()

    reg = L.load_registry()
    sources = [s for s in reg.get("sources", []) if s.get("job") == "guideline-surveillance"]
    if args.source:
        sources = [s for s in sources if s["id"] == args.source]

    fixture = json.load(open(args.fixture, encoding="utf-8")) if args.fixture else None
    token = os.environ.get("APIFY_TOKEN")
    if fixture is None and not token:
        sys.exit("ERROR: APIFY_TOKEN required (or pass --fixture for offline runs)")

    os.makedirs(args.baseline_dir, exist_ok=True)
    findings, checked = [], []
    for s in sources:
        try:
            raw = fixture.get(s["id"], "") if fixture is not None else fetch_apify(s, token)
        except Exception as e:
            print(f"  ! fetch failed for {s['id']}: {e}", file=sys.stderr)
            raw = ""
        finding, record = evaluate(s, raw, args.baseline_dir)
        if record is not None:
            json.dump(record, open(os.path.join(args.baseline_dir, f"{s['id']}.json"), "w",
                                   encoding="utf-8"), indent=2)
        if finding:
            findings.append(finding)
        checked.append(s["id"])
        print(f"  {s['id']}: {'CHANGE' if finding and finding['change_type']=='modified' else ('ALARM' if finding else 'ok')}")

    json.dump(findings, open(args.out, "w", encoding="utf-8"), indent=2)
    print(f"guideline-surveillance: {len(findings)} finding(s) across {len(checked)} source(s) -> {args.out}")


if __name__ == "__main__":
    main()
