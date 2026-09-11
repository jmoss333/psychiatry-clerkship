#!/usr/bin/env python3
"""research-dock.py — the research-return dock.

A deep-research answer (OpenEvidence, ChatGPT deep research, Claude) is a SECONDARY
source. It licenses nothing on its own. This tool makes sure every such answer ends in
one of two states and never a third:

  * a curriculum change backed by a verbatim span from a PRIMARY paper, or
  * a recorded decision not to use it.

It does NOT replace the evidence gate. It is the step before it: it holds the answer,
forces a routing decision per finding, and fails when an answer has been sitting
undecided. Landing an adopted finding is still
`13_Faculty_Resources/_automation/oe_scanner/EVIDENCE_INBOX_RUNBOOK.md` step 5.

Return documents live in `Evidence Inbox/_research-returns/`. That is a SUBFOLDER of the
existing Evidence Inbox on purpose: oe_scan.py discovers candidates with os.listdir (not
recursive) and skips directories, so the two systems share a folder without fighting over
it. There are still two drop folders and one scanner.

Usage:
    python3 bin/research-dock.py status                 # what is open, what is rotting
    python3 bin/research-dock.py check                  # report defects, exit 0
    python3 bin/research-dock.py check --strict         # exit 1 on any defect  (gate mode)
    python3 bin/research-dock.py new RQ-10 --tool chatgpt-deep-research
    python3 bin/research-dock.py clean rq-10-2026-09-10  # strip invisible characters
    python3 bin/research-dock.py --self-test            # built-in fixtures

Exit codes: 0 clean · 1 defects found (--strict only) · 2 usage or data error.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REGISTRY = os.path.join(ROOT, "research_returns.json")
RETURN_DIR = os.path.join(ROOT, "Evidence Inbox", "_research-returns")

TOOLS = ("openevidence", "chatgpt-deep-research", "claude", "other")
Q_STATUS = ("open", "asked", "answered", "retired")
R_STATUS = ("triage", "closed")
DISPOSITIONS = ("needs-primary", "adopt", "cite", "supersedes", "reject", "no-action")
LANDS_IN_LIBRARY = ("adopt", "cite", "supersedes")
CLOSED_OUT = ("reject", "no-action")

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
QID_RE = re.compile(r"^RQ-\d+$")
RID_RE = re.compile(r"^rq-\d+-\d{4}-\d{2}-\d{2}(-[a-z0-9]+)?$")
FID_RE = re.compile(r"^f\d+$")


# ---------------------------------------------------------------- loading

def load(path=REGISTRY):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        die("registry not found: %s" % _rel(path))
    except json.JSONDecodeError as exc:
        die("registry is not valid JSON: %s" % exc)


def save(doc, path=REGISTRY):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")


def die(msg, code=2):
    print("research-dock: %s" % msg, file=sys.stderr)
    raise SystemExit(code)


def _rel(path):
    try:
        return os.path.relpath(path, ROOT)
    except ValueError:
        return path


def _today():
    return _dt.date.today().isoformat()


def _is_invisible(ch):
    """Private-use area, zero-width, or BOM.

    RQ-10's first return arrived with 378 of these: U+E200/E201/E202, the delimiters a
    deep-research tool wraps its citation markers in. They are invisible in every editor,
    they make the markers ungreppable, and none of the citations they wrap resolve. In a
    repo that verifies verbatim sourceSpans character-for-character, a span carrying one
    would match nothing and no human could see why.
    """
    o = ord(ch)
    return (0xE000 <= o <= 0xF8FF) or ch in "\u200b\u200c\u200d\u2060\ufeff"


def _count_invisibles(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return sum(1 for ch in fh.read() if _is_invisible(ch))
    except (OSError, UnicodeDecodeError):
        return 0


def _days_since(datestr, today=None):
    today = _dt.date.fromisoformat(today or _today())
    return (today - _dt.date.fromisoformat(datestr)).days


# ---------------------------------------------------------------- checking

class Defect(str):
    """A defect that knows whether it blocks a push.

    Subclasses str deliberately: every existing caller — printing, joining, the self-test's
    substring assertions — keeps working unchanged, and only the two places that care about
    blocking have to know this type exists.

    Advisory vs blocking is not a severity dial. A blocking defect is a property of the
    tracked JSON: wrong here, wrong in CI, wrong in every checkout, and fixable in seconds.
    An advisory one is a statement about the WORLD rather than the file — the passage of
    time, or a file that lives only in the checkout that owns it. Blocking a push on those
    punishes work that has nothing to do with the dock.
    """

    advisory = False

    def __new__(cls, text, advisory=False):
        obj = super().__new__(cls, text)
        obj.advisory = advisory
        return obj


def check(doc, today=None, root=ROOT):
    """Return a list of Defect strings. Empty list means clean.

    Defects block unless marked advisory; see Defect. `--strict` exits 1 on blocking only.
    """
    d = []
    # Returns are gitignored, so they exist only in the checkout that owns them. Every other
    # worktree carries the registry (tracked) without the answers (not tracked) — a missing
    # capability, not a broken record. Without this distinction, --strict would block every
    # push from all ~25 other worktrees the moment they picked up the dock's verify.sh step.
    holds_returns = os.path.isdir(os.path.join(root, "Evidence Inbox", "_research-returns"))
    if doc.get("schemaVersion") != 1:
        d.append("schemaVersion must be 1")
    grace = doc.get("graceDays", 21)
    if not isinstance(grace, int) or grace < 1:
        d.append("graceDays must be a positive integer")
        grace = 21

    qids = set()
    for q in doc.get("questions", []):
        qid = q.get("id", "?")
        if not QID_RE.match(str(qid)):
            d.append("question id %r must look like RQ-7" % qid)
        if qid in qids:
            d.append("duplicate question id %s" % qid)
        qids.add(qid)
        if q.get("primaryTool") not in TOOLS:
            d.append("%s: primaryTool must be one of %s" % (qid, ", ".join(TOOLS)))
        if q.get("status") not in Q_STATUS:
            d.append("%s: status must be one of %s" % (qid, ", ".join(Q_STATUS)))
        if len(str(q.get("title", ""))) < 10:
            d.append("%s: title is too short to be useful" % qid)

    rids = set()
    for r in doc.get("returns", []):
        rid = r.get("id", "?")
        if not RID_RE.match(str(rid)):
            d.append("return id %r must look like rq-10-2026-09-11" % rid)
        if rid in rids:
            d.append("duplicate return id %s" % rid)
        rids.add(rid)

        if r.get("question") not in qids:
            d.append("%s: question %r is not in the questions list" % (rid, r.get("question")))
        if r.get("tool") not in TOOLS:
            d.append("%s: tool must be one of %s" % (rid, ", ".join(TOOLS)))
        if r.get("status") not in R_STATUS:
            d.append("%s: status must be triage or closed" % rid)

        # A model synthesis is always secondary. This is the rule the dock exists to hold.
        if r.get("sourceKind") != "secondary":
            d.append("%s: sourceKind must be \"secondary\" — a model synthesis licenses "
                     "nothing on its own" % rid)

        for key in ("returnedOn", "askedOn", "closedOn"):
            val = r.get(key)
            if val is not None and not DATE_RE.match(str(val)):
                d.append("%s: %s must be YYYY-MM-DD" % (rid, key))

        rf = r.get("returnFile")
        if not rf:
            d.append("%s: returnFile is required — the verbatim answer must be saved" % rid)
        elif not os.path.isfile(os.path.join(root, rf)):
            if holds_returns:
                d.append("%s: returnFile does not exist on disk: %s" % (rid, rf))
            else:
                d.append(Defect("%s: returnFile is not in this checkout: %s — returns are "
                                "gitignored and live only in the checkout that owns them, so "
                                "this cannot be verified here" % (rid, rf), advisory=True))
        else:
            n = _count_invisibles(os.path.join(root, rf))
            if n:
                d.append("%s: returnFile contains %d invisible character(s) — private-use or "
                         "zero-width. Strip them before any text from it reaches a sourceSpan: "
                         "python3 bin/research-dock.py clean %s" % (rid, n, rid))

        fids = set()
        unrouted = 0
        for f in r.get("findings", []):
            fid = f.get("id", "?")
            label = "%s/%s" % (rid, fid)
            if not FID_RE.match(str(fid)):
                d.append("%s: finding id must look like f1" % label)
            if fid in fids:
                d.append("%s: duplicate finding id" % label)
            fids.add(fid)

            disp = f.get("disposition")
            if disp not in DISPOSITIONS:
                d.append("%s: disposition must be one of %s" % (label, ", ".join(DISPOSITIONS)))
                continue
            if len(str(f.get("claim", ""))) < 15:
                d.append("%s: claim must be a readable sentence" % label)

            if disp == "needs-primary":
                unrouted += 1

            if disp in LANDS_IN_LIBRARY:
                p = f.get("primary") or {}
                if not p.get("citation"):
                    d.append("%s: disposition %r requires primary.citation — you may not "
                             "cite the model" % (label, disp))
                # Two ways to satisfy "point at something that is not the model".
                published = bool(p.get("pmid") or p.get("doi"))
                web = bool(p.get("url") and p.get("retrievedAt") and p.get("archivedCopy"))
                if not (published or web):
                    if p.get("url"):
                        missing = [k for k in ("retrievedAt", "archivedCopy") if not p.get(k)]
                        d.append("%s: disposition %r has a primary url but is missing %s — a web "
                                 "source needs a read date and a dated local capture, because the "
                                 "page can change silently" % (label, disp, " and ".join(missing)))
                    else:
                        d.append("%s: disposition %r requires either a primary pmid/doi or a "
                                 "custodian url + retrievedAt + archivedCopy" % (label, disp))
                if web and not os.path.isfile(os.path.join(root, p["archivedCopy"])):
                    d.append("%s: primary.archivedCopy does not exist on disk: %s"
                             % (label, p["archivedCopy"]))
                if not f.get("landedIn"):
                    d.append("%s: disposition %r requires landedIn once the change is made "
                             "(page path or evidence_registry source id)" % (label, disp))

            if disp in CLOSED_OUT and not str(f.get("note", "")).strip():
                d.append("%s: disposition %r requires a note saying why" % (label, disp))

        if r.get("status") == "closed":
            if unrouted:
                d.append("%s: closed but %d finding(s) still needs-primary" % (rid, unrouted))
            if not r.get("closedOn"):
                d.append("%s: closed returns need closedOn" % rid)
            if not r.get("findings"):
                d.append("%s: closed with no findings — a return with nothing in it should "
                         "carry one no-action finding saying so" % rid)
        else:
            ret = r.get("returnedOn")
            if ret and DATE_RE.match(str(ret)):
                age = _days_since(ret, today)
                if not r.get("findings"):
                    if age > grace:
                        d.append(Defect(
                            "%s: STALE — returned %d days ago and still has no findings "
                            "(grace is %d days). This is the rot the dock exists to catch."
                            % (rid, age, grace), advisory=True))
                elif unrouted and age > grace:
                    d.append(Defect(
                        "%s: STALE — returned %d days ago with %d finding(s) still "
                        "needs-primary (grace is %d days)"
                        % (rid, age, unrouted, grace), advisory=True))
    return d


# ---------------------------------------------------------------- commands

def cmd_status(doc, today=None):
    qs = doc.get("questions", [])
    rs = doc.get("returns", [])
    grace = doc.get("graceDays", 21)
    by_q = {}
    for r in rs:
        by_q.setdefault(r.get("question"), []).append(r)

    print("Research return dock — %s" % (today or _today()))
    print("%d questions · %d returns · grace %d days" % (len(qs), len(rs), grace))
    print()
    print("%-7s %-9s %-22s %s" % ("QUESTION", "STATUS", "TOOL", "TITLE"))
    for q in qs:
        print("%-7s %-9s %-22s %s" % (q.get("id"), q.get("status"),
                                      q.get("primaryTool"), q.get("title")[:52]))
    if not rs:
        print()
        print("No returns yet. Ask one:  python3 bin/research-dock.py new RQ-10")
        return
    print()
    print("RETURNS")
    for r in rs:
        fs = r.get("findings", [])
        counts = {}
        for f in fs:
            counts[f.get("disposition")] = counts.get(f.get("disposition"), 0) + 1
        age = ""
        if r.get("returnedOn") and DATE_RE.match(str(r.get("returnedOn"))):
            age = "%dd" % _days_since(r["returnedOn"], today)
        bits = ", ".join("%s %d" % (k, v) for k, v in sorted(counts.items())) or "no findings yet"
        flag = ""
        if r.get("status") == "triage" and age and int(age[:-1]) > grace and (
                counts.get("needs-primary") or not fs):
            flag = "  <-- STALE"
        print("  %-26s %-8s %-5s %s%s" % (r.get("id"), r.get("status"), age, bits, flag))


TEMPLATE = """# Research return — {qid}

