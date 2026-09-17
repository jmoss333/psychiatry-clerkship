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

A RATCHETING GATE since 2026-09-16. Before that it exited 1 only on a REWORDED
sentence -- and the pott-2022 defect above is not one. A clause deleted from the
middle of a sentence reassembles from two in-order verbatim runs, so the
classifier calls it EDITED, and nothing gated EDITED: re-shipping the exact
defect this tool was built for exited 0. A wrong --cache path printed
"0 clean ... 49 uncached" and exited 0 too. Now every count is pinned in
bin/verify_spans_baseline.json, the pattern of bin/check_design_drift.py:

  HARD     any REWORDED sentence fails, whatever the baseline says.
  RATCHET  rows_flagged, sentences_truncated, sentences_edited, rows_uncached
           may fall freely; a rise fails; a fall prints a note.
  BROKEN   no baseline, a baseline missing a key, or zero rows carrying a span
           exits 2. A pass over nothing is docs/SILENT_SHRINK_CHECKLIST.md D4.

Exit 0 clean (ratchets at or below baseline), 1 a finding, 2 could not audit.

Needs a local abstract cache because eutils is not reachable from inside the
build sandbox (the agent proxy returns 403), so abstracts are fetched via the
PubMed MCP tool and written to the cache by hand or by a dev script. The cache
is git-tracked, so rows_uncached is deterministic across checkouts and pinnable.

    python3 bin/verify_spans.py                    # the gate (bin/verify.sh runs it)
    python3 bin/verify_spans.py --id pott-2022     # one row; ratchet not evaluated
    python3 bin/verify_spans.py --self-test        # a regression exits 1, the tree exits 0
    python3 bin/verify_spans.py --update-baseline  # LOWER the ratchet after a reviewed reduction

