#!/usr/bin/env python3
"""Name every evidence source whose faculty review is overdue, due, or about to fall due under its own reviewCadence.

WHY: every source in `evidence_registry.json` carries a `governance.reviewCadence`, and that
word is a promise. As of 2026-09-18, 101 sources promise "annual" and 8 promise "monthly".
The first annual reviews fall due in July 2027; the monthly ones fall due every month, and
nothing in the repo has ever re-reviewed one on that schedule. `monthly_review.py` already
COUNTS the cadence buckets (`_evidence_counts`) and flips the monthly gate to "review" when
any source is due, overdue or unknown -- but a count is not a work list. It tells the
reviewer "8 overdue" and leaves them to open the registry and re-derive which 8, which is
exactly the step that does not happen. It also has no lookahead: a source becomes visible
the day it is late, never the month before, so a review that takes a week to schedule is
always overdue by the time it is booked.

This tool closes both gaps. It applies the SAME definition of "next review" as
monthly_review.py -- `_add_months(lastReviewed, 1 if monthly else 12)`, with the same
month-end clamping (Jan 31 + 1 month is Feb 28/29, not Mar 3) -- and names the rows. The
definition is re-implemented here rather than imported, because bin/ tools must run
standalone; `--self-test` imports monthly_review's own `_add_months` and asserts parity on
the boundary cases, and records the check as SKIPPED (not passed) if the import fails.

Two buckets exist purely for lookahead: `due-30d` and `due-90d`. Neither fails the run --
they are the queue, not the alarm. What fails the run is `overdue`, `due`, and `unknown`.
Unknown is a finding, never a pass: a missing or malformed `lastReviewed`, a date in the
future, or a cadence outside {monthly, annual} means the promise cannot be checked, and a
check that cannot see is never a check that agrees. Every unknown row carries its reason.

Nothing here decides whether a source is still correct. It asserts only that somebody
looked when they said they would.

MODES
  (default)                   examine ROOT/evidence_registry.json as of today; exit 1 on findings
  --as-of YYYY-MM-DD          examine as of a frozen date (the self-test never reads the clock)
  --json                      same, as machine-readable JSON
  --all                       also name the due-90d and current rows (default: counts only)
  --registry PATH             examine a different registry file (used by --self-test)
  --self-test                 prove each bucket can fire and stays silent on the good case,
                              assert parity with monthly_review._add_months, drive main()
                              end-to-end against inline fixtures; no network, no clock

EXIT CODES. 0 when no source is overdue, due or unknown; 1 when any is; 2 when the registry
cannot be read or parsed, or when fewer sources were examined than the registry declares.
There is no exit code that means "did not look".
"""

from __future__ import annotations

import argparse
import calendar
import json
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = ROOT / "evidence_registry.json"
MONTHLY_REVIEW_DIR = ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"

# Cadence word -> months until the next review. Anything else is `unknown`, deliberately:
# the schema does not constrain the value, so a typo like "anual" must surface as a
# finding rather than silently fall into a default.
CADENCE_MONTHS = {"monthly": 1, "annual": 12}

# Lookahead horizons. 30 days is "book it now"; 90 is "it is on the horizon".
NEAR_DAYS = 30
FAR_DAYS = 90

# The buckets that fail the run. due-30d and due-90d are a queue, not an alarm.
FAILING = ("overdue", "due", "unknown")
BUCKETS = ("overdue", "due", "due-30d", "due-90d", "current", "unknown")


class CadenceError(RuntimeError):
    """The registry could not be read, parsed, or fully examined."""


# ------------------------------------------------------------------ date helpers


