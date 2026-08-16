#!/usr/bin/env python3
"""Validate curriculum.json — the front door's week/library structure.

curriculum.json holds STRUCTURE ONLY. Everything about an item (minutes,
summary, key points, attestation) joins from topic_meta.json at render time,
so this file must never duplicate those facts. What it must guarantee is that
every ref it names is a page the build actually ships:

  - weeks are exactly 1..6, each present once
  - every item ref resolves to a shipped slug
  - item kind agrees with the slug's type (.html => tool, .md => read)
  - refs within a week are unique
  - every shipped slug is placed in a library column or explicitly excluded

WHAT "SHIPPED" COVERS — read this before trusting the totality guard.
site_manifest.json is the registry of *shared* pages, but it is not the whole
build. The guard therefore reasons about the union of three enumerable sets:

  1. site_manifest.json — 21 tools + 67 markdown pages, shipped to both sites.
  2. SITE_EXTRAS in validate_tool_governance.py — the per-site tools the build
     copies outside the manifest: learning-path.html (both sites),
     orientation-video.html (ms3), rp-agitation.html / rp-brief-psych.html /
     rp-canon-quiz.html (resident). Read from that module rather than restated
     here, so the two can never disagree.
  3. The literal RES_EXTRA entries in site_build/resident_section.py — the
     resident-only markdown pages (rotation.md, adv_psychopharm.md,
     systems_medlegal.md, supervision_teaching.md, canon_200.md,
     cl_reference.md). Also read from source, not restated.

WHAT IT DOES NOT COVER — this is a DECISION, not an oversight; do not "fix" it.
The case-of-the-week pages are outside the guard on purpose. resident_section.py
builds cotw_<date>_<topic>_{ms3,res}.md by comprehension over cotw_registry.json,
so their slugs change every time a case is published. Folding them in would mean
publishing a teaching case — a purely editorial act — also required an edit to
curriculum.json, and would fail the build until someone made it. That tradeoff
was weighed and declined. Also outside: non-page build outputs (media,
.pack.json sidecars, index.html).

A new *durable* page in none of the three sets above is likewise invisible here.
Registering it in site_manifest.json is what brings it under the rule, and is
the intended route.

Exits non-zero and prints every violation.
Usage:  python3 validate_curriculum.py [curriculum.json] [site_manifest.json]
"""
import ast
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

GOVERNANCE_PY = os.path.join(HERE, "validate_tool_governance.py")
RESIDENT_PY = os.path.join(HERE, "site_build", "resident_section.py")


def _top_level_assign(path, name):
    """Return the AST node assigned to a module-level `name`, or None.

    Parsed, never imported: validate_tool_governance.py pulls in jsonschema and
    the surface-governance ledger, and this validator runs inside the Netlify
    build (build_and_check.sh) where taking that dependency would be a new way
    for the deploy to fail.
    """
    with open(path, encoding="utf-8") as fh:
        tree = ast.parse(fh.read(), filename=path)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return node.value
    return None


def _slugs_from_pairs(node):
    """Collect the second element of every literal 2-tuple of strings under `node`."""
    out = set()
    for sub in ast.walk(node):
        if not isinstance(sub, ast.Tuple) or len(sub.elts) != 2:
            continue
        if all(isinstance(e, ast.Constant) and isinstance(e.value, str) for e in sub.elts):
            out.add(sub.elts[1].value)
    return out


def extra_shipped_slugs():
    """Slugs the build ships that site_manifest.json does not list.

    Fails loudly rather than silently narrowing: a rename in either source file
    must break this validator, not quietly shrink the set it guards.
    """
    extras = set()

    site_extras = _top_level_assign(GOVERNANCE_PY, "SITE_EXTRAS")
    if site_extras is None:
        raise SystemExit(
            "validate_curriculum: SITE_EXTRAS not found in %s — the extra-tool source moved; "
            "fix this derivation rather than hardcoding a second list." % GOVERNANCE_PY)
    for entries in ast.literal_eval(site_extras).values():
        extras.update(slug for _source, slug in entries)

    res_extra = _top_level_assign(RESIDENT_PY, "RES_EXTRA")
    if res_extra is None:
        raise SystemExit(
            "validate_curriculum: RES_EXTRA not found in %s — the resident-only page source "
            "moved; fix this derivation rather than hardcoding a second list." % RESIDENT_PY)
    # Literal tuples only. The registry-driven case-of-the-week entries in the same
    # list are comprehensions with no constant slug, and are out of scope per the docstring.
    extras.update(_slugs_from_pairs(res_extra))

    return frozenset(s for s in extras if s.endswith(".html") or s.endswith(".md"))


EXTRA_SHIPPED = extra_shipped_slugs()


