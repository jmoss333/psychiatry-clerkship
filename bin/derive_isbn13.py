#!/usr/bin/env python3
"""Derive and record an ISBN-13 for every book in the MS3 book library.

WHY THIS IS A SCRIPT AND NOT A PROMPT: it is the first task the nightly queue runner is
allowed to perform unattended, and the reason it qualifies is that no judgement is
involved. Every book on the page links to amazon.com/dp/<ASIN>, and for a print book
Amazon's ASIN *is* the ISBN-10 — all 51 pass the ISBN-10 check digit, which a random
10-character string manages about one time in eleven. ISBN-13 is then arithmetic: prefix
978, drop the old check digit, recompute mod-10. An agent that free-hand edited 51 lines
could hallucinate a digit; a script cannot, and `--check` proves it afterwards.

WHY IT MATTERS: today the only route to any of these books is a vendor link. A learner
without an Amazon account has no way to find one in a library catalogue. That is the same
principle INV-IR2 already applies to retired instruments — a withdrawal must leave a
route — applied to books.

    python3 bin/derive_isbn13.py            # dry run: what would change
    python3 bin/derive_isbn13.py --write    # record the ISBNs (idempotent)
    python3 bin/derive_isbn13.py --check    # verify every recorded ISBN; exit 1 on a mismatch

`--check` is the reviewer's tool and the gate the runner must pass before it opens a PR:
it recomputes each recorded ISBN-13 from the ASIN on the same line and from the ISBN-13's
own check digit, so a wrong digit cannot survive. Running --write twice changes nothing.

Exit codes: 0 fine · 1 --check found a mismatch · 2 usage or parse error.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOKS = ROOT / "07_Evidence_and_Reading" / "Book_Summaries" / "ms3_book_library.md"

ENTRY = re.compile(r"^- \*\*")
ASIN = re.compile(r"amazon\.com/dp/([0-9A-Za-z]{10})")
RECORDED = re.compile(r"\bISBN\s+(97[89][0-9]{10})\b")


def isbn10_valid(code):
    """ISBN-10 check: sum of digit*(10-position) divisible by 11, X counting as 10.

    Total by construction: an Amazon-only ASIN (B00X4WHP55) is not an ISBN and must answer
    False rather than raising, since the caller's whole job is telling the two apart.
    """
    if not re.fullmatch(r"[0-9]{9}[0-9Xx]", code or ""):
        return False
    return sum((10 - i) * (10 if c in "Xx" else int(c))
               for i, c in enumerate(code)) % 11 == 0


def to_isbn13(isbn10):
    """978 + the first nine digits + a fresh mod-10 check digit."""
    core = "978" + isbn10[:9]
    total = sum((1 if i % 2 == 0 else 3) * int(c) for i, c in enumerate(core))
    return core + str((10 - total % 10) % 10)


def isbn13_valid(code):
    total = sum((1 if i % 2 == 0 else 3) * int(c) for i, c in enumerate(code[:12]))
    return code[12] == str((10 - total % 10) % 10)


def rewrite(line):
    """Return (new_line, action). Idempotent: an already-recorded ISBN is left alone.

    The ISBN goes at the end of the bullet, after the prose, as plain text rather than a
    link. A bare ISBN is what a library catalogue's search box wants, and it adds no
    external URL for the link monitor to have to keep alive.
    """
    if not ENTRY.match(line):
        return line, "skip"
    if RECORDED.search(line):
        return line, "already"
    found = ASIN.search(line)
    if not found:
        return line, "no-asin"
    code = found.group(1)
    if not isbn10_valid(code):
        # A real Amazon ASIN (B0...) rather than an ISBN-10. Never guess one.
        return line, "not-an-isbn"
    return "%s  ISBN %s" % (line.rstrip(), to_isbn13(code)), "add"


def check(lines):
    """Every recorded ISBN-13 must be self-consistent AND match its line's ASIN."""
    problems = []
    for n, line in enumerate(lines, 1):
        recorded = RECORDED.search(line)
        if not recorded:
            continue
        got = recorded.group(1)
        if not isbn13_valid(got):
            problems.append((n, got, "fails its own check digit"))
            continue
        asin = ASIN.search(line)
        if asin and isbn10_valid(asin.group(1)):
            want = to_isbn13(asin.group(1))
            if want != got:
                problems.append((n, got, "does not match the ASIN on this line (%s)" % want))
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="record the ISBNs")
    mode.add_argument("--check", action="store_true", help="verify; exit 1 on a mismatch")
    # Exists so a test can exercise the real write/measure loop without touching the tracked
    # library. Before it, the retirement test mutated the shipped file and restored it in a
    # `finally` — which left the tracked file derived if the process died, and, worse, made the
    # test depend on the tree being un-derived. The nightly runner does the work in the same
    # checkout it then runs the guard suite in, so that assumption failed three nights running
    # (2026-09-09..11). A task's own test must not require that the task has not been done.
    ap.add_argument("--books", type=Path, default=BOOKS,
                    help="book library to read (default: the tracked one)")
    args = ap.parse_args()
    books = args.books

    try:
        text = books.read_text(encoding="utf-8")
    except OSError as exc:
        print("cannot read %s: %s" % (books.name, exc), file=sys.stderr)
        return 2
    lines = text.splitlines()

    if args.check:
        problems = check(lines)
        for n, got, why in problems:
            print("line %d: ISBN %s %s" % (n, got, why))
        recorded = sum(1 for ln in lines if RECORDED.search(ln))
        print("%d recorded ISBN-13(s), %d problem(s)" % (recorded, len(problems)))
        return 1 if problems else 0

    out, counts = [], {"add": 0, "already": 0, "no-asin": 0, "not-an-isbn": 0, "skip": 0}
    for line in lines:
        new, action = rewrite(line)
        counts[action] += 1
        out.append(new)

    entries = counts["add"] + counts["already"] + counts["no-asin"] + counts["not-an-isbn"]
    print("%d book entries: %d to add, %d already recorded, %d without an ASIN, "
          "%d whose id is not an ISBN-10" %
          (entries, counts["add"], counts["already"], counts["no-asin"], counts["not-an-isbn"]))

    if not args.write:
        print("\ndry run — pass --write to record them")
        return 0
    if not counts["add"]:
        print("nothing to do")
        return 0
    books.write_text("\n".join(out) + ("\n" if text.endswith("\n") else ""), encoding="utf-8")
    try:
        where = books.relative_to(ROOT)
    except ValueError:  # a fixture outside the repo, under --books
        where = books
    print("wrote %d ISBN(s) to %s" % (counts["add"], where))
    print("now run: python3 bin/derive_isbn13.py --check")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(2)
