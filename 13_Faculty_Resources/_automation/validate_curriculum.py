#!/usr/bin/env python3
"""Validate curriculum.json — the front door's week/library structure.

curriculum.json holds STRUCTURE ONLY. Everything about an item (minutes,
summary, key points, attestation) joins from topic_meta.json at render time,
so this file must never duplicate those facts. What it must guarantee is that
every ref it names is a page the build actually ships:

  - weeks are exactly 1..6, each present once
  - every item ref resolves to a slug BOTH sites ship
  - item kind agrees with the slug's type (.html => tool, .md => read)
  - refs within a week are unique
  - every shipped slug is placed in a library column or explicitly excluded,
    checked PER SITE

PER-SITE MEMBERSHIP. The two sites do not ship the same page set, so neither
does the Library. A libraryColumns ref (and a libraryExclude entry) is either a
bare slug — meaning every site ships it — or an object carrying "sites", naming
the site(s) it belongs to. Two rules make that honest:

  - an entry may only name a site that actually ships the ref; and
  - an entry that names no site must be shipped by EVERY site, because the
    build renders bare refs on both. That is what stops a one-site page from
    being placed globally and dead-linking on the other site.

Before this, the only way to express "resident ships it, MS3 does not" was a
libraryExclude entry, which excluded the page from BOTH Libraries — and the
resident site's nine resident-only pages were reachable only through the
sidebar's nav.json. The front door deletes that sidebar, so a globally excluded
resident page would have become unreachable except by search.

A per-site ref also carries its own "title": site_manifest.json registers only
the shared pages, so for these there is no manifest row for fd_data.js's title
index to read, and the row would otherwise degrade to its raw slug.

WHAT "SHIPPED" COVERS — read this before trusting the totality guard.
site_manifest.json is the registry of *shared* pages, but it is not the whole
build. The guard therefore reasons about three enumerable sets, kept per site:

  1. site_manifest.json — 21 tools + 67 markdown pages, shipped to both sites.
  2. SITE_EXTRAS in validate_tool_governance.py — the per-site tools the build
     copies outside the manifest: orientation-video.html (ms3),
     rp-agitation.html / rp-brief-psych.html / rp-canon-quiz.html (resident).
     Read from that module rather than restated here, so the two can never
     disagree — including which SITE each belongs to.
  3. The literal RES_EXTRA entries in site_build/resident_section.py — the
     resident-only markdown pages (rotation.md, adv_psychopharm.md,
     systems_medlegal.md, supervision_teaching.md, canon_200.md,
     cl_reference.md). Also read from source, not restated, and resident-only
     by construction: resident_section.py is the only script that copies them.

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


# Every site the one curriculum.json is read by. Ordered so messages are stable.
SITES = ("ms3", "resident")


def _pages_only(slugs):
    return frozenset(s for s in slugs if s.endswith(".html") or s.endswith(".md"))


def extra_shipped_slugs_by_site():
    """{site: frozenset(slug)} — the slugs each site ships that site_manifest.json
    does not list.

    Fails loudly rather than silently narrowing: a rename in either source file
    must break this validator, not quietly shrink the set it guards. Keeping the
    site key (rather than unioning, as this did before per-site membership
    existed) is what lets the totality check tell "MS3 does not ship this" apart
    from "nobody ships this".
    """
    site_extras = _top_level_assign(GOVERNANCE_PY, "SITE_EXTRAS")
    if site_extras is None:
        raise SystemExit(
            "validate_curriculum: SITE_EXTRAS not found in %s — the extra-tool source moved; "
            "fix this derivation rather than hardcoding a second list." % GOVERNANCE_PY)
    by_site = {site: set(slug for _source, slug in entries)
               for site, entries in ast.literal_eval(site_extras).items()}

    res_extra = _top_level_assign(RESIDENT_PY, "RES_EXTRA")
    if res_extra is None:
        raise SystemExit(
            "validate_curriculum: RES_EXTRA not found in %s — the resident-only page source "
            "moved; fix this derivation rather than hardcoding a second list." % RESIDENT_PY)
    # Literal tuples only. The registry-driven case-of-the-week entries in the same
    # list are comprehensions with no constant slug, and are out of scope per the docstring.
    # resident_section.py is the only script that copies these, so they are resident-only.
    by_site.setdefault("resident", set()).update(_slugs_from_pairs(res_extra))

    if set(by_site) != set(SITES):
        raise SystemExit(
            "validate_curriculum: SITE_EXTRAS names sites %s but this validator knows %s — "
            "a site was added or renamed; update SITES here rather than dropping the check."
            % (sorted(by_site), sorted(SITES)))
    return {site: _pages_only(slugs) for site, slugs in by_site.items()}


EXTRA_SHIPPED_BY_SITE = extra_shipped_slugs_by_site()
# Union, kept for callers that only need "does the build ship this anywhere" —
# test_validate_curriculum.py builds its fixture excludes from it.
EXTRA_SHIPPED = frozenset().union(*EXTRA_SHIPPED_BY_SITE.values())

# roles[].name / roles[].desc are DISPLAYED copy (unlike id, an identifier) and curriculum.json
# ships to both site builds unrebranded, so the front-door analogue of tests/shell-copy.test.mjs's
# audience-token scan applies here too — mirrors AUDIENCE_TOKEN_RE in that file.
ROLE_AUDIENCE_TOKEN_RE = re.compile(r"MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford", re.IGNORECASE)


def main(argv):
    cur_path = argv[0] if len(argv) > 0 else os.path.join(REPO, "curriculum.json")
    man_path = argv[1] if len(argv) > 1 else os.path.join(
        REPO, "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json")

    if not os.path.exists(cur_path):
        print("curriculum.json not found at %s — nothing to validate (skipping)." % cur_path)
        return 0

    cur = json.load(open(cur_path, encoding="utf-8"))
    man = json.load(open(man_path, encoding="utf-8"))

    manifest_slugs = {e[1] for e in man.get("tools", [])} | {e[1] for e in man.get("md", [])}
    # Per site, then unioned. `shipped` answers "does the build produce this page at all";
    # shipped_by_site answers "does THIS site produce it", which is what per-site membership
    # and the totality check below both turn on.
    shipped_by_site = {site: manifest_slugs | EXTRA_SHIPPED_BY_SITE.get(site, frozenset())
                       for site in SITES}
    shipped = set().union(*shipped_by_site.values())
    tool_slugs = {s for s in shipped if s.endswith(".html")}

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
            # Weeks carry no per-site field: the Path tab renders the same six weeks on both
            # sites, so a week item must be a page EVERY site ships or the other site's Path
            # tab dead-links. Named per site so the message says which one is missing it.
            missing = [s for s in SITES if ref not in shipped_by_site[s]]
            if missing:
                if len(missing) == len(SITES):
                    bad(label, "ref '%s' is not a shipped slug" % ref)
                else:
                    bad(label, "ref '%s' is not shipped by %s — a week item must be a page "
                               "every site ships, since the Path tab is not site-scoped"
                        % (ref, ", ".join(missing)))
                continue
            expected = "tool" if ref in tool_slugs else "read"
            if kind != expected:
                bad(label, "ref '%s' has kind '%s' but the build ships it as '%s'"
                    % (ref, kind, expected))

    # ---- library totality: every shipped slug is placed or explicitly excluded, PER SITE ----
    # The front-door analogue of the build's orphaned-source check. The sidebar is gone, so
    # the Library is the only browse surface, and an unplaced page is an unreachable page.
    # Checked per site because the two sites do not ship the same pages: a global check
    # cannot tell "resident places it, MS3 does not ship it" (correct) apart from "nobody
    # places it on MS3" (a page lost). The exclude list keeps this a HARD failure instead of
    # a rule quietly weakened for the handful of pages that genuinely are not library content.

    def entry_sites(entry_sites_value, where, ref):
        """The sites an entry applies to, defaulting to every site.

        Two failures are reported here, and both are the reason this field exists:
          - naming a site that does not ship the ref (the entry can never apply); and
          - naming NO site for a ref only one site ships, which is how a one-site page
            used to get placed globally and dead-link on the other site.
        """
        ships = [s for s in SITES if ref in shipped_by_site[s]]
        if entry_sites_value is None:
            if len(ships) != len(SITES):
                bad(where, "ref '%s' is shipped only by %s, so it needs an explicit \"sites\" "
                           "list — without one the build renders it on every site, and the "
                           "site that does not ship it gets a dead link"
                    % (ref, ", ".join(ships) or "no site"))
            return list(SITES)
        if not isinstance(entry_sites_value, list) or not entry_sites_value:
            bad(where, "ref '%s' has a 'sites' that is not a non-empty list (got %r)"
                % (ref, entry_sites_value))
            return []
        out = []
        for site in entry_sites_value:
            if site not in SITES:
                bad(where, "ref '%s' names unknown site %r" % (ref, site))
            elif ref not in shipped_by_site[site]:
                bad(where, "ref '%s' is listed for site '%s', which does not ship it"
                    % (ref, site))
            else:
                out.append(site)
        return out

    placed = {site: set() for site in SITES}
    columns = cur.get("libraryColumns")
    if not isinstance(columns, list):
        bad("libraryColumns", "must be a list")
        columns = []
    for col in columns:
        if not isinstance(col, dict):
            bad("libraryColumns", "each column must be an object")
            continue
        name = col.get("name") or "?"
        where = "column %s" % name
        refs = col.get("refs")
        if not isinstance(refs, list):
            bad(where, "'refs' must be a list")
            continue
        for entry in refs:
            # A bare string is a page every site ships; the object form carries per-site
            # membership and, for a ref site_manifest.json cannot name, its own title.
            if isinstance(entry, str):
                ref, sites_value, title = entry, None, None
            elif isinstance(entry, dict):
                ref, sites_value, title = entry.get("ref"), entry.get("sites"), entry.get("title")
            else:
                bad(where, "ref must be a string or an object (got %r)" % (entry,))
                continue
            if not isinstance(ref, str):
                bad(where, "ref must be a string (got %r)" % (ref,))
                continue
            if ref not in shipped:
                bad(where, "ref '%s' is not a shipped slug" % ref)
                continue
            # Title: required exactly when site_manifest.json has no row to supply one,
            # forbidden when it does — one source of truth per page, either way.
            if ref in manifest_slugs:
                if title is not None:
                    bad(where, "ref '%s' carries a 'title', but site_manifest.json already "
                               "names it — the manifest row is the single source of truth" % ref)
            elif not isinstance(title, str) or not title.strip():
                bad(where, "ref '%s' is not in site_manifest.json, so it needs a non-empty "
                           "'title' here — nothing else can supply one and the Library row "
                           "would render as the raw slug" % ref)
            for site in entry_sites(sites_value, where, ref):
                placed[site].add(ref)

    excluded = {site: set() for site in SITES}
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
            continue
        for site in entry_sites(ent.get("sites"), "libraryExclude", ref):
            excluded[site].add(ref)

    for site in SITES:
        for ref in sorted(shipped_by_site[site] - placed[site] - excluded[site]):
            bad("library", "%s ships '%s' but places it in no column and excludes it in no "
                           "libraryExclude entry — it would be reachable only by search"
                % (site, ref))
        for ref in sorted(placed[site] & excluded[site]):
            bad("library", "%s both places and excludes '%s'" % (site, ref))

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
        # Same reasoning as week items: the kit is not site-scoped, so every site must
        # ship the page or one site's safety kit dead-links — the worst surface for it.
        missing = [s for s in SITES if ref not in shipped_by_site[s]]
        if missing:
            if len(missing) == len(SITES):
                bad("safetyKit", "ref '%s' is not a shipped slug" % ref)
            else:
                bad("safetyKit", "ref '%s' is not shipped by %s — the safety kit is not "
                                 "site-scoped, so every site must ship it"
                    % (ref, ", ".join(missing)))

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
    print("curriculum.json OK — 6 weeks, %d week items; %s."
          % (total, "; ".join("%s: %d placed, %d excluded"
                              % (site, len(placed[site]), len(excluded[site]))
                              for site in SITES)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
