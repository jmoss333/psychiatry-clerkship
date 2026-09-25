#!/usr/bin/env python3
"""Does a newer paper still say what a stored claim says it says — same direction, same numbers, same words?

WHY. `bin/check_source_integrity.py` now reports when a source that licenses a stored
claim has been superseded (a Cochrane review moving from pub3 to pub4, say). That is
"here is a new paper". The question faculty actually have is "does the new paper reverse
something we teach?" — and answering it by hand means opening the abstract, finding the
sentence the claim rests on, and reading its direction. This tool does the mechanical
part of that read so the human reads a verdict with the evidence attached, not a DOI.

WHAT IT CHECKS, per claim in `evidence_annotations.json` for the source:
  · SPAN SURVIVAL — does each sentence of the stored `sourceSpan` appear verbatim in the
    newer abstract? A span that survives whole is the strongest possible "nothing moved".
  · DIRECTION — the sentences of the newer abstract that carry the claim's `claimTerms`
    are classified positive / negative / unclear with the SAME null/negative marker list
    `validate_evidence_annotations.py`'s C5 gate uses (imported, not copied), plus a small
    positive list. The verdict compares that to the claim's stored `direction`:
      consistent    the located sentences agree with the stored direction
      contradicts   a located sentence carries the opposite direction — read it
      unlocated     no sentence in the newer abstract carries the claim's terms — the
                    claim's subject may have been dropped, which is its own finding
      unclear       located, but the sentence carries no directional marker
  · NUMBERS — the statistics quoted in `claimText` (C3's token rule) are present in the
    newer abstract, or named as missing.

It is ADVISORY (exit 0), routed to a human like every dock finding; `--strict` exits 1 on
any `contradicts` or `unlocated` verdict for scripting. It never edits the annotation,
the registry, or a page. Classification by marker is deliberately crude and says so in
its output: the verdict tells the reader WHERE to look and what the machine thinks it
saw; the reader decides.

MODES
  --source-id ID --newer-doi DOI | --newer-pmid PMID     fetch the newer abstract (Europe PMC)
  --source-id ID --abstract-file PATH                    compare against a saved abstract (offline)
  --json / --out FILE                                    machine-readable report
  --self-test                                            prove each verdict can fire and stays silent
                                                         on the good case; no network

EXIT CODES. 0 report produced (any verdict); 1 only with --strict and a contradicts /
unlocated verdict; 2 could not determine (unknown source, no claims, abstract unreachable
or empty, unparseable inputs). Never a verdict over an empty abstract.
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANNOTATIONS = ROOT / "evidence_annotations.json"
VALIDATOR = ROOT / "13_Faculty_Resources" / "_automation" / "validate_evidence_annotations.py"

UA = "clerkship-claim-direction/1.0 (+https://github.com/jmoss333/psychiatry-clerkship; education)"
EUROPEPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
TIMEOUT_S = 25

# Phrases authors use when a result HELD. Conservative on purpose; anything else is "unclear".
POSITIVE_MARKERS = (
    "beneficial effect",
    "evidence of benefit",
    "improved",
    "improves",
    "improvement in",
    "reduced the risk",
    "reduction in",
    "superior to",
    "more effective",
    "effective in",
    "significantly greater",
    "significantly lower",
    "significantly reduced",
    "support the conclusion",
    "supports the use",
    "favoured",
    "favored",
)


class DirectionError(RuntimeError):
    """The comparison could not be made. Never a verdict."""


def _negative_markers():
    """C5's own list, loaded from the validator so the two can never drift apart."""
    spec = importlib.util.spec_from_file_location("validate_evidence_annotations", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return tuple(module.NEGATIVE_MARKERS)


try:
    NEGATIVE_MARKERS = _negative_markers()
except Exception:  # noqa: BLE001 - a tool that cannot find the shared list must not invent one
    NEGATIVE_MARKERS = None


# ---------------------------------------------------------------------------------------
# Pure logic. No network below this line until the collectors.
# ---------------------------------------------------------------------------------------

def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def sentences(text: str) -> list[str]:
    """Split on sentence ends, keeping decimals (RR 0.66) and abbreviations (vs.) intact."""
    text = re.sub(r"\s+", " ", text or "").strip()
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", text)
    return [p.strip() for p in parts if p.strip()]


def numeric_tokens(text: str) -> set[str]:
    """Statistics only — the same rule as validate_evidence_annotations C3."""
    toks = set(re.findall(r"\d+(?:\.\d+)?%?", text or ""))
    return {t for t in toks if not re.fullmatch(r"(19|20)\d{2}", t)}


def sentence_direction(sentence: str) -> tuple[str, str | None]:
    """positive | negative | unclear, plus the marker that decided it."""
    if NEGATIVE_MARKERS is None:
        raise DirectionError("C5 marker list unavailable (validate_evidence_annotations.py not found)")
    s = normalise(sentence)
    for m in NEGATIVE_MARKERS:
        if m in s:
            return "negative", m
    for m in POSITIVE_MARKERS:
        if m in s:
            return "positive", m
    return "unclear", None


def span_survival(span: str, abstract: str) -> dict:
    norm_abs = normalise(abstract)
    rows = []
    for sent in sentences(span):
        rows.append({"sentence": sent, "verbatim": normalise(sent) in norm_abs})
    kept = sum(1 for r in rows if r["verbatim"])
    return {
        "sentences": len(rows),
        "verbatim": kept,
        "status": "all" if rows and kept == len(rows) else ("none" if kept == 0 else "partial"),
        "rows": rows,
    }


def locate(claim: dict, abstract: str) -> list[dict]:
    """Sentences of the newer abstract that carry any claimTerm; if none carry a term, the
    sentences that carry any statistic the claim quotes (a renamed outcome still has its
    number)."""
    terms = [normalise(t) for t in (claim.get("claimTerms") or []) if normalise(t)]
    numbers = numeric_tokens(claim.get("claimText", ""))
    by_term, by_number = [], []
    for sent in sentences(abstract):
        s = normalise(sent)
        hit_terms = [t for t in terms if t in s]
        if hit_terms:
            by_term.append({"sentence": sent, "matchedTerms": hit_terms, "matchedNumbers": sorted(numbers & numeric_tokens(sent))})
            continue
        hit_nums = sorted(numbers & numeric_tokens(sent))
        if hit_nums:
            by_number.append({"sentence": sent, "matchedTerms": [], "matchedNumbers": hit_nums})
    return by_term or by_number


def judge(claim: dict, abstract: str) -> dict:
    stored = claim.get("direction")
    located = locate(claim, abstract)
    out = {
        "claimId": claim.get("claimId"),
        "storedDirection": stored,
        "located": [],
        "numbersMissing": sorted(numeric_tokens(claim.get("claimText", "")) - numeric_tokens(abstract)),
    }
    seen = set()
    for row in located:
        d, marker = sentence_direction(row["sentence"])
        row = {**row, "direction": d, "marker": marker}
        out["located"].append(row)
        seen.add(d)
    if not located:
        out["verdict"] = "unlocated"
        out["why"] = "no sentence in the newer abstract carries any claimTerm or quoted statistic"
        return out
    if stored in ("positive", "negative"):
        opposite = "negative" if stored == "positive" else "positive"
        if opposite in seen:
            out["verdict"] = "contradicts"
            out["why"] = "a located sentence carries the %s direction against a stored %s claim" % (opposite, stored)
            return out
        if stored in seen:
            out["verdict"] = "consistent"
            out["why"] = "located sentence(s) carry the stored %s direction" % stored
            return out
    out["verdict"] = "unclear"
    out["why"] = ("located sentence(s) carry no directional marker" if seen == {"unclear"}
                  else "stored direction %r is not a polarity this check can compare" % stored)
    return out


def compare(annotation: dict, abstract: str, newer: dict | None = None) -> dict:
    if not normalise(abstract):
        raise DirectionError("newer abstract is empty — no verdict over nothing")
    claims = annotation.get("claims") or []
    if not claims:
        raise DirectionError("annotation for %r has no claims" % annotation.get("sourceId"))
    span = (annotation.get("verifiedAgainst") or {}).get("sourceSpan", "")
    report = {
        "schemaVersion": 1,
        "sourceId": annotation.get("sourceId"),
        "storedAgainst": {k: (annotation.get("verifiedAgainst") or {}).get(k) for k in ("pmid", "doi", "retrievedAt")},
        "newer": newer or {},
        "spanSurvival": span_survival(span, abstract),
        "claims": [judge(c, abstract) for c in claims],
        "advisory": "marker-based classification; the located sentences are the evidence, the verdict is a pointer",
    }
    verdicts = [c["verdict"] for c in report["claims"]]
    report["worst"] = ("contradicts" if "contradicts" in verdicts else
                       "unlocated" if "unlocated" in verdicts else
                       "unclear" if "unclear" in verdicts else "consistent")
    return report


def render(r: dict) -> str:
    n = r.get("newer") or {}
    lines = [
        "claim direction: %s — stored against %s (%s), newer %s (%s)" % (
            r["sourceId"], r["storedAgainst"].get("doi") or r["storedAgainst"].get("pmid") or "?",
            r["storedAgainst"].get("retrievedAt") or "?",
            n.get("doi") or n.get("pmid") or "?", n.get("publishedAt") or n.get("source") or "?"),
        "  span survival: %s (%d of %d sentence(s) verbatim in the newer abstract)" % (
            r["spanSurvival"]["status"], r["spanSurvival"]["verbatim"], r["spanSurvival"]["sentences"]),
    ]
    for c in r["claims"]:
        lines.append("  %-12s %s  [stored %s] — %s" % (c["verdict"].upper(), c["claimId"], c["storedDirection"], c["why"]))
        for row in c["located"][:4]:
            lines.append("      · (%s%s) %s" % (row["direction"], " via %r" % row["marker"] if row["marker"] else "",
                                                row["sentence"][:220]))
        if c["numbersMissing"]:
            lines.append("      numbers quoted in the claim but absent from the newer abstract: " + ", ".join(c["numbersMissing"]))
    lines.append("claim direction: %s — %s" % (r["worst"].upper(), r["advisory"]))
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------
# Collectors
# ---------------------------------------------------------------------------------------

def load_annotation(source_id: str, path: Path = ANNOTATIONS) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise DirectionError("cannot read %s: %s" % (path, exc)) from exc
    for ann in data.get("annotations", []):
        if ann.get("sourceId") == source_id:
            return ann
    raise DirectionError("no annotation for source id %r" % source_id)


def strip_abstract_html(text: str) -> str:
    text = re.sub(r"<h4>(.*?)</h4>", r" \1: ", text or "")
    return html.unescape(re.sub(r"<[^>]+>", " ", text))


def fetch_europepmc(doi: str | None = None, pmid: str | None = None) -> dict:
    query = "DOI:%s" % doi if doi else "EXT_ID:%s AND SRC:MED" % pmid
    url = EUROPEPMC + "?" + urllib.parse.urlencode({"query": query, "resultType": "core", "format": "json"})
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            payload = json.loads(r.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise DirectionError("Europe PMC unreachable or unparseable: %s" % exc) from exc
    results = (payload.get("resultList") or {}).get("result") or []
    if not results:
        raise DirectionError("Europe PMC has no record for %s" % (doi or pmid))
    hit = results[0]
    abstract = strip_abstract_html(hit.get("abstractText") or "")
    if not normalise(abstract):
        raise DirectionError("Europe PMC record %s carries no abstract" % (doi or pmid))
    return {"doi": hit.get("doi"), "pmid": hit.get("pmid"), "title": hit.get("title"),
            "publishedAt": hit.get("firstPublicationDate"), "source": "europepmc:rest:search?resultType=core",
            "abstract": abstract}


# ---------------------------------------------------------------------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source-id", help="registry / annotation source id")
    ap.add_argument("--newer-doi")
    ap.add_argument("--newer-pmid")
    ap.add_argument("--abstract-file", type=Path, help="offline: a file holding the newer abstract text")
    ap.add_argument("--annotations", type=Path, default=ANNOTATIONS)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--strict", action="store_true", help="exit 1 on contradicts / unlocated")
    ap.add_argument("--self-test", action="store_true",
                    help="prove each verdict can fire and stays silent on the good case; no network")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()
    if not args.source_id or not (args.newer_doi or args.newer_pmid or args.abstract_file):
        print("claim direction: need --source-id and one of --newer-doi / --newer-pmid / --abstract-file", file=sys.stderr)
        return 2
    try:
        ann = load_annotation(args.source_id, args.annotations)
        if args.abstract_file:
            try:
                abstract = args.abstract_file.read_text(encoding="utf-8")
            except OSError as exc:
                raise DirectionError("cannot read %s: %s" % (args.abstract_file, exc)) from exc
            newer = {"source": "file:%s" % args.abstract_file.name, "doi": args.newer_doi, "pmid": args.newer_pmid}
        else:
            newer = fetch_europepmc(doi=args.newer_doi, pmid=args.newer_pmid)
            abstract = newer.pop("abstract")
        report = compare(ann, abstract, newer)
    except DirectionError as exc:
        print("claim direction: COULD NOT DETERMINE — %s" % exc, file=sys.stderr)
        return 2
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps({**report, "abstract": abstract}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True) if args.json else render(report))
    if args.strict and report["worst"] in ("contradicts", "unlocated"):
        return 1
    return 0


# ---------------------------------------------------------------------------------------

def self_test() -> int:
    import tempfile

    checks: list[tuple[str, bool]] = []

    def expect(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))

    expect("C5 marker list is the validator's own, not a copy", NEGATIVE_MARKERS is not None and "no significant difference" in NEGATIVE_MARKERS)
    expect("sentences: decimals and abbreviations do not split",
           sentences("RR 0.66 (95% CI 0.59 to 0.74) held. Second sentence here.") ==
           ["RR 0.66 (95% CI 0.59 to 0.74) held.", "Second sentence here."])
    expect("numeric tokens: years excluded, percentages kept",
           numeric_tokens("in 2022, 58% vs 35%, RR 0.66") == {"58%", "35%", "0.66"})
    expect("direction: negative marker wins", sentence_direction("We found no significant difference in response.")[0] == "negative")
    expect("direction: positive marker", sentence_direction("SSRIs showed a beneficial effect on response.")[0] == "positive")
    expect("direction: neither is unclear", sentence_direction("We searched three databases.")[0] == "unclear")

    span = ("For the primary outcome of treatment response, we found evidence of beneficial effect for "
            "selective serotonin reuptake inhibitors (SSRIs) compared with placebo (risk ratio (RR) 0.66, "
            "95% confidence interval (CI) 0.59 to 0.74). This improved symptoms in 58% versus 35%.")
    ann = {"sourceId": "s", "verifiedAgainst": {"sourceSpan": span, "doi": "10.1/pub3", "retrievedAt": "2026-09-16"},
           "claims": [{"claimId": "c1", "direction": "positive",
                       "claimText": "SSRIs had a beneficial effect on treatment response (RR 0.66, 95% CI 0.59 to 0.74), 58% vs 35%.",
                       "claimTerms": ["treatment response", "selective serotonin reuptake inhibitors"]}]}
    same = "Background: PTSD is common. Main results: " + span + " Conclusions: SSRIs are first-line."
    r = compare(ann, same, {"doi": "10.1/pub4"})
    expect("consistent: span survives whole and direction agrees",
           r["worst"] == "consistent" and r["spanSurvival"]["status"] == "all" and r["claims"][0]["numbersMissing"] == [])
    reversed_abs = ("Main results: For the primary outcome of treatment response, we found no significant difference "
                    "between selective serotonin reuptake inhibitors (SSRIs) and placebo (RR 0.98, 95% CI 0.85 to 1.12).")
    r = compare(ann, reversed_abs)
    expect("contradicts: the located sentence carries the opposite direction",
           r["worst"] == "contradicts" and r["claims"][0]["located"][0]["direction"] == "negative")
    expect("contradicts: the span did not survive", r["spanSurvival"]["status"] == "none")
    expect("contradicts: the claim's numbers are named as missing",
           set(r["claims"][0]["numbersMissing"]) >= {"0.66", "58%", "35%"})
    r = compare(ann, "Main results: We included 12 trials of psychotherapy for depression. Outcomes improved.")
    expect("unlocated: no claimTerm and no quoted statistic in the newer abstract", r["worst"] == "unlocated")
    r = compare(ann, "Main results: For the primary outcome of treatment response we report the pooled estimate below.")
    expect("unclear: located by term but no directional marker", r["worst"] == "unclear")
    partial = "Main results: For the primary outcome of treatment response, we found evidence of beneficial effect for selective serotonin reuptake inhibitors (SSRIs) compared with placebo (risk ratio (RR) 0.66, 95% confidence interval (CI) 0.59 to 0.74). Different second sentence."
    expect("span survival: partial when one sentence changed", compare(ann, partial)["spanSurvival"]["status"] == "partial")
    renamed = "Main results: The outcome was renamed but the estimate stands: RR 0.66 (95% CI 0.59 to 0.74) favoured the drug."
    r = compare(ann, renamed)
    expect("locate: falls back to quoted statistics when the terms were renamed",
           r["claims"][0]["located"] and r["claims"][0]["located"][0]["matchedNumbers"] == ["0.59", "0.66", "0.74", "95%"])
    neg_ann = {**ann, "claims": [{**ann["claims"][0], "direction": "negative"}]}
    expect("a stored negative claim against a positive abstract also contradicts",
           compare(neg_ann, same)["worst"] == "contradicts")
    desc_ann = {**ann, "claims": [{**ann["claims"][0], "direction": "descriptive"}]}
    expect("a descriptive claim is never judged contradicted, only located",
           compare(desc_ann, reversed_abs)["worst"] == "unclear")
    try:
        compare(ann, "   ")
        expect("empty abstract raises, never a verdict", False)
    except DirectionError:
        expect("empty abstract raises, never a verdict", True)
    try:
        compare({"sourceId": "x", "claims": []}, same)
        expect("no claims raises", False)
    except DirectionError:
        expect("no claims raises", True)
    expect("strip_abstract_html turns h4 headings into labels and drops tags",
           strip_abstract_html("<h4>Main results</h4>We <i>found</i> x.").strip() == "Main results:  We  found  x.".replace("  ", " ") or
           "Main results" in strip_abstract_html("<h4>Main results</h4>We <i>found</i> x."))

    # end to end: main() offline with --abstract-file, both exit codes
    with tempfile.TemporaryDirectory() as td:
        annp = Path(td) / "ann.json"; annp.write_text(json.dumps({"annotations": [ann]}))
        absp = Path(td) / "abs.txt"; absp.write_text(same)
        rev = Path(td) / "rev.txt"; rev.write_text(reversed_abs)
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = main(["--source-id", "s", "--abstract-file", str(absp), "--annotations", str(annp)])
        expect("main: consistent → exit 0 and the render says CONSISTENT", code == 0 and "CONSISTENT" in buf.getvalue())
        with contextlib.redirect_stdout(io.StringIO()):
            code = main(["--source-id", "s", "--abstract-file", str(rev), "--annotations", str(annp)])
        expect("main: contradicts is advisory → exit 0 without --strict", code == 0)
        with contextlib.redirect_stdout(io.StringIO()):
            code = main(["--source-id", "s", "--abstract-file", str(rev), "--annotations", str(annp), "--strict"])
        expect("main: --strict turns contradicts into exit 1", code == 1)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = main(["--source-id", "nope", "--abstract-file", str(absp), "--annotations", str(annp)])
        expect("main: unknown source id is exit 2", code == 2)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = main(["--source-id", "s", "--abstract-file", str(Path(td) / "missing.txt"), "--annotations", str(annp)])
        expect("main: unreadable abstract file is exit 2", code == 2)
        out = Path(td) / "r.json"
        with contextlib.redirect_stdout(io.StringIO()):
            main(["--source-id", "s", "--abstract-file", str(absp), "--annotations", str(annp), "--out", str(out)])
        expect("main: --out keeps the abstract beside the report for the reader", "abstract" in json.loads(out.read_text()))

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
