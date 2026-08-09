#!/usr/bin/env python3
"""Validate claim anchors: bind an individual claim to the source that backs it.

WHY THIS EXISTS
---------------
`topic_meta.evidenceIds` links a PAGE to sources. It never links a CLAIM to a
source. The 2026-08-08 safety-level audit found three mis-attributions that all
shared that shape — a number sitting beside correctly-sourced numbers, visually
indistinguishable from them:

  * t_anxiety cited Lima 2004 as "the strongest evidence" for propranolol in
    akathisia; the review concludes the opposite.
  * t_perinatal claimed "recurs in ~30-50% of subsequent deliveries" with no
    source anywhere in the registry supporting it.
  * t_perinatal said stopping maintenance medication "roughly doubles" relapse
    where its own cited figures were 66% vs 23% — nearly a tripling.

Each was caught by a human reading an abstract. A claim anchor makes the same
check mechanical.

SYNTAX
------
Put `[^source-id]` immediately after the claim it backs:

    ...postpartum relapse 35% overall[^wesseloo-2016-postpartum-relapse]...

The anchor is author- and reviewer-facing metadata. `build_deploy.py` strips it
before the page ships, so learners never see it.

RULES
-----
1. Every anchor id must exist in evidence_registry.json.
2. Every anchor id must be listed in that page's topic_meta `evidenceIds`.
3. Once a page carries ANY anchor, every id in its `evidenceIds` must be used by
   at least one anchor. Half-anchored is worse than unanchored: it implies the
   unanchored numbers were checked when they were not.

Opt-in by design. A page with zero anchors is not failed — rule 3 only arms once
an author opts that page in. This lets anchors spread page by page with each
evidence batch instead of demanding one flag-day conversion.

Exits non-zero and prints every violation.
Usage:  python3 validate_claim_anchors.py [repo_root]
"""
import ast
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(os.path.abspath(__file__)).parent
REPO_ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE.parent.parent

TOPIC_META = REPO_ROOT / "topic_meta.json"
REGISTRY = REPO_ROOT / "evidence_registry.json"
MANIFEST = REPO_ROOT / "13_Faculty_Resources/_automation/site_build/site_manifest.json"
RESIDENT_SECTION = REPO_ROOT / "13_Faculty_Resources/_automation/site_build/resident_section.py"

# `[^id]` where id is a registry stable id: lowercase alphanumerics and hyphens.
# Deliberately narrow so ordinary markdown (footnotes, escaped brackets, regex in
# code fences) cannot be mistaken for an anchor.
ANCHOR_RE = re.compile(r"\[\^([a-z0-9][a-z0-9-]*)\]")

errs = []


def bad(where, msg):
    errs.append("%s: %s" % (where, msg))


def load_evidence_ids():
    evidence_tools = str(REPO_ROOT / "tools" / "evidence_registry")
    if evidence_tools not in sys.path:
        sys.path.insert(0, evidence_tools)
    from registry import index_sources, load_evidence_registry

    return set(index_sources(load_evidence_registry(REGISTRY)))


def shipped_name_to_source():
    """Map shipped page name (topic_meta key) -> source markdown path.

    Two producers ship markdown: site_manifest.json for the shared hub, and
    RES_EXTRA in resident_section.py for resident-only pages. resident_section
    CANNOT be imported — importing it rmtree's and rebuilds the output dir — so
    its literal pairs are read statically with ast.
    """
    mapping = {}
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for row in manifest.get("md", []):
        if isinstance(row, list) and len(row) > 1:
            mapping[row[1]] = row[0]

    if RESIDENT_SECTION.exists():
        tree = ast.parse(RESIDENT_SECTION.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign):
                continue
            if not any(
                isinstance(t, ast.Name) and t.id == "RES_EXTRA" for t in node.targets
            ):
                continue
            for sub in ast.walk(node.value):
                if not isinstance(sub, ast.Tuple) or len(sub.elts) != 2:
                    continue
                src, shipped = sub.elts
                if (
                    isinstance(src, ast.Constant)
                    and isinstance(src.value, str)
                    and isinstance(shipped, ast.Constant)
                    and isinstance(shipped.value, str)
                ):
                    # site_manifest wins: a shared page is authored once.
                    mapping.setdefault(shipped.value, src.value)
    return mapping


def main():
    if not TOPIC_META.exists():
        print("topic_meta.json not found at %s — nothing to validate (skipping)." % TOPIC_META)
        return 0

    topics = json.loads(TOPIC_META.read_text(encoding="utf-8"))
    try:
        evidence_ids = load_evidence_ids()
    except Exception as exc:
        print("evidence_registry.json INVALID — %s" % exc)
        return 1

    sources = shipped_name_to_source()
    anchored_pages = 0
    anchor_count = 0

    for key, meta in sorted(topics.items()):
        if key == "_note" or not isinstance(meta, dict):
            continue
        src_rel = sources.get(key)
        if src_rel is None:
            # Generated pages (case-of-the-week) and tool-backed entries have no
            # single authored source file. Nothing to scan; not an error.
            continue
        src = REPO_ROOT / src_rel
        if not src.exists():
            continue

        text = src.read_text(encoding="utf-8")
        found = ANCHOR_RE.findall(text)
        if not found:
            continue

        anchored_pages += 1
        anchor_count += len(found)
        declared = meta.get("evidenceIds") or []
        declared = declared if isinstance(declared, list) else []

        for aid in sorted(set(found)):
            if aid not in evidence_ids:
                bad(src_rel, "claim anchor [^%s] is not a source in evidence_registry.json" % aid)
            elif aid not in declared:
                bad(
                    src_rel,
                    "claim anchor [^%s] is not in %s's evidenceIds — add it there or "
                    "anchor a source the page actually declares" % (aid, key),
                )

        unused = [d for d in declared if d not in set(found)]
        if unused:
            bad(
                src_rel,
                "page is anchored but %d declared evidenceId(s) are never used as an "
                "anchor: %s. A half-anchored page implies the unanchored claims were "
                "checked. Anchor them or drop the id."
                % (len(unused), ", ".join(sorted(unused))),
            )

    if errs:
        print("claim anchors INVALID — %d issue(s):" % len(errs))
        for e in errs:
            print("  -", e)
        return 1

    print(
        "claim anchors OK — %d anchor(s) across %d opted-in page(s); all resolve to "
        "declared evidence." % (anchor_count, anchored_pages)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
