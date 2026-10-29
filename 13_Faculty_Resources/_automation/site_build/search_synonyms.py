#!/usr/bin/env python3
"""Load and validate the one bidirectional learner-search synonym list.

Source: site_build/data/search-synonyms.v1.json (see its `_note`). The Front Door search
receives the groups through the audience payload (frontdoor_catalog.build_frontdoor_payload
puts them on the projected curriculum as `synonymGroups`); fd_search.js turns a typed term
into the other terms of its group and scores those as alternative queries.

Fails closed: a malformed file raises ValueError, which aborts the build, rather than quietly
shipping a search with fewer synonyms than the reviewed list says.

Rules enforced here (each one is a reviewability rule, not a style preference):
  * every term is normalised exactly as the search normalises a query (lowercase,
    runs of non-alphanumerics -> one space), so a term can never be unmatchable;
  * a group has at least two distinct terms, and no term sits in two groups -- otherwise
    "bidirectional" would silently become transitive across groups;
  * no term carries a dose, route or frequency (the same line the search-alias benchmark draws).
"""

from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "data", "search-synonyms.v1.json")

_NORMALISE_RE = re.compile(r"[^a-z0-9]+")
_DOSE_RE = re.compile(r"\b\d+(\.\d+)?\s*(mg|mcg|ug|ml|g|units?|iu|im|iv|po|sl|pr|q\d*h)\b", re.I)
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def normalise(text):
    """Mirror of fdSearchNormalize in frontdoor/fd_search.js."""
    return _NORMALISE_RE.sub(" ", str(text or "").lower()).strip()


def validate(data):
    problems = []
    if not isinstance(data, dict) or data.get("version") != 1:
        return ["search synonyms: expected an object with version 1"]
    groups = data.get("groups")
    if not isinstance(groups, list) or not groups:
        return ["search synonyms: `groups` must be a non-empty list"]
    owner, ids = {}, set()
    for i, group in enumerate(groups):
        where = "search synonyms group %d" % i
        if not isinstance(group, dict):
            problems.append("%s: must be an object" % where)
            continue
        gid = group.get("id")
        if not isinstance(gid, str) or not _ID_RE.match(gid) or gid in ids:
            problems.append("%s: needs a unique kebab-case id" % where)
        ids.add(gid)
        where = "search synonyms group %r" % gid
        if not isinstance(group.get("why"), str) or len(group["why"].strip()) < 10:
            problems.append("%s: needs a `why` a reviewer can read" % where)
        terms = group.get("terms")
        if not isinstance(terms, list) or len(terms) < 2:
            problems.append("%s: needs at least two terms" % where)
            continue
        seen = set()
        for term in terms:
            if not isinstance(term, str) or not term.strip():
                problems.append("%s: empty term" % where)
                continue
            if normalise(term) != term:
                problems.append("%s: term %r must be written normalised as %r"
                                % (where, term, normalise(term)))
            if _DOSE_RE.search(term):
                problems.append("%s: term %r carries a dose/route" % (where, term))
            if term in seen:
                problems.append("%s: duplicate term %r" % (where, term))
            seen.add(term)
            if term in owner and owner[term] != gid:
                problems.append("%s: term %r is already in group %r" % (where, term, owner[term]))
            owner[term] = gid
    return problems


def load(path=PATH):
    """Return the groups as [[term, ...], ...] for the audience payload. Raises on any problem."""
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    problems = validate(data)
    if problems:
        raise ValueError("; ".join(problems))
    return [list(group["terms"]) for group in data["groups"]]


if __name__ == "__main__":
    try:
        groups = load()
    except (OSError, ValueError) as error:
        print("search synonyms: FAIL -- %s" % error, file=sys.stderr)
        sys.exit(1)
    print("search synonyms: %d groups, %d terms" % (len(groups), sum(len(g) for g in groups)))
