#!/usr/bin/env python3
"""Find reviewer instructions that shipped as learner-facing text.

THE DEFECT CLASS. The 2026-09-01 curriculum review stored each correction in a `replacement`
field, and some of those fields were INSTRUCTIONS rather than text: "Rewrite the item to the
review's actual result, e.g. stem: '…' keyed to '…'". The remediation pasted three of them
verbatim, so learners were served a reviewer's note as the thing to learn:

  AR-34 Q6   a keyed OPTION reading "Re-key the item … (the key is the false claim): key '…'"
  AR-20 Q2   a STEM reading "Rewrite the item to the review's actual result, e.g. stem: '…'"
  AR-27 Q3   distractor FEEDBACK reading "Rewrite the item to the trial's published finding …"

Both copies of the audio-quiz decks carry all three (07_…/quizzes.json and the resident Canon
Quiz's _prototypes/canon-quiz/quizzes.json). Every schema and validator passed, because each
string is a perfectly valid string. The 2026-09-24 peer review found them again (pattern A,
decision J5) and asked for a lint that runs before every push rather than a promise to be careful.

WHAT IT SCANS. Every learner-facing registry, named below and REQUIRED to exist and parse, plus
every `_prototypes/**/*.pack.json`, plus every shipped `source`/`extraSources` from
site_build/shipped_pages.json read through load_shipped_pages() — never site_manifest.json alone
(ADR-002). JSON is scanned as its DECODED strings, because a registry written with
ensure_ascii=True stores "—" as "\\u2014" and a raw-text scan would miss "[your role — e.g.".
HTML comments are stripped first: `<!-- … (MS3V01-F005) -->` is a provenance note no learner
sees, and the repository cites finding ids in comments on purpose. JavaScript `//` comments are
NOT stripped; none carries a finding id today, and a future false positive there is cheaper than
a parser. `docs/` and `13_Faculty_Resources/Handoffs/` are allowlisted: the review record is
where these phrases are supposed to live.

WHAT IT MATCHES. SR-01 from the peer review's sibling_rules.json, generalised (handoff §4.7):

  rewrite-instruction   "rewrite the item|stem|question"
  rekey-instruction     "re-key the item" / "rekey to"
  key-is-false-claim    "the key is the false claim"
  keyed-to-quote        "keyed to '…"          (SR-01; the tail of a pasted replacement)
  eg-stem               "e.g. stem:"
  bracket-placeholder   "[your role — e.g. …"  (an unresolved per-edition placeholder, C1-008)
  reviewer-directive    "reviewer must|should"
  finding-id            MS3V01-F005, A3C2-F014 …  (case-sensitive: a review finding id in text)

A bare "reviewer" is deliberately not a pattern: three shipped tools render `rv.reviewer` from
governance data. "TODO|TK" was tried and dropped: it matches author initials in citations.

A RATCHET, the pattern of bin/check_qbank_coherence.py (docs/RATCHETS.md). The leak count is
pinned in bin/editorial_leaks_baseline.json; a rise fails, a fall prints a note naming the
lowering command, and no baseline exits 2. It pins TODAY's count rather than zero because the
three items above are fixed by the WP-3 content PR, and a governance PR may not carry that
content edit (Gate B, L1). Lowering the pin to 0 after WP-3 merges is its own small governance
PR. Hard stops beside the ratchet, all exit 2 (docs/SILENT_SHRINK_CHECKLIST.md D4): a required
registry missing or unparsable, a listed shipped source missing on disk, shipped_pages.json
unreadable, no pack found, or nothing examined at all. A lint that silently skips a file it was
told to read reports clean over a smaller set than it claims.

Every hit is printed with its path, its JSON pointer (or line) and the rule that fired: a count
cannot see one leak swapped for another, the listing can. The tally rides on the last line
because bin/verify.sh shows only a step's last line.

Exit 0 clean (at or below baseline), 1 a rise, 2 could not check.

    python3 bin/check_editorial_leaks.py                    # the gate (bin/verify.sh runs it)
    python3 bin/check_editorial_leaks.py --self-test        # planted leaks exit 1, the live tree exits 0
    python3 bin/check_editorial_leaks.py --update-baseline  # LOWER the pin after a reviewed reduction

--update-baseline rewrites the pin from the current tree. It locks in a reduction made on
purpose; it is never for absorbing a rise. The JSON diff is in the PR and a reviewer reads it.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_BUILD = ROOT / "13_Faculty_Resources" / "_automation" / "site_build"
BASELINE = Path(__file__).resolve().parent / "editorial_leaks_baseline.json"
RATCHET_KEYS = ("leaks",)
UPDATE_HINT = "python3 bin/check_editorial_leaks.py --update-baseline"

# ADR-002's own reader: it validates the document's version and every page's shape and RAISES on
# a malformed entry, which is what a lint that must not shrink needs.
sys.path.insert(0, str(SITE_BUILD))
from shipped_pages import ShippedPagesError, load_shipped_pages  # noqa: E402
# The COTW registry is read for its TEXT (the TL;DR and shelf-takeaway overlays a learner sees,
# e.g. finding M11-001), not to enumerate what ships. Its path comes from the one module that
# owns it rather than a literal here: tests/shipped-pages-readers.test.mjs freezes the set of
# files naming a "what ships" producer, and that list may only shrink (ADR-002). cotw_meta's own
# load_weeks() is NOT used — it returns [] for a missing file, which is the silent shrink this
# lint refuses; the existence check below stays ours.
from cotw_meta import REGISTRY_REL as COTW_REGISTRY  # noqa: E402

# Learner-facing registries. Each one is REQUIRED: a registry that is renamed or deleted makes
# this lint exit 2 until the list below is updated in a (governance) PR that says why.
REGISTRIES = (
    "question_bank.json",
    "07_Evidence_and_Reading/Landmark_Trials/quizzes.json",
    "_prototypes/canon-quiz/quizzes.json",
    "topic_meta.json",
    "communication_cases.json",
    "reasoning_cases.json",
    "reasoning_cases_resident.json",
    "family_systems_scenarios.json",
    "longitudinal_case.json",
    COTW_REGISTRY,
)
PACK_GLOB = "_prototypes/**/*.pack.json"
ALLOW_PREFIXES = ("docs/", "13_Faculty_Resources/Handoffs/")

PATTERNS = (
    ("rewrite-instruction", re.compile(r"\brewrite the (?:item|stem|question)\b", re.I)),
    ("rekey-instruction", re.compile(r"\bre-?key (?:the item|to)\b", re.I)),
    ("key-is-false-claim", re.compile(r"\bthe key is the false claim\b", re.I)),
    ("keyed-to-quote", re.compile(r"\bkeyed to ['\"‘“]", re.I)),
    ("eg-stem", re.compile(r"\be\.g\. stem:", re.I)),
    ("bracket-placeholder", re.compile(r"\[your [a-z]+ [—–-] e\.g\.", re.I)),
    ("reviewer-directive", re.compile(r"\breviewer (?:must|should)\b", re.I)),
    ("finding-id", re.compile(r"\b[A-Z0-9]{2,6}-F\d{3}\b")),
)
RULE_NAMES = tuple(name for name, _ in PATTERNS)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)


class ScanError(Exception):
    """The lint could not examine a file it was told to examine: exit 2, never a pass."""


# ---------------------------------------------------------------------------------------- scan

def _json_strings(node, pointer=""):
    """Yield (json-pointer, string) for every string in a decoded JSON document."""
    if isinstance(node, str):
        yield pointer or "/", node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _json_strings(value, f"{pointer}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _json_strings(value, f"{pointer}/{index}")


def _match(text):
    """(rule, match, visible-text) for every pattern hit, HTML comments removed first."""
    visible = HTML_COMMENT.sub(" ", text)
    for name, pattern in PATTERNS:
        for m in pattern.finditer(visible):
            yield name, m, visible


def _excerpt(text, m, width=70):
    left = max(0, m.start() - width)
    return re.sub(r"\s+", " ", text[left:m.end() + width]).strip()


def targets(root):
    """Every path (repo-relative, sorted, de-duplicated) the lint must examine. Raises ScanError."""
    root = Path(root)
    wanted = list(REGISTRIES)
    packs = sorted(
        os.path.relpath(p, root)
        for p in glob.glob(str(root / PACK_GLOB), recursive=True)
    )
    if not packs:
        raise ScanError(f"no file matches {PACK_GLOB} -- the pack scope went empty")
    wanted += packs
    try:
        document = load_shipped_pages(root)
    except (ShippedPagesError, OSError, ValueError) as exc:
        raise ScanError(f"shipped_pages.json unreadable: {exc}") from exc
    for page in document["pages"]:
        for source in [page.get("source")] + list(page.get("extraSources") or []):
            if source:
                wanted.append(source)
    out, seen = [], set()
    for rel in wanted:
        rel = rel.replace(os.sep, "/")
        if rel in seen or rel.startswith(ALLOW_PREFIXES):
            continue
        seen.add(rel)
        if not (root / rel).is_file():
            raise ScanError(f"{rel} is in scope but missing on disk")
        out.append(rel)
    return sorted(out)


def scan(root=ROOT):
    """(examined, hits). hits are dicts {path, locus, rule, excerpt}. Raises ScanError."""
    root = Path(root)
    examined, hits = targets(root), []
    for rel in examined:
        path = root / rel
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise ScanError(f"{rel} unreadable: {exc}") from exc
        if rel.endswith(".json"):
            try:
                strings = list(_json_strings(json.loads(text)))
            except ValueError as exc:
                raise ScanError(f"{rel} does not parse as JSON: {exc}") from exc
            for pointer, value in strings:
                for rule, m, visible in _match(value):
                    hits.append({"path": rel, "locus": pointer, "rule": rule,
                                 "excerpt": _excerpt(visible, m)})
        else:
            for rule, m, visible in _match(text):
                line = visible.count("\n", 0, m.start()) + 1
                hits.append({"path": rel, "locus": f"line ~{line}", "rule": rule,
                             "excerpt": _excerpt(visible, m)})
    return examined, hits


# ------------------------------------------------------------------------------------- ratchet

def load_baseline(path):
    """(counts, None) or (None, error). A missing key is an error, not an unpinned key."""
    path = Path(path)
    rel = os.path.relpath(path, ROOT)
    if not path.exists():
        return None, f"no baseline at {rel} -- run `{UPDATE_HINT}` (reviewed) to pin one"
    try:
        counts = json.loads(path.read_text(encoding="utf-8")).get("counts") or {}
    except (OSError, ValueError, AttributeError) as exc:
        return None, f"baseline {rel} unreadable: {exc}"
    missing = [k for k in RATCHET_KEYS if not isinstance(counts.get(k), int)]
    if missing:
        return None, (f"baseline {rel} does not pin {', '.join(missing)} -- "
                      f"run `{UPDATE_HINT}` (reviewed) to pin every key")
    return {k: counts[k] for k in RATCHET_KEYS}, None


def write_baseline(path, counts):
    payload = {
        "_note": "Pinned by bin/check_editorial_leaks.py. Counts may fall, never rise. Regenerate "
                 "with --update-baseline as part of a reviewed reduction, never to absorb a rise -- "
                 "the diff is in the PR. See docs/RATCHETS.md.",
        "counts": {k: counts[k] for k in RATCHET_KEYS},
    }
    Path(path).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def gate(examined, hits, baseline, out=print):
    """The whole exit contract, in-process so --self-test can drive it.
    0 clean, 1 a rise above baseline, 2 could not check."""
    if not examined:
        out("editorial leaks: NOTHING EXAMINED -- a pass over zero files is not a pass "
            "(docs/SILENT_SHRINK_CHECKLIST.md D4).")
        return 2
    for hit in hits:
        out(f"LEAK  {hit['rule']:<20} {hit['path']} {hit['locus']}\n        {hit['excerpt']}")
    files = len({h["path"] for h in hits})
    out(f"\neditorial leaks: {len(hits)} hit(s) in {files} file(s); {len(examined)} file(s) examined")
    if baseline is None:
        out(f"FAIL -- no baseline to ratchet against. Run `{UPDATE_HINT}` (reviewed) and commit "
            f"bin/editorial_leaks_baseline.json.")
        return 2
    was, now = baseline["leaks"], len(hits)
    if now < was:
        out(f"note: leaks improved {was} -> {now} -- run `{UPDATE_HINT}` to lock the gain in "
            f"(its own governance PR: the baseline lives under bin/).")
    if now > was:
        out(f"FAIL -- leaks rose {was} -> {now}. A reviewer's instruction is in learner text above: "
            f"replace it with the text it asked for; never re-pin to absorb a rise.")
        return 1
    out(f"OK -- {now} leak(s) across {len(examined)} file(s) examined; at or below baseline ({was}).")
    return 0


def run(root, baseline, out=print):
    """scan + gate with ScanError mapped to exit 2."""
    try:
        examined, hits = scan(root)
    except ScanError as exc:
        out(f"editorial leaks: COULD NOT CHECK -- {exc}")
        return 2
    return gate(examined, hits, baseline, out=out)


# ----------------------------------------------------------------------------------- self-test

def _fixture(td, *, quiz_fb="Lithium was superior at preventing new episodes.", page_extra="",
             drop=None, broken=None, docs_leak=False):
    """A minimal tree that satisfies the REAL loader and the REAL registry list."""
    root = Path(td)
    for rel in REGISTRIES:
        body = {"items": []}
        if rel.endswith("quizzes.json"):
            body = {"decks": [{"id": "AR-99", "questions": [
                {"q": "What did the trial find?", "o": [{"t": "Lithium", "c": True, "fb": quiz_fb}]}]}]}
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        # ensure_ascii=True on purpose: an em dash lands on disk as —, the case raw text misses
        p.write_text(json.dumps(body, ensure_ascii=True), encoding="utf-8")
    pack = root / "_prototypes" / "demo" / "demo.pack.json"
    pack.parent.mkdir(parents=True, exist_ok=True)
    pack.write_text(json.dumps({"cases": [{"hint": "Ask about sleep."}]}), encoding="utf-8")
    page = root / "03_Core_Topics" / "Demo" / "demo_inpatient_teaching.md"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text("# Demo\n\nPlain teaching text.\n" + page_extra, encoding="utf-8")
    listing = root / "13_Faculty_Resources" / "_automation" / "site_build" / "shipped_pages.json"
    listing.parent.mkdir(parents=True, exist_ok=True)
    listing.write_text(json.dumps({"version": 1, "pages": [
        {"kind": "page", "producer": "site_manifest", "sites": ["ms3"], "slug": "demo.md",
         "source": "03_Core_Topics/Demo/demo_inpatient_teaching.md", "title": "Demo"}]}), encoding="utf-8")
    if docs_leak:
        d = root / "docs" / "review" / "notes.md"
        d.parent.mkdir(parents=True, exist_ok=True)
        d.write_text("Rewrite the item, e.g. stem: '...'", encoding="utf-8")
    if drop:
        (root / drop).unlink()
    if broken:
        (root / broken).write_text("{not json", encoding="utf-8")
    return root


PLANTS = {
    "rewrite-instruction": "Rewrite the item to the trial's published finding.",
    "rekey-instruction": "Re-key the item to match the deck's convention.",
    "key-is-false-claim": "Overstatement item (the key is the false claim).",
    "keyed-to-quote": "Which arm relapsed less?' keyed to 'Lithium'",
    "eg-stem": "Use the actual result, e.g. stem: 'In BALANCE, how did lithium compare?'",
    "bracket-placeholder": "I'm [your role — e.g., a medical student or a resident] on the team.",
    "reviewer-directive": "The reviewer should confirm the dose.",
    "finding-id": "Corrected per A3C2-F014.",
}


def self_test() -> int:
    checks = []

    def expect(label, cond):
        checks.append((label, bool(cond)))

    def drive(root, baseline):
        lines = []
        rc = run(root, baseline, out=lines.append)
        return rc, "\n".join(lines)

    expect("every rule has a plant", set(PLANTS) == set(RULE_NAMES))
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td), {"leaks": 0})
        expect("clean fixture vs zero baseline exits 0 and names the file count",
               rc == 0 and "file(s) examined" in out.splitlines()[-1])

    # each rule, planted alone in quiz FEEDBACK (the AR-27 Q3 locus), is a rise -> exit 1
    for rule, text in PLANTS.items():
        with tempfile.TemporaryDirectory() as td:
            rc, out = drive(_fixture(td, quiz_fb=text), {"leaks": 0})
            expect(f"planted {rule} exits 1 and is named", rc == 1 and f"LEAK  {rule}" in out
                   and "/decks/0/questions/0/o/0/fb" in out)

    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, page_extra="Rewrite the stem before shipping.\n"), {"leaks": 0})
        expect("a leak in a shipped markdown source exits 1 with its line", rc == 1 and "line ~" in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, page_extra="<!-- fixed per MS3V01-F005; rewrite the item -->\n"),
                        {"leaks": 0})
        expect("text inside an HTML comment is not a leak", rc == 0)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, docs_leak=True), {"leaks": 0})
        expect("docs/ is allowlisted", rc == 0)

    # the exit is baseline-driven; a fall is a note naming the lowering command. The fixture
    # plants into BOTH quizzes.json registries (as the real twin decks carry both copies), so
    # pin the measured count rather than assuming one.
    with tempfile.TemporaryDirectory() as td:
        root = _fixture(td, quiz_fb=PLANTS["eg-stem"])
        n = len(scan(root)[1])
        expect("a planted leak is counted in both twin decks", n == 2)
        rc, out = drive(root, {"leaks": n})
        expect("a pinned leak exits 0", rc == 0 and "FAIL" not in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td), {"leaks": 3})
        expect("a fall exits 0 with an improvement note", rc == 0 and "improved 3 -> 0" in out
               and "--update-baseline" in out)

    # could-not-check is never a pass
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td), None)
        expect("missing baseline exits 2", rc == 2 and "--update-baseline" in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, drop="communication_cases.json"), {"leaks": 0})
        expect("a missing registry exits 2", rc == 2 and "communication_cases.json" in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, broken="topic_meta.json"), {"leaks": 0})
        expect("an unparsable registry exits 2", rc == 2 and "does not parse" in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, drop="03_Core_Topics/Demo/demo_inpatient_teaching.md"), {"leaks": 0})
        expect("a listed shipped source missing on disk exits 2", rc == 2 and "missing on disk" in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, drop="_prototypes/demo/demo.pack.json"), {"leaks": 0})
        expect("an empty pack scope exits 2", rc == 2 and "pack.json" in out)
    with tempfile.TemporaryDirectory() as td:
        rc, out = drive(_fixture(td, broken="13_Faculty_Resources/_automation/site_build/shipped_pages.json"),
                        {"leaks": 0})
        expect("an unreadable shipped_pages.json exits 2", rc == 2)
    lines = []
    expect("nothing examined exits 2", gate([], [], {"leaks": 0}, out=lines.append) == 2)
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "b.json"
        p.write_text(json.dumps({"counts": {}}), encoding="utf-8")
        counts, err = load_baseline(p)
        expect("a baseline missing 'leaks' is an error naming the key", counts is None and "leaks" in err)

    # the LIVE tree agrees with the committed baseline (so this self-test certifies the pin)
    baseline, err = load_baseline(BASELINE)
    rc, out = drive(ROOT, baseline)
    expect("live tree vs committed baseline exits 0", err is None and rc == 0)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--update-baseline", action="store_true",
                    help="rewrite bin/editorial_leaks_baseline.json from the current tree "
                         "(reviewed reductions only -- the diff is in the PR)")
    ap.add_argument("--self-test", action="store_true",
                    help="plant each pattern in a fixture tree and prove the gate exits 1 on it, "
                         "2 on every could-not-check shape, and 0 on the live tree")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if a.update_baseline:
        try:
            _, hits = scan(ROOT)
        except ScanError as exc:
            print(f"editorial leaks: COULD NOT CHECK -- {exc}; baseline not written")
            return 2
        write_baseline(BASELINE, {"leaks": len(hits)})
        print(f"baseline written to {os.path.relpath(BASELINE, ROOT)}: leaks={len(hits)}")
    baseline, err = load_baseline(BASELINE)
    if err:
        print(f"FAIL -- {err}")
        return 2
    return run(ROOT, baseline)


if __name__ == "__main__":
    sys.exit(main())
