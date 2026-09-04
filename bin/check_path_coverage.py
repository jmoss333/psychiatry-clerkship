#!/usr/bin/env python3
"""How much of each site's Library is actually REQUIRED — the number nobody was keeping.

An external audit (2026-09-04) found the resident required Path "substantially narrower
than the Library": mood, psychosis and substance are required, anxiety/OCD is not;
psychotherapy, geriatrics, perinatal, culture and sleep are optional browsing. All of
that was true. None of it was measurable, because no tool computed the ratio, so the
Path could drift away from the Library one merge at a time and nothing said so.

This computes it. Per site: how many refs the Library places, how many the Path
requires, the ratio, and — the part that matters — the explicit list of Library refs a
learner is never required to open.

REPORT-ONLY BY DEFAULT, AND THAT IS THE POINT
---------------------------------------------
A low coverage number is not a defect. A six-week library that required everything in it
would be a worse curriculum, not a better one. The defect is an OPTIONAL ref nobody
DECIDED was optional — and telling those two apart needs a faculty judgement this script
must not invent. So it prints and exits 0, the same posture as library_coverage_scan.py
and sweep_unlicensed_claims.py.

`--exemptions FILE` supplies that judgement once it exists: a JSON object mapping each
deliberately-optional ref to a written reason,

    {"ms3": {"canon_200.md": "resident reference list; MS3 reads core_readings.md"},
     "resident": {"osce.md": "MS3 exam-prep surface, not resident work"}}

and `--strict` then FAILS on any Library ref that is neither required nor explained.
Wire it into bin/verify.sh with --strict only after the exemption file is filled in;
turning it on with an empty file would fail on all 61 resident refs at once, and a gate
that goes red on day one is a gate somebody deletes in week two.

Usage:
    python3 bin/check_path_coverage.py                      # counts only
    python3 bin/check_path_coverage.py --site resident --list  # and every optional ref
    python3 bin/check_path_coverage.py --exemptions path_coverage_exemptions.json --strict
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITES = ("ms3", "resident")

# Recorded 2026-09-04 against curriculum.json at 1f293cb, so a later run can say whether
# the gap is closing or widening rather than only what it is today. Update deliberately,
# in the PR that moves the number, with the reason in the commit message.
BASELINE = {"ms3": (40, 83), "resident": (31, 92)}


def library_refs(curriculum: dict, site: str) -> list[str]:
    """Refs this site's Library places, in column order.

    Shared `libraryColumns`, plus this site's `siteLibrary.additions`, minus its
    `siteLibrary.exclusions` — the same projection frontdoor_catalog.py performs at
    build time, recomputed here rather than imported so this tool can disagree with
    the builder instead of agreeing with it by construction.
    """
    refs: list[str] = []
    for column in curriculum.get("libraryColumns", []):
        for ref in column.get("refs", []):
            if isinstance(ref, str) and ref not in refs:
                refs.append(ref)
    config = (curriculum.get("siteLibrary") or {}).get(site) or {}
    for addition in config.get("additions", []):
        for ref in addition.get("refs", []):
            if isinstance(ref, str) and ref not in refs:
                refs.append(ref)
    excluded = set(config.get("exclusions", []))
    return [ref for ref in refs if ref not in excluded]


def path_refs(curriculum: dict, site: str) -> list[str]:
    """Refs this site's required Path asks a learner to open, in week order."""
    path = (curriculum.get("learningPaths") or {}).get(site) or {}
    refs: list[str] = []
    for week in path.get("weeks", []):
        for item in week.get("items", []):
            ref = item.get("ref")
            if isinstance(ref, str) and ref not in refs:
                refs.append(ref)
    return refs


def week_rows(curriculum: dict, site: str) -> list[tuple]:
    path = (curriculum.get("learningPaths") or {}).get(site) or {}
    return [(w.get("n"), w.get("title", ""), len(w.get("items", [])))
            for w in path.get("weeks", [])]


