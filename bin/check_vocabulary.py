#!/usr/bin/env python3
"""check_vocabulary.py — the internal content vocabulary is data, and the code must agree.

Until 2026-09-14 the twelve internal codes existed ONLY as six hard-coded literals in five
files:

    bin/check_standards_coverage.py                          INTERNAL_CODES
    13_Faculty_Resources/_automation/validate_curriculum.py  FOCUS_CATEGORIES
    13_Faculty_Resources/_automation/validate_topic_meta.py  SHELF_VOCAB
    .../site_build/cotw_meta.py                              SHELF_VOCAB
    .../site_build/crosswalk_apply.py                        SHELF_VOCAB
    .../site_build/check-static-site.mjs                     SHELF_VOCAB  (TWICE)

Nothing checked that they agreed. That is the real reason the `safety` split has been
"the obvious next step" since RQ-1 and has never happened: the edit is six places in two
languages, invisible to every gate, and a half-done one produces silent miscoverage rather
than an error. A vocabulary nobody dares edit is a vocabulary that stops describing the
curriculum.

So `vocabulary.json` is now the source of truth and this checker holds the code to it.

  DEFECT  the sites disagree with the registry, or a proposed code has shipped early,
          or a claimed payoff is not agreed to by standards.json
  REPORT  the queue: how many blocked units each proposed code would unblock

The design follows bin/check_standards_coverage.py: report-only by default, `--strict`
for deliberate use, `--self-test` proving it can fail. Report-only because a vocabulary
gap is a curriculum decision, not a broken file, and must never be able to stop a clinical
correction from being pushed.

Usage:
    python3 bin/check_vocabulary.py            # report, exit 0
    python3 bin/check_vocabulary.py --strict   # exit 1 on any defect
    python3 bin/check_vocabulary.py --self-test
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REGISTRY = os.path.join(ROOT, "vocabulary.json")
STANDARDS = os.path.join(ROOT, "standards.json")

A = "13_Faculty_Resources/_automation"

# (path, the assignment prefix to look for). EVERY occurrence in the file is checked, not
# just the first — check-static-site.mjs declares SHELF_VOCAB twice, in two scopes, and a
# checker that read only the first would have been blind to exactly half of that file.
SITES = (
    ("bin/check_standards_coverage.py", "INTERNAL_CODES = {"),
    ("%s/validate_curriculum.py" % A, "FOCUS_CATEGORIES = frozenset({"),
    ("%s/validate_topic_meta.py" % A, "SHELF_VOCAB = {"),
    ("%s/site_build/cotw_meta.py" % A, "SHELF_VOCAB = {"),
    ("%s/site_build/crosswalk_apply.py" % A, "SHELF_VOCAB = ["),
    ("%s/site_build/check-static-site.mjs" % A, "SHELF_VOCAB = ["),
)

TOKEN_RE = re.compile(r"""['"]([a-z][a-z-]*)['"]""")
CLOSERS = {"{": "}", "[": "]"}


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def literals_in(text, marker):
    """Every code-set literal introduced by `marker`, as a list of sets, in file order.

    Deliberately dumb: find the marker, read forward to the first closing delimiter, take
    the quoted lowercase tokens. It cannot be fooled by a code that is present but
    commented out, because a commented-out code IS absent from the running set — which is
    the thing being checked.
    """
    out = []
    closer = CLOSERS[marker.rstrip()[-1]]
    start = 0
    while True:
        i = text.find(marker, start)
        if i < 0:
            return out
        j = text.find(closer, i + len(marker))
        if j < 0:
            return out
        out.append(set(TOKEN_RE.findall(text[i + len(marker):j])))
        start = j


