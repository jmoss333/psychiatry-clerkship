#!/usr/bin/env python3
"""Every ICD-10-CM F-code the library mentions must exist in the code set in force on the date it is read.

WHY. ICD-10-CM is re-issued every October 1. The FY2027 set takes effect 2026-10-01, and
learners read this library on both sides of that boundary: a case written in July is still
being read in November. A code that is retired, or a category that is split into finer
codes, is a silent teaching error -- the page still renders, the schema still validates,
and the learner copies a code that no longer exists into a note. No schema sees it, because
each page is individually valid and only the corpus-versus-calendar pair is wrong.
Measured 2026-09-18: one F-code in shipped content (F10.231, alcohol dependence with
withdrawal delirium, valid in both FY2026 and FY2027). The value of the tool is not that
one code. It is that the October boundary never has to be remembered again: run it with
today's date and it picks the right table; run it in September and it warns about a code
that will stop existing in October, before it does.

WHAT IT READS. Nothing on the network, ever. The code set is a committed fixture,
bin/data/icd10cm_f_chapter.json, built once from the CMS "code descriptions in tabular
order" files (icd10cm_order_YYYY.txt) and carrying the sha256 of each source so a refresh is
checkable. It holds the F chapter only (F01-F99, Mental, Behavioral and Neurodevelopmental
disorders), one table per fiscal year with its effective date. Refreshing it for FY2028 is
a data change, not a code change.

WHAT COUNTS AS A MENTION. The scan covers tracked *.md, *.html and *.json files under the
numbered content directories at the repo root (NN_*/), excluding 99_Archive/, any _build/,
node_modules/ and docs/. The file list comes from `git ls-files`, so untracked scratch is
never scanned and never counted. A mention is the pattern F + two digits, optionally a dot
and one to four digits, bounded on both sides by a non-alphanumeric character or the edge of
the line -- so "F10.231", "F32.9" and "(F41.1)" match, while "F10x", "PDF10.2", "F1.2" and
"F123.4" do not. Matches are normalised to CMS's dotless form (F10.231 -> F10231).

  - A DOTTED code ("F10.231") is a codeMention and must validate against the table.
  - A BARE two-digit category ("F32", no dot) is reported separately as a categoryMention
    and is informational, never a finding. This is a deliberate precision choice: bare
    "F32" in prose is as often a keyboard key, a hex fragment or a DSM chapter heading as
    it is a diagnosis code, and a category that exists as a header row in the table
    proves nothing about the code the author meant. Only a dotted code is specific enough
    to be wrong, so only dotted codes are gated.
  - Codes whose later characters are letters (FY2027's new F64A) are not matched by the
    pattern and are outside this tool's claim. Today the corpus writes none.

STATUS PER MENTION, chosen against the fiscal-year table in force on --as-of (the latest
table whose effective date is <= as-of):
  valid-billable   exists, billing flag 1              (clean)
  valid-header     exists, billing flag 0 -- a category header such as F10.23; allowed in
                   teaching prose, reported as informational                (clean)
  retiring         exists now but NOT in the next fiscal year's table       (FINDING --
                   fires before October 1, which is the whole point)
  not-in-set       absent from the table in force                           (FINDING)
  new-next-fy      absent now, present in the next table                    (informational)

USAGE
  python3 bin/check_icd_codes.py                        # scan, as of today
  python3 bin/check_icd_codes.py --as-of 2026-10-01     # what the corpus looks like then
  python3 bin/check_icd_codes.py --json                 # machine-readable report
  python3 bin/check_icd_codes.py --self-test            # prove it can fail; no network
  python3 bin/check_icd_codes.py --table T --paths F... # test hooks: other table, other files

EXIT CODES. 0 clean, 1 findings (a not-in-set or retiring code), 2 the checker could not
determine: table missing or unparseable, no fiscal-year table covers --as-of, git unavailable,
or nothing to scan. A scan of zero files is exit 2, never 0 -- a check that examined nothing
did not pass, it did not look.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TABLE = ROOT / "bin" / "data" / "icd10cm_f_chapter.json"

SCAN_SUFFIXES = (".md", ".html", ".json")
# Content source lives in the numbered NN_*/ directories at the repo root.
CONTENT_DIR = re.compile(r"^\d{2}_[^/]+/")
EXCLUDED_TOP = ("99_Archive/",)
EXCLUDED_PARTS = frozenset({"_build", "node_modules", "docs"})

# F + two digits, optional dot + 1-4 digits. The lookbehind/lookahead are the real boundary:
# \b alone would accept "F10x" (x is a word char, but so is the 0 before it -- no boundary
# there, yet \b after "F10" is satisfied at "F10." and "F10 ", and would also let "F10" match
# inside "F10x" via backtracking on the optional group). Requiring non-alphanumeric on both
# sides closes that.
CODE_RE = re.compile(r"(?<![A-Za-z0-9])F(\d{2})(?:\.(\d{1,4}))?(?![A-Za-z0-9])")

FINDING_STATUSES = frozenset({"not-in-set", "retiring"})
INFO_STATUSES = frozenset({"valid-header", "new-next-fy"})


class IcdCheckError(RuntimeError):
    """The checker cannot determine an answer. main() turns this into exit 2."""


# ------------------------------------------------------------------ table


def load_table(path: Path) -> dict:
    """Read the fixture and return its fiscal-year tables with parsed effective dates.

    Result: {fy: {"effective": date, "codes": {CODE: [flag, shortDescription]}}}.
    Anything missing or malformed raises IcdCheckError -- a table that cannot be read is
    not an empty table.
    """
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise IcdCheckError(f"code table not found: {path}")
    except (OSError, ValueError) as exc:
        raise IcdCheckError(f"code table unreadable: {path}: {exc}")
    if not isinstance(raw, dict) or raw.get("schemaVersion") != 1:
        raise IcdCheckError(f"code table {path}: expected schemaVersion 1")
    fys = raw.get("fiscalYears")
    if not isinstance(fys, dict) or not fys:
        raise IcdCheckError(f"code table {path}: no fiscalYears")
    tables: dict[str, dict] = {}
    for fy, entry in fys.items():
        if not isinstance(entry, dict):
            raise IcdCheckError(f"code table {path}: {fy} is not an object")
        try:
            effective = date.fromisoformat(str(entry.get("effective")))
        except ValueError:
            raise IcdCheckError(f"code table {path}: {fy} has no valid effective date")
        codes = entry.get("codes")
        if not isinstance(codes, dict) or not codes:
            raise IcdCheckError(f"code table {path}: {fy} has no codes")
        tables[fy] = {"effective": effective, "codes": codes}
    return tables


def table_in_force(tables: dict, as_of: date) -> tuple[str, str | None]:
    """(fy in force, next fy or None). Raises when no table covers as_of."""
    ordered = sorted(tables, key=lambda fy: tables[fy]["effective"])
    current = [fy for fy in ordered if tables[fy]["effective"] <= as_of]
    if not current:
        raise IcdCheckError(
            f"no fiscal-year table covers {as_of.isoformat()} "
            f"(earliest effective {tables[ordered[0]]['effective'].isoformat()})")
    fy = current[-1]
    later = [f for f in ordered if tables[f]["effective"] > as_of]
    return fy, (later[0] if later else None)


def classify(code: str, tables: dict, as_of: date) -> dict:
    """Status of one dotless code against the table in force on as_of. Pure."""
    fy, next_fy = table_in_force(tables, as_of)
    now = tables[fy]["codes"]
    nxt = tables[next_fy]["codes"] if next_fy else None
    result = {"code": code, "fy": fy, "nextFy": next_fy}
    if code in now:
        flag, short = now[code][0], now[code][1]
        result["description"] = short
        if nxt is not None and code not in nxt:
            result["status"] = "retiring"
        else:
            result["status"] = "valid-billable" if flag == "1" else "valid-header"
    elif nxt is not None and code in nxt:
        result["status"] = "new-next-fy"
        result["description"] = nxt[code][1]
    else:
        result["status"] = "not-in-set"
    return result


# ------------------------------------------------------------------ scan


def normalise(category: str, extension: str | None) -> str:
    """('10', '231') -> 'F10231'; ('32', None) -> 'F32'."""
    return f"F{category}{extension or ''}"


def find_mentions(text: str) -> list[dict]:
    """Every match in text, with 1-based line, raw form, dotless code and dotted flag."""
    out = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        for m in CODE_RE.finditer(line):
            out.append({
                "line": lineno,
                "raw": m.group(0),
                "code": normalise(m.group(1), m.group(2)),
                "dotted": m.group(2) is not None,
            })
    return out


def tracked_content_files() -> list[Path]:
    """Tracked *.md / *.html / *.json under NN_*/, minus the exclusions. Via git only."""
    try:
        proc = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, check=True,
                              capture_output=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise IcdCheckError(f"git ls-files failed, cannot enumerate content: {exc}")
    files = []
    for rel in proc.stdout.decode("utf-8", errors="replace").split("\0"):
        if not rel or not CONTENT_DIR.match(rel) or rel.startswith(EXCLUDED_TOP):
            continue
        if not rel.endswith(SCAN_SUFFIXES):
            continue
        if EXCLUDED_PARTS.intersection(rel.split("/")[:-1]):
            continue
        files.append(ROOT / rel)
    return files


def scan(paths: list[Path]) -> list[dict]:
    """Mentions across paths, each tagged with a display path. Missing file -> error."""
    mentions = []
    for p in paths:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise IcdCheckError(f"cannot read {p}: {exc}")
        for m in find_mentions(text):
            m["path"] = display_path(p)
            mentions.append(m)
    return mentions


def display_path(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(ROOT))
    except ValueError:
        return str(p)


# ------------------------------------------------------------------ report


def run(tables: dict, paths: list[Path], as_of: date) -> dict:
    """The whole check as data. Raises IcdCheckError on anything undeterminable."""
    if not paths:
        raise IcdCheckError("nothing to scan: the file list is empty "
                            "(a scan of nothing is not a pass)")
    fy, next_fy = table_in_force(tables, as_of)
    mentions = scan(paths)
    dotted = [m for m in mentions if m["dotted"]]
    bare = [m for m in mentions if not m["dotted"]]
    results = []
    for m in dotted:
        verdict = classify(m["code"], tables, as_of)
        results.append({**m, **verdict})
    findings = [r for r in results if r["status"] in FINDING_STATUSES]
    informational = [r for r in results if r["status"] in INFO_STATUSES]
    return {
        "schemaVersion": 1,
        "asOf": as_of.isoformat(),
        "fyInForce": fy,
        "effective": tables[fy]["effective"].isoformat(),
        "nextFy": next_fy,
        "nextEffective": tables[next_fy]["effective"].isoformat() if next_fy else None,
        "filesScanned": len(paths),
        "codeMentions": len(dotted),
        "filesWithCodeMentions": len({m["path"] for m in dotted}),
        "categoryMentions": len(bare),
        "mentions": results,
        "categories": bare,
        "findings": findings,
        "informational": informational,
        "status": "findings" if findings else "clean",
    }


def print_report(report: dict) -> None:
    nxt = (f", next {report['nextFy']} effective {report['nextEffective']}"
           if report["nextFy"] else ", no later table known")
    print(f"icd-10-cm: {report['filesScanned']} file(s) scanned, "
          f"{report['codeMentions']} dotted code mention(s) in "
          f"{report['filesWithCodeMentions']} file(s), "
          f"{report['categoryMentions']} bare category mention(s) (informational); "
          f"table {report['fyInForce']} in force as of {report['asOf']} "
          f"(effective {report['effective']}){nxt}")
    for r in report["findings"]:
        print(f"{r['path']}:{r['line']}  {r['raw']}  {r['status']}")
    for r in report["informational"]:
        desc = f"  ({r['description']})" if r.get("description") else ""
        print(f"note: {r['path']}:{r['line']}  {r['raw']}  {r['status']}{desc}")
    n = len(report["findings"])
    if n:
        print(f"icd-10-cm: FAIL -- {n} finding(s)")
    else:
        print("icd-10-cm: clean")


# ------------------------------------------------------------------ self-test


def self_test() -> int:
    checks: list[tuple[str, bool]] = []

    def expect(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))

    before = date(2026, 9, 30)
    boundary = date(2026, 10, 1)

    # Inline mini-table. F10231 in both years; F99900 only in fy2026 (retires); F64Z0
    # only in fy2027 (new); F1023 is a header row in both.
    mini = {
        "schemaVersion": 1,
        "fiscalYears": {
            "fy2026": {"effective": "2025-10-01", "codes": {
                "F10231": ["1", "Alcohol dependence with withdrawal delirium"],
                "F1023": ["0", "Alcohol dependence with withdrawal"],
                "F99900": ["1", "Retiring test code"],
            }},
            "fy2027": {"effective": "2026-10-01", "codes": {
                "F10231": ["1", "Alcohol dependence with withdrawal delirium"],
                "F1023": ["0", "Alcohol dependence with withdrawal"],
                "F64Z0": ["1", "New test code"],
            }},
        },
    }

    def parsed(fixture: dict) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "t.json"
            p.write_text(json.dumps(fixture), encoding="utf-8")
            return load_table(p)

    tables = parsed(mini)

    # --- table selection is by effective date, latest first.
    expect("fy2026 is in force on 2026-09-30",
           table_in_force(tables, before) == ("fy2026", "fy2027"))
    expect("fy2027 is in force on 2026-10-01",
           table_in_force(tables, boundary) == ("fy2027", None))
    raised = False
    try:
        table_in_force(tables, date(2020, 1, 1))
    except IcdCheckError:
        raised = True
    expect("a date before every table raises, never guesses", raised)

    # --- classify: the four statuses and both sides of the boundary.
    expect("a billable code in both years is valid-billable before Oct 1",
           classify("F10231", tables, before)["status"] == "valid-billable")
    expect("and still valid-billable on Oct 1",
           classify("F10231", tables, boundary)["status"] == "valid-billable")
    expect("a header row is valid-header, not a finding",
           classify("F1023", tables, before)["status"] == "valid-header")
    expect("a code only in fy2026 is RETIRING before Oct 1",
           classify("F99900", tables, before)["status"] == "retiring")
    expect("and not-in-set on Oct 1",
           classify("F99900", tables, boundary)["status"] == "not-in-set")
    # A code that only exists NEXT year is absent from the set in force, but it is not a
    # teaching error to have written it early -- it is informational (new-next-fy), and the
    # distinction from not-in-set is exactly what the next-table lookup buys.
    expect("a code only in fy2027 is new-next-fy before Oct 1, NOT a finding",
           classify("F64Z0", tables, before)["status"] == "new-next-fy"
           and "new-next-fy" not in FINDING_STATUSES)
    expect("and valid-billable on Oct 1",
           classify("F64Z0", tables, boundary)["status"] == "valid-billable")
    expect("classify reports the fy it judged against",
           classify("F10231", tables, before)["fy"] == "fy2026"
           and classify("F10231", tables, boundary)["fy"] == "fy2027")
    expect("a code in no table is not-in-set",
           classify("F00000", tables, before)["status"] == "not-in-set")
    expect("with no later table, an absent code is not-in-set (nothing to defer to)",
           classify("F64Z0", {"fy2026": tables["fy2026"]}, before)["status"]
           == "not-in-set")

    # --- regex, both directions.
    for text in ("F10.231", "F32.9", "(F41.1)", "see F10.231.", "|F10.231|"):
        got = find_mentions(text)
        expect(f"matches {text!r} as a dotted code",
               len(got) == 1 and got[0]["dotted"])
    expect("F10.231 normalises to F10231",
           find_mentions("F10.231")[0]["code"] == "F10231")
    expect("(F41.1) normalises to F411",
           find_mentions("(F41.1)")[0]["code"] == "F411")
    for text in ("F10x", "PDF10.2", "F1.2", "F123.4", "#F10AB", "xF32.9"):
        expect(f"does NOT match {text!r} as a code",
               not any(m["dotted"] for m in find_mentions(text)))
    expect("F123.4 does not match at all (no partial F12)",
           find_mentions("F123.4") == [])
    expect("a bare category is a mention but not dotted",
           find_mentions("DSM chapter F32 covers")[0]["dotted"] is False
           and find_mentions("DSM chapter F32 covers")[0]["code"] == "F32")
    expect("mentions carry a 1-based line number",
           find_mentions("x\ny F32.9\n")[0]["line"] == 2)

    # --- load_table refuses what it cannot trust.
    for label, bad in (
        ("wrong schemaVersion", {**mini, "schemaVersion": 2}),
        ("no fiscalYears", {"schemaVersion": 1}),
        ("bad effective date", {"schemaVersion": 1, "fiscalYears": {
            "fy1": {"effective": "soon", "codes": {"F1": ["1", "x"]}}}}),
        ("empty codes", {"schemaVersion": 1, "fiscalYears": {
            "fy1": {"effective": "2025-10-01", "codes": {}}}}),
    ):
        raised = False
        try:
            parsed(bad)
        except IcdCheckError:
            raised = True
        expect(f"load_table raises on {label}", raised)

    # --- end to end. main() with --table and --paths at tempfiles, stdout captured.
    def drive(argv: list[str]) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(argv)
        return code, out.getvalue(), err.getvalue()

    with tempfile.TemporaryDirectory() as tmp:
        table = Path(tmp) / "table.json"
        table.write_text(json.dumps(mini), encoding="utf-8")
        clean = Path(tmp) / "clean.md"
        clean.write_text("Delirium tremens is F10.231; header F10.23 is fine.\n",
                         encoding="utf-8")
        bad = Path(tmp) / "bad.md"
        bad.write_text("first line\nold code F99.900 here\n", encoding="utf-8")
        blank = Path(tmp) / "blank.md"
        blank.write_text("no codes at all, press F12\n", encoding="utf-8")
        common = ["--table", str(table), "--as-of", "2026-09-18"]

        code, out, _ = drive(common + ["--paths", str(clean)])
        expect("a clean file is exit 0", code == 0)
        expect("coverage is printed before the verdict",
               out.startswith("icd-10-cm: 1 file(s) scanned, 2 dotted code mention(s)"))
        expect("the header code is reported as a note, not a finding",
               "valid-header" in out and "icd-10-cm: clean" in out)

        code, out, _ = drive(common + ["--paths", str(bad), str(clean)])
        expect("a retiring code is exit 1 before Oct 1", code == 1)
        expect("the finding names path:line, code and status",
               f"{bad}:2  F99.900  retiring" in out)
        code, out, _ = drive(["--table", str(table), "--as-of", "2026-10-01",
                              "--paths", str(bad)])
        expect("the same code is not-in-set, still exit 1, on Oct 1",
               code == 1 and "F99.900  not-in-set" in out)

        code, out, _ = drive(common + ["--json", "--paths", str(bad)])
        expect("--json is parseable and carries the finding",
               json.loads(out)["findings"][0]["status"] == "retiring")
        expect("--json reports coverage counts",
               json.loads(out)["filesScanned"] == 1
               and json.loads(out)["fyInForce"] == "fy2026")

        code, _, _ = drive(common + ["--paths", str(blank)])
        expect("a file with no dotted codes is exit 0 (bare F12 is informational)",
               code == 0)

        code, _, err = drive(["--table", str(Path(tmp) / "missing.json"),
                              "--as-of", "2026-09-18", "--paths", str(clean)])
        expect("a missing table is exit 2, not a pass", code == 2 and "not found" in err)

        code, _, err = drive(common + ["--paths"])
        expect("an empty path list is exit 2, not a pass",
               code == 2 and "nothing to scan" in err)

        code, _, _ = drive(common + ["--paths", str(Path(tmp) / "nope.md")])
        expect("an unreadable listed file is exit 2", code == 2)

        code, _, err = drive(["--table", str(table), "--as-of", "2020-01-01",
                              "--paths", str(clean)])
        expect("a date no table covers is exit 2", code == 2 and "covers" in err)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


# ------------------------------------------------------------------ main


def _iso_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {text!r}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--as-of", type=_iso_date, default=None,
                    help="judge against the code set in force on this date (default today)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--table", type=Path, default=DEFAULT_TABLE,
                    help="code table fixture (default bin/data/icd10cm_f_chapter.json)")
    ap.add_argument("--paths", nargs="*", default=None, type=Path,
                    help="scan these files instead of the tracked content set")
    ap.add_argument("--self-test", action="store_true",
                    help="prove each check can fail, and stays silent on the good case")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    as_of = args.as_of or date.today()
    try:
        tables = load_table(args.table)
        paths = args.paths if args.paths is not None else tracked_content_files()
        report = run(tables, list(paths), as_of)
    except IcdCheckError as exc:
        print(f"icd-10-cm: could not determine: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_report(report)
    return 1 if report["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
