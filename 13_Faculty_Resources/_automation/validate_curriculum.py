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
  - every MS3 week's landingRef is a shipped MS3 Markdown page (welcome_compass.prepare_cards)

WHAT "SHIPPED" COVERS — read this before trusting the totality guard.
The shipped set is READ, not re-derived: site_build/shipped_pages.json is the one
generated listing of what the two builds publish. shipped_pages.py assembles it
from every producer and build_and_check.sh verifies it against the real build
output on every build, so this guard cannot see a narrower universe than the one
that actually ships (ADR-002, beside that file).

Until 2026-09 this validator rebuilt the set here from three of the producers —
the shared registry, the per-site extra-tools table in validate_tool_governance.py,
and the resident track pages in site_build/site_extras.py, the last two by AST
parse. Every list was correct; the exposure was that a fourth route would appear
and this guard would go on guarding the three it knew. That is the shape of the
failure ADR-002 exists to end.

WHAT IT DOES NOT COVER — this is a DECISION, not an oversight; do not "fix" it.
The case-of-the-week pages are outside the guard on purpose: the listing marks
them with the producer "cotw_registry" and this validator drops exactly those.
resident_section.py builds cotw_<date>_<topic>_{ms3,res}.md by comprehension over
the weekly registry, so their slugs change every time a case is published.
Folding them in would mean publishing a teaching case — a purely editorial act —
also required an edit to curriculum.json, and would fail the build until someone
made it. That tradeoff was weighed and declined. Also outside: non-page build
outputs (media, .pack.json sidecars, index.html).

A new *durable* page reaches this guard as soon as it reaches shipped_pages.json.
Registering it in site_manifest.json is the intended route; a page arriving by any
other route must be wired into shipped_pages.py, which the build gate enforces.

Exits non-zero and prints every violation.
Usage:  python3 validate_curriculum.py [curriculum.json] [repo root holding
        13_Faculty_Resources/_automation/site_build/shipped_pages.json]
        [topic_meta.json] [evidence_registry.json]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

sys.path.insert(0, os.path.join(HERE, "site_build"))
from shipped_pages import ShippedPagesError, load_shipped_pages  # noqa: E402
from welcome_compass import CompassContractError, prepare_cards  # noqa: E402

# The weekly-case producer, excluded from every set below by the decision recorded
# in this module's docstring. Named once so the exclusion is greppable.
COTW_PRODUCER = "cotw_registry"


def shipped_sets(root):
    """What ships, split the three ways this validator asks about it.

    Returns ``(tool_slugs, md_slugs, site_shipped)``. ``site_shipped`` is keyed by
    this validator's audience names ("ms3", "resident"); the listing uses the build's
    site names ("ms3", "res").

    Fails loudly rather than silently narrowing: an unreadable or malformed listing
    raises, because a short shipped set makes the totality guard false-green, which
    is the exact failure mode ADR-002 was written about.
    """
    document = load_shipped_pages(root)
    pages = [page for page in document["pages"] if page["producer"] != COTW_PRODUCER]
    tool_slugs = {page["slug"] for page in pages if page["kind"] == "tool"}
    md_slugs = {page["slug"] for page in pages if page["kind"] == "page"}
    site_shipped = {
        "ms3": {page["slug"] for page in pages if "ms3" in page["sites"]},
        "resident": {page["slug"] for page in pages if "res" in page["sites"]},
    }
    return tool_slugs, md_slugs, site_shipped


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
PATH_CONTRACT = {
    "ms3": ("ms3-six-week", 6),
    "resident": ("resident-four-week", 4),
}
FOCUS_CATEGORIES = frozenset({
    "anxiety", "childdev", "ethics", "mood", "neurocog", "otherdx",
    "personality", "pharm", "psychosis", "relational", "safety", "substance",
})


