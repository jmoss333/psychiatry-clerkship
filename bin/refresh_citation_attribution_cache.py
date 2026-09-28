#!/usr/bin/env python3
"""Resolve every DOI/PMID in the curriculum's reference sections and commit the answers.

THE NETWORK HALF OF THE CITATION GATE, AND DELIBERATELY A SEPARATE PROGRAM.

`bin/check_citation_attribution.py` reads the cache this writes and makes zero HTTP
calls, which is the single property that keeps it a gate: CI cannot flake on a Crossref
timeout, and a run reproduces months later from the committed JSON. A citation gate that
fails randomly gets marked `continue-on-error` within a week and then it protects
nothing. So refreshing is a deliberate, human-run, network-touching act — never a step
in `verify.sh` or `ci.yml`.

    python3 bin/refresh_citation_attribution_cache.py            # resolve what is missing
    python3 bin/refresh_citation_attribution_cache.py --force    # re-resolve everything
    python3 bin/refresh_citation_attribution_cache.py --dry-run  # report, write nothing

TWO INDEPENDENT OPINIONS, BOTH STORED.
  DOI  -> Crossref `/works/{doi}`: title, container-title, short-container-title, issued
          year, author family names.
  PMID -> NCBI esummary: title, `source` (the Vancouver abbreviation), `fulljournalname`,
          pubdate year, author names.
A DOI is additionally run through NCBI esearch to pick up its PMID, because the
abbreviation PubMed prints is the form curriculum references actually use ("Br J
Addict"), and Crossref usually carries only the expanded title. Every journal-name
variant either service returns is stored in `containerAlt`, so the gate's comparison has
the abbreviation AND the expansion to match against instead of guessing between them.

WHAT AN ENTRY MEANS.
  status "resolved"   the service returned a record; the gate compares against it.
  status "not-found"  the service answered, and there is no such paper. The gate FAILS
                      on this. It is a verdict, not an outage.
An identifier neither service could be asked about (a transport error) is left OUT of
the cache entirely rather than written as any status, because the gate treats a missing
entry as fail-closed and treats a stored status as an answer. Writing "unknown" would
launder an outage into a record.

Stdlib only. Polite: one request at a time, throttled, bounded retries.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "bin"))

from check_citation_attribution import (  # noqa: E402
    CACHE_PATH, collect_references, today,
)

UA = "psychiatry-clerkship-citation-attribution/1.0 (+education; faculty contact)"
TIMEOUT_S = 25
THROTTLE_S = 0.40
RETRIES = 2

CROSSREF = "https://api.crossref.org/works/"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"


def _get(url):
    """Return parsed JSON, or None when the service answered 404, or raise on transport."""
    last = None
    for attempt in range(RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as fh:
                return json.loads(fh.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in (404, 400):
                return None            # an answer: no such record
            last = exc
        except Exception as exc:       # noqa: BLE001 — transport, retry then give up
            last = exc
        time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


TAG_RE = re.compile(r"<[^>]+>")


def clean(s):
    """Publisher metadata carries markup — Crossref returns '<i>2018 CANMAT</i>' inside titles
    and JATS entities inside abstracts. Strip it here, once, so every consumer compares words."""
    if not s:
        return s
    s = TAG_RE.sub(" ", str(s))
    s = s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return re.sub(r"\s+", " ", s).strip()


def surname_of(pubmed_name):
    """'van Dis EAM' -> 'van Dis'; 'Bastos Maia S' -> 'Bastos Maia'; 'Sullivan JT' -> 'Sullivan'.

    PubMed prints the surname followed by a single initials token. Taking the FIRST token
    instead (the obvious shortcut) mangles every Dutch tussenvoegsel and every two-word
    surname in the corpus — 'van Dis' became 'van' and matched nothing.
    """
    toks = str(pubmed_name or "").split()
    if len(toks) > 1 and re.fullmatch(r"[A-Z][A-Za-z]{0,3}", toks[-1]):
        toks = toks[:-1]
    return " ".join(toks)


def year_of(parts):
    for chunk in (parts or []):
        for v in (chunk or []):
            if isinstance(v, int) and 1500 < v < 2100:
                return v
            if isinstance(v, list) and v and isinstance(v[0], int):
                return v[0]
    return None


def from_crossref(doi):
    data = _get(CROSSREF + urllib.parse.quote(doi, safe=""))
    if not data or "message" not in data:
        return None
    m = data["message"]
    titles = [t for t in (m.get("title") or []) if t]
    containers = [c for c in (m.get("container-title") or []) if c]
    shorts = [c for c in (m.get("short-container-title") or []) if c]
    issued = (m.get("issued") or {}).get("date-parts")
    published = (m.get("published-print") or m.get("published-online") or {}).get("date-parts")
    authors = [a.get("family") for a in (m.get("author") or []) if a.get("family")]
    return {
        "title": clean(titles[0]) if titles else None,
        "container": clean((shorts or containers or [None])[0]),
        "containerAlt": sorted({clean(c) for c in (containers + shorts)} - {None, ""}),
        "year": year_of(issued) or year_of(published),
        "authors": [clean(a) for a in authors],
        "source": "crossref",
    }


def pmid_for_doi(doi):
    url = (EUTILS + "esearch.fcgi?db=pubmed&retmode=json&retmax=1&term="
           + urllib.parse.quote(f'"{doi}"[AID]'))
    data = _get(url)
    ids = ((data or {}).get("esearchresult") or {}).get("idlist") or []
    return ids[0] if ids else None


def from_pubmed(pmid):
    data = _get(EUTILS + f"esummary.fcgi?db=pubmed&retmode=json&id={urllib.parse.quote(pmid)}")
    result = (data or {}).get("result") or {}
    rec = result.get(str(pmid))
    if not rec or rec.get("error"):
        return None
    year = None
    m = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", str(rec.get("pubdate") or ""))
    if m:
        year = int(m.group(1))
    return {
        "title": clean(rec.get("title")).rstrip("."),
        "container": clean(rec.get("source")),
        "containerAlt": sorted({clean(x) for x in (rec.get("source"), rec.get("fulljournalname"))
                                if x}),
        "year": year,
        "authors": [surname_of(a.get("name")) for a in (rec.get("authors") or [])
                    if a.get("name")],
        "source": "pubmed",
    }


def merge(primary, secondary):
    """Primary wins on every field it fills; secondary supplies the gaps and extra aliases."""
    if primary and not secondary:
        return primary
    if secondary and not primary:
        return secondary
    if not primary and not secondary:
        return None
    out = dict(primary)
    for key in ("title", "container", "year"):
        if not out.get(key):
            out[key] = secondary.get(key)
    if len(secondary.get("authors") or []) > len(out.get("authors") or []):
        out["authors"] = secondary["authors"]
    out["containerAlt"] = sorted(
        {*(out.get("containerAlt") or []), *(secondary.get("containerAlt") or []),
         *(x for x in (out.get("container"), secondary.get("container")) if x)})
    out["source"] = f"{primary.get('source')}+{secondary.get('source')}"
    return out


def resolve_doi(doi):
    cross = from_crossref(doi)
    pub = None
    pmid = pmid_for_doi(doi)
    if pmid:
        pub = from_pubmed(pmid)
    rec = merge(cross, pub)
    if rec is None:
        return {"status": "not-found", "resolvedAt": today()}
    rec.update({"status": "resolved", "resolvedAt": today(), "pmid": pmid})
    return rec


def resolve_pmid(pmid):
    rec = from_pubmed(pmid)
    if rec is None:
        return {"status": "not-found", "resolvedAt": today()}
    rec.update({"status": "resolved", "resolvedAt": today()})
    return rec


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-resolve identifiers already cached")
    ap.add_argument("--dry-run", action="store_true", help="report what would change; write nothing")
    args = ap.parse_args()

    refs = collect_references(REPO)
    wanted_dois, wanted_pmids = set(), set()
    for ref in refs:
        if ref.doi:
            wanted_dois.add(ref.doi.lower())
        elif ref.pmid:
            wanted_pmids.add(ref.pmid)

    try:
        with open(CACHE_PATH, encoding="utf-8") as fh:
            cache = json.load(fh)
    except FileNotFoundError:
        cache = {}
    dois = dict(cache.get("dois") or {})
    pmids = dict(cache.get("pmids") or {})

    todo = [("doi", d) for d in sorted(wanted_dois) if args.force or d not in dois]
    todo += [("pmid", p) for p in sorted(wanted_pmids) if args.force or p not in pmids]
    print(f"{len(refs)} reference(s); {len(wanted_dois)} DOI(s), {len(wanted_pmids)} PMID(s); "
          f"{len(todo)} to resolve")
    if args.dry_run:
        for kind, key in todo:
            print(f"  would resolve {kind} {key}")
        return 0

    failed = []
    for i, (kind, key) in enumerate(todo, 1):
        try:
            rec = resolve_doi(key) if kind == "doi" else resolve_pmid(key)
        except RuntimeError as exc:
            # Transport, not a verdict. Leave it out so the gate stays fail-closed on it.
            failed.append((kind, key, str(exc)))
            print(f"  [{i}/{len(todo)}] {kind} {key}: TRANSPORT ERROR, not cached")
            continue
        (dois if kind == "doi" else pmids)[key] = rec
        flag = "ok " if rec["status"] == "resolved" else "404"
        print(f"  [{i}/{len(todo)}] {flag} {kind} {key}: {str(rec.get('title'))[:76]}")
        time.sleep(THROTTLE_S)

    payload = {
        "_note": (
            "Resolved citation metadata, written by bin/refresh_citation_attribution_cache.py "
            "and read by bin/check_citation_attribution.py, which never touches the network. "
            "Keyed by lowercased DOI and by PMID. status 'not-found' is a verdict (the service "
            "answered and there is no such paper) and FAILS the gate; an identifier absent from "
            "this file also fails, because a gate that skips what it cannot resolve rebuilds the "
            "hole PR #672 walked through. Refresh is a deliberate human act, never a CI step."),
        "refreshedAt": today(),
        "dois": dict(sorted(dois.items())),
        "pmids": dict(sorted(pmids.items())),
    }
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=False, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {os.path.relpath(CACHE_PATH, REPO)}: "
          f"{len(dois)} DOI(s), {len(pmids)} PMID(s)")
    if failed:
        print(f"\n{len(failed)} identifier(s) could not be reached and were NOT cached:")
        for kind, key, err in failed:
            print(f"  {kind} {key}: {err[:120]}")
        print("Re-run when the service is reachable; the gate fails closed on them meanwhile.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