def report(curriculum: dict, site: str, exemptions: dict, show_list: bool) -> list[str]:
    library = library_refs(curriculum, site)
    required = path_refs(curriculum, site)
    optional = [ref for ref in library if ref not in required]
    # A Path ref outside the Library would be a page required but unbrowsable.
    # validate_curriculum.py's library-totality rule should make this impossible;
    # reported rather than assumed, because "impossible" is how findings hide.
    unplaced = [ref for ref in required if ref not in library]

    pct = (100.0 * len(required) / len(library)) if library else 0.0
    base = BASELINE.get(site)
    drift = ""
    if base:
        base_pct = 100.0 * base[0] / base[1]
        delta = pct - base_pct
        drift = "  (baseline %d/%d = %.0f%%, %+.0f pt)" % (base[0], base[1], base_pct, delta)

    print("\n%s" % site.upper())
    print("  Library places      %3d refs" % len(library))
    print("  Path requires       %3d refs" % len(required))
    print("  Coverage            %5.0f%%%s" % (pct, drift))
    print("  Optional browsing   %3d refs" % len(optional))
    for n, title, count in week_rows(curriculum, site):
        print("    week %-2s %-46s %2d item(s)" % (n, title[:46], count))

    site_exempt = exemptions.get(site, {}) if isinstance(exemptions, dict) else {}
    unexplained = [ref for ref in optional if ref not in site_exempt]
    if site_exempt:
        print("  Explained optional  %3d refs" % (len(optional) - len(unexplained)))
        print("  UNEXPLAINED         %3d refs" % len(unexplained))

    if show_list:
        print("  Optional refs (no learner is required to open these):")
        for ref in optional:
            reason = site_exempt.get(ref)
            print("    %-32s %s" % (ref, ("— " + reason) if reason else ""))

    errors = []
    for ref in unplaced:
        errors.append("%s: '%s' is on the Path but not placed in the Library "
                      "(required, yet not browsable)" % (site, ref))
    for ref in unexplained:
        errors.append("%s: '%s' is optional with no recorded reason" % (site, ref))
    return errors


SELF_TEST_CURRICULUM = {
    "libraryColumns": [{"name": "C", "refs": ["a.md", "b.md", "gone.md"]}],
    "siteLibrary": {
        "ms3": {"additions": [], "exclusions": ["gone.md"]},
        "resident": {"additions": [{"column": "C", "refs": ["r.md"]}], "exclusions": []},
    },
    "learningPaths": {
        "ms3": {"weeks": [{"n": 1, "title": "W", "items": [{"ref": "a.md"}, {"ref": "a.md"}]}]},
        "resident": {"weeks": [{"n": 1, "title": "W", "items": [{"ref": "r.md"}]}]},
    },
}


def self_test() -> int:
    """Pin the projection: exclusions removed, additions added, duplicates collapsed."""
    cur = SELF_TEST_CURRICULUM
    checks = [
        ("ms3 library drops an exclusion", library_refs(cur, "ms3"), ["a.md", "b.md"]),
        ("resident library adds its extras", library_refs(cur, "resident"),
         ["a.md", "b.md", "gone.md", "r.md"]),
        ("a ref repeated across weeks counts once", path_refs(cur, "ms3"), ["a.md"]),
        ("resident path reads its own weeks", path_refs(cur, "resident"), ["r.md"]),
    ]
    failures = [(label, got, want) for label, got, want in checks if got != want]
    for label, got, want in failures:
        print("self-test FAIL — %s: got %r, want %r" % (label, got, want))
    if failures:
        return 1
    print("path-coverage self-test: OK — %d projection check(s)" % len(checks))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--site", choices=SITES, help="report one site (default: both)")
    parser.add_argument("--exemptions", type=Path,
                        help="JSON of {site: {ref: reason}} for deliberately-optional refs")
    parser.add_argument("--strict", action="store_true",
                        help="exit non-zero on an optional ref with no recorded reason")
    parser.add_argument("--list", action="store_true", dest="show_list",
                        help="always print the optional refs, even when all are explained")
    parser.add_argument("--self-test", action="store_true",
                        help="run the projection checks against a fixture and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    curriculum = json.loads((ROOT / "curriculum.json").read_text(encoding="utf-8"))
    exemptions = {}
    if args.exemptions:
        if not args.exemptions.exists():
            print("path-coverage: exemptions file not found: %s" % args.exemptions,
                  file=sys.stderr)
            return 2
        exemptions = json.loads(args.exemptions.read_text(encoding="utf-8"))

    errors = []
    for site in ([args.site] if args.site else SITES):
        errors.extend(report(curriculum, site, exemptions, args.show_list))

    print()
    if not errors:
        print("path-coverage: OK — every Library ref is required or explained")
        return 0
    if args.strict:
        print("path-coverage: FAIL — %d unexplained or unplaced ref(s)" % len(errors))
        for error in errors:
            print("  - %s" % error)
        return 1
    print("path-coverage: %d ref(s) optional with no recorded reason. Report-only; pass "
          "--exemptions with a reason per ref, then --strict, to make this a gate." % len(errors))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