def check(vocab, standards, root=ROOT, sites=SITES):
    """Return (defects, report_lines)."""
    defects, report = [], []
    codes = vocab.get("codes", [])

    seen = set()
    for c in codes:
        cid = c.get("id", "?")
        if cid in seen:
            defects.append("%s: duplicate code id" % cid)
        seen.add(cid)
    active = {c["id"] for c in codes if c.get("status") == "active"}
    proposed = {c["id"] for c in codes if c.get("status") == "proposed"}

    # ---- 1. the six sites must agree with the registry, exactly.
    for rel, marker in sites:
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            defects.append("%s: code site does not exist — SITES is stale, which means this "
                           "checker is checking less than it claims" % rel)
            continue
        with open(path, encoding="utf-8") as fh:
            found = literals_in(fh.read(), marker)
        if not found:
            defects.append("%s: no %r literal found — it was renamed or removed, and this "
                           "checker went quiet instead of failing" % (rel, marker.strip()))
            continue
        for n, got in enumerate(found):
            where = rel if len(found) == 1 else "%s (#%d)" % (rel, n + 1)
            missing = sorted(active - got)
            if missing:
                defects.append("%s: active code(s) missing from the code: %s"
                               % (where, ", ".join(missing)))
            early = sorted(got & proposed)
            if early:
                defects.append("%s: PROPOSED code(s) already shipped here: %s — a half-added "
                               "code tags content that no other site can read. Ship it "
                               "everywhere and flip status to active, or take it out."
                               % (where, ", ".join(early)))
            stray = sorted(got - active - proposed)
            if stray:
                defects.append("%s: code(s) not in vocabulary.json at all: %s"
                               % (where, ", ".join(stray)))

    # ---- 2. a proposal must be a real proposal.
    units = {u.get("code"): u for u in standards.get("units", [])}
    for c in codes:
        cid = c.get("id", "?")
        if c.get("status") != "proposed":
            if c.get("unblocks") or c.get("supersedes"):
                defects.append("%s: status %r but still carries unblocks/supersedes — those "
                               "describe a queue entry, not a shipped code"
                               % (cid, c.get("status")))
            continue
        if len(str(c.get("rationale", "")).strip()) < 20:
            defects.append("%s: proposed with no rationale — a proposal nobody argued for is "
                           "a proposal nobody can evaluate" % cid)
        if not c.get("unblocks") and not c.get("supersedes"):
            defects.append("%s: proposed but unblocks nothing and supersedes nothing — the "
                           "point of the queue is that every entry has a known payoff" % cid)
        for old in c.get("supersedes", []):
            if old not in active:
                defects.append("%s: supersedes %r, which is not an active code" % (cid, old))
        # ---- 3. both directions. A proposal may not claim a payoff the spine denies.
        for ucode in c.get("unblocks", []):
            u = units.get(ucode)
            if u is None:
                defects.append("%s: claims to unblock %s, which is not a unit in standards.json"
                               % (cid, ucode))
            elif u.get("mappingStatus") != "blocked-on-vocabulary":
                defects.append("%s: claims to unblock %s, but that unit is %r, not "
                               "blocked-on-vocabulary" % (cid, ucode, u.get("mappingStatus")))
            elif u.get("blockedByCode") != cid:
                defects.append("%s: claims to unblock %s, but that unit says it is blocked by "
                               "%r — one of the two is wrong and the payoff cannot be trusted"
                               % (cid, ucode, u.get("blockedByCode")))

    # ---- 4. and the other direction, so a unit cannot be blocked on a code nobody proposed.
    for ucode, u in units.items():
        if u.get("mappingStatus") != "blocked-on-vocabulary":
            continue
        bc = u.get("blockedByCode")
        if not bc:
            defects.append("%s: blocked-on-vocabulary with no blockedByCode — say which queue "
                           "entry delivers it" % ucode)
        elif bc in active:
            defects.append("%s: blocked by %r, which is ALREADY ACTIVE — either map the unit "
                           "or correct the blocker" % (ucode, bc))
        elif bc not in proposed:
            defects.append("%s: blocked by %r, which is not a proposed code in vocabulary.json"
                           % (ucode, bc))
        elif ucode not in vocab_code(codes, bc).get("unblocks", []):
            defects.append("%s: blocked by %r, but that code does not list %s in its unblocks"
                           % (ucode, bc, ucode))

    # ---- reports: the queue, ordered by payoff. This is the deliverable.
    report.append("%d active code(s), %d proposed" % (len(active), len(proposed)))
    queue = [c for c in codes if c.get("status") == "proposed"]
    queue.sort(key=lambda c: (-len(c.get("unblocks", [])), c["id"]))
    if queue:
        report.append("VOCABULARY QUEUE — what each proposed code buys, most first:")
        for c in queue:
            ub = c.get("unblocks", [])
            sup = c.get("supersedes", [])
            what = ("unblocks %d unit(s): %s" % (len(ub), ", ".join(ub))) if ub else "unblocks nothing directly"
            if sup:
                what += "; supersedes %s" % ", ".join(sup)
            report.append("    %-20s %s" % (c["id"], what))
        report.append("Each costs the SAME edit: %d code site(s) in two languages, plus this "
                      "registry. That cost is why none has happened; the payoff above is what "
                      "makes it arguable." % (len(sites) + 1))
    return defects, report


