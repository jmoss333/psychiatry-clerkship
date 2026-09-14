#!/usr/bin/env python3
"""check_standards_coverage.py — is the external competency spine honest?

standards.json says which ACGME Psychiatry Milestones subcompetencies this program's
resident rotation claims to address. This asks whether those claims survive contact with
the rest of the repo.

The design follows bin/check_path_coverage.py: REPORT-ONLY by default, because a low
coverage number is not a defect — an UNDECIDED item is. `--strict` turns the defects into
a non-zero exit for deliberate use.

Two kinds of finding, and the distinction is the whole point:

  DEFECT   something is wrong or undecided and a human must act
  REPORT   a number worth knowing that is nobody's fault

The rule this file exists to enforce: an empty internalCodes list is NOT automatically a
gap. The internal vocabulary is a DISORDER taxonomy; the Milestones are a COMPETENCY
taxonomy. Nine of 21 units are unmappable by construction. A unit marked `elsewhere` with
a rationale is a coverage ANSWER — the program addresses it on another rotation and this
one is correctly silent. Only `undecided` is unfinished.

Usage:
    python3 bin/check_standards_coverage.py            # report, exit 0
    python3 bin/check_standards_coverage.py --strict   # exit 1 on any defect
    python3 bin/check_standards_coverage.py --self-test
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REGISTRY = os.path.join(ROOT, "standards.json")

# The twelve codes are FOCUS_CATEGORIES and SHELF_VOCAB both — they are the same list, so
# adding or splitting one touches two vocabularies and the shelf blueprint.
INTERNAL_CODES = {
    "anxiety", "childdev", "ethics", "mood", "neurocog", "otherdx",
    "personality", "pharm", "psychosis", "relational", "safety", "substance",
}

# SBP1 is institutional safety events, disclosure and RCAs. `safety` in this repo means
# patient risk — suicide and violence. Mapping one to the other manufactures false
# coverage on the most safety-critical code in the vocabulary. RQ-1 finding f4.
COLLISION = {"SBP1": "safety"}


def load(path=REGISTRY):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def check(doc, root=ROOT):
    """Return (defects, report_lines)."""
    defects, report = [], []
    fw = {f["key"]: f for f in doc.get("frameworks", [])}
    units = doc.get("units", [])

    # ---- rights come first: nothing may ship on an unverified grant.
    for key, f in fw.items():
        r = f.get("rights", {})
        if r.get("status") == "granted":
            cap = r.get("archivedCopy")
            if not cap:
                defects.append("%s: rights are 'granted' with no archivedCopy — a permission "
                               "sentence on a web page is not a record" % key)
            elif not os.path.isfile(os.path.join(root, cap)):
                defects.append("%s: archivedCopy does not exist on disk: %s" % (key, cap))
            if not r.get("grantText"):
                defects.append("%s: rights are 'granted' but the grant is not quoted verbatim" % key)
        elif r.get("status") == "not-established":
            report.append("%s: rights NOT ESTABLISHED — reference mode only "
                          "(cite the identifier, paraphrase the title)" % key)
        if r.get("titlesReproducible") is False:
            report.append("%s: unit titles may NOT be reproduced; pages must paraphrase" % key)

    seen = set()
    for u in units:
        code = u.get("code", "?")
        if u.get("framework") not in fw:
            defects.append("%s: framework '%s' is not declared" % (code, u.get("framework")))
        if u.get("id") in seen:
            defects.append("%s: duplicate unit id %s" % (code, u.get("id")))
        seen.add(u.get("id"))

        bad = [c for c in u.get("internalCodes", []) if c not in INTERNAL_CODES]
        if bad:
            defects.append("%s: internal code(s) not in the vocabulary: %s" % (code, ", ".join(bad)))

        if code in COLLISION and COLLISION[code] in u.get("internalCodes", []):
            defects.append(
                "%s: mapped to '%s' — REFUSED. That code means patient risk (suicide, violence); "
                "this unit means institutional safety events. Mapping them together manufactures "
                "false coverage. Split the code first (safety-risk / safety-systems)."
                % (code, COLLISION[code]))

        rr = u.get("rotationRequirement")
        if rr == "undecided":
            defects.append("%s: rotationRequirement UNDECIDED — a faculty decision, not a gap "
                           "(%s)" % (code, u.get("rotationRationale", "no rationale recorded")[:90]))
        if rr in ("required", "elsewhere") and not str(u.get("rotationRationale", "")).strip():
            defects.append("%s: rotationRequirement '%s' with no rationale — an unexplained "
                           "placement is not a decision" % (code, rr))
        if rr == "required" and not u.get("internalCodes") and not str(u.get("mappingNote", "")).strip():
            defects.append("%s: REQUIRED on this rotation, mapped to nothing, and no mappingNote "
                           "says why — this is the real zero-coverage case" % code)

        if u.get("review") == "approved" and not (u.get("reviewedBy") and u.get("reviewedOn")):
            defects.append("%s: review 'approved' without reviewedBy/reviewedOn" % code)

    # ---- reports: numbers worth knowing, nobody's fault
    pend = [u["code"] for u in units if u.get("review") == "pending"]
    if pend:
        report.append("HUMAN REVIEW GATE: %d of %d unit(s) still pending — nothing here is "
                      "publishable yet" % (len(pend), len(units)))
    req = [u for u in units if u.get("rotationRequirement") == "required"]
    els = [u for u in units if u.get("rotationRequirement") == "elsewhere"]
    report.append("rotation split: %d required on this rotation, %d addressed elsewhere, "
                  "%d undecided" % (len(req), len(els), len(units) - len(req) - len(els)))
    unmapped = [u["code"] for u in units if not u.get("internalCodes")]
    report.append("%d of %d unit(s) map to no internal code (%s) — expected: a disorder "
                  "vocabulary cannot express a competency taxonomy, so this is a category "
                  "mismatch, not a content gap" % (len(unmapped), len(units), ", ".join(unmapped)))
    used = {c for u in units for c in u.get("internalCodes", [])}
    unused = sorted(INTERNAL_CODES - used)
    if unused:
        report.append("internal code(s) no unit maps to: %s" % ", ".join(unused))
    return defects, report


def _self_test():
    ok = True

    def expect(name, got, want):
        nonlocal ok
        if got != want:
            ok = False
            print("  FAIL %s (got %r, wanted %r)" % (name, got, want))
        else:
            print("  ok   %s" % name)

    base = {
        "schemaVersion": 1,
        "frameworks": [{"key": "f", "name": "A framework name", "version": "1", "authority": "X",
                        "versionDate": "2020-03-01",
                        "rights": {"status": "granted", "grantText": "a" * 30,
                                   "sourceUrl": "https://x.example/", "verifiedOn": "2026-09-10",
                                   "archivedCopy": "standards.json", "titlesReproducible": True}}],
        "units": [],
    }

    def one(**over):
        u = {"id": "u1", "framework": "f", "code": "PC1", "title": "Title", "domain": "D",
             "rotationRequirement": "required", "rotationRationale": "because it is enacted here",
             "internalCodes": ["mood"], "review": "pending"}
        u.update(over)
        d = dict(base); d["units"] = [u]
        return d

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, ".."))

    d, _ = check(one(), root=root)
    expect("a well-formed unit is clean", d, [])
    d, _ = check(one(internalCodes=["nope"]), root=root)
    expect("unknown internal code is caught", any("not in the vocabulary" in x for x in d), True)
    d, _ = check(one(code="SBP1", internalCodes=["safety"]), root=root)
    expect("SBP1 -> safety is REFUSED", any("REFUSED" in x for x in d), True)
    d, _ = check(one(code="SBP1", internalCodes=[], mappingNote="n/a", rotationRequirement="elsewhere"), root=root)
    expect("SBP1 unmapped is fine", any("REFUSED" in x for x in d), False)
    d, _ = check(one(rotationRequirement="undecided"), root=root)
    expect("undecided is a defect", any("UNDECIDED" in x for x in d), True)
    d, _ = check(one(rotationRequirement="elsewhere", rotationRationale=""), root=root)
    expect("placement without rationale is a defect", any("no rationale" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote=""), root=root)
    expect("required + unmapped + unexplained is the real zero-coverage case",
           any("real zero-coverage" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote="unmappable by construction"), root=root)
    expect("required + unmapped WITH an explanation is not a defect",
           any("real zero-coverage" in x for x in d), False)
    d, _ = check(one(review="approved"), root=root)
    expect("approved without a reviewer is a defect", any("reviewedBy" in x for x in d), True)

    bad = dict(base)
    bad["frameworks"] = [dict(base["frameworks"][0])]
    bad["frameworks"][0]["rights"] = dict(bad["frameworks"][0]["rights"])
    bad["frameworks"][0]["rights"]["archivedCopy"] = "nope/missing.txt"
    bad["units"] = []
    d, _ = check(bad, root=root)
    expect("a missing rights capture is caught", any("does not exist on disk" in x for x in d), True)

    print("self-test: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def main(argv=None):
    p = argparse.ArgumentParser(description="Report standards-spine coverage and defects.")
    p.add_argument("--strict", action="store_true", help="exit 1 on any defect")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args(argv)

    if args.self_test:
        return _self_test()

    try:
        doc = load()
    except FileNotFoundError:
        print("standards.json not found", file=sys.stderr)
        return 2

    defects, report = check(doc)
    for line in report:
        print("  [report] %s" % line)
    if not defects:
        print("standards coverage: OK — %d unit(s), no defects." % len(doc.get("units", [])))
        return 0
    print("standards coverage: %d defect(s)" % len(defects))
    for x in defects:
        print("  - %s" % x)
    return 1 if args.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
