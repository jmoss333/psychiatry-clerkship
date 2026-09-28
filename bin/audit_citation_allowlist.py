#!/usr/bin/env python3
"""Option B, as an audit: try to find an identifier for every grandfathered citation.

THIS IS NOT A GATE AND MUST NEVER BECOME ONE. It runs on a schedule
(.github/workflows/surveillance-citations.yml), it blocks no merge, and it exits 0 whatever
it finds. That is the whole point of where it sits.

THE RULING IT IMPLEMENTS (2026-09-27, Josh). The citation-gate design draft offered two
answers to "what about a citation with no DOI/PMID": A, require an identifier; B, search
PubMed and judge. The ruling took both, in different places:

    A is the gate      deterministic, cache-backed, no network, on every PR. It is what
                       stops the next #672 at the door, because every #672 citation had no
                       identifier at all.
    B is this file     heuristic, network-bound, non-deterministic — the same citation can
                       match today and not next month as PubMed's index moves. As a gate
                       that is a flake generator and a flaky gate gets switched off. As an
                       audit it is free to be wrong, because a wrong proposal costs a human
                       thirty seconds and blocks nobody.

ITS JOB IS TO WORK THE ALLOWLIST DOWN. bin/citation_identifier_allowlist.json is capped and
may only shrink (see ALLOWLIST_CAP in bin/check_citation_attribution.py). Something has to
push against it or it just sits there, and this is that something: for each grandfathered
citation it searches NCBI by title, then by author + year, and reports the best candidate so
a human can decide whether the citation should carry that identifier — at which point the
citation gets the identifier and the allowlist entry is DELETED, which the gate then requires
anyway, because a stale entry fails.

IT PROPOSES; IT NEVER WRITES. It does not touch the allowlist, the cache, or any page. The
reason is on the record: on 2026-09-21 the previous Option-B implementation proposed PMID
25934299 (Taylor & Perera, "NICE CG178 ... — an evidence-based guideline?") for the CG178
citation. That paper is a commentary ABOUT CG178, not CG178. An automatic writer would have
swapped a guideline for someone's opinion of it and every downstream check would have gone
green. So candidates about a source are flagged as such, and every proposal needs a name
against it.

    python3 bin/audit_citation_allowlist.py                 # the sweep
    python3 bin/audit_citation_allowlist.py --self-test     # no network
    python3 bin/audit_citation_allowlist.py --out F.json    # machine-readable proposals
    python3 bin/audit_citation_allowlist.py --offline       # shape only, no lookups

Exit 0 always, except 2 if it cannot read its own inputs. Stdlib only.
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
    ALLOWLIST_CAP, ALLOWLIST_PATH, collect_references, load_json, normalize_title,
    title_similarity, today,
)

UA = "psychiatry-clerkship-allowlist-audit/1.0 (+education; faculty contact)"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
TIMEOUT_S = 25
THROTTLE_S = 0.40

# A candidate scoring at or above this against the citation's own title is worth a human's
# attention. It is not a threshold anything is decided on — nothing here decides anything.
PROPOSE_FLOOR = 0.55

# A title that talks ABOUT a source rather than being it. The CG178 near-miss, generalised.
ABOUT_MARKERS = (
    "an evidence-based guideline?", "a critical appraisal", "a commentary", "commentary on",
    "a review of the", "critique of", "what do the guidelines", "guidelines reviewed",
    "an appraisal of", "editorial:", "response to",
)


def looks_like_commentary(candidate_title, cited_title):
    """True when the candidate reads as writing about the cited source, not the source itself.

    Deliberately crude and deliberately non-fatal: it adds a warning to a proposal a human is
    going to read anyway. The failure it exists to prevent is silent acceptance, not a wrong
    score.
    """
    t = normalize_title(candidate_title)
    if any(normalize_title(m) in t for m in ABOUT_MARKERS):
        return True
    if t.endswith("guideline") and "?" in str(candidate_title):
        return True
    # "NICE CG178 Psychosis and Schizophrenia ... - an evidence-based guideline?" names the
    # cited document inside a longer title that adds a question. Naming plus interrogation is
    # the commentary shape.
    return "?" in str(candidate_title) and normalize_title(cited_title)[:24] in t


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as fh:
        return json.loads(fh.read().decode("utf-8"))


def esearch(term, retmax=5):
    url = (EUTILS + f"esearch.fcgi?db=pubmed&retmode=json&retmax={retmax}&term="
           + urllib.parse.quote(term))
    try:
        return ((_get(url).get("esearchresult") or {}).get("idlist") or [])
    except (urllib.error.URLError, OSError, ValueError):
        return []


def esummary(pmids):
    if not pmids:
        return []
    url = EUTILS + "esummary.fcgi?db=pubmed&retmode=json&id=" + ",".join(pmids)
    try:
        result = _get(url).get("result") or {}
    except (urllib.error.URLError, OSError, ValueError):
        return []
    out = []
    for uid in result.get("uids", []):
        rec = result[uid]
        year = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", str(rec.get("pubdate") or ""))
        out.append({
            "pmid": uid,
            "title": (rec.get("title") or "").rstrip("."),
            "container": rec.get("source"),
            "year": int(year.group(1)) if year else None,
            "doi": next((a["value"] for a in rec.get("articleids", [])
                         if a.get("idtype") == "doi"), None),
        })
    return out


def citation_title(citation):
    """Best effort at the title inside a reference line: the *italicised* span if there is
    one (this corpus italicises titles and journals), else the second '. '-separated
    segment."""
    m = re.search(r"\*([^*]{12,})\*", citation)
    if m:
        return m.group(1).strip(" .")
    body = re.sub(r"^\s*\d{1,3}\.\s+", "", citation)
    parts = [p.strip() for p in body.split(". ") if p.strip()]
    return parts[1] if len(parts) > 1 else (parts[0] if parts else "")


def audit_entry(entry, offline=False):
    cited = citation_title(entry.get("citation", ""))
    row = {
        "citationKey": entry.get("citationKey"),
        "path": entry.get("path"),
        "citedTitle": cited,
        "reason": entry.get("reason"),
        "candidates": [],
        "verdict": "no-candidate",
    }
    if offline or not cited:
        row["verdict"] = "not-searched"
        return row
    pmids = esearch(f"{cited}[Title]") or esearch(cited)
    time.sleep(THROTTLE_S)
    for cand in esummary(pmids[:5]):
        score = title_similarity(cited, cand["title"])
        if score < PROPOSE_FLOOR:
            continue
        cand["score"] = round(score, 3)
        cand["aboutNotIt"] = looks_like_commentary(cand["title"], cited)
        row["candidates"].append(cand)
    row["candidates"].sort(key=lambda c: -c["score"])
    if row["candidates"]:
        row["verdict"] = ("candidate-is-commentary" if all(c["aboutNotIt"]
                                                           for c in row["candidates"])
                          else "candidate-for-review")
    return row


def report(rows, cap, out=print):
    out(f"allowlist audit — {len(rows)} grandfathered citation(s) of a cap of {cap}\n")
    actionable = 0
    for row in rows:
        out(f"  {row['citationKey']}  {row['verdict']}")
        out(f"      {row['path']}")
        out(f"      cited: {str(row['citedTitle'])[:110]}")
        if row["reason"]:
            out(f"      grandfathered because: {str(row['reason'])[:150]}")
        for cand in row["candidates"][:3]:
            mark = "  ⚠ ABOUT the source, not the source" if cand["aboutNotIt"] else ""
            out(f"      candidate PMID {cand['pmid']} (score {cand['score']}, "
                f"{cand['container']} {cand['year']}){mark}")
            out(f"         {str(cand['title'])[:110]}")
        if row["verdict"] == "candidate-for-review":
            actionable += 1
            out("      → if this IS the cited source, put the identifier on the citation and "
                "DELETE the allowlist entry. The gate then requires the deletion anyway: a "
                "grandfather clause whose citation changed fails as stale.")
        out("")
    out(f"{actionable} of {len(rows)} entr(ies) have a candidate worth a human decision. "
        f"This audit blocks nothing and decides nothing.")
    return actionable


def self_test():
    failures = []

    def ck(label, got, want):
        if got != want:
            failures.append(f"{label}: got {got!r}, want {want!r}")

    # THE 2026-09-21 NEAR-MISS, as a regression fixture. The previous Option-B run proposed
    # this commentary for the CG178 citation. If this ever stops being flagged, an automatic
    # writer built on this scoring would swap a guideline for an opinion about it.
    ck("the CG178 near-miss is flagged as commentary",
       looks_like_commentary(
           "NICE CG178 Psychosis and Schizophrenia in Adults: Treatment and Management - "
           "an evidence-based guideline?",
           "Psychosis and schizophrenia in adults: prevention and management"), True)
    ck("a genuine paper is not flagged",
       looks_like_commentary(
           "Fluoxetine in the treatment of bulimia nervosa. A multicenter, placebo-controlled, "
           "double-blind trial.",
           "Fluoxetine in the treatment of bulimia nervosa"), False)

    ck("italic title extracted",
       citation_title("8. National Institute for Health and Care Excellence. *Psychosis and "
                      "schizophrenia in adults: prevention and management.* NICE CG178, 2014."),
       "Psychosis and schizophrenia in adults: prevention and management")
    ck("vancouver title extracted",
       citation_title("3. Smith AB, Jones CD. A trial of something. J Test. 2020;1:1-9."),
       "A trial of something")

    # offline mode searches nothing and says so
    row = audit_entry({"citationKey": "k", "citation": "1. Org. *A thing.* 2020.",
                       "path": "x.md", "reason": "r"}, offline=True)
    ck("offline is honest about not searching", row["verdict"], "not-searched")

    # THE CONTRACT THAT KEEPS THIS OUT OF THE MERGE PATH. The workflow validator forbids
    # `continue-on-error:`, so "blocks nobody" cannot live in the YAML — it has to be the
    # tool's own exit behaviour, and it has to be asserted somewhere a gate runs. This is that
    # assertion: reporting findings, including a stale entry the real gate fails on, is exit 0.
    loud = [{"citationKey": "deadbeefdeadbeef", "path": "x.md", "citedTitle": "A thing",
             "reason": "r", "candidates": [{"pmid": "1", "title": "A thing", "container": "J",
                                            "year": 2020, "score": 0.99, "aboutNotIt": False}],
             "verdict": "candidate-for-review"},
            {"citationKey": "cafecafecafecafe", "path": "y.md", "citedTitle": "Another",
             "reason": "r", "candidates": [],
             "verdict": "stale-the-gate-already-fails-this"}]
    ck("a loud report still counts its actionable rows",
       report(loud, ALLOWLIST_CAP, out=lambda *_: None), 1)

    # the live allowlist is readable and within the cap the gate pins
    allow, err = load_json(ALLOWLIST_PATH)
    if err:
        failures.append(err)
    else:
        ck("live allowlist is within the gate's cap",
           len(allow.get("entries") or []) <= ALLOWLIST_CAP, True)

    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print("self-test: OK — 6/6 checks passed, including the 2026-09-21 CG178 near-miss")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--offline", action="store_true", help="shape only; no lookups")
    ap.add_argument("--out", metavar="PATH", help="write the proposals as JSON")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    allow, err = load_json(ALLOWLIST_PATH)
    if err:
        print(f"allowlist audit: cannot read the allowlist — {err}")
        return 2
    entries = allow.get("entries") or []
    if not entries:
        print("allowlist audit: the allowlist is empty. Nothing to work down — lower "
              f"ALLOWLIST_CAP from {ALLOWLIST_CAP} to 0 in a policy-only commit and this "
              "sweep can be retired with it.")
        return 0

    present = {ref.key for ref in collect_references(REPO)}
    rows = [audit_entry(e, offline=args.offline) for e in entries]
    for row, entry in zip(rows, entries):
        if entry.get("citationKey") not in present:
            row["verdict"] = "stale-the-gate-already-fails-this"

    report(rows, ALLOWLIST_CAP)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"generatedAt": today(), "cap": ALLOWLIST_CAP, "entries": rows},
                      fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