def main(argv):
    cur_path = argv[0] if len(argv) > 0 else os.path.join(REPO, "curriculum.json")
    shipped_root = argv[1] if len(argv) > 1 else REPO
    topic_path = argv[2] if len(argv) > 2 else os.path.join(REPO, "topic_meta.json")
    evidence_path = argv[3] if len(argv) > 3 else os.path.join(REPO, "evidence_registry.json")

    if not os.path.exists(cur_path):
        print("curriculum.json not found at %s — nothing to validate (skipping)." % cur_path)
        return 0

    cur = json.load(open(cur_path, encoding="utf-8"))
    topic_meta = json.load(open(topic_path, encoding="utf-8"))
    evidence_registry = json.load(open(evidence_path, encoding="utf-8"))

    try:
        tool_slugs, md_slugs, site_shipped = shipped_sets(shipped_root)
        # The Compass gate below asks the listing about each week's landing page directly —
        # kind, sites and slug together — which the three flattened sets no longer carry.
        # Loading the document a second time keeps shipped_sets' signature the ADR-002 shape
        # every other reader uses; the read is a small local JSON file.
        shipped_document = load_shipped_pages(shipped_root)
    except ShippedPagesError as error:
        print("curriculum.json INVALID — %s" % error)
        return 1
    shipped = tool_slugs | md_slugs

    # ---- rights references: curriculum.json must agree with the publication contract ----
    # instrument_rights.json (INV-IR1, #412) is the authority on which pages exist to say an
    # instrument is NOT reproduced. curriculum.json repeats the list because fd_data.js builds the
    # front-door index from curriculum alone; this check is what stops the copy from drifting.
    rights_refs = set(cur.get("rightsReferences") or [])
    rights_path = os.path.join(REPO, "instrument_rights.json")
    contract_refs = set()
    if os.path.exists(rights_path):
        rights_doc = json.load(open(rights_path, encoding="utf-8"))
        for entry in rights_doc.get("instruments", []):
            for page in entry.get("pages", []):
                if page.get("requiredDisclaimerType") == "instrument-not-reproduced":
                    contract_refs.add(page.get("file"))

    errs = []

    def bad(where, msg):
        errs.append("%s: %s" % (where, msg))

    # Synonym keys: a key with a space is a PHRASE, matched whole-phrase against the raw query.
    # Both forms must be lowercase and trimmed or they can never match a lowercased query — a
    # silently-inert entry is worse than a rejected one, because it looks like coverage.
    synonyms = cur.get("synonyms")
    if not isinstance(synonyms, dict):
        bad("synonyms", "must be an object")
        synonyms = {}
    for key, expansion in sorted(synonyms.items()):
        if key != key.strip().lower() or not key:
            bad("synonyms", "key %r must be lowercase and trimmed, or it can never match" % (key,))
        if not isinstance(expansion, str) or not expansion.strip():
            bad("synonyms", "key %r needs a non-empty expansion" % (key,))
            continue
        if expansion != expansion.strip().lower():
            bad("synonyms", "expansion for %r must be lowercase and trimmed" % (key,))
        if "  " in key:
            bad("synonyms", "phrase key %r must use single spaces" % (key,))

    if contract_refs and rights_refs != contract_refs:
        bad("rightsReferences",
            "must equal the set of instrument_rights.json pages marked "
            "'instrument-not-reproduced'. curriculum has %s; the contract has %s"
            % (sorted(rights_refs) or "nothing", sorted(contract_refs)))
    for ref in sorted(rights_refs):
        if ref not in tool_slugs:
            bad("rightsReferences",
                "'%s' must be a shipped .html page (a rights reference replaces a tool)" % ref)

    # ---- each audience path has the exact count, categories, and site-shipped refs ----
    paths = cur.get("learningPaths")
    if not isinstance(paths, dict):
        bad("learningPaths", "must be an object with ms3 and resident entries")
        paths = {}

    path_totals = {}
    for site, (expected_id, expected_count) in PATH_CONTRACT.items():
        path = paths.get(site)
        label = "learningPaths.%s" % site
        if not isinstance(path, dict):
            bad(label, "must be an object")
            continue
        if path.get("id") != expected_id:
            bad(label, "id must be '%s'" % expected_id)
        weeks = path.get("weeks") if isinstance(path.get("weeks"), list) else []
        numbers = [w.get("n") for w in weeks if isinstance(w, dict)
                   and isinstance(w.get("n"), int) and not isinstance(w.get("n"), bool)]
        if numbers != list(range(1, expected_count + 1)):
            bad(label, "week numbers must be exactly 1..%d in order, got %r" %
                (expected_count, numbers))
        for index, week in enumerate(weeks):
            week_label = "%s week %s" % (label,
                                           week.get("n") if isinstance(week, dict) else index + 1)
            if not isinstance(week, dict):
                bad(week_label, "must be an object")
                continue
            for field in ("title", "theme"):
                if not isinstance(week.get(field), str) or not week.get(field).strip():
                    bad(week_label, "'%s' must be a non-empty string" % field)
            focus = week.get("focusCategories")
            if not isinstance(focus, list) or not focus:
                bad(week_label, "focusCategories must be a non-empty list")
                focus = []
            if len({value for value in focus if isinstance(value, str)}) != len(focus):
                bad(week_label, "focusCategories must contain unique strings")
            for value in focus:
                if value not in FOCUS_CATEGORIES:
                    bad(week_label, "unknown focus category %r" % value)
            items = week.get("items")
            if not isinstance(items, list):
                bad(week_label, "items must be a list")
                continue
            seen_refs = set()
            for item in items:
                if not isinstance(item, dict):
                    bad(week_label, "each item must be an object")
                    continue
                ref, kind = item.get("ref"), item.get("kind")
                if not isinstance(ref, str):
                    bad(week_label, "item ref must be a string (got %r)" % (ref,))
                    continue
                if ref in seen_refs:
                    bad(week_label, "duplicate ref '%s' within the week" % ref)
                seen_refs.add(ref)
                if ref not in site_shipped[site]:
                    bad(week_label, "ref '%s' is not shipped on %s" % (ref, site))
                    continue
                expected_kind = "tool" if ref in tool_slugs else "read"
                if kind != expected_kind:
                    bad(week_label, "ref '%s' has kind '%s' but the build ships it as '%s'" %
                        (ref, kind, expected_kind))
        if site == "ms3":
            try:
                prepare_cards(weeks, shipped_document)
            except CompassContractError as error:
                bad(label, str(error))
        path_totals[site] = sum(len(w.get("items", [])) for w in weeks if isinstance(w, dict))

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
        # Crisis routing is explicit vocabulary, not a stopword accident. Before 2026-08-28 the
        # only token in "i want to kill myself" that reached pg_suicide.md was the stopword "to",
        # substring-matched inside "thoughts" -- one copy-edit away from silently deleting the
        # safety kit from every plain-language suicide query. An empty list re-opens that hole.
        triggers = ent.get("triggers")
        if not isinstance(triggers, list) or not triggers:
            bad("safetyKit", "entry '%s' needs a non-empty 'triggers' list -- the protocol pass "
                             "routes crisis queries by this vocabulary" % (ref,))
        else:
            for trig in triggers:
                if not isinstance(trig, str) or trig != trig.strip().lower() or len(trig) < 2:
                    bad("safetyKit",
                        "entry '%s' trigger %r must be a lowercase, trimmed string of 2+ chars"
                        % (ref, trig))
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

    print("curriculum.json OK — ms3 6 weeks/%d items; resident 4 weeks/%d items; "
          "%d pages placed, %d excluded." %
          (path_totals.get("ms3", 0), path_totals.get("resident", 0),
           len(placed), len(excluded)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