def _exact_date(value):
    """An ISO date string, exactly (no whitespace, no time part), else None.

    Same rule as monthly_review._exact_date: a value that round-trips through
    date.isoformat() unchanged. "2026-7-8" and "2026-07-08T00:00" are both rejected.
    """
    if not isinstance(value, str) or value != value.strip():
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def _add_months(value: date, months: int) -> date:
    """Same semantics as monthly_review._add_months: clamp to the target month's last day."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


# ------------------------------------------------------------------ classification


def classify(source: dict, today: date) -> dict:
    """Bucket one source by its own cadence, as of `today`. Pure; never reads the clock."""
    source = source if isinstance(source, dict) else {}
    governance = source.get("governance")
    governance = governance if isinstance(governance, dict) else {}
    citation = source.get("citation")
    citation = citation if isinstance(citation, dict) else {}

    row = {
        "id": source.get("id"),
        "title": citation.get("title"),
        "lastReviewed": governance.get("lastReviewed"),
        "cadence": governance.get("reviewCadence"),
        "nextReview": None,
        "bucket": "unknown",
        "daysUntil": None,
    }

    last = _exact_date(row["lastReviewed"])
    if last is None:
        row["reason"] = (
            "lastReviewed missing" if row["lastReviewed"] in (None, "")
            else f"lastReviewed malformed: {row['lastReviewed']!r}"
        )
        return row
    if last > today:
        row["reason"] = f"lastReviewed {last.isoformat()} is after as-of {today.isoformat()}"
        return row
    months = CADENCE_MONTHS.get(row["cadence"]) if isinstance(row["cadence"], str) else None
    if months is None:
        row["reason"] = f"reviewCadence not in {sorted(CADENCE_MONTHS)}: {row['cadence']!r}"
        return row

    next_review = _add_months(last, months)
    days = (next_review - today).days
    row["nextReview"] = next_review.isoformat()
    row["daysUntil"] = days
    if days < 0:
        row["bucket"] = "overdue"
    elif days == 0:
        row["bucket"] = "due"
    elif days <= NEAR_DAYS:
        row["bucket"] = "due-30d"
    elif days <= FAR_DAYS:
        row["bucket"] = "due-90d"
    else:
        row["bucket"] = "current"
    return row


# ------------------------------------------------------------------ registry


def load_registry(path: Path) -> list:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CadenceError(f"{path}: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("sources"), list):
        raise CadenceError(f"{path}: expected an object with a sources[] list")
    return data["sources"]


def examine(sources: list, today: date) -> dict:
    """Classify every declared source. Raises rather than summarising over a short set."""
    declared = len(sources)
    rows = [classify(s, today) for s in sources]
    if len(rows) != declared:
        raise CadenceError(f"examined {len(rows)} of {declared} declared sources")
    counts = {b: sum(1 for r in rows if r["bucket"] == b) for b in BUCKETS}
    order = {b: i for i, b in enumerate(BUCKETS)}
    rows.sort(key=lambda r: (order[r["bucket"]],
                             r["daysUntil"] if r["daysUntil"] is not None else 0,
                             str(r["id"])))
    return {
        "schemaVersion": 1,
        "asOf": today.isoformat(),
        "declared": declared,
        "examined": len(rows),
        "counts": counts,
        "rows": rows,
    }


def render(report: dict, show_all: bool) -> str:
    counts = report["counts"]
    out = [
        f"review cadence: {report['declared']} source(s) declared, "
        f"{report['examined']} examined, as of {report['asOf']}",
        "  " + "  ".join(f"{b} {counts[b]}" for b in BUCKETS),
    ]
    named = set(FAILING) | {"due-30d"}
    if show_all:
        named |= {"due-90d", "current"}
    for bucket in BUCKETS:
        rows = [r for r in report["rows"] if r["bucket"] == bucket]
        if not rows or bucket not in named:
            continue
        out.append("")
        out.append(f"{bucket} ({len(rows)}):")
        for r in rows:
            if bucket == "unknown":
                detail = r.get("reason", "?")
            else:
                when = r["nextReview"]
                d = r["daysUntil"]
                if d < 0:
                    detail = f"next {when}, {-d}d late"
                elif d == 0:
                    detail = f"next {when}, today"
                else:
                    detail = f"next {when}, in {d}d"
            out.append(f"  {str(r['id']):40s} {str(r['cadence']):8s} "
                       f"last {r['lastReviewed'] or '-'}  {detail}")
    failing = sum(counts[b] for b in FAILING)
    out.append("")
    if failing:
        out.append(f"review cadence: {failing} finding(s) — "
                   + ", ".join(f"{counts[b]} {b}" for b in FAILING if counts[b]))
    else:
        out.append("OK — no source is overdue, due or unknown"
                   + (f"; {counts['due-30d']} fall due within {NEAR_DAYS}d"
                      if counts["due-30d"] else ""))
    return "\n".join(out)


# ------------------------------------------------------------------ self-test


def _fixture(sources: list) -> dict:
    return {"sources": sources}


def _source(sid: str, last, cadence, title: str = "t") -> dict:
    return {"id": sid, "citation": {"title": title},
            "governance": {"lastReviewed": last, "reviewCadence": cadence}}


def self_test() -> int:
    checks: list[tuple[str, bool]] = []

    def expect(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))

    today = date(2026, 9, 18)  # frozen: this function never reads the clock

    # --- _add_months: the one definition everything rests on.
    expect("_add_months clamps Jan 31 + 1 to Feb 28 in a common year",
           _add_months(date(2026, 1, 31), 1) == date(2026, 2, 28))
    expect("_add_months clamps Jan 31 + 1 to Feb 29 in a leap year",
           _add_months(date(2028, 1, 31), 1) == date(2028, 2, 29))
    expect("_add_months rolls a leap day + 12 to Feb 28",
           _add_months(date(2028, 2, 29), 12) == date(2029, 2, 28))
    expect("_add_months crosses the year on Dec + 1",
           _add_months(date(2026, 12, 15), 1) == date(2027, 1, 15))
    expect("_add_months leaves a mid-month day alone",
           _add_months(date(2026, 7, 8), 12) == date(2027, 7, 8))

    # --- parity with monthly_review's own implementation. Skipped-but-noted on import
    #     failure: a parity check that silently passes when it could not compare is the
    #     vacuous-pass shape this whole tool exists to refuse.
    parity_fixtures = [
        (date(2026, 1, 31), 1), (date(2028, 1, 31), 1), (date(2028, 2, 29), 12),
        (date(2026, 12, 15), 1), (date(2026, 12, 31), 1), (date(2026, 7, 8), 12),
        (date(2026, 8, 31), 1), (date(2024, 2, 29), 12),
    ]
    theirs = None
    try:
        sys.path.insert(0, str(MONTHLY_REVIEW_DIR))
        import monthly_review  # type: ignore
        theirs = monthly_review._add_months
    except Exception as exc:  # noqa: BLE001 - any import failure is "could not compare"
        print(f"  SKIP  parity with monthly_review._add_months: import failed ({exc})")
    finally:
        if str(MONTHLY_REVIEW_DIR) in sys.path:
            sys.path.remove(str(MONTHLY_REVIEW_DIR))
    if theirs is not None:
        expect("parity: _add_months agrees with monthly_review on every fixture",
               all(_add_months(d, m) == theirs(d, m) for d, m in parity_fixtures))
        expect("parity: the two functions really are different objects",
               theirs is not _add_months)

    # --- _exact_date: the same strictness as monthly_review.
    expect("_exact_date accepts a canonical ISO date",
           _exact_date("2026-07-08") == date(2026, 7, 8))
    expect("_exact_date rejects a non-canonical date", _exact_date("2026-7-8") is None)
    expect("_exact_date rejects a datetime", _exact_date("2026-07-08T00:00") is None)
    expect("_exact_date rejects surrounding whitespace", _exact_date(" 2026-07-08") is None)
    expect("_exact_date rejects a non-string", _exact_date(20260708) is None)

    # --- classify: every bucket fires on its case and is silent on its neighbours.
    def bucket(last, cadence):
        return classify(_source("x", last, cadence), today)["bucket"]

    # monthly, last 2026-08-17 -> next 2026-09-17 -> one day late
    expect("classify: overdue fires the day after next review",
           bucket("2026-08-17", "monthly") == "overdue")
    expect("classify: overdue on a months-late monthly",
           bucket("2026-07-08", "monthly") == "overdue")
    expect("classify: overdue on a years-late annual",
           bucket("2024-01-01", "annual") == "overdue")
    # monthly, last 2026-08-18 -> next 2026-09-18 == today
    expect("classify: due fires on the day itself",
           bucket("2026-08-18", "monthly") == "due")
    expect("classify: due is not overdue",
           bucket("2026-08-18", "monthly") != "overdue")
    # monthly, last 2026-08-19 -> next 2026-09-19 -> 1 day out
    expect("classify: due-30d fires one day out",
           bucket("2026-08-19", "monthly") == "due-30d")
    # annual, last 2025-10-18 -> next 2026-10-18 -> 30 days out (boundary, inclusive)
    expect("classify: due-30d includes exactly 30 days",
           bucket("2025-10-18", "annual") == "due-30d")
    # annual, last 2025-10-19 -> next 2026-10-19 -> 31 days out
    expect("classify: due-90d starts at 31 days",
           bucket("2025-10-19", "annual") == "due-90d")
    # annual, last 2025-12-17 -> next 2026-12-17 -> 90 days out (boundary, inclusive)
    expect("classify: due-90d includes exactly 90 days",
           bucket("2025-12-17", "annual") == "due-90d")
    # annual, last 2025-12-18 -> next 2026-12-18 -> 91 days out
    expect("classify: current starts at 91 days",
           bucket("2025-12-18", "annual") == "current")
    expect("classify: current on a freshly reviewed annual",
           bucket("2026-09-16", "annual") == "current")
    expect("classify: a fresh monthly is due-30d, not current",
           bucket("2026-09-16", "monthly") == "due-30d")
    # month-end clamping reaches the verdict: Aug 31 + 1 month is Sep 30, not Oct 1
    row = classify(_source("x", "2026-08-31", "monthly"), today)
    expect("classify: month-end clamps (Aug 31 monthly -> Sep 30)",
           row["nextReview"] == "2026-09-30" and row["daysUntil"] == 12)
    # unknown, each reason
    for last, cadence, needle in [
        (None, "annual", "missing"),
        ("", "annual", "missing"),
        ("2026-7-8", "annual", "malformed"),
        ("not a date", "annual", "malformed"),
        ("2026-09-19", "annual", "after as-of"),
        ("2026-07-08", "quarterly", "reviewCadence"),
        ("2026-07-08", None, "reviewCadence"),
        ("2026-07-08", "Annual", "reviewCadence"),
    ]:
        r = classify(_source("x", last, cadence), today)
        expect(f"classify: unknown on last={last!r} cadence={cadence!r}",
               r["bucket"] == "unknown" and needle in r.get("reason", "")
               and r["nextReview"] is None and r["daysUntil"] is None)
    expect("classify: a well-formed source is NOT unknown",
           bucket("2026-07-08", "annual") == "current")
    expect("classify: survives a source with no governance at all",
           classify({"id": "bare"}, today)["bucket"] == "unknown")
    expect("classify: survives a non-dict source",
           classify("garbage", today)["bucket"] == "unknown")
    expect("classify: carries id and title through",
           classify(_source("abc", "2026-07-08", "annual", "Title"), today)["title"] == "Title")
    expect("classify: reports daysUntil as an integer, negative when late",
           classify(_source("x", "2026-07-08", "monthly"), today)["daysUntil"] == -41)

    # --- examine: counts sum to declared, and declared == examined.
    report = examine([_source("a", "2026-07-08", "monthly"),
                      _source("b", "2026-09-01", "annual"),
                      _source("c", None, "annual")], today)
    expect("examine: declared equals examined",
           report["declared"] == 3 and report["examined"] == 3)
    expect("examine: bucket counts sum to declared",
           sum(report["counts"].values()) == 3)
    expect("examine: sorts failing buckets first",
           [r["bucket"] for r in report["rows"]] == ["overdue", "current", "unknown"])
    expect("examine: an empty registry examines zero of zero",
           examine([], today)["declared"] == 0)

    # --- render names the failing rows and the 30-day queue, not the rest.
    text = render(examine([_source("late", "2026-07-08", "monthly"),
                           _source("soon", "2026-08-25", "monthly"),
                           _source("later", "2025-11-01", "annual"),
                           _source("fine", "2026-09-01", "annual")], today), False)
    expect("render: coverage line comes first",
           text.splitlines()[0].startswith("review cadence: 4 source(s) declared, 4 examined"))
    expect("render: names an overdue row", "late" in text and "41d late" in text)
    expect("render: names a due-30d row", "soon" in text)
    expect("render: does not name a due-90d row by default", "later" not in text)
    expect("render: does not name a current row by default", "  fine " not in text)
    text_all = render(examine([_source("later", "2025-11-01", "annual")], today), True)
    expect("render: --all names the due-90d row", "later" in text_all)
    clean = render(examine([_source("fine", "2026-09-01", "annual")], today), False)
    expect("render: clean run says OK", "OK" in clean)

    # --- end to end: main() against a tempfile registry, frozen as-of.
    def drive(payload, *extra):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                         encoding="utf-8") as fh:
            fh.write(payload if isinstance(payload, str) else json.dumps(payload))
            reg = fh.name
        import io
        from contextlib import redirect_stderr, redirect_stdout
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(["--registry", reg, "--as-of", "2026-09-18", *extra])
        Path(reg).unlink(missing_ok=True)
        return code, out.getvalue(), err.getvalue()

    code, out, _ = drive(_fixture([_source("late", "2026-07-08", "monthly"),
                                   _source("fine", "2026-09-01", "annual")]), "--json")
    blob = json.loads(out) if out.strip().startswith("{") else {}
    expect("main: exit 1 with one overdue row",
           code == 1 and blob.get("counts", {}).get("overdue") == 1)
    expect("main: --json carries declared == examined == 2",
           blob.get("declared") == 2 and blob.get("examined") == 2)
    expect("main: --json names the overdue row",
           [r["id"] for r in blob.get("rows", []) if r["bucket"] == "overdue"] == ["late"])
    code, out, _ = drive(_fixture([_source("a", "2026-09-01", "annual"),
                                   _source("b", "2026-08-01", "annual")]))
    expect("main: exit 0 on an all-current fixture", code == 0 and "OK" in out)
    code, out, _ = drive(_fixture([_source("a", "2026-08-18", "monthly")]))
    expect("main: exit 1 on a due-today row", code == 1)
    code, out, _ = drive(_fixture([_source("a", None, "annual")]))
    expect("main: exit 1 on an unknown row", code == 1 and "missing" in out)
    code, out, _ = drive(_fixture([_source("a", "2026-08-25", "monthly")]))
    expect("main: exit 0 on a due-30d row (queue, not alarm)", code == 0)
    code, _, err = drive("{not json")
    expect("main: exit 2 on a corrupt registry", code == 2 and "cannot run" in err)
    code, _, err = drive({"sources": "nope"})
    expect("main: exit 2 on a registry with no sources[]", code == 2)
    code, _, err = drive(_fixture([]))
    expect("main: exit 0 on an empty registry (0 declared, 0 examined)", code == 0)
    code, _, err = drive(_fixture([_source("a", "2026-09-01", "annual")]),
                         "--as-of", "2026-13-45")
    expect("main: exit 2 on an impossible --as-of", code == 2)
    with tempfile.TemporaryDirectory() as tmp:
        import io
        from contextlib import redirect_stderr
        err = io.StringIO()
        with redirect_stderr(err):
            code = main(["--registry", str(Path(tmp) / "absent.json"),
                         "--as-of", "2026-09-18"])
        expect("main: exit 2 on a missing registry", code == 2)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


# ------------------------------------------------------------------ main


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--as-of", metavar="YYYY-MM-DD",
                    help="examine as of this date instead of today")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--all", action="store_true",
                    help="also name the due-90d and current rows")
    ap.add_argument("--registry", metavar="PATH", default=str(DEFAULT_REGISTRY),
                    help="registry to examine (default: evidence_registry.json at the repo root)")
    ap.add_argument("--self-test", action="store_true",
                    help="prove each bucket can fire, and stays silent on the good case")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    try:
        if args.as_of is None:
            today = date.today()
        else:
            today = _exact_date(args.as_of)
            if today is None:
                raise CadenceError(f"--as-of must be YYYY-MM-DD, got {args.as_of!r}")
        sources = load_registry(Path(args.registry))
        report = examine(sources, today)
    except CadenceError as exc:
        print(f"review cadence: cannot run ({exc})", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render(report, args.all))

    if report["examined"] != report["declared"]:
        print(f"review cadence: examined {report['examined']} of {report['declared']} "
              "declared", file=sys.stderr)
        return 2
    return 1 if any(report["counts"][b] for b in FAILING) else 0


if __name__ == "__main__":
    sys.exit(main())
