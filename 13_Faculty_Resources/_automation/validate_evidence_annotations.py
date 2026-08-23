#!/usr/bin/env python3
"""Gate: every library claim about a paper must be licensed by that paper's own words.

Motivation
----------
On 2026-08-21 an abstract-check pass over 46 curated therapy papers found that 25
annotations (54%) needed amendment and 7 said close to the opposite of what the
paper concluded. Four of those seven were domain anchors. Every one of them had
been written from the title.

This validator makes that class of defect a build failure rather than a periodic
audit. For each claim the library makes about a source, `evidence_annotations.json`
must store the verbatim span from the source (abstract or full text) that licenses
it, plus retrieval provenance. This script then checks, without a network call:

  C1  provenance    - retrievedAt present, well-formed, and not older than maxAgeDays
  C2  identity      - the stored pmid/doi matches the evidence_registry entry
  C3  numbers       - every numeric token asserted in the claim appears in the span
  C4  terms         - every declared claimTerm appears in the span
  C5  inversion     - a span carrying a null/negative finding may not license a
                      claim stated in the positive voice unless the claim carries
                      the negation itself (this is the check that catches the
                      seven contradictions)
  C6  orphans       - every registry source cited by curriculum content has a row

Design notes
------------
* stdlib only, so it runs in CI beside validate_registry_schemas.py
* lexical, not semantic - it is a cheap proxy that fails loudly, not a judge
* the correct response to a C5 failure is usually to rewrite the claim, not to
  add an exemption

Exit codes: 0 clean, 1 findings, 2 usage/IO error.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

ANNOTATIONS = "evidence_annotations.json"
REGISTRY = "evidence_registry.json"

# Phrases that mark a span as reporting a null, negative or sharply hedged finding.
# Deliberately conservative: each is a phrase authors use when a result did NOT hold.
NEGATIVE_MARKERS = (
    "no reliable evidence",
    "no clear evidence",
    "no significant difference",
    "no significant differences",
    "no significant association",
    "no evidence that",
    "not supported",
    "is not supported",
    "did not prove",
    "did not differ",
    "was not significant",
    "were not significant",
    "not superior",
    "no benefit",
    "no effect",
    "does not emerge",
    "if any",
    "insufficient evidence",
    "precluded",
    "no high-quality randomised controlled trials",
    "no high-quality randomized controlled trials",
    "inconclusive",
    "non-significant",
    "nonsignificant",
)

# A claim that carries one of these is already stating the negative and is
# therefore compatible with a negative span.
CLAIM_NEGATION_MARKERS = (
    "no ",
    "not ",
    "null",
    "did not",
    "does not",
    "insufficient",
    "unsupported",
    "fails",
    "failed",
    "absent",
    "if any",
    "no better",
    "acceptable, not",
    "non-significant",
    "nonsignificant",
    "cannot",
    "inconclusive",
)

NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalise(text: str) -> str:
    """Fold case, unicode punctuation and whitespace so spans compare sanely."""
    text = unicodedata.normalize("NFKD", text)
    text = (
        text.replace("‐", "-")
        .replace("‑", "-")
        .replace("‒", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
        .replace("‘", "'")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace(" ", " ")
    )
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def numeric_tokens(text: str) -> set[str]:
    """Numbers as the literature writes them, with trailing zeros trimmed."""
    out = set()
    for raw in NUMBER_RE.findall(text):
        token = raw.replace(",", ".")
        if "." in token:
            token = token.rstrip("0").rstrip(".")
        out.add(token or "0")
    return out


def load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        raise SystemExit(f"{path.name}: MISSING")
    except json.JSONDecodeError as error:
        raise SystemExit(f"{path.name}: INVALID JSON at line {error.lineno}: {error.msg}")


def check_row(row, registry_index, today, max_age_days, findings):
    source_id = row.get("sourceId", "<no sourceId>")
    where = f"{source_id}"

    span = row.get("verifiedAgainst", {})
    raw_span = span.get("sourceSpan", "")
    span_norm = normalise(raw_span)

    # ---- C1 provenance ----
    retrieved = span.get("retrievedAt", "")
    if not DATE_RE.match(retrieved or ""):
        findings.append(f"{where}: C1 provenance - retrievedAt missing or malformed ({retrieved!r})")
    else:
        age = (today - datetime.strptime(retrieved, "%Y-%m-%d").date()).days
        if age > max_age_days:
            findings.append(
                f"{where}: C1 provenance - span retrieved {age} days ago, limit is {max_age_days}; re-pull before shipping"
            )
    if not span.get("sourceEndpoint"):
        findings.append(f"{where}: C1 provenance - sourceEndpoint missing (record where the span came from)")
    if span.get("spanType") not in {"abstract", "fulltext", "conclusion", "guideline-statement"}:
        findings.append(f"{where}: C1 provenance - spanType must be abstract|fulltext|conclusion|guideline-statement")
    if len(span_norm) < 80:
        findings.append(f"{where}: C1 provenance - sourceSpan is too short ({len(span_norm)} chars) to license a claim")

    # ---- C2 identity ----
    entry = registry_index.get(source_id)
    if entry is None:
        findings.append(f"{where}: C2 identity - no matching source in {REGISTRY}")
    else:
        citation = entry.get("citation", {})
        for field in ("pmid", "doi"):
            declared = (span.get(field) or "").strip()
            registered = (citation.get(field) or "").strip()
            if declared and registered and declared.lower() != registered.lower():
                findings.append(
                    f"{where}: C2 identity - {field} mismatch: annotation says {declared!r}, registry says {registered!r}"
                )

    # ---- per-claim checks ----
    claims = row.get("claims") or []
    if not claims:
        findings.append(f"{where}: no claims declared - a source with no claim should not be in the annotation registry")

    span_has_negative = [m for m in NEGATIVE_MARKERS if m in span_norm]

    for position, claim in enumerate(claims, start=1):
        label = f"{where}[claim {position}]"
        text = claim.get("claimText", "")
        text_norm = normalise(text)
        if not text_norm:
            findings.append(f"{label}: claimText is empty")
            continue

        # ---- C3 numbers ----
        missing_numbers = sorted(numeric_tokens(text_norm) - numeric_tokens(span_norm))
        # years and small ordinals are routinely paraphrased; only guard statistics
        missing_numbers = [n for n in missing_numbers if not re.fullmatch(r"(19|20)\d{2}", n)]
        if missing_numbers:
            findings.append(
                f"{label}: C3 numbers - {', '.join(missing_numbers)} asserted in the claim but absent from the stored span"
            )

        # ---- C4 terms ----
        for term in claim.get("claimTerms") or []:
            if normalise(term) not in span_norm:
                findings.append(f"{label}: C4 terms - claimTerm {term!r} does not appear in the stored span")

        # ---- C5 inversion ----
        if span_has_negative:
            claim_is_negative = any(m in text_norm for m in CLAIM_NEGATION_MARKERS)
            if not claim_is_negative and claim.get("direction") != "negative":
                findings.append(
                    f"{label}: C5 inversion - the stored span reports a null/negative finding "
                    f"({span_has_negative[0]!r}) but the claim is stated positively. "
                    "Rewrite the claim to match the paper, or move the claim to a source that supports it."
                )
        if claim.get("direction") not in {"positive", "negative", "mixed", "descriptive"}:
            findings.append(f"{label}: direction must be positive|negative|mixed|descriptive")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=".", help="repository root (default: cwd)")
    parser.add_argument("--max-age-days", type=int, default=730, help="re-pull spans older than this (default: 730)")
    parser.add_argument("--today", default=None, help="override today's date as YYYY-MM-DD (testing)")
    parser.add_argument("--self-test", action="store_true", help="run built-in cases and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    root = Path(args.root)
    annotations = load_json(root / ANNOTATIONS)
    registry = load_json(root / REGISTRY)
    registry_index = {entry["id"]: entry for entry in registry.get("sources", []) if "id" in entry}

    today = date.fromisoformat(args.today) if args.today else date.today()
    findings: list[str] = []

    rows = annotations.get("annotations", [])
    if not rows:
        print(f"{ANNOTATIONS}: no annotations declared", file=sys.stderr)
        return 1

    seen = set()
    for row in rows:
        source_id = row.get("sourceId")
        if source_id in seen:
            findings.append(f"{source_id}: duplicate annotation row")
        seen.add(source_id)
        check_row(row, registry_index, today, args.max_age_days, findings)

    # ---- C6 orphans (ratchet, not a wall) ----
    # Sources that predate this gate are listed in policy.orphanBacklog. A source on
    # that list is reported as a warning; a source NOT on the list fails the build.
    # The list may only shrink - adding to it is the finding, not the fix.
    backlog = set(annotations.get("policy", {}).get("orphanBacklog", []))
    warnings: list[str] = []
    stale_backlog = []
    for source_id, entry in registry_index.items():
        curriculum = entry.get("curriculum") or {}
        if curriculum.get("role") == "required" and source_id not in seen:
            if source_id in backlog:
                warnings.append(f"{source_id}: C6 orphan (backlogged) - required source with no verified annotation")
            else:
                findings.append(
                    f"{source_id}: C6 orphan - curriculum role is 'required' but no verified annotation exists. "
                    "Add a verifiedAgainst span, or drop the source from the required set."
                )
    for source_id in sorted(backlog):
        if source_id in seen or source_id not in registry_index:
            stale_backlog.append(source_id)
    if stale_backlog:
        findings.append(
            "policy.orphanBacklog contains entries that are now resolved or absent from the registry - "
            f"remove them so the ratchet stays honest: {', '.join(stale_backlog)}"
        )

    if warnings:
        print(f"evidence-annotation gate: {len(warnings)} backlogged orphan(s) remaining", file=sys.stderr)
        for warning in warnings:
            print(f"  ~ {warning}", file=sys.stderr)

    if findings:
        print(f"evidence-annotation gate: {len(findings)} finding(s)\n", file=sys.stderr)
        for finding in findings:
            print(f"  - {finding}", file=sys.stderr)
        print(
            "\nA C5 inversion is almost never fixed by editing the span. Read the paper's "
            "conclusion and rewrite the claim.",
            file=sys.stderr,
        )
        return 1

    print(f"evidence-annotation gate: OK ({len(rows)} source(s), {sum(len(r.get('claims') or []) for r in rows)} claim(s))")
    return 0


def self_test() -> int:
    """Cases drawn from the seven real contradictions found on 2026-08-21."""
    cases = []
    today = date(2026, 8, 21)

    def run(row, expect_substring, name):
        findings: list[str] = []
        check_row(row, {"x": {"citation": {"pmid": "41217072", "doi": ""}}}, today, 730, findings)
        hit = any(expect_substring in f for f in findings)
        cases.append((name, hit, findings))

    # The real CBTp inversion: span says "no reliable evidence", claim said selection matters.
    run(
        {
            "sourceId": "x",
            "verifiedAgainst": {
                "sourceSpan": "There was no reliable evidence indicating that any of the covariates "
                "considered in this evidence synthesis significantly impacted the efficacy of "
                "cognitive-behavioural therapy in this client group.",
                "retrievedAt": "2026-08-21",
                "sourceEndpoint": "europepmc:core",
                "spanType": "conclusion",
                "pmid": "41217072",
            },
            "claims": [
                {
                    "claimText": "patient selection is a clinical skill because the average effect hides real heterogeneity",
                    "claimTerms": [],
                    "direction": "positive",
                }
            ],
        },
        "C5 inversion",
        "catches the CBTp inversion",
    )

    # The same span with an honestly negative claim must pass C5.
    run(
        {
            "sourceId": "x",
            "verifiedAgainst": {
                "sourceSpan": "There was no reliable evidence indicating that any of the covariates "
                "considered in this evidence synthesis significantly impacted the efficacy of "
                "cognitive-behavioural therapy in this client group.",
                "retrievedAt": "2026-08-21",
                "sourceEndpoint": "europepmc:core",
                "spanType": "conclusion",
                "pmid": "41217072",
            },
            "claims": [
                {
                    "claimText": "no covariate reliably moderated efficacy, so CBTp should be offered equally",
                    "claimTerms": ["no reliable evidence"],
                    "direction": "negative",
                }
            ],
        },
        "C5 inversion",
        "does not fire on an honestly negative claim",
    )

    # A fabricated effect size must fail C3.
    run(
        {
            "sourceId": "x",
            "verifiedAgainst": {
                "sourceSpan": "The pooled standardised mean difference was 0.19 (95% CI -0.10 to 0.49, "
                "p = 0.20) across five trials including 195 patients, graded low certainty.",
                "retrievedAt": "2026-08-21",
                "sourceEndpoint": "europepmc:core",
                "spanType": "abstract",
                "pmid": "41217072",
            },
            "claims": [
                {"claimText": "behavioural activation produced an SMD of 0.62", "claimTerms": [], "direction": "positive"}
            ],
        },
        "C3 numbers",
        "catches a fabricated effect size",
    )

    passed = 0
    for name, hit, findings in cases:
        expected = name != "does not fire on an honestly negative claim"
        ok = hit is expected
        passed += ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
        if not ok:
            for finding in findings:
                print(f"        {finding}")
    print(f"self-test: {passed}/{len(cases)} passed")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit as error:
        if isinstance(error.code, str):
            print(error.code, file=sys.stderr)
            sys.exit(2)
        raise
