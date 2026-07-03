#!/usr/bin/env python3
"""
build_citation_index.py — grow citation_index.json by scanning the curriculum.

Walks the numbered content folders (01_.. 14_) for .md/.html teaching files and
detects which authoritative sources each page depends on, using per-source match
patterns (domains + distinctive tokens). Discovered `path -> [source_id]` mappings
are merged NON-DESTRUCTIVELY into citation_index.json: hand-seeded entries and their
notes are preserved; cites are unioned; brand-new files are added with "auto": true.

Match patterns live here (scanner config), not in the registry, and are easy to tune.
Short acronyms use word boundaries to avoid false positives.

Usage:
  python3 build_citation_index.py            # scan + write (merge)
  python3 build_citation_index.py --dry-run  # report only, no write
"""
import os, re, json, argparse
import lib_surveillance as L

# source_id -> regex patterns (case-insensitive). Keep specific to limit false hits.
MATCH = {
    "fda-drug-safety":        [r"fda\.gov", r"\bFDA\b", r"boxed warning", r"black[- ]box"],
    "clozapine-rems":         [r"clozapine", r"\bREMS\b", r"\bANC\b"],
    "spravato-rems":          [r"esketamine", r"spravato"],
    "apa-practice-guidelines":[r"psychiatry\.org", r"APA (Practice )?[Gg]uideline"],
    "dsm-5-tr":               [r"\bDSM-5(-TR)?\b", r"\bDSM\b"],
    "uspstf-mental-health":   [r"\bUSPSTF\b", r"Preventive Services Task Force"],
    "samhsa-guidelines":      [r"\bSAMHSA\b", r"\b988\b", r"Treatment Improvement Protocol", r"\bTIP \d"],
    "aacap-parameters":       [r"\bAACAP\b", r"Practice Parameter"],
}
COMPILED = {sid: [re.compile(p, re.IGNORECASE) for p in pats] for sid, pats in MATCH.items()}

CONTENT_DIR_RE = re.compile(r"^\d\d_")
SKIP_DIRS = {"_source", "_build", "_prototypes", "_automation", "99_Archive", ".git"}
# Top-level areas that are navigation/aggregation, not primary clinical teaching pages.
# 00_START_HERE holds orientation + NotebookLM upload bundles (concatenations of the real
# pages) + audit reports — re-reviewing those on a guideline change would be redundant.
SKIP_TOP = {"00_START_HERE"}


def iter_files():
    for top in sorted(os.listdir(L.LIB_ROOT)):
        if not CONTENT_DIR_RE.match(top) or top in SKIP_TOP:
            continue
        base = os.path.join(L.LIB_ROOT, top)
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs
                       if d not in SKIP_DIRS and not d.startswith(".") and not d.startswith("_")]
            for fn in files:
                if fn.startswith("_") or not fn.endswith((".md", ".html")):
                    continue
                yield os.path.relpath(os.path.join(root, fn), L.LIB_ROOT)


def detect(text):
    return sorted(sid for sid, regs in COMPILED.items() if any(r.search(text) for r in regs))


def scan():
    hits = {}
    for rel in iter_files():
        try:
            text = open(os.path.join(L.LIB_ROOT, rel), encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        sids = detect(text)
        if sids:
            hits[rel] = sids
    return hits


def merge(existing, hits):
    idx = existing.setdefault("index", {})
    added_files, grown = 0, 0
    for path, sids in hits.items():
        if path in idx:
            cur = set(idx[path].get("cites", []))
            new = cur | set(sids)
            if new != cur:
                idx[path]["cites"] = sorted(new)
                grown += 1
        else:
            idx[path] = {"cites": sids, "auto": True}
            added_files += 1
    existing["generated_by"] = "seed + auto-scan (build_citation_index.py)"
    existing["auto_scanned_at"] = L.today()
    return added_files, grown


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    existing = json.load(open(L.CITATION_INDEX, encoding="utf-8"))
    before = len(existing.get("index", {}))
    hits = scan()
    added, grown = merge(existing, hits)
    after = len(existing["index"])

    # per-source coverage
    cov = {}
    for meta in existing["index"].values():
        for sid in meta.get("cites", []):
            cov[sid] = cov.get(sid, 0) + 1

    print(f"scanned files with >=1 source: {len(hits)}")
    print(f"index entries: {before} -> {after}  (+{added} new files, {grown} existing grown)")
    print("per-source coverage: " + ", ".join(f"{k}={v}" for k, v in sorted(cov.items())))
    if args.dry_run:
        print("\n[dry-run] not written.")
        return
    json.dump(existing, open(L.CITATION_INDEX, "w", encoding="utf-8"), indent=2)
    print(f"\nwrote {L.CITATION_INDEX}")


if __name__ == "__main__":
    main()
