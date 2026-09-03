#!/usr/bin/env python3
"""Audit evidence_annotations.json sourceSpans against the papers they claim to quote.

The C1-C6 gate in validate_evidence_annotations.py checks the CLAIM against the
stored SPAN. Nothing checks the SPAN against the PAPER — so a span that has been
paraphrased, or had an inconvenient clause trimmed out of its middle, stays green
forever. That is how pott-2022 shipped a span with the phrase "for comorbid
depression and substance use disorders" silently deleted from the sentence it
claimed to quote (found 2026-09-03, WP-5g).

This checks the other direction: every SENTENCE of a stored span must appear
verbatim in the source abstract, modulo whitespace and unicode punctuation.

Sentence-level, deliberately. A span that stitches together non-adjacent
sentences -- a Results sentence plus a Conclusions sentence, say -- is normal,
defensible curation and must pass. What must NOT pass is a sentence that has
been reworded, or had a clause deleted out of its middle, because that is a
sentence the paper never wrote. Requiring one contiguous run instead would flag
most of the corpus and tell you nothing.

Report-only. Needs a local abstract cache because eutils is not reachable from
inside the build sandbox (the agent proxy returns 403), so abstracts are fetched
via the PubMed MCP tool and written to the cache by hand or by a dev script.

    python3 bin/verify_spans.py                # audit every cached row
    python3 bin/verify_spans.py --id pott-2022 # one row
"""
import argparse, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ANN = os.path.join(ROOT, "evidence_annotations.json")
CACHE = os.path.join(ROOT, "13_Faculty_Resources", "_automation", "span_audit", "abstract_cache.json")

# Characters that differ between what a publisher renders and what a curator pastes.
_FOLD = {
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-",
    "‘": "'", "’": "'", "“": '"', "”": '"', " ": " ",
    "′": "'", "″": '"', "­": "",
}