def vocab_code(codes, cid):
    for c in codes:
        if c.get("id") == cid:
            return c
    return {}


def _self_test():
    ok = True

    def expect(name, got, want):
        nonlocal ok
        if got != want:
            ok = False
            print("  FAIL %s (got %r, wanted %r)" % (name, got, want))
        else:
            print("  ok   %s" % name)

    import tempfile

    def build(tmp, site_text, vocab, standards):
        os.makedirs(os.path.join(tmp, "bin"), exist_ok=True)
        with open(os.path.join(tmp, "bin", "fake.py"), "w", encoding="utf-8") as fh:
            fh.write(site_text)
        return check(vocab, standards, root=tmp, sites=(("bin/fake.py", "VOCAB = {"),))

    V_ACTIVE = {"schemaVersion": 1, "codes": [
        {"id": "mood", "label": "Mood", "status": "active"},
        {"id": "safety", "label": "Safety", "status": "active"}]}
    S_EMPTY = {"units": []}

    with tempfile.TemporaryDirectory() as tmp:
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', V_ACTIVE, S_EMPTY)
        expect("code that matches the registry is clean", d, [])
        d, _ = build(tmp, 'VOCAB = {"mood"}\n', V_ACTIVE, S_EMPTY)
        expect("an active code missing from the code is caught",
               any("missing from the code: safety" in x for x in d), True)
        d, _ = build(tmp, 'VOCAB = {"mood", "safety", "surprise"}\n', V_ACTIVE, S_EMPTY)
        expect("a code the registry never heard of is caught",
               any("not in vocabulary.json at all: surprise" in x for x in d), True)
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\nVOCAB = {"mood"}\n', V_ACTIVE, S_EMPTY)
        expect("the SECOND literal in a file is checked too (the .mjs case)",
               any("(#2)" in x and "missing from the code" in x for x in d), True)
        d, _ = build(tmp, 'NOTHING = {"mood"}\n', V_ACTIVE, S_EMPTY)
        expect("a renamed literal fails loudly instead of going quiet",
               any("went quiet instead of failing" in x for x in d), True)

        # a proposed code must not be shipped early
        v = {"schemaVersion": 1, "codes": [
            {"id": "mood", "label": "Mood", "status": "active"},
            {"id": "safety", "label": "Safety", "status": "active"},
            {"id": "wellbeing", "label": "Well-being", "status": "proposed",
             "rationale": "a rationale long enough to count", "unblocks": ["PROF3"]}]}
        s = {"units": [{"code": "PROF3", "mappingStatus": "blocked-on-vocabulary",
                        "blockedByCode": "wellbeing"}]}
        d, rep = build(tmp, 'VOCAB = {"mood", "safety"}\n', v, s)
        expect("a well-formed proposal is clean", d, [])
        expect("...and appears in the queue report",
               any("wellbeing" in x and "unblocks 1 unit(s)" in x for x in rep), True)
        d, _ = build(tmp, 'VOCAB = {"mood", "safety", "wellbeing"}\n', v, s)
        expect("a proposed code shipped early is caught",
               any("PROPOSED code(s) already shipped here: wellbeing" in x for x in d), True)

        # both directions have to agree
        s_bad = {"units": [{"code": "PROF3", "mappingStatus": "blocked-on-vocabulary",
                            "blockedByCode": "something-else"}]}
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', v, s_bad)
        expect("a proposal claiming a payoff the unit denies is caught",
               any("that unit says it is blocked by 'something-else'" in x for x in d), True)
        expect("...and the unit's own dangling reference is caught too",
               any("not a proposed code in vocabulary.json" in x for x in d), True)
        s_none = {"units": [{"code": "PROF3", "mappingStatus": "blocked-on-vocabulary"}]}
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', v, s_none)
        expect("a blocked unit with no blockedByCode is caught",
               any("no blockedByCode" in x for x in d), True)
        s_act = {"units": [{"code": "PROF3", "mappingStatus": "blocked-on-vocabulary",
                            "blockedByCode": "mood"}]}
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', v, s_act)
        expect("a unit blocked on an ALREADY ACTIVE code is caught",
               any("ALREADY ACTIVE" in x for x in d), True)

        v_thin = {"schemaVersion": 1, "codes": [
            {"id": "mood", "label": "Mood", "status": "active"},
            {"id": "safety", "label": "Safety", "status": "active"},
            {"id": "vibes", "label": "Vibes", "status": "proposed", "rationale": "x"}]}
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', v_thin, S_EMPTY)
        expect("a proposal with no payoff is caught",
               any("unblocks nothing and supersedes nothing" in x for x in d), True)
        expect("a proposal with a one-word rationale is caught",
               any("nobody argued for" in x for x in d), True)
        v_sup = {"schemaVersion": 1, "codes": [
            {"id": "mood", "label": "Mood", "status": "active"},
            {"id": "safety", "label": "Safety", "status": "active"},
            {"id": "safety-risk", "label": "Risk", "status": "proposed",
             "rationale": "a rationale long enough to count", "supersedes": ["nope"]}]}
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', v_sup, S_EMPTY)
        expect("superseding a code that does not exist is caught",
               any("not an active code" in x for x in d), True)
        v_ship = {"schemaVersion": 1, "codes": [
            {"id": "mood", "label": "Mood", "status": "active", "unblocks": ["PC1"]},
            {"id": "safety", "label": "Safety", "status": "active"}]}
        d, _ = build(tmp, 'VOCAB = {"mood", "safety"}\n', v_ship, S_EMPTY)
        expect("an ACTIVE code still carrying unblocks is caught",
               any("describe a queue entry, not a shipped code" in x for x in d), True)

    # ---- and the live tree: the whole point is that the six real sites agree TODAY.
    d, _ = check(load(REGISTRY), load(STANDARDS))
    expect("the live repo's code sites agree with the live registry", d, [])

    print("self-test: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def main(argv=None):
    p = argparse.ArgumentParser(description="The internal content vocabulary, as data.")
    p.add_argument("--strict", action="store_true", help="exit 1 on any defect")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args(argv)

    if args.self_test:
        return _self_test()

    defects, report = check(load(REGISTRY), load(STANDARDS))
    for line in report:
        print("  [report] %s" % line)
    if defects:
        print("vocabulary: %d defect(s)" % len(defects))
        for x in defects:
            print("  - %s" % x)
        return 1 if args.strict else 0
    print("vocabulary: OK — every code site agrees with vocabulary.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
