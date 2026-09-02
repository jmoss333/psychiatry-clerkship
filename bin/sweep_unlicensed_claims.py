#!/usr/bin/env python3
"""
sweep_unlicensed_claims.py - find assertions on shipped pages that carry no attribution.

WHY THIS EXISTS
The evidence gate (`evidence_annotations.json` + validate_evidence_annotations.py)
protects every claim that HAS an annotation. It is structurally blind to a sentence
that asserts a finding and was never annotated at all - there is nothing for it to
check. Those are the ones that bite: Q39 on rounds_questions.md states a Cochrane
effect size with no source named anywhere, and was found only by accident while
triaging an unrelated P0.

WHAT IT FLAGS
A line on a page registered in site_manifest.json (i.e. one a learner can actually
read) that (a) asserts something specific - an effect size, a rate, a comparative,
a superlative, a recommendation - and (b) has no attribution within a few lines.

Attribution is read generously: a bracket anchor, a DOI, a PMID, an inline
author-year, or a "Key paper:"/"Evidence:"/"Source:" sibling bullet all count. The
point is not to enforce one citation style; it is to find claims with NOTHING.

WHAT IT IS NOT
Not a validator and not a gate. It cannot tell a wrong claim from a right one - it
tells you where to look. Every hit needs a human read. Expect false positives on
teaching scaffolding ("answer 3 of 5 correctly") and on clinical vignettes.

Usage:
  python3 bin/sweep_unlicensed_claims.py                 # ranked summary
  python3 bin/sweep_unlicensed_claims.py --detail        # every hit with its line
  python3 bin/sweep_unlicensed_claims.py --page PATH     # one page, verbose
  python3 bin/sweep_unlicensed_claims.py --json OUT      # machine-readable
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "site_manifest.json"

# --- what counts as attribution, read generously -----------------------------
ATTRIBUTION = re.compile(
    # anchors are single or multi-reference: [5 ✓] and [27 ✓, 28 ✓]
    r"\[\s*\d+\s*[✓✔](?:\s*,\s*\d+\s*[✓✔])*\s*\]"
    # THE REPO'S OWN CLAIM ANCHOR, and the strongest attribution it has:
    # `[^source-id]` binds one claim to one evidence_registry id, is validated by
    # validate_claim_anchors.py, and is stripped by build_deploy.py so learners
    # never see it. Missing this made a properly anchored page look unsourced.
    r"|\[\^[a-z0-9][a-z0-9-]*\]"
    r"|doi\.org/|\bdoi:|\[DOI\]"                   # DOI in any form
    r"|\bPMID\b"                                   # PMID
    r"|\*\*(?:Key paper|Evidence|Source|Citation|Reference)s?:?\*\*"
    # author-year in every form the library actually uses:
    #   Smith 2024 | Smith et al. (2024) | Smith et al., 2024 | Smith and Jones (2024)
    #   Washington v. Harper (1990)
    r"|\b[A-Z][a-z]{2,}(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+|v\.\s+[A-Z][a-z]+))?[,.]?\s*\(?(?:19|20)\d{2}\b"
    # a named trial is traceable attribution: CATIE, STAR*D, MIND-USA, TREC trials
    r"|\b[A-Z][A-Z0-9*\u2011-]{2,}(?:\s+[A-Z][A-Z0-9*-]+)?\s+(?:trial|study|RCT)s?\b",
    re.I,
)

# --- what counts as an assertion ---------------------------------------------
STAT = re.compile(
    # effect measures. The connector is deliberately loose: "NNT 5", "NNT = 5",
    # "NNT of 5" and "an NNT around 5" are the same claim, and the prose forms are
    # exactly where an unattributed number hides.
    r"\b(?:RR|OR|HR|SMD|NNT|NNH|AUC)\b\s*(?:[=:]|of|around|near|about|approximately)?\s*[\d.]"
    r"|\b95%\s*CI|\bCI\s*[\d.]"                            # confidence intervals
    r"|\bp\s*[<>=]\s*0?\.\d"                               # p values
    r"|\b[nN]\s*=\s*\d"                                    # sample sizes
    r"|\b[dr]\s*=\s*[-\d.]"                                # effect sizes
    r"|\bI²\s*=|\bI2\s*="                             # heterogeneity
    r"|\d+\s*%"                                            # percentages
    r"|per\s+100[\s,]?000"                                 # rates
    r"|\b\d+(?:\.\d+)?[-–]fold\b",
)
COMPARATIVE = re.compile(
    r"\bfirst[- ]line\b|\bsecond[- ]line\b|\bgold standard\b"
    r"|\bmore effective than\b|\bsuperior to\b|\bbetter than\b|\bno better than\b"
    r"|\bthe only\b|\bstrongest\b|\bmost effective\b|\bbest evidence\b"
    r"|\boutperform\w*\b|\bdoubl\w+\b|\bhalv\w+\b"
    r"|\bnot recommended\b|\bis recommended\b|\brecommended over\b"
    r"|\bcontraindicated\b|\bshould not be used\b",
    re.I,
)

# --- lines that look like claims but are not ---------------------------------
NOT_A_CLAIM = re.compile(
    r"^\s{0,3}#{1,6}\s"                       # headings
    r"|^\s*\|?\s*[-:|\s]+\|?\s*$"             # table rules
    r"|^\s*(?:\*|-|\d+\.)\s*$"                # empty bullets
    r"|\b\d+-year-old\b|\bage[ds]?\s+\d+\b"   # vignette ages
    r"|\bWeek\s+\d|\bDay\s+\d|\bBlock\s+\d"   # curriculum scaffolding
    r"|\bpp?\.\s*\d|\bvol\.?\s*\d"            # page/volume numbers
    r"|^\s*\d+\.\s+\*\*Q|^\s*\*\*\d+\.",      # numbered question stems
    re.I,
)
WINDOW = 3  # lines either side that may carry the attribution


def shipped_pages():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    out = []
    for kind in ("md", "tools"):
        for entry in m.get(kind, []):
            if isinstance(entry, list) and entry:
                p = ROOT / entry[0]
                if p.exists() and p.suffix in {".md", ".html"}:
                    out.append((p, entry[2] if len(entry) > 2 else entry[1], kind))
    return out


# An HTML tool is mostly CSS and JS. Sweeping its source matches `width:100%`
# and nothing else - 100% false positives - so strip the machinery and keep the
# prose a learner actually reads. Line numbers then refer to the extracted text,
# which is why --detail prints the sentence rather than only a location.
STYLE_SCRIPT = re.compile(r"<(style|script)\b.*?</\1>", re.I | re.S)
COMMENT = re.compile(r"<!--.*?-->", re.S)
TAG = re.compile(r"<[^>]+>")


MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
BARE_URL = re.compile(r"https?://\S+")
STYLE_ATTR = re.compile(r'\sstyle\s*=\s*"[^"]*"|\sstyle\s*=\s*\'[^\']*\'', re.I)


def visible_text(path):
    raw = path.read_text(encoding="utf-8", errors="ignore")
    raw = COMMENT.sub(" ", STYLE_SCRIPT.sub(" ", raw))
    # Markdown pages embed raw HTML (iframes, figures). Their style attributes are
    # full of `width:100%`, which is not a clinical claim - strip markup from every
    # file type, not just .html.
    raw = STYLE_ATTR.sub(" ", raw)
    # URLs carry percent-encoding (`Episode+126%3A`) that reads as a percentage, and
    # query strings full of digits. Keep markdown link TEXT, drop the target.
    raw = MD_LINK.sub(r"\1", raw)
    raw = BARE_URL.sub(" ", raw)
    if path.suffix.lower() == ".html":
        raw = TAG.sub("\n", raw)
    else:
        raw = TAG.sub(" ", raw)
    return [l.strip() for l in raw.splitlines()]


BIBLIOGRAPHY = re.compile(r"^#{2,4}\s*(?:Sources|References|Bibliography|Citations)\b", re.I)


def sweep_page(path):
    lines = visible_text(path)
    hits = []
    for i, line in enumerate(lines):
        if len(line.strip()) < 25 or NOT_A_CLAIM.search(line):
            continue
        kinds = []
        if STAT.search(line):
            kinds.append("stat")
        if COMPARATIVE.search(line):
            kinds.append("comparative")
        if not kinds:
            continue
        lo, hi = max(0, i - WINDOW), min(len(lines), i + WINDOW + 1)
        if any(ATTRIBUTION.search(l) for l in lines[lo:hi]):
            continue
        hits.append({"line": i + 1, "kinds": kinds, "text": line.strip()[:300]})
    # A page can carry a full bibliography and still leave every individual number
    # untraceable. That is a different defect from having no sources at all, and the
    # memo has to say which one it is.
    has_bib = any(BIBLIOGRAPHY.match(l) for l in lines)
    return hits, has_bib


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--detail", action="store_true")
    ap.add_argument("--page")
    ap.add_argument("--json", dest="json_out")
    args = ap.parse_args(argv)

    pages = shipped_pages()
    if args.page:
        pages = [p for p in pages if args.page in str(p[0])]
        args.detail = True

    results = []
    for path, title, kind in pages:
        hits, has_bib = sweep_page(path)
        if hits:
            results.append({
                "bibliography": has_bib,
                "path": str(path.relative_to(ROOT)),
                "title": title,
                "kind": kind,
                "count": len(hits),
                "stat": sum(1 for h in hits if "stat" in h["kinds"]),
                "hits": hits,
            })
    results.sort(key=lambda r: (-r["stat"], -r["count"]))

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(results, indent=2), encoding="utf-8")

    total = sum(r["count"] for r in results)
    stat_total = sum(r["stat"] for r in results)
    print(f"swept {len(pages)} shipped surfaces; {len(results)} carry unattributed assertions")
    print(f"{total} lines flagged ({stat_total} contain a statistic)\n")
    with_bib = sum(1 for r in results if r["bibliography"])
    print(f"{with_bib} of those pages carry a bibliography - their numbers are")
    print("sourced at page level but not traceable claim by claim.\n")
    print(f"{'stat':>5} {'all':>5} {'bib':>4}  page")
    for r in results:
        print(f"{r['stat']:>5} {r['count']:>5} {'yes' if r['bibliography'] else '  -':>4}  {r['path']}")
        if args.detail:
            for h in r["hits"]:
                print(f"          L{h['line']:<5} [{','.join(h['kinds'])}] {h['text'][:170]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