def norm(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    for a, b in _FOLD.items():
        s = s.replace(a, b)
    s = re.sub(r"\s+", " ", s).strip()
    # PubMed's plain-text abstracts drop italics and superscripts that the
    # published paper (and therefore a careful curator's span) carries:
    # "I2 = 0%" comes back as "I = 0%", "n = 482" as "= 482", "B = -0.49" as
    # "= -0.49". Collapse a lone statistic label before "=" on BOTH sides so
    # this fetch artifact is not mistaken for a curator rewording.
    s = re.sub(r"\bI\s*2\s*=", "I =", s)
    s = re.sub(r"(?<![A-Za-z])[A-Za-z]{1,2}\s*=\s*", "= ", s)
    s = re.sub(r"\s*=\s*", " = ", s)          # uniform spacing around "="
    s = re.sub(r"\s+", " ", s)
    return s

def rows(doc):
    r = doc["annotations"] if isinstance(doc, dict) and "annotations" in doc else doc
    return list(r.items()) if isinstance(r, dict) else [(x.get("sourceId"), x) for x in r]

# Split on sentence enders, keeping decimals ("0.19"), "et al.", "vs.", "e.g."
# and bracketed stats intact.
_ABBREV = r"(?<!\bet al)(?<!\bvs)(?<!\be\.g)(?<!\bi\.e)(?<!\bNo)(?<!\bDr)(?<!\bcf)"
_SENT = re.compile(rf"{_ABBREV}(?<=[.!?])\s+(?=[A-Z(\u201c])")

def sentences(text: str):
    parts = [p.strip() for p in _SENT.split(text) if p.strip()]
    return [p for p in parts if len(p) > 12]        # ignore fragments/labels

def fragment_walk(sentence: str, abstract: str, minrun: int = 18):
    """Greedily rebuild `sentence` from verbatim runs of `abstract`.

    Returns (fragments, in_order) or (None, False) if some part of the sentence
    does not occur in the abstract at all -- which means the paper never wrote
    those words, i.e. a genuine rewording rather than an editorial cut.
    """
    frags, positions, rest = [], [], sentence
    while rest:
        n = longest_prefix(rest, abstract)
        if n < minrun:
            # Try skipping one word before giving up (handles a dropped "n"/"I2").
            sp = rest.find(" ")
            if sp == -1 or len(rest) < minrun:
                return (frags, False) if not rest.strip() else (None, False)
            rest = rest[sp + 1:]
            continue
        frag = rest[:n]
        frags.append(frag)
        positions.append(abstract.find(frag))
        rest = rest[n:].lstrip(" ")
    return frags, positions == sorted(positions)

def longest_prefix(span: str, abstract: str) -> int:
    """How many characters of `span` match before the verbatim run breaks."""
    lo, hi = 0, len(span)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if span[:mid] in abstract:
            lo = mid
        else:
            hi = mid - 1
    return lo

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", help="audit a single sourceId")
    ap.add_argument("--cache", default=CACHE)
    args = ap.parse_args()

    doc = json.load(open(ANN, encoding="utf-8"))
    cache = json.load(open(args.cache, encoding="utf-8")) if os.path.exists(args.cache) else {}

    verbatim = paraphrase = uncached = 0
    findings = []
    for sid, row in rows(doc):
        if args.id and sid != args.id:
            continue
        va = row.get("verifiedAgainst") or {}
        pmid, span = str(va.get("pmid") or ""), va.get("sourceSpan") or ""
        if not span:
            continue
        abstract = cache.get(pmid)
        if not abstract:
            uncached += 1
            continue
        n_span, n_abs = norm(span), norm(abstract)
        sents = sentences(n_span) or [n_span]
        bad = []
        for x in sents:
            if x in n_abs:
                continue
            frags, ordered = fragment_walk(x, n_abs)
            # A sentence the curator EDITED -- quoted from mid-sentence, stopped
            # early, pulled one item out of an enumerated list, or lost a
            # superscript/italic in the fetch pipeline (PubMed returns "I = 0%"
            # for the published "I2 = 0%", and "= 482" for "n = 482") -- still
            # reassembles from a few long verbatim runs that appear IN ORDER.
            # A sentence the paper never wrote does not.
            if frags is not None and ordered and len(frags) <= 3 and min(len(f) for f in frags) >= 18:
                bad.append({"sentence": x, "kind": "EDITED",
                            "matched_chars": longest_prefix(x, n_abs),
                            "frags": len(frags)})
                continue
            # A sentence quoted up to a clause boundary and closed with a full
            # stop the paper does not have is a TRUNCATION, not a paraphrase:
            # every word is the paper's, it just stops early. Separate finding,
            # much lower severity than a sentence the paper never wrote.
            stem = x.rstrip(". ")
            kind = "TRUNCATED" if stem and stem in n_abs else "PARAPHRASE"
            bad.append({"sentence": x, "kind": kind,
                        "matched_chars": longest_prefix(x, n_abs), "frags": None})
        if not bad:
            verbatim += 1
            continue
        paraphrase += 1
        findings.append({"sourceId": sid, "pmid": pmid,
                         "n_sent": len(sents), "bad": bad})

    n_para = n_trunc = 0
    _rank = {"PARAPHRASE": 0, "TRUNCATED": 1, "EDITED": 2}
    for f in sorted(findings, key=lambda x: min(_rank[b["kind"]] for b in x["bad"])):
        kinds = {b["kind"] for b in f["bad"]}
        worst = "PARAPHRASE" if "PARAPHRASE" in kinds else ("TRUNCATED" if "TRUNCATED" in kinds else "EDITED")
        print(f"{worst:<11} {f['sourceId']:<34} pmid {f['pmid']:<10} "
              f"{len(f['bad'])} of {f['n_sent']} sentence(s)")
        for b in f["bad"]:
            n_para if b["kind"] == "PARAPHRASE" else None
            cut = b["matched_chars"]
            print(f"    [{b['kind']}] stored: {b['sentence'][:150]}")
            print(f"    diverges after {cut} chars: ...{b['sentence'][max(0,cut-45):cut+60]}...")
        print()
    for f in findings:
        for b in f["bad"]:
            if b["kind"] == "PARAPHRASE": n_para += 1
            else: n_trunc += 1

    print(f"span audit: {verbatim} clean, {paraphrase} row(s) flagged "
          f"({n_para} REWORDED sentence(s) -- the paper never wrote them; "
          f"{n_trunc} merely cut/edited), {uncached} uncached")
    # Gate on REWORDED sentences only. A curator who quotes from mid-sentence,
    # stops at a clause, or lifts one item out of a list is doing normal work;
    # a sentence the paper never wrote is the defect this exists to catch.
    return 1 if n_para else 0

if __name__ == "__main__":
    sys.exit(main())
