#!/usr/bin/env python3
"""check_standards_coverage.py — is the external competency spine honest?

standards.json says which units of each external framework this program claims to address:
the ACGME Psychiatry Milestones for the resident rotation, and (since 2026-09-24) the ADMSEP
Clinical Learning Objectives Guide and the AAMC/AACOM/ACGME Foundational Competencies for
the MS3 clerkship. This asks whether those claims survive contact with the rest of the repo.
The rotation split is reported per framework, because each framework's rotationRequirement
is relative to its own audience's rotation.

The design follows bin/check_path_coverage.py: REPORT-ONLY by default, because a low
coverage number is not a defect — an UNDECIDED item is. `--strict` turns the defects into
a non-zero exit for deliberate use.

Two kinds of finding, and the distinction is the whole point:

  DEFECT   something is wrong or undecided and a human must act
  REPORT   a number worth knowing that is nobody's fault

The rule this file exists to enforce: an empty internalCodes list is NOT automatically a
gap. The internal vocabulary is a DISORDER taxonomy; the Milestones are a COMPETENCY
taxonomy. A unit marked `elsewhere` with a rationale is a coverage ANSWER — the program
addresses it on another rotation and this one is correctly silent. Only `undecided` is
unfinished.

AND THE CORRECTION TO THAT RULE, 2026-09-14: it was being over-applied. This file used to
report all ten unmapped units as "a category mismatch, not a content gap" — while nine of
the ten carried a mappingNote in standards.json that began with the words VOCABULARY GAP.
The rule was written for PC6 and quietly extended amnesty to nine units that are not PC6.
Each unmapped unit must now declare a `mappingStatus`, and the report splits accordingly:
`answered-elsewhere` / `category-mismatch` are correctly silent, `blocked-on-vocabulary`
units ARE content gaps and are reported as such, each naming the code that does not exist
yet. An unnamed gap is a gap nobody fixes; a reassuring summary over contradicting data is
worse than no summary at all, because it is what people read instead of the data.

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
# FC-SBP (Foundational Competencies, Systems-Based Practice) carries the same construct as
# its subcompetency 6 — patient-safety concerns, systems issues, QI — so it is refused the
# same way. Patient Care 4 (urgent/emergent recognition) IS patient risk, which is why
# FC-PC may map to `safety` and FC-SBP may not.
COLLISION = {"SBP1": "safety", "FC-SBP": "safety"}

# DECISION: sbp1-required-inpatient — SBP1 is REQUIRED on the adult inpatient rotation
# (2026-09-14, Joshua Moss, MD). This file is named in that decision's `governs` because
# it is what reports the split and what refuses SBP1 -> `safety`. The ruling creates a
# content obligation; it creates no coverage. SBP1 is now blocked-on-vocabulary below.

# Why an unmapped unit is unmapped. Added 2026-09-14: the single report line this file
# used to print said all ten unmapped units were "a category mismatch, not a content gap"
# — while nine of those ten carried a mappingNote in standards.json that began with the
# words "VOCABULARY GAP". The reassuring sentence was contradicted by the data it was
# summarising, and it was the only thing a reader saw. One word per unit now decides
# which sentence it earns.
#
#   answered-elsewhere     the rotation does not teach it, so silence here is the ANSWER
#   blocked-on-vocabulary  mappable, once a NAMED code is added or split. A REAL gap.
#   category-mismatch      genuinely inexpressible in a disorder taxonomy, for all time
#
# `category-mismatch` is deliberately hard to earn and currently unused. If a unit looks
# like one, check first whether it is really blocked on a code nobody has written yet.
MAPPING_STATUSES = ("answered-elsewhere", "blocked-on-vocabulary", "category-mismatch")


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

    seen, seen_codes = set(), {}
    for u in units:
        code = u.get("code", "?")
        if u.get("framework") not in fw:
            defects.append("%s: framework '%s' is not declared" % (code, u.get("framework")))
        if u.get("id") in seen:
            defects.append("%s: duplicate unit id %s" % (code, u.get("id")))
        seen.add(u.get("id"))
        # Codes, not only ids, must be unique ACROSS frameworks: vocabulary.json's `unblocks`
        # and COLLISION above both resolve a unit by its code, and bin/check_vocabulary.py
        # builds a code-keyed dict — so a second unit with the same code would silently
        # shadow the first and its blocker would stop being checked.
        if code in seen_codes:
            defects.append("%s: duplicate unit code (units %s and %s) — vocabulary.json "
                           "resolves units by code, so one would silently shadow the other"
                           % (code, seen_codes[code], u.get("id")))
        seen_codes.setdefault(code, u.get("id"))

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

        # ---- why an unmapped unit is unmapped. A prose note can say anything; this is
        # the one word the report lines are computed from, so it is checked.
        ms = u.get("mappingStatus")
        if not u.get("internalCodes"):
            if ms not in MAPPING_STATUSES:
                defects.append("%s: maps to no internal code and declares no mappingStatus — "
                               "say which of %s it is. Without it the unit is silently counted "
                               "as 'not a content gap'." % (code, ", ".join(MAPPING_STATUSES)))
            elif ms == "blocked-on-vocabulary" and not str(u.get("mappingBlockedBy", "")).strip():
                defects.append("%s: mappingStatus 'blocked-on-vocabulary' with no "
                               "mappingBlockedBy — name the code that does not exist yet. "
                               "A gap nobody named is a gap nobody fixes." % code)
        elif ms is not None:
            defects.append("%s: has internalCodes (%s) AND a mappingStatus of %r — "
                           "mappingStatus explains an ABSENCE and must be removed once the "
                           "unit maps to something" % (code, ", ".join(u["internalCodes"]), ms))

        if u.get("review") == "approved" and not (u.get("reviewedBy") and u.get("reviewedOn")):
            defects.append("%s: review 'approved' without reviewedBy/reviewedOn" % code)

    # ---- reports: numbers worth knowing, nobody's fault
    pend = [u["code"] for u in units if u.get("review") == "pending"]
    if pend:
        report.append("HUMAN REVIEW GATE: %d of %d unit(s) still pending — nothing here is "
                      "publishable yet" % (len(pend), len(units)))
    # One split PER FRAMEWORK. rotationRequirement is relative to the rotation that
    # framework's audience does here (the resident rotation for the Milestones, the MS3
    # clerkship for the student frameworks), so summing across frameworks would add two
    # different rotations into one number that describes neither.
    for key in fw:
        fu = [u for u in units if u.get("framework") == key]
        if not fu:
            report.append("%s: framework registered with NO units — nothing can be mapped "
                          "against it until its units are written" % key)
            continue
        req = [u for u in fu if u.get("rotationRequirement") == "required"]
        els = [u for u in fu if u.get("rotationRequirement") == "elsewhere"]
        report.append("rotation split — %s: %d required on its rotation, %d addressed "
                      "elsewhere, %d undecided"
                      % (key, len(req), len(els), len(fu) - len(req) - len(els)))
    unmapped = [u for u in units if not u.get("internalCodes")]
    by_status = {}
    for u in unmapped:
        by_status.setdefault(u.get("mappingStatus"), []).append(u)

    silent = [u["code"] for s in ("answered-elsewhere", "category-mismatch")
              for u in by_status.get(s, [])]
    if silent:
        report.append("%d of %d unit(s) are correctly silent here — the rotation does not "
                      "teach them, or a disorder vocabulary cannot express them. NOT content "
                      "gaps: %s" % (len(silent), len(units), ", ".join(sorted(silent))))

    blocked = by_status.get("blocked-on-vocabulary", [])
    if blocked:
        # This line exists because its absence was the defect. Everything unmapped used to
        # be reported as "not a content gap", including nine units whose own notes in
        # standards.json said "VOCABULARY GAP". A reassuring summary over contradicting
        # data is worse than no summary: it is the thing people read instead of the data.
        report.append("%d of %d unit(s) are BLOCKED ON VOCABULARY — these ARE content gaps. "
                      "Each is mappable the day a named code exists; none is mapped today, "
                      "so the coverage they imply does not exist: %s"
                      % (len(blocked), len(units),
                         ", ".join(u["code"] for u in blocked)))
        for u in blocked:
            report.append("    %-6s needs: %s" % (u["code"], u.get("mappingBlockedBy", "?")))
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
    d, _ = check(one(code="SBP1", internalCodes=[], mappingNote="n/a", rotationRequirement="elsewhere",
                     mappingStatus="answered-elsewhere"), root=root)
    expect("SBP1 unmapped is fine", any("REFUSED" in x for x in d), False)
    d, _ = check(one(rotationRequirement="undecided"), root=root)
    expect("undecided is a defect", any("UNDECIDED" in x for x in d), True)
    d, _ = check(one(rotationRequirement="elsewhere", rotationRationale=""), root=root)
    expect("placement without rationale is a defect", any("no rationale" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote=""), root=root)
    expect("required + unmapped + unexplained is the real zero-coverage case",
           any("real zero-coverage" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote="unmappable by construction",
                     mappingStatus="category-mismatch"), root=root)
    expect("required + unmapped WITH an explanation is not a defect",
           any("real zero-coverage" in x for x in d), False)

    # ---- mappingStatus. The reassuring report line was the defect; this is what fixes it.
    d, _ = check(one(internalCodes=[], mappingNote="VOCABULARY GAP: documentation."), root=root)
    expect("an unmapped unit that declares no mappingStatus is a defect",
           any("declares no mappingStatus" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote="x", mappingStatus="vibes"), root=root)
    expect("a made-up mappingStatus is a defect",
           any("declares no mappingStatus" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote="x", mappingStatus="blocked-on-vocabulary"), root=root)
    expect("blocked-on-vocabulary without naming the blocker is a defect",
           any("no mappingBlockedBy" in x for x in d), True)
    d, _ = check(one(internalCodes=[], mappingNote="x", mappingStatus="blocked-on-vocabulary",
                     mappingBlockedBy="no code for documentation"), root=root)
    expect("blocked-on-vocabulary that names its blocker is clean", d, [])
    d, _ = check(one(mappingStatus="category-mismatch"), root=root)
    expect("a MAPPED unit may not also claim a mappingStatus",
           any("must be removed once the unit maps" in x for x in d), True)

    # The report lines are the deliverable here, so they are asserted, not eyeballed.
    blocked_unit = one(internalCodes=[], mappingNote="x", mappingStatus="blocked-on-vocabulary",
                       mappingBlockedBy="no code for documentation")
    _, rep = check(blocked_unit, root=root)
    expect("a blocked unit is reported as a REAL content gap",
           any("BLOCKED ON VOCABULARY" in x and "ARE content gaps" in x for x in rep), True)
    expect("...and is NOT counted among the correctly silent",
           any("NOT content gaps" in x for x in rep), False)
    expect("...and the missing code is named in the report",
           any("no code for documentation" in x for x in rep), True)
    _, rep = check(one(internalCodes=[], mappingNote="x", mappingStatus="answered-elsewhere",
                       rotationRequirement="elsewhere"), root=root)
    expect("an answered-elsewhere unit is reported as correctly silent",
           any("NOT content gaps" in x for x in rep), True)
    expect("...and raises no gap alarm",
           any("BLOCKED ON VOCABULARY" in x for x in rep), False)

    d, _ = check(one(review="approved"), root=root)
    expect("approved without a reviewer is a defect", any("reviewedBy" in x for x in d), True)

    # ---- more than one framework. Added 2026-09-24 with the two student frameworks: until
    # then every unit belonged to one framework and one rotation, so a single summary line
    # and a code-keyed lookup were both safe. Neither is any more.
    fw_b = dict(base["frameworks"][0]); fw_b["key"] = "g"
    two = dict(base)
    two["frameworks"] = [base["frameworks"][0], fw_b]

    def unit(uid, fwk, code, rr="required"):
        return {"id": uid, "framework": fwk, "code": code, "title": "Title", "domain": "D",
                "rotationRequirement": rr, "rotationRationale": "because it is enacted here",
                "internalCodes": ["mood"], "review": "pending"}

    two["units"] = [unit("a1", "f", "PC1"), unit("b1", "g", "PC1")]
    d, _ = check(two, root=root)
    expect("the same unit code in two frameworks is a defect (vocabulary.json resolves "
           "units by code, so one would silently shadow the other)",
           any("duplicate unit code" in x for x in d), True)

    two["units"] = [unit("a1", "f", "PC1"), unit("a2", "f", "PC2", rr="elsewhere"),
                    unit("b1", "g", "FC-MK")]
    d, rep = check(two, root=root)
    expect("distinct codes across two frameworks are clean", d, [])
    expect("each framework gets its OWN rotation split — two rotations never sum",
           [x for x in rep if x.startswith("rotation split")],
           ["rotation split — f: 1 required on its rotation, 1 addressed elsewhere, 0 undecided",
            "rotation split — g: 1 required on its rotation, 0 addressed elsewhere, 0 undecided"])

    two["units"] = [unit("a1", "f", "PC1")]
    _, rep = check(two, root=root)
    expect("a framework registered with no units is reported, not silently skipped",
           any(x.startswith("g: framework registered with NO units") for x in rep), True)

    d, _ = check(one(code="FC-SBP", internalCodes=["safety"]), root=root)
    expect("FC-SBP -> safety is REFUSED (Systems-Based Practice 6 is the SBP1 construct)",
           any("REFUSED" in x for x in d), True)

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
