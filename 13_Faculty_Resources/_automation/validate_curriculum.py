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
     copies outside the manifest: orientation-video.html (ms3), rp-agitation.html / rp-brief-psych.html /
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
        [topic_meta.json] [evidence_registry.json]
"""
import ast
import json
import os
import re
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


def site_extra_shipped_slugs():
    """Return the build extras, separated by the one site that ships each slug.

    Fails loudly rather than silently narrowing: a rename in either source file
    must break this validator, not quietly shrink the set it guards.
    """
    site_extras = _top_level_assign(GOVERNANCE_PY, "SITE_EXTRAS")
    if site_extras is None:
        raise SystemExit(
            "validate_curriculum: SITE_EXTRAS not found in %s — the extra-tool source moved; "
            "fix this derivation rather than hardcoding a second list." % GOVERNANCE_PY)
    declared_extras = ast.literal_eval(site_extras)
    extras = {
        site: {
            slug for _source, slug in declared_extras.get(site, ())
            if slug.endswith(".html") or slug.endswith(".md")
        }
        for site in ("ms3", "resident")
    }

    res_extra = _top_level_assign(RESIDENT_PY, "RES_EXTRA")
    if res_extra is None:
        raise SystemExit(
            "validate_curriculum: RES_EXTRA not found in %s — the resident-only page source "
            "moved; fix this derivation rather than hardcoding a second list." % RESIDENT_PY)
    # Literal tuples only. The registry-driven case-of-the-week entries in the same
    # list are comprehensions with no constant slug, and are out of scope per the docstring.
    extras["resident"].update(_slugs_from_pairs(res_extra))

    return {site: frozenset(slugs) for site, slugs in extras.items()}


SITE_EXTRA_SHIPPED = site_extra_shipped_slugs()
EXTRA_SHIPPED = frozenset().union(*SITE_EXTRA_SHIPPED.values())


# roles[].name / roles[].desc are DISPLAYED copy (unlike id, an identifier) and curriculum.json
# ships to both site builds unrebranded, so the front-door analogue of tests/shell-copy.test.mjs's
# audience-token scan applies here too — mirrors AUDIENCE_TOKEN_RE in that file.
ROLE_AUDIENCE_TOKEN_RE = re.compile(r"MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford", re.IGNORECASE)
SAFETY_KIT_REFS = (
    "pg_suicide.md",
    "agitation.md",
    "exp_consult.md",
    "t_sud.md",
    "delirium.md",
)


def main(argv):
    cur_path = argv[0] if len(argv) > 0 else os.path.join(REPO, "curriculum.json")
    man_path = argv[1] if len(argv) > 1 else os.path.join(
        REPO, "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json")
    topic_path = argv[2] if len(argv) > 2 else os.path.join(REPO, "topic_meta.json")
    evidence_path = argv[3] if len(argv) > 3 else os.path.join(REPO, "evidence_registry.json")

    if not os.path.exists(cur_path):
        print("curriculum.json not found at %s — nothing to validate (skipping)." % cur_path)
        return 0

    cur = json.load(open(cur_path, encoding="utf-8"))
    man = json.load(open(man_path, encoding="utf-8"))
    topic_meta = json.load(open(topic_path, encoding="utf-8"))
    evidence_registry = json.load(open(evidence_path, encoding="utf-8"))

    shared_tool_slugs = {e[1] for e in man.get("tools", [])}
    shared_md_slugs = {e[1] for e in man.get("md", [])}
    shared_shipped = shared_tool_slugs | shared_md_slugs
    site_shipped = {
        site: shared_shipped | SITE_EXTRA_SHIPPED[site]
        for site in ("ms3", "resident")
    }
    tool_slugs = set(shared_tool_slugs)
    md_slugs = set(shared_md_slugs)
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

    # ---- site library overlays: additions point to existing columns and stay unique ----
    # The shared columns remain the MS3 baseline. Resident-only pages/tools are named here,
    # not duplicated with titles or kinds: those come from each completed site's nav.
    site_library = cur.get("siteLibrary")
    if not isinstance(site_library, dict):
        bad("siteLibrary", "must be an object with ms3 and resident entries")
        site_library = {}
    column_names = {column.get("name") for column in columns if isinstance(column, dict)}
    for site in ("ms3", "resident"):
        overlay = site_library.get(site)
        if not isinstance(overlay, dict):
            bad("siteLibrary", "'%s' must be an object" % site)
            continue
        additions = overlay.get("additions")
        if not isinstance(additions, list):
            bad("siteLibrary %s" % site, "'additions' must be a list")
            additions = []
        added_refs = set()
        for addition in additions:
            if not isinstance(addition, dict):
                bad("siteLibrary %s" % site, "each addition must be an object")
                continue
            column = addition.get("column")
            if column not in column_names:
                bad("siteLibrary %s" % site, "addition names unknown column '%s'" % column)
            refs = addition.get("refs")
            if not isinstance(refs, list):
                bad("siteLibrary %s" % site, "addition refs must be a list")
                continue
            for ref in refs:
                if not isinstance(ref, str):
                    bad("siteLibrary %s" % site, "addition ref must be a string (got %r)" % ref)
                    continue
                if ref in added_refs:
                    bad("siteLibrary %s" % site, "duplicate addition ref '%s'" % ref)
                added_refs.add(ref)
                if ref not in site_shipped[site]:
                    bad("siteLibrary %s" % site,
                        "addition ref '%s' is not shipped on %s" % (ref, site))
        exclusions = overlay.get("exclusions")
        if not isinstance(exclusions, list):
            bad("siteLibrary %s" % site, "'exclusions' must be a list")
            continue
        if len(set(ref for ref in exclusions if isinstance(ref, str))) != len(exclusions):
            bad("siteLibrary %s" % site, "exclusion refs must be unique strings")
        for ref in exclusions:
            if not isinstance(ref, str):
                bad("siteLibrary %s" % site, "exclusion ref must be a string (got %r)" % ref)
            elif ref not in site_shipped[site]:
                bad("siteLibrary %s" % site,
                    "exclusion ref '%s' is not shipped on %s" % (ref, site))

    # ---- safety kit: five reviewed, high-safety protocols with canonical evidence ----
    kit = cur.get("safetyKit")
    if not isinstance(kit, list):
        bad("safetyKit", "must be a list")
        kit = []
    if len(kit) != len(SAFETY_KIT_REFS):
        bad("safetyKit", "must contain exactly 5 current protocols (got %d)" % len(kit))
    kit_refs = []
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
        kit_refs.append(ref)
        if ref not in shipped:
            bad("safetyKit", "ref '%s' is not a shipped slug" % ref)
    if len(set(kit_refs)) != len(kit_refs):
        bad("safetyKit", "protocol refs must be unique")
    if tuple(kit_refs) != SAFETY_KIT_REFS:
        bad("safetyKit", "must list the current five protocols in canonical order: %s"
            % ", ".join(SAFETY_KIT_REFS))

    sources = evidence_registry.get("sources", []) if isinstance(evidence_registry, dict) else []
    evidence_ids = {
        source.get("id") for source in sources
        if isinstance(source, dict) and isinstance(source.get("id"), str)
    }
    for ref in SAFETY_KIT_REFS:
        meta = topic_meta.get(ref) if isinstance(topic_meta, dict) else None
        if not isinstance(meta, dict):
            bad("safetyKit %s" % ref, "missing topic_meta record")
            continue
        if meta.get("safetyLevel") != "high":
            bad("safetyKit %s" % ref, "safetyLevel must be 'high'")
        faculty = meta.get("facultyReview")
        if not isinstance(faculty, dict) or faculty.get("status") != "reviewed":
            bad("safetyKit %s" % ref, "facultyReview.status must be 'reviewed'")
        steps = meta.get("safetySteps")
        if not isinstance(steps, list):
            bad("safetyKit %s" % ref, "safetySteps must be a list of 3 to 5 non-empty steps")
        else:
            if len(steps) < 3 or len(steps) > 5:
                bad("safetyKit %s" % ref, "safetySteps must contain 3 to 5 steps (got %d)"
                    % len(steps))
            for index, step in enumerate(steps):
                if not isinstance(step, str) or not step.strip():
                    bad("safetyKit %s" % ref,
                        "safetySteps[%d] must be a non-empty string" % index)
        if not isinstance(meta.get("safetyDoc"), str) or not meta.get("safetyDoc", "").strip():
            bad("safetyKit %s" % ref, "safetyDoc must be a non-empty documentation line")
        refs = meta.get("evidenceIds")
        if not isinstance(refs, list) or not refs:
            bad("safetyKit %s" % ref, "evidenceIds must include a canonical evidence ID")
        elif not any(isinstance(evidence_id, str) and evidence_id in evidence_ids
                     for evidence_id in refs):
            bad("safetyKit %s" % ref,
                "evidenceIds contains no canonical evidence ID (got %r)" % refs)

    # ---- roles: id/name/desc non-empty, and the displayed text is audience-neutral ----
    # curriculum.json is one document read by both site builds, so a role's displayed name/desc
    # (id is an identifier, not copy, and is exempt) must not carry an audience-specific token —
    # the front-door analogue of tests/shell-copy.test.mjs's shared-copy scan.
    roles = cur.get("roles")
    if not isinstance(roles, dict):
        bad("roles", "must be an object")
        roles = {}
    for site in ("ms3", "resident"):
        site_roles = roles.get(site)
        if not isinstance(site_roles, list):
            bad("roles.%s" % site, "must be a list")
            continue
        for idx, r in enumerate(site_roles):
            label = "roles.%s[%d]" % (site, idx)
            if not isinstance(r, dict):
                bad(label, "each role must be an object")
                continue
            for field in ("id", "name", "desc"):
                val = r.get(field)
                if not isinstance(val, str) or not val.strip():
                    bad(label, "'%s' must be a non-empty string" % field)
            for field in ("name", "desc"):
                val = r.get(field)
                if isinstance(val, str) and ROLE_AUDIENCE_TOKEN_RE.search(val):
                    bad(label, "'%s' contains an audience-specific token: %r" % (field, val))

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