**Question:** {title}
**Tool:** {tool}
**Asked:** {asked}
**Returned:** {returned}

> This file is the VERBATIM answer, kept as it came back. Do not edit it, summarise it, or
> tidy it — its value is that it is what the tool actually said. Triage lives in
> `research_returns.json`, not here.
>
> A model synthesis is a SECONDARY source. It licenses nothing on its own. Every finding
> you adopt must carry a verbatim span from the PRIMARY paper, retrieved from
> PubMed/Europe PMC — never retyped from this file.

---

<!-- PASTE THE FULL ANSWER BELOW THIS LINE -->

"""


def cmd_new(doc, qid, tool, today=None):
    today = today or _today()
    qs = {q["id"]: q for q in doc.get("questions", [])}
    if qid not in qs:
        die("unknown question %s. Known: %s" % (qid, ", ".join(sorted(qs))))
    if tool is None:
        tool = qs[qid].get("primaryTool", "other")
    if tool not in TOOLS:
        die("tool must be one of %s" % ", ".join(TOOLS))

    base = "%s-%s" % (qid.lower(), today)
    existing = {r["id"] for r in doc.get("returns", [])}
    rid, n = base, 1
    while rid in existing:
        n += 1
        rid = "%s-%d" % (base, n)

    os.makedirs(RETURN_DIR, exist_ok=True)
    fname = "%s.md" % rid
    fpath = os.path.join(RETURN_DIR, fname)
    if not os.path.exists(fpath):
        with open(fpath, "w", encoding="utf-8") as fh:
            fh.write(TEMPLATE.format(qid=qid, title=qs[qid]["title"], tool=tool,
                                     asked=today, returned=today))

    doc.setdefault("returns", []).append({
        "id": rid,
        "question": qid,
        "tool": tool,
        "askedOn": today,
        "returnedOn": today,
        "returnFile": os.path.join("Evidence Inbox", "_research-returns", fname),
        "sourceKind": "secondary",
        "status": "triage",
        "findings": [],
    })
    qs[qid]["status"] = "asked"
    save(doc)

    print("Created return %s" % rid)
    print()
    print("  1. Paste the full answer into:")
    print("       %s" % _rel(fpath))
    print("  2. Then tell Claude:  triage the research return %s" % rid)
    print("  3. Then check:        python3 bin/research-dock.py check")


def cmd_clean(doc, rid, root=ROOT):
    """Strip invisible characters from a return file, in place, reporting what went."""
    rec = next((r for r in doc.get("returns", []) if r.get("id") == rid), None)
    if rec is None:
        die("unknown return %s. Known: %s"
            % (rid, ", ".join(r.get("id", "?") for r in doc.get("returns", []))))
    path = os.path.join(root, rec["returnFile"])
    if not os.path.isfile(path):
        die("returnFile does not exist: %s" % rec["returnFile"])
    with open(path, encoding="utf-8") as fh:
        before = fh.read()
    counts = {}
    for ch in before:
        if _is_invisible(ch):
            counts[hex(ord(ch))] = counts.get(hex(ord(ch)), 0) + 1
    if not counts:
        print("research-dock: %s is already clean." % rid)
        return
    after = "".join(ch for ch in before if not _is_invisible(ch))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(after)
    print("research-dock: stripped %d invisible character(s) from %s"
          % (sum(counts.values()), rec["returnFile"]))
    for code, n in sorted(counts.items()):
        print("  %s x%d" % (code, n))
    print("The visible text is unchanged; only the invisible characters are gone.")


# ---------------------------------------------------------------- self-test

def _self_test():
    ok = True

    def expect(name, defects, needle, want=True):
        nonlocal ok
        hit = any(needle in x for x in defects)
        if hit != want:
            ok = False
            print("  FAIL %s (expected %r %s)" % (name, needle, "present" if want else "absent"))
            for x in defects:
                print("       %s" % x)
        else:
            print("  ok   %s" % name)

    base = {
        "schemaVersion": 1, "graceDays": 21,
        "questions": [{"id": "RQ-1", "title": "A sufficiently long title",
                       "primaryTool": "claude", "status": "open"}],
        "returns": [],
    }

    expect("empty registry is clean", check(dict(base), today="2026-09-10"), "", want=False)

    def one(**over):
        r = {"id": "rq-1-2026-09-01", "question": "RQ-1", "tool": "claude",
             "returnedOn": "2026-09-01", "returnFile": "research_returns.json",
             "sourceKind": "secondary", "status": "triage", "findings": []}
        r.update(over)
        doc = dict(base); doc["returns"] = [r]
        return doc

    expect("model cannot be primary",
           check(one(sourceKind="primary"), today="2026-09-02"), "sourceKind must be")
    expect("adopt without pmid/doi fails",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "adopt",
                                "primary": {"citation": "Someone et al. 2025"},
                                "landedIn": ["x.md"]}]), today="2026-09-02"),
           "requires either a primary pmid/doi or a custodian url")
    expect("adopt with pmid passes",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "adopt",
                                "primary": {"citation": "Someone et al. 2025", "pmid": "12345678"},
                                "landedIn": ["x.md"]}]), today="2026-09-02"),
           "primary pmid or doi", want=False)
    expect("reject needs a reason",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "reject"}]), today="2026-09-02"),
           "requires a note")
    expect("stale return is caught",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "needs-primary"}]), today="2026-10-15"),
           "STALE")
    expect("in-grace return is not stale",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "needs-primary"}]), today="2026-09-10"),
           "STALE", want=False)

    # Advisory vs blocking. A gate that stops unrelated work gets switched off, so what
    # blocks has to be exactly what a person can fix by editing the file in front of them.
    def blocking_only(defects):
        return [x for x in defects if not getattr(x, "advisory", False)]

    stale = check(one(), today="2026-10-30")
    expect("a stale return is reported", stale, "STALE")
    expect("...but staleness never blocks", blocking_only(stale), "STALE", want=False)

    with tempfile.TemporaryDirectory() as tmp:
        # A checkout that owns the returns: a missing answer file is a real broken record.
        os.makedirs(os.path.join(tmp, "Evidence Inbox", "_research-returns"))
        owns = check(one(returnFile="Evidence Inbox/_research-returns/gone.md"),
                     today="2026-09-02", root=tmp)
        expect("missing return file blocks where the returns live",
               blocking_only(owns), "returnFile does not exist")

    with tempfile.TemporaryDirectory() as tmp:
        # Any other worktree: the registry is tracked, the answers are not. Not a defect.
        away = check(one(returnFile="Evidence Inbox/_research-returns/gone.md"),
                     today="2026-09-02", root=tmp)
        expect("...and is advisory in a checkout that does not", away,
               "returnFile is not in this checkout")
        expect("...where it must not block", blocking_only(away), "returnFile", want=False)
    expect("web primary without capture fails",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "cite",
                                "primary": {"citation": "Custodian permission page.",
                                            "url": "https://example.org/permissions"},
                                "landedIn": ["instrument_rights.json#x"]}]), today="2026-09-02"),
           "read date and a dated local capture")
    expect("web primary with url+date+capture passes",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "cite",
                                "primary": {"citation": "Custodian permission page.",
                                            "url": "https://example.org/permissions",
                                            "retrievedAt": "2026-09-01",
                                            "archivedCopy": "research_returns.json"},
                                "landedIn": ["instrument_rights.json#x"]}]), today="2026-09-02"),
           "primary", want=False)
    expect("web primary with a missing capture file fails",
           check(one(findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "cite",
                                "primary": {"citation": "Custodian permission page.",
                                            "url": "https://example.org/permissions",
                                            "retrievedAt": "2026-09-01",
                                            "archivedCopy": "nope/missing.pdf"},
                                "landedIn": ["instrument_rights.json#x"]}]), today="2026-09-02"),
           "archivedCopy does not exist")
    expect("closed with unrouted finding fails",
           check(one(status="closed", closedOn="2026-09-05",
                     findings=[{"id": "f1", "claim": "Some claim worth checking here.",
                                "disposition": "needs-primary"}]), today="2026-09-06"),
           "still needs-primary")
    import tempfile as _tf
    _tmp = _tf.mkdtemp()
    with open(os.path.join(_tmp, "dirty.md"), "w", encoding="utf-8") as _fh:
        _fh.write("visible text \ue202turn1view0 more text")
    with open(os.path.join(_tmp, "research_returns.json"), "w", encoding="utf-8") as _fh:
        _fh.write("{}")
    expect("invisible characters in a return file are caught",
           check(one(returnFile="dirty.md"), today="2026-09-02", root=_tmp),
           "invisible character")
    expect("a clean return file is not flagged",
           check(one(returnFile="research_returns.json"), today="2026-09-02", root=_tmp),
           "invisible character", want=False)
    # Root-explicit on purpose. With a default root this case silently changed meaning with
    # the checkout it ran in — blocking in the tree that owns the returns, advisory in every
    # other worktree — which is exactly the ambiguity the advisory split exists to name.
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "Evidence Inbox", "_research-returns"))
        expect("missing return file is caught",
               check(one(returnFile="Evidence Inbox/_research-returns/nope.md"),
                     today="2026-09-02", root=tmp),
               "does not exist on disk")

    print("self-test: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


# ---------------------------------------------------------------- main

def main(argv=None):
    p = argparse.ArgumentParser(description="The research-return dock.")
    p.add_argument("command", nargs="?", default="check",
                   choices=["check", "status", "new", "clean"])
    p.add_argument("question", nargs="?", help="RQ-n for `new`; a return id for `clean`")
    p.add_argument("--tool", choices=list(TOOLS), default=None)
    p.add_argument("--strict", action="store_true", help="exit 1 on any defect")
    p.add_argument("--today", default=None, help="override today's date (testing)")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args(argv)

    if args.self_test:
        return _self_test()

    doc = load()

    if args.command == "status":
        cmd_status(doc, today=args.today)
        return 0

    if args.command == "clean":
        if not args.question:
            die("usage: research-dock.py clean rq-10-2026-09-10")
        cmd_clean(doc, args.question)
        return 0

    if args.command == "new":
        if not args.question:
            die("usage: research-dock.py new RQ-10 [--tool chatgpt-deep-research]")
        cmd_new(doc, args.question.upper(), args.tool, today=args.today)
        return 0

    defects = check(doc, today=args.today)
    blocking = [x for x in defects if not getattr(x, "advisory", False)]
    advisory = [x for x in defects if getattr(x, "advisory", False)]
    summary = ("%d question(s), %d return(s)"
               % (len(doc.get("questions", [])), len(doc.get("returns", []))))

    if blocking:
        print("research-dock: %d defect(s)" % len(blocking))
        for x in blocking:
            print("  - %s" % x)
    for x in advisory:
        print("  ~ %s  [advisory]" % x)

    # verify.sh prints the last line of a passing step, so the last line has to be the one
    # worth reading when nothing blocks.
    if not blocking:
        if advisory:
            print("research-dock: OK — %s, %d advisory (reported, never blocking)."
                  % (summary, len(advisory)))
        else:
            print("research-dock: OK — %s, nothing undecided." % summary)
        return 0
    return 1 if args.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