--update-baseline rewrites the pins from the current tree. It locks in a reduction
you made on purpose; it is never for absorbing a rise. The JSON diff is in the PR
and a reviewer reads it. See docs/RATCHETS.md.
"""
import argparse, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ANN = os.path.join(ROOT, "evidence_annotations.json")
CACHE = os.path.join(ROOT, "13_Faculty_Resources", "_automation", "span_audit", "abstract_cache.json")
BASELINE = os.path.join(HERE, "verify_spans_baseline.json")

# The counts the ratchet pins: the four that can rise as a defect. rows_clean and
# rows_audited are printed, not pinned -- deleting an annotation lowers both legitimately
# and shows in that file's own diff (validate_evidence_annotations.py's orphan check gates
# a source that loses its row); the wrong-cache collapse is a rise in rows_uncached. A
# COVERAGE floor on rows_audited (fail when it FALLS) would be the inverse ratchet and is a
# deliberate follow-up, not a first-cut feature: see docs/RATCHETS.md. sentences_reworded
# is reported and hard-floored at zero, so it needs no pin.
RATCHET_KEYS = ("rows_flagged", "sentences_truncated", "sentences_edited", "rows_uncached")
UPDATE_HINT = "python3 bin/verify_spans.py --update-baseline"

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

# ---------------------------------------------------------------- audit (finding logic, unchanged)

def audit(doc, cache, only_id=None):
    """Classify every stored span. Returns (counts, findings).

    The loop body is the original checker verbatim; only the tallying moved out of
    main() so --self-test can drive it on in-memory fixtures.
    """
    verbatim = paraphrase = uncached = audited = 0
    findings = []
    for sid, row in rows(doc):
        if only_id and sid != only_id:
            continue
        va = row.get("verifiedAgainst") or {}
        pmid, span = str(va.get("pmid") or ""), va.get("sourceSpan") or ""
        if not span:
            continue
        audited += 1
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

    n_para = n_trunc = n_edit = 0
    for f in findings:
        for b in f["bad"]:
            if b["kind"] == "PARAPHRASE":
                n_para += 1
            elif b["kind"] == "TRUNCATED":
                n_trunc += 1
            else:
                n_edit += 1
    counts = {
        "rows_audited": audited, "rows_clean": verbatim, "rows_flagged": paraphrase,
        "sentences_reworded": n_para, "sentences_truncated": n_trunc,
        "sentences_edited": n_edit, "rows_uncached": uncached,
    }
    return counts, findings


_RANK = {"PARAPHRASE": 0, "TRUNCATED": 1, "EDITED": 2}


def report(findings, out=print):
    """Print every flagged row exactly as before. Readers are told to READ these
    lines (CLAUDE.md); the summary line may change, these may not."""
    for f in sorted(findings, key=lambda x: min(_RANK[b["kind"]] for b in x["bad"])):
        kinds = {b["kind"] for b in f["bad"]}
        worst = "PARAPHRASE" if "PARAPHRASE" in kinds else ("TRUNCATED" if "TRUNCATED" in kinds else "EDITED")
        out(f"{worst:<11} {f['sourceId']:<34} pmid {f['pmid']:<10} "
            f"{len(f['bad'])} of {f['n_sent']} sentence(s)")
        for b in f["bad"]:
            cut = b["matched_chars"]
            out(f"    [{b['kind']}] stored: {b['sentence'][:150]}")
            out(f"    diverges after {cut} chars: ...{b['sentence'][max(0,cut-45):cut+60]}...")
        out("")


# ---------------------------------------------------------------- ratchet
# The pattern of bin/check_design_drift.py: a committed JSON pins each count, a rise
# fails, a fall is a note, --update-baseline lowers the pin. Two deliberate departures:
# a baseline missing a key is an ERROR rather than an unpinned key (deleting one line of
# JSON must not retire a ratchet silently), and an empty audit is exit 2, not a pass.

def load_baseline(path):
    """(counts, None) or (None, error)."""
    rel = os.path.relpath(path, ROOT)
    if not os.path.exists(path):
        return None, f"no baseline at {rel} -- run `{UPDATE_HINT}` (reviewed) to pin one"
    try:
        with open(path, encoding="utf-8") as fh:
            counts = json.load(fh).get("counts") or {}
    except (OSError, ValueError, AttributeError) as e:
        return None, f"baseline {rel} unreadable: {e}"
    missing = [k for k in RATCHET_KEYS if not isinstance(counts.get(k), int)]
    if missing:
        return None, (f"baseline {rel} does not pin {', '.join(missing)} -- "
                      f"run `{UPDATE_HINT}` (reviewed) to pin every key")
    return {k: counts[k] for k in RATCHET_KEYS}, None


def write_baseline(path, counts):
    payload = {
        "_note": "Pinned by bin/verify_spans.py. Counts may fall, never rise. Regenerate with "
                 "--update-baseline as part of a reviewed reduction, never to absorb a rise -- "
                 "the diff is in the PR. See docs/RATCHETS.md.",
        "counts": {k: counts[k] for k in RATCHET_KEYS},
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
        fh.write("\n")


def compare(counts, baseline):
    """Per key: a rise fails, a fall is a note. Keys are independent, so an
    improvement in one never pays for a regression in another."""
    fails, notes = [], []
    for key in RATCHET_KEYS:
        was, now = baseline[key], counts[key]
        if now > was:
            fails.append(f"R  {key} rose {was} -> {now}. The baseline exists so this number only "
                         f"goes down: fix the span from the paper's own words (or cache the "
                         f"abstract); do not re-pin.")
        elif now < was:
            notes.append(f"R  {key} improved {was} -> {now} -- run `{UPDATE_HINT}` to lock the gain in.")
    return fails, notes


def gate(doc, cache, baseline, only_id=None, out=print):
    """The whole exit contract, in-process so --self-test can drive it.
    0 clean, 1 a finding (hard or ratchet), 2 could not audit."""
    counts, findings = audit(doc, cache, only_id)
    report(findings, out)
    if counts["rows_audited"] == 0:
        out("span audit: NOTHING AUDITED -- no annotation row carries a sourceSpan"
            + (f" (--id {only_id} matched nothing)" if only_id else "")
            + ". A pass over an empty set is not a pass (docs/SILENT_SHRINK_CHECKLIST.md D4).")
        return 2
    out(f"span audit: {counts['rows_clean']} clean, {counts['rows_flagged']} row(s) flagged "
        f"({counts['sentences_reworded']} REWORDED sentence(s) -- the paper never wrote them; "
        f"{counts['sentences_truncated']} TRUNCATED, {counts['sentences_edited']} EDITED -- "
        f"merely cut), {counts['rows_uncached']} uncached of {counts['rows_audited']} audited")
    fails, notes = [], []
    # Hard floor, unchanged since the tool was written: a sentence the paper never
    # wrote is THE defect, and no baseline may absorb one.
    if counts["sentences_reworded"]:
        fails.append(f"HARD  {counts['sentences_reworded']} REWORDED sentence(s) -- rewrite the "
                     f"span from the paper's own words.")
    if only_id:
        notes.append("ratchet not evaluated: --id is a partial run and the pins cover the whole file")
    elif baseline is None:
        out(f"\nFAIL -- no baseline to ratchet against. Run `{UPDATE_HINT}` (reviewed) and "
            f"commit bin/verify_spans_baseline.json.")
        return 2
    else:
        f, n = compare(counts, baseline)
        fails += f
        notes += n
    for note in notes:
        out("note: " + note)
    if fails:
        out(f"\nFAIL -- {len(fails)} span-audit finding(s):")
        for f in fails:
            out("  - " + f)
        return 1
    # The tally rides on the LAST line on purpose: bin/verify.sh shows only a step's last
    # line, and readers are told to read the counts, not just the PASS.
    c = counts
    tally = (f"{c['rows_clean']} clean, {c['rows_flagged']} flagged ({c['sentences_truncated']} "
             f"TRUNCATED, {c['sentences_edited']} EDITED), {c['rows_uncached']} uncached of "
             f"{c['rows_audited']}")
    out(f"OK -- {tally}; REWORDED 0; "
        + ("single-row report, ratchet not evaluated." if only_id else "ratchets at or below baseline."))
    return 0


# ---------------------------------------------------------------- falsification
# House rule: a guard ships with a paired falsification, or it is not a guard
# (bin/check_vacuity.py). The fixtures are synthetic but SHAPED like the defects.
# _FX_POTT is a sentence with a clause deleted from its MIDDLE -- exactly what
# shipped in pott-2022. It reassembles from two in-order verbatim runs, so the
# classifier calls it EDITED, and the hard REWORDED check cannot see it. Only the
# ratchet can, which is why this self-test asserts the ratchet's exit code and
# not just the classification.

_FX_ABSTRACT = (
    "We pooled twelve trials of the intervention in the primary analysis (N = 640). "
    "The intervention did not emerge as a differentially effective treatment for "
    "comorbid depression and substance use disorders, although it did appear to be "
    "an acceptable option for most participants. "
    "Sensitivity analyses excluding the two open-label trials did not change these "
    "conclusions."
)
_FX_S1 = "We pooled twelve trials of the intervention in the primary analysis (N = 640)."
_FX_S2 = ("The intervention did not emerge as a differentially effective treatment for "
          "comorbid depression and substance use disorders, although it did appear to be "
          "an acceptable option for most participants.")
_FX_S3 = ("Sensitivity analyses excluding the two open-label trials did not change these "
          "conclusions.")
_FX_POTT = _FX_S2.replace(" for comorbid depression and substance use disorders", "")
_FX_TRUNC = "Sensitivity analyses excluding the two open-label trials did not change."
_FX_REWORD = "The intervention was clearly more effective than control for depression outcomes."
_FX_CACHE = {"1": _FX_ABSTRACT}


def _fx(**spans):
    """An annotations doc whose rows are {sid: (pmid, sourceSpan)}."""
    return {"annotations": {sid: {"verifiedAgainst": {"pmid": pmid, "sourceSpan": span}}
                            for sid, (pmid, span) in spans.items()}}


def self_test() -> int:
    import tempfile
    checks = []

    def expect(label, cond):
        checks.append((label, bool(cond)))

    def run(doc, cache, baseline, only_id=None):
        lines = []
        rc = gate(doc, cache, baseline, only_id=only_id, out=lines.append)
        return rc, "\n".join(lines)

    zero = {k: 0 for k in RATCHET_KEYS}
    generous = {k: 5 for k in RATCHET_KEYS}

    # 1. a verbatim span against a zero baseline is clean
    rc, out = run(_fx(clean=("1", _FX_S1 + " " + _FX_S2)), _FX_CACHE, zero)
    expect("verbatim span vs zero baseline exits 0", rc == 0 and "OK" in out)

    # 2. THE pott-2022 shape: clause deleted mid-sentence -> EDITED -> ratchet fails
    rc, out = run(_fx(pott=("1", _FX_POTT)), _FX_CACHE, zero)
    expect("pott-2022 shape classifies as EDITED (not REWORDED)",
           "[EDITED]" in out and "[PARAPHRASE]" not in out)
    expect("pott-2022 shape raises sentences_edited and exits 1",
           rc == 1 and "sentences_edited rose 0 -> 1" in out)

    # 2b. a rise in one key fails even when another key improved
    rc, out = run(_fx(pott=("1", _FX_POTT)), _FX_CACHE,
                  dict(zero, rows_flagged=1, sentences_truncated=4))
    expect("a rise fails even alongside an improvement", rc == 1 and "sentences_edited rose" in out)

    # 3. the same defect against a baseline that pins it exits 0: the exit is baseline-driven
    rc, out = run(_fx(pott=("1", _FX_POTT)), _FX_CACHE, dict(zero, rows_flagged=1, sentences_edited=1))
    expect("pinned EDITED count exits 0 (exit is baseline-driven)", rc == 0 and "FAIL" not in out)

    # 4. REWORDED is a hard floor: no baseline can absorb it
    rc, out = run(_fx(re=("1", _FX_REWORD)), _FX_CACHE, generous)
    expect("a REWORDED sentence exits 1 regardless of baseline", rc == 1 and "REWORDED" in out)

    # 5. an uncached pmid is a rise in rows_uncached -- the wrong-cache silent pass is closed
    rc, out = run(_fx(unc=("999", _FX_S1)), _FX_CACHE, zero)
    expect("uncached row raises rows_uncached and exits 1", rc == 1 and "rows_uncached rose 0 -> 1" in out)

    # 6. a truncated sentence is a rise in sentences_truncated
    rc, out = run(_fx(tr=("1", _FX_TRUNC)), _FX_CACHE, zero)
    expect("truncated sentence raises sentences_truncated and exits 1",
           rc == 1 and "[TRUNCATED]" in out and "sentences_truncated rose 0 -> 1" in out)

    # 7. a fall is a note naming the lowering command, never a failure
    rc, out = run(_fx(clean=("1", _FX_S1)), _FX_CACHE, dict(zero, rows_flagged=2, sentences_edited=3))
    expect("a fall exits 0 with a note naming --update-baseline",
           rc == 0 and "improved" in out and "--update-baseline" in out)

    # 8. no baseline is a broken run, not a pass
    rc, out = run(_fx(clean=("1", _FX_S1)), _FX_CACHE, None)
    expect("missing baseline exits 2", rc == 2 and "--update-baseline" in out)

    # 8b. a baseline missing a key cannot silently un-pin that key
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "b.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump({"counts": {"rows_flagged": 1}}, fh)
        counts, err = load_baseline(p)
        expect("baseline missing a key is an error naming the key",
               counts is None and err and "sentences_truncated" in err)
        counts, err = load_baseline(os.path.join(td, "absent.json"))
        expect("absent baseline path is an error", counts is None and bool(err))

    # 9. nothing audited is a broken run, not a pass (SILENT_SHRINK D4)
    rc, out = run({"annotations": {"nospan": {"verifiedAgainst": {"pmid": "1"}}}}, _FX_CACHE, zero)
    expect("zero audited rows exits 2", rc == 2 and "NOTHING AUDITED" in out)

    # --id is a partial run: the ratchet is skipped, the hard floor is not
    rc, out = run(_fx(pott=("1", _FX_POTT)), _FX_CACHE, None, only_id="pott")
    expect("--id skips the ratchet", rc == 0 and "ratchet not evaluated" in out)
    rc, out = run(_fx(re=("1", _FX_REWORD)), _FX_CACHE, None, only_id="re")
    expect("--id keeps the REWORDED hard floor", rc == 1)

    # 10. the LIVE tree agrees with the committed baseline. This is what makes
    # `--self-test` alone certify that the pin is current.
    doc = json.load(open(ANN, encoding="utf-8"))
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    baseline, err = load_baseline(BASELINE)
    rc, out = run(doc, cache, baseline)
    expect("live evidence_annotations.json vs committed baseline exits 0 "
           "(if not: run the gate to see which count moved)", err is None and rc == 0)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--id", help="audit a single sourceId (report only; the ratchet is not evaluated)")
    ap.add_argument("--cache", default=CACHE)
    ap.add_argument("--update-baseline", action="store_true",
                    help="rewrite bin/verify_spans_baseline.json from the current tree "
                         "(reviewed reductions only -- the diff is in the PR)")
    ap.add_argument("--self-test", action="store_true",
                    help="prove a synthetic regression exits 1 and the live tree exits 0")
    args = ap.parse_args()
    if args.self_test:
        return self_test()

    doc = json.load(open(ANN, encoding="utf-8"))
    cache = json.load(open(args.cache, encoding="utf-8")) if os.path.exists(args.cache) else {}
    if args.update_baseline:
        counts, _ = audit(doc, cache)
        write_baseline(BASELINE, counts)
        print(f"baseline written to {os.path.relpath(BASELINE, ROOT)}: "
              + ", ".join(f"{k}={counts[k]}" for k in RATCHET_KEYS))
    baseline = None
    if not args.id:
        baseline, err = load_baseline(BASELINE)
        if err:
            print(f"FAIL -- {err}")
            return 2
    return gate(doc, cache, baseline, only_id=args.id)


if __name__ == "__main__":
    sys.exit(main())
