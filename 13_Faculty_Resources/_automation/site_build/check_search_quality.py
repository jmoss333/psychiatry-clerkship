#!/usr/bin/env python3
"""Regression checks for high-value clerkship search behavior.

The SPA search is intentionally lightweight, so this script verifies the cases
students are likely to type on the unit: shorthand, acronyms, and short clinical
prefixes. It fails the build when search-index.json loses a required synonym or
when a common shorthand query drifts to an irrelevant top result.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path


STOP = set("a an and are as at be by for from has in is it of on or that the to was with you your".split())

REQUIRED_SYNONYMS = {
    "ss": {"serotonin", "syndrome"},
    "td": {"tardive", "dyskinesia"},
    "ama": {"against", "medical", "advice", "discharge"},
    "dts": {"delirium", "tremens"},
    "wke": {"wernicke", "encephalopathy"},
    "aws": {"alcohol", "withdrawal"},
    "eps": {"extrapyramidal", "symptoms"},
}

CASES = [
    {"query": "cat", "anyTop": {"catatonia.md", "bfcrs.html"}, "limit": 3},
    {"query": "catatonia", "anyTop": {"catatonia.md", "bfcrs.html"}, "limit": 3},
    {"query": "ss", "anyTop": {"rounds_questions.md", "cl_reference.md", "psychopharm_primer.md"}, "limit": 5},
    {"query": "td", "anyTop": {"rounds_questions.md", "adv_psychopharm.md"}, "limit": 5},
    {"query": "dts", "anyTop": {"rounds_questions.md", "exp_consult.md", "delirium.md", "cl_reference.md"}, "limit": 5},
    {"query": "wke", "anyTop": {"t_sud.md", "rounds_questions.md"}, "limit": 5},
    {"query": "aws", "anyTop": {"t_sud.md", "rounds_questions.md", "exp_consult.md", "withdrawal.html"}, "limit": 5},
    {"query": "eps", "anyTop": {"rounds_questions.md", "exp_tx.md", "adv_psychopharm.md"}, "limit": 5},
    {"query": "ama", "anyTop": {"exp_family.md", "systems_medlegal.md", "evidence_inpatient.md"}, "limit": 5, "notFirst": {"book_library.md"}},
]


def tok(text: str) -> list[str]:
    return [
        word
        for word in re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split()
        if len(word) >= 2 and word not in STOP
    ]


def load_index(site: Path) -> dict:
    path = site / "search-index.json"
    if not path.exists():
        raise SystemExit(f"search-quality: search-index.json not found in {site}")
    return json.loads(path.read_text(encoding="utf-8"))


def validate_synonyms(index: dict) -> list[str]:
    errors: list[str] = []
    synonyms = index.get("synonyms", {})
    for term, required in REQUIRED_SYNONYMS.items():
        found = set(synonyms.get(term, []))
        missing = required - found
        if missing:
            errors.append(f"{term} missing synonym token(s): {', '.join(sorted(missing))}")
    return errors


def run_search(index: dict, query: str) -> list[dict]:
    postings = index.get("postings", {})
    synonyms = index.get("synonyms", {})
    vocab = sorted(postings.keys())
    score: dict[int, float] = {}
    cover: dict[int, int] = {}

    def idf(term: str) -> float:
        return math.log(1 + index.get("n", 1) / (index.get("df", {}).get(term) or 1))

    for term in tok(query):
        terms: dict[str, float] = {}
        if term in postings:
            terms[term] = 1.0
        syn = synonyms.get(term, [])
        for item in syn:
            if item in postings and item not in terms:
                terms[item] = 0.6
        if len(term) >= 3 and not syn:
            for vocab_term in vocab:
                if vocab_term != term and vocab_term.startswith(term) and vocab_term not in terms:
                    terms[vocab_term] = 0.5

        hit: dict[int, bool] = {}
        for search_term, weight in terms.items():
            for doc_id, tf in postings.get(search_term, []):
                doc_id = int(doc_id)
                score[doc_id] = score.get(doc_id, 0.0) + (float(tf) * idf(search_term) * weight)
                hit[doc_id] = True
        for doc_id in hit:
            cover[doc_id] = cover.get(doc_id, 0) + 1

    ql = query.lower()
    results = []
    docs = index.get("docs", [])
    for doc_id, raw_score in score.items():
        doc = docs[doc_id]
        final_score = raw_score * (1 + 0.6 * ((cover.get(doc_id) or 1) - 1))
        if ql in doc.get("t", "").lower():
            final_score += 25
        results.append({"score": final_score, **doc})
    return sorted(results, key=lambda item: item["score"], reverse=True)


def validate_cases(index: dict) -> list[str]:
    errors: list[str] = []
    for case in CASES:
        query = case["query"]
        results = run_search(index, query)
        files = [item.get("f") for item in results[: case.get("limit", 5)]]
        if case.get("notFirst") and results and results[0].get("f") in case["notFirst"]:
            errors.append(f"{query!r} returned irrelevant first result: {results[0].get('f')}")
        if not set(files).intersection(case["anyTop"]):
            errors.append(
                "%r expected one of {%s} in top %d, got: %s"
                % (query, ", ".join(sorted(case["anyTop"])), case.get("limit", 5), ", ".join(files[:5]) or "(none)")
            )
    return errors


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: check_search_quality.py <built-site-dir> [label]", file=sys.stderr)
        return 2
    site = Path(sys.argv[1])
    label = sys.argv[2] if len(sys.argv) > 2 else site.name
    index = load_index(site)
    errors = validate_synonyms(index) + validate_cases(index)
    if errors:
        print(f"search-quality: FAIL — {label} has {len(errors)} issue(s)")
        for error in errors:
            print(f"  - {error}")
        return 1
    print(f"search-quality: OK — {label} abbreviation and prefix checks passed ({len(CASES)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