def main(argv):
    cur_path = argv[0] if len(argv) > 0 else os.path.join(REPO, "curriculum.json")
    man_path = argv[1] if len(argv) > 1 else os.path.join(
        REPO, "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json")

    if not os.path.exists(cur_path):
        print("curriculum.json not found at %s — nothing to validate (skipping)." % cur_path)
        return 0

    cur = json.load(open(cur_path, encoding="utf-8"))
    man = json.load(open(man_path, encoding="utf-8"))

    tool_slugs = {e[1] for e in man.get("tools", [])}
    md_slugs = {e[1] for e in man.get("md", [])}
    tool_slugs |= {s for s in EXTRA_SHIPPED if s.endswith(".html")}
    md_slugs |= {s for s in EXTRA_SHIPPED if s.endswith(".md")}
    shipped = tool_slugs | md_slugs

    errs = []

    def bad(where, msg):
        errs.append("%s: %s" % (where, msg))

    # ---- weeks are exactly 1..6, each present once ----
    weeks = cur.get("weeks")
    if not isinstance(weeks, list):
        bad("weeks", "must be a list")
        weeks = []
    seen_n = []
    for idx, w in enumerate(weeks):
        if not isinstance(w, dict):
            continue
        n = w.get("n")
        # bool is a subclass of int in Python, so isinstance(True, int) is True —
        # exclude it explicitly or a week with "n": true would silently count as week 1.
        if isinstance(n, bool) or not isinstance(n, int):
            bad("weeks", "week at index %d has a missing or non-integer 'n' (got %r)" % (idx, n))
            continue
        seen_n.append(n)
    if sorted(seen_n) != [1, 2, 3, 4, 5, 6]:
        bad("weeks", "week numbers must be exactly 1..6 with no gaps or duplicates, got %s"
            % sorted(seen_n))

    # ---- every item ref is shipped, and kind agrees with slug type ----
    for w in weeks:
        if not isinstance(w, dict):
            bad("weeks", "each week must be an object")
            continue
        label = "week %s" % w.get("n")
        for field in ("title", "theme"):
            if not isinstance(w.get(field), str) or not w.get(field):
                bad(label, "'%s' must be a non-empty string" % field)
        items = w.get("items")
        if not isinstance(items, list):
            bad(label, "'items' must be a list")
            continue
        seen_refs = set()
        for it in items:
            if not isinstance(it, dict):
                bad(label, "each item must be an object")
                continue
            ref, kind = it.get("ref"), it.get("kind")
            if not isinstance(ref, str):
                bad(label, "item ref must be a string (got %r)" % (ref,))
                continue
            if ref in seen_refs:
                bad(label, "duplicate ref '%s' within the week" % ref)
            seen_refs.add(ref)
            if ref not in shipped:
                bad(label, "ref '%s' is not a shipped slug" % ref)
                continue
            expected = "tool" if ref in tool_slugs else "read"
            if kind != expected:
                bad(label, "ref '%s' has kind '%s' but the build ships it as '%s'"
                    % (ref, kind, expected))

    # ---- library totality: every shipped slug is placed or explicitly excluded ----
    # The front-door analogue of the build's orphaned-source check. Once the sidebar is
    # gone the Library is the only browse surface, so an unplaced page is an unreachable
    # page. The exclude list keeps this a HARD failure instead of a rule that gets quietly
    # weakened for the handful of pages that genuinely are not library content.
    placed = set()
    columns = cur.get("libraryColumns")
    if not isinstance(columns, list):
        bad("libraryColumns", "must be a list")
        columns = []
    for col in columns:
        if not isinstance(col, dict):
            bad("libraryColumns", "each column must be an object")
            continue
        name = col.get("name") or "?"
        refs = col.get("refs")
        if not isinstance(refs, list):
            bad("column %s" % name, "'refs' must be a list")
            continue
        for ref in refs:
            if not isinstance(ref, str):
                bad("column %s" % name, "ref must be a string (got %r)" % (ref,))
                continue
            if ref not in shipped:
                bad("column %s" % name, "ref '%s' is not a shipped slug" % ref)
            else:
                placed.add(ref)

    excluded = set()
    exclude = cur.get("libraryExclude")
    if not isinstance(exclude, list):
        bad("libraryExclude", "must be a list")
        exclude = []
    for ent in exclude:
        if not isinstance(ent, dict):
            bad("libraryExclude", "each entry must be an object")
            continue
        ref = ent.get("ref")
        if not isinstance(ent.get("reason"), str) or not ent.get("reason").strip():
            bad("libraryExclude", "entry '%s' needs a non-empty 'reason'" % ref)
        if not isinstance(ref, str):
            bad("libraryExclude", "entry ref must be a string (got %r)" % (ref,))
            continue
        if ref not in shipped:
            bad("libraryExclude", "ref '%s' is not a shipped slug" % ref)
        else:
            excluded.add(ref)

    for ref in sorted(shipped - placed - excluded):
        bad("library", "shipped slug '%s' appears in no column and no libraryExclude entry"
            % ref)

    # ---- safety kit refs resolve ----
    # Membership and order only. The steps themselves are attested content in
    # topic_meta.json (safetySteps/safetyDoc), so the failure modes left here are a kit
    # entry naming a page the build does not ship, or one missing its subtitle.
    kit = cur.get("safetyKit")
    if not isinstance(kit, list):
        bad("safetyKit", "must be a list")
        kit = []
    for ent in kit:
        if not isinstance(ent, dict):
            bad("safetyKit", "each entry must be an object")
            continue
        ref = ent.get("ref")
        if not isinstance(ent.get("sub"), str) or not ent.get("sub").strip():
            bad("safetyKit", "entry '%s' needs a non-empty 'sub'" % (ref,))
        if not isinstance(ref, str):
            bad("safetyKit", "entry ref must be a string (got %r)" % (ref,))
            continue
        if ref not in shipped:
            bad("safetyKit", "ref '%s' is not a shipped slug" % ref)

    if errs:
        print("curriculum.json INVALID — %d issue(s):" % len(errs))
        for e in errs:
            print("  -", e)
        return 1

    total = sum(len(w.get("items", [])) for w in weeks if isinstance(w, dict))
    print("curriculum.json OK — 6 weeks, %d week items, %d pages placed, %d excluded."
          % (total, len(placed), len(excluded)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
