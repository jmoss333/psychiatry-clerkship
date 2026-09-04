#!/usr/bin/env python3
"""Regression checks for high-value clerkship search behavior.

The SPA search is intentionally lightweight, so this script verifies the cases
students are likely to type on the unit: shorthand, acronyms, and short clinical
prefixes. It fails the build when search-index.json loses a required synonym or
when a common shorthand query drifts to an irrelevant top result.

It also gates REACHABILITY, which ranking checks cannot see. A page can be placed
in the Library — the site's only browse surface — and still be missing from the
index entirely, in which case no ranking case will ever mention it and search
simply denies the page exists. That is what happened: `hidden` in the navigation
meant "not in the (since-removed) sidebar", `build_search_index` read it as "do
not index", and 19 Library-placed resident pages became unsearchable (t_sleep.md,
cultural_psychiatry.md, ect_neuromodulation.md, ethics_legal.md, t_neurocog.md
and 14 more; MS3 lost 2). `validate_reachability` recomputes the browsable set
from curriculum.json and the built nav.json — deliberately NOT by calling the
build's own frontdoor_catalog helper, so the gate can disagree with the builder
rather than passing by construction.
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
    # Pages that were Library-placed but unindexed until the hidden-vs-reachable fix.
    # Ranking cases, not reachability ones: validate_reachability proves they are IN the
    # index, these prove the index answers the word a learner would actually type.
    {"query": "sleep", "anyTop": {"t_sleep.md"}, "limit": 3},
    {"query": "culture", "anyTop": {"cultural_psychiatry.md"}, "limit": 3},
    {"query": "ect", "anyTop": {"ect_neuromodulation.md"}, "limit": 3},
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


SITE_KEYS = {"ms3": "ms3", "resident": "resident", "res": "resident"}

REPO_ROOT = Path(__file__).resolve().parents[3]


def browsable_refs(site_key: str, nav: list) -> set[str]:
    """Refs a learner can reach by browsing this site: Library-placed plus Path items.

    Recomputed from curriculum.json's own semantics — shared libraryColumns, plus
    this site's siteLibrary additions, minus its exclusions — then intersected with
    what this site's navigation actually ships, which is what makes one shared
    column list resolve correctly for two different sites. Path items are unioned in
    for completeness; validate_curriculum.py already proves each one ships.
    """
    curriculum = json.loads((REPO_ROOT / "curriculum.json").read_text(encoding="utf-8"))
    refs: set[str] = set()
    for column in curriculum.get("libraryColumns", []):
        refs.update(r for r in column.get("refs", []) if isinstance(r, str))
    site_library = (curriculum.get("siteLibrary") or {}).get(site_key) or {}
    for addition in site_library.get("additions", []):
        refs.update(r for r in addition.get("refs", []) if isinstance(r, str))
    refs.difference_update(site_library.get("exclusions", []))
    for week in ((curriculum.get("learningPaths") or {}).get(site_key) or {}).get("weeks", []):
        refs.update(i["ref"] for i in week.get("items", []) if isinstance(i.get("ref"), str))
    shipped = {item["f"] for section in nav for item in section.get("items", [])
               if isinstance(item.get("f"), str)}
    return refs & shipped


def validate_reachability(index: dict, site: Path, label: str) -> list[str]:
    """Every browsable page must have a document in the index."""
    site_key = SITE_KEYS.get(label)
    if site_key is None:
        return ["reachability: unknown site label %r (expected ms3 or resident)" % label]
    nav_path = site / "nav.json"
    if not nav_path.exists():
        return ["reachability: nav.json not found in %s" % site]
    nav = json.loads(nav_path.read_text(encoding="utf-8"))
    indexed = {doc.get("f") for doc in index.get("docs", [])}
    missing = sorted(browsable_refs(site_key, nav) - indexed)
    if not missing:
        return []
    return ["%s is placed in the Library or on the Path but has no search-index entry "
            "(a page the site shows and search denies)" % ref for ref in missing]


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
    errors = (validate_synonyms(index) + validate_reachability(index, site, label)
              + validate_cases(index))
    if errors:
        print(f"search-quality: FAIL — {label} has {len(errors)} issue(s)")
        for error in errors:
            print(f"  - {error}")
        return 1
    print(f"search-quality: OK — {label} abbreviation and prefix checks passed "
          f"({len(CASES)} cases); every Library/Path page is in the index")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
