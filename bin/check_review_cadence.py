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

POLICY (Josh, 2026-09-19): for a source under guideline surveillance, a green monthly
surveillance examination COUNTS as its review. The first run of this tool named all 8
monthly-cadence sources 41 days overdue against `governance.lastReviewed` (2026-07-08),
while the surveillance job had examined seven of them on 2026-09-01. Nobody re-stamps the
registry by hand for a run that found nothing, and automation must not stamp it either
(an agent never signs a review) -- so the credit is DERIVED at read time, never written:
  · the examination date comes from the job's own per-source record,
    `surveillance/history/baselines/<id>.json` `checked_at`, which the job writes only
    after a successful extraction and hash compare (a dead scraper writes nothing);
  · the credit is withheld when the job detected a CHANGE the faculty have not yet
    actioned -- a `modified` finding in `history/guideline_delta_*.json` newer than the
    faculty's own `lastReviewed` whose status is not `actioned` or `dismissed`. A change
    is exactly the case where a person must look, so it stays in faculty's court;
  · every row says who the effective review came from (`reviewedBy`: faculty or
    guideline-surveillance) and why the credit was or was not given.
A change finding counts as ACTIONED when any of three records says so, because the
dated reports freeze the status a finding had on the day it was written (REVIEW_RULES §7:
"nothing auto-closes", but a closed issue IS the human's action): (1) the newest report
row for that fingerprint carries `actioned`/`dismissed`; (2) the fingerprint is in
`surveillance/config/dismissed.json`; (3) the issue that carries the fingerprint is CLOSED
in the issue snapshot -- `history/issue_snapshot.json`, which sync_findings.py writes on
every scheduled run, or a file passed with `--issues-json` (either that shape or raw
`gh issue list --state all --json number,state,body,closedAt,url,labels` output). Without
any of the three the finding stays pending and the credit is withheld -- loud, not silent.
`--no-surveillance-credit` shows the faculty-only view. `monthly_review.py` still counts
by `lastReviewed` alone; teaching it the same rule is a follow-up (WS-7).

MODES
  (default)                   examine ROOT/evidence_registry.json as of today; exit 1 on findings
  --as-of YYYY-MM-DD          examine as of a frozen date (the self-test never reads the clock)
  --json                      same, as machine-readable JSON
  --all                       also name the due-90d and current rows (default: counts only)
  --registry PATH             examine a different registry file (used by --self-test)
  --history PATH              surveillance history dir (default: the repo's; used by --self-test)
  --issues-json PATH          issue snapshot to honour instead of history/issue_snapshot.json
  --no-surveillance-credit    faculty lastReviewed only; ignore surveillance examinations
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
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = ROOT / "evidence_registry.json"
MONTHLY_REVIEW_DIR = ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"
DEFAULT_HISTORY = ROOT / "13_Faculty_Resources" / "_automation" / "surveillance" / "history"

# The surveillance job whose examination counts as a review, and the finding statuses that
# mean the faculty have dealt with a detected change (lifecycle in surveillance/REVIEW_RULES.md:
# new -> triaged -> issue-open -> actioned -> dismissed).
CREDITED_JOB = "guideline-surveillance"
RESOLVED_STATUSES = frozenset({"actioned", "dismissed"})
FP_RE = re.compile(r"surveillance:fp=([A-Za-z0-9:._\-]+)")  # same marker sync_findings.py uses

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


# ------------------------------------------------------------------ surveillance credit


def _iso_date_prefix(value):
    """The date part of an ISO datetime such as 2026-09-01T06:08:48+00:00, else None."""
    return _exact_date(value[:10]) if isinstance(value, str) and len(value) >= 10 else None


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def closed_fingerprints(snapshot) -> set:
    """Fingerprints whose GitHub issue is CLOSED, from any of the accepted snapshot shapes:
    {"issues": [...]} as history/issue_snapshot.json, a bare list of normalized entries
    ({fingerprint, state}), or raw `gh issue list --json number,state,body,...` entries
    (fingerprint recovered from the `surveillance:fp=` marker in the body)."""
    items = snapshot.get("issues") if isinstance(snapshot, dict) else snapshot
    out = set()
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict) or "pull_request" in it:
            continue
        fp = it.get("fingerprint")
        if not fp:
            m = FP_RE.search(it.get("body") or "")
            fp = m.group(1) if m else None
        if fp and str(it.get("state") or "").upper() == "CLOSED":
            out.add(fp)
    return out


def load_surveillance(history_dir: Path, issues_path: Path | None = None,
                      dismissed_path: Path | None = None) -> dict:
    """Per-source examination evidence from the guideline-surveillance job's own records.

    Returns {source_id: {"examinedAt": date|None, "openChanges": [{"detectedAt", "status",
    "severity", "fingerprint"}]}} plus a "_meta" entry with what was read and how each
    change finding was resolved. Reads only; an absent directory is an empty map (no
    credit, so every surveilled source falls back to the faculty date -- loud, never a
    silent pass).
    """
    out: dict = {}
    meta = {"baselines": 0, "findingsSeen": 0, "resolvedByStatus": 0, "resolvedByDismissal": 0,
            "resolvedByClosedIssue": 0, "issueSnapshotCapturedAt": None, "dismissedFingerprints": 0}
    base = history_dir / "baselines"
    if base.is_dir():
        for path in sorted(base.glob("*.json")):
            rec = _read_json(path)
            when = _iso_date_prefix(rec.get("checked_at")) if isinstance(rec, dict) else None
            if when is not None:
                out.setdefault(path.stem, {"examinedAt": None, "openChanges": []})["examinedAt"] = when
                meta["baselines"] += 1

    dismissed_path = dismissed_path or (history_dir.parent / "config" / "dismissed.json")
    dismissed = _read_json(dismissed_path)
    dismissed_fps = set((dismissed or {}).get("dismissed", {}).keys()) if isinstance(dismissed, dict) else set()
    meta["dismissedFingerprints"] = len(dismissed_fps)

    snapshot = _read_json(issues_path) if issues_path else _read_json(history_dir / "issue_snapshot.json")
    if isinstance(snapshot, dict):
        meta["issueSnapshotCapturedAt"] = snapshot.get("capturedAt")
    closed = closed_fingerprints(snapshot) if snapshot is not None else set()

    # Newest report row per fingerprint wins: a dated report freezes the status a finding
    # had that day, and a later run may carry the same fingerprint with a later status.
    latest: dict = {}
    files = sorted(history_dir.glob("guideline_delta_*.json")) if history_dir.is_dir() else []
    for path in files:
        findings = _read_json(path)
        for f in findings if isinstance(findings, list) else []:
            if not isinstance(f, dict) or f.get("change_type") != "modified":
                continue
            fp = f.get("fingerprint") or f.get("finding_id")
            when = _iso_date_prefix(f.get("detected_at"))
            sid = f.get("source_id")
            if not fp or when is None or not sid:
                continue
            latest[fp] = {"sid": sid, "detectedAt": when.isoformat(), "status": f.get("status"),
                          "severity": f.get("severity"), "fingerprint": fp}
    meta["findingsSeen"] = len(latest)
    for fp, rec in latest.items():
        if rec["status"] in RESOLVED_STATUSES:
            meta["resolvedByStatus"] += 1
            continue
        if fp in dismissed_fps:
            meta["resolvedByDismissal"] += 1
            continue
        if fp in closed:
            meta["resolvedByClosedIssue"] += 1
            continue
        sid = rec.pop("sid")
        out.setdefault(sid, {"examinedAt": None, "openChanges": []})["openChanges"].append(rec)
    out["_meta"] = meta
    return out


# ------------------------------------------------------------------ classification


def classify(source: dict, today: date, surveillance: dict | None = None) -> dict:
    """Bucket one source by its own cadence, as of `today`. Pure; never reads the clock.

    `surveillance` is the map from load_surveillance(); None or {} means no credit is
    available and the faculty's `lastReviewed` stands alone.
    """
    source = source if isinstance(source, dict) else {}
    governance = source.get("governance")
    governance = governance if isinstance(governance, dict) else {}
    citation = source.get("citation")
    citation = citation if isinstance(citation, dict) else {}
    surv_block = source.get("surveillance")
    surv_block = surv_block if isinstance(surv_block, dict) else {}

    row = {
        "id": source.get("id"),
        "title": citation.get("title"),
        "lastReviewed": governance.get("lastReviewed"),
        "cadence": governance.get("reviewCadence"),
        "reviewedBy": "faculty",
        "effectiveReviewed": None,
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

    # Surveillance credit: only for sources the credited job examines, only from the job's
    # own record, and never across a detected change the faculty have not actioned.
    if surv_block.get("job") == CREDITED_JOB:
        ev = (surveillance or {}).get(row["id"]) or {}
        examined = ev.get("examinedAt")
        pending = [c for c in ev.get("openChanges", [])
                   if _exact_date(c["detectedAt"]) is not None and _exact_date(c["detectedAt"]) > last]
        if surveillance is None:
            row["surveillance"] = "credit disabled"
        elif pending:
            newest = max(pending, key=lambda c: c["detectedAt"])
            row["surveillance"] = (f"change detected {newest['detectedAt']} ({newest['status']}, "
                                   f"{newest['severity']}) — faculty review pending; no credit")
        elif examined is None:
            row["surveillance"] = "no successful examination on record; no credit"
        elif examined <= last:
            row["surveillance"] = f"last examined {examined.isoformat()}, not after faculty review"
        elif examined > today:
            row["surveillance"] = f"examined {examined.isoformat()} is after as-of; no credit"
        else:
            last = examined
            row["reviewedBy"] = CREDITED_JOB
            row["surveillance"] = f"examined {examined.isoformat()}, no change — counts as the review"
    row["effectiveReviewed"] = last.isoformat()

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


def examine(sources: list, today: date, surveillance: dict | None = None) -> dict:
    """Classify every declared source. Raises rather than summarising over a short set."""
    declared = len(sources)
    rows = [classify(s, today, surveillance) for s in sources]
    if len(rows) != declared:
        raise CadenceError(f"examined {len(rows)} of {declared} declared sources")
    counts = {b: sum(1 for r in rows if r["bucket"] == b) for b in BUCKETS}
    order = {b: i for i, b in enumerate(BUCKETS)}
    rows.sort(key=lambda r: (order[r["bucket"]],
                             r["daysUntil"] if r["daysUntil"] is not None else 0,
                             str(r["id"])))
    credited = sum(1 for r in rows if r["reviewedBy"] == CREDITED_JOB)
    return {
        "schemaVersion": 1,
        "asOf": today.isoformat(),
        "declared": declared,
        "examined": len(rows),
        "surveillanceCredit": None if surveillance is None else {
            "baselines": sum(1 for k, v in surveillance.items() if k != "_meta" and v.get("examinedAt")),
            **{k: v for k, v in (surveillance.get("_meta") or {}).items() if k != "baselines"},
            "openChangeFindings": sum(len(v.get("openChanges", [])) for k, v in surveillance.items() if k != "_meta"),
            "sourcesCredited": credited,
        },
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
    sc = report.get("surveillanceCredit")
    if sc is None:
        out.append("  surveillance credit: disabled (faculty lastReviewed only)")
    else:
        out.append(f"  surveillance credit: {sc['baselines']} baseline(s) read, "
                   f"{sc['openChangeFindings']} unactioned change finding(s), "
                   f"{sc['sourcesCredited']} source(s) credited")
        if "findingsSeen" in sc:
            out.append(f"    change findings seen {sc['findingsSeen']}: resolved by status {sc['resolvedByStatus']}, "
                       f"by dismissal {sc['resolvedByDismissal']}, by closed issue {sc['resolvedByClosedIssue']}"
                       + (f"; issue snapshot captured {sc['issueSnapshotCapturedAt'][:10]}"
                          if sc.get("issueSnapshotCapturedAt") else "; no issue snapshot"))
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
            if r.get("surveillance"):
                out.append(f"  {'':40s} {'':8s} surveillance: {r['surveillance']}")
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

    # --- surveillance credit: derived, never written; withheld across an unactioned change.
    def surv_source(sid, last="2026-07-08"):
        src = _source(sid, last, "monthly")
        src["surveillance"] = {"job": CREDITED_JOB}
        return src

    ev = {
        "clean": {"examinedAt": date(2026, 9, 1), "openChanges": []},
        "changed": {"examinedAt": date(2026, 9, 1),
                    "openChanges": [{"detectedAt": "2026-08-31", "status": "issue-open", "severity": "P0"}]},
        "settled": {"examinedAt": date(2026, 9, 1),
                    "openChanges": [{"detectedAt": "2026-07-01", "status": "new", "severity": "P2"}]},
        "stale": {"examinedAt": date(2026, 7, 1), "openChanges": []},
        "future": {"examinedAt": date(2026, 9, 30), "openChanges": []},
    }
    r = classify(surv_source("clean"), today, ev)
    expect("credit: a green examination after the faculty date counts as the review",
           r["reviewedBy"] == CREDITED_JOB and r["effectiveReviewed"] == "2026-09-01"
           and r["bucket"] == "due-30d" and r["nextReview"] == "2026-10-01")
    r = classify(surv_source("changed"), today, ev)
    expect("credit: withheld across an unactioned change newer than the faculty review",
           r["reviewedBy"] == "faculty" and r["bucket"] == "overdue"
           and "change detected 2026-08-31" in r["surveillance"])
    r = classify(surv_source("settled"), today, ev)
    expect("credit: a change older than the faculty review does not block credit",
           r["reviewedBy"] == CREDITED_JOB and r["bucket"] == "due-30d")
    r = classify(surv_source("absent"), today, ev)
    expect("credit: no baseline on record -> no credit, reason says so",
           r["reviewedBy"] == "faculty" and r["bucket"] == "overdue"
           and "no successful examination" in r["surveillance"])
    r = classify(surv_source("stale"), today, ev)
    expect("credit: an examination BEFORE the faculty review is not a newer review",
           r["reviewedBy"] == "faculty" and "not after faculty review" in r["surveillance"])
    r = classify(surv_source("future"), today, ev)
    expect("credit: an examination after as-of is not credited",
           r["reviewedBy"] == "faculty" and "after as-of" in r["surveillance"])
    r = classify(surv_source("clean"), today, None)
    expect("credit: disabled (None) -> faculty only, and the row says so",
           r["reviewedBy"] == "faculty" and r["bucket"] == "overdue"
           and r["surveillance"] == "credit disabled")
    r = classify(_source("plain", "2026-07-08", "monthly"), today, ev)
    expect("credit: a source outside the credited job never gets credit",
           r["reviewedBy"] == "faculty" and "surveillance" not in r)
    other = _source("otherjob", "2026-07-08", "monthly")
    other["surveillance"] = {"job": "link-source-monitor"}
    expect("credit: a link check is not a review",
           classify(other, today, {"otherjob": ev["clean"]})["reviewedBy"] == "faculty")
    expect("credit: an unknown row stays unknown even with a baseline",
           classify({"id": "clean", "surveillance": {"job": CREDITED_JOB},
                     "governance": {"reviewCadence": "monthly"}}, today, ev)["bucket"] == "unknown")
    with tempfile.TemporaryDirectory() as tmp:
        # history/ and config/ are siblings, as under surveillance/. `hist = Path(tmp)` made
        # hist.parent the shared TMPDIR itself, so every run wrote config/dismissed.json there
        # and nothing ever removed it (verify.sh's private-TMPDIR leak check found it).
        hist = Path(tmp) / "history"
        hist.mkdir()
        (hist / "baselines").mkdir()
        (hist / "baselines" / "clean.json").write_text(
            json.dumps({"hash": "x", "chars": 10, "checked_at": "2026-09-01T06:08:48+00:00"}))
        (hist / "baselines" / "broken.json").write_text("{not json")
        (hist / "guideline_delta_2026-08-31.json").write_text(json.dumps([
            {"source_id": "changed", "fingerprint": "changed::modified::aaaa", "change_type": "modified",
             "status": "issue-open", "severity": "P0", "detected_at": "2026-08-31T15:53:39+00:00"},
            {"source_id": "done", "fingerprint": "done::modified::bbbb", "change_type": "modified",
             "status": "actioned", "severity": "P2", "detected_at": "2026-08-31T15:53:39+00:00"},
            {"source_id": "down", "fingerprint": "down::removed::cccc", "change_type": "removed",
             "status": "new", "severity": "P1", "detected_at": "2026-08-31T15:53:39+00:00"},
            {"source_id": "later", "fingerprint": "later::modified::dddd", "change_type": "modified",
             "status": "new", "severity": "P2", "detected_at": "2026-08-31T15:53:39+00:00"},
            {"source_id": "dis", "fingerprint": "dis::modified::eeee", "change_type": "modified",
             "status": "new", "severity": "P2", "detected_at": "2026-08-31T15:53:39+00:00"},
            {"source_id": "closed", "fingerprint": "closed::modified::ffff", "change_type": "modified",
             "status": "issue-open", "severity": "P1", "detected_at": "2026-08-31T15:53:39+00:00"},
        ]))
        # a LATER report carries the same fingerprint with a later status: newest wins
        (hist / "guideline_delta_2026-09-01.json").write_text(json.dumps([
            {"source_id": "later", "fingerprint": "later::modified::dddd", "change_type": "modified",
             "status": "actioned", "severity": "P2", "detected_at": "2026-08-31T15:53:39+00:00"},
        ]))
        (hist.parent / "config").mkdir(exist_ok=True)
        (hist.parent / "config" / "dismissed.json").write_text(json.dumps(
            {"dismissed": {"dis::modified::eeee": {"reason": "heading rename", "at": "2026-09-19"}}}))
        loaded = load_surveillance(hist)
        expect("load_surveillance: reads the baseline's checked_at as a date",
               loaded.get("clean", {}).get("examinedAt") == date(2026, 9, 1))
        expect("load_surveillance: keeps an unactioned modified finding, with its fingerprint",
               [(c["status"], c["fingerprint"]) for c in loaded.get("changed", {}).get("openChanges", [])]
               == [("issue-open", "changed::modified::aaaa")])
        expect("load_surveillance: drops an actioned finding and a non-modified one",
               "done" not in loaded and "down" not in loaded)
        expect("load_surveillance: the newest report row for a fingerprint wins (actioned later)",
               "later" not in loaded and loaded["_meta"]["resolvedByStatus"] == 2)
        expect("load_surveillance: a fingerprint in config/dismissed.json is resolved",
               "dis" not in loaded and loaded["_meta"]["resolvedByDismissal"] == 1)
        expect("load_surveillance: with no issue snapshot a closed-on-GitHub finding is still pending",
               "closed" in loaded and loaded["_meta"]["resolvedByClosedIssue"] == 0
               and loaded["_meta"]["issueSnapshotCapturedAt"] is None)
        expect("load_surveillance: skips an unparseable baseline without failing",
               "broken" not in loaded)
        expect("load_surveillance: an absent directory yields no sources (meta only)",
               [k for k in load_surveillance(hist / "nope") if k != "_meta"] == [])
        # issue snapshot, both shapes
        snap = hist / "issue_snapshot.json"
        snap.write_text(json.dumps({"schemaVersion": 1, "capturedAt": "2026-09-19T10:00:00+00:00", "issues": [
            {"number": 1, "state": "CLOSED", "fingerprint": "closed::modified::ffff"},
            {"number": 2, "state": "OPEN", "fingerprint": "changed::modified::aaaa"},
        ]}))
        loaded = load_surveillance(hist)
        expect("load_surveillance: history/issue_snapshot.json CLOSED resolves the finding",
               "closed" not in loaded and loaded["_meta"]["resolvedByClosedIssue"] == 1
               and loaded["_meta"]["issueSnapshotCapturedAt"] == "2026-09-19T10:00:00+00:00")
        expect("load_surveillance: an OPEN issue keeps the finding pending", "changed" in loaded)
        raw = hist / "gh.json"
        raw.write_text(json.dumps([
            {"number": 1, "state": "CLOSED", "body": "...\n<!-- surveillance:fp=closed::modified::ffff -->"},
            {"number": 3, "state": "CLOSED", "body": "no marker here"},
            {"number": 4, "state": "CLOSED", "body": "<!-- surveillance:fp=changed::modified::aaaa -->", "pull_request": {}},
        ]))
        loaded = load_surveillance(hist, issues_path=raw)
        expect("load_surveillance: raw gh issue JSON is honoured via the fp marker; PRs and unmarked bodies ignored",
               "closed" not in loaded and "changed" in loaded)
        expect("closed_fingerprints: accepts a bare normalized list",
               closed_fingerprints([{"fingerprint": "x", "state": "closed"}]) == {"x"})

        # end to end through main(): credit turns the overdue row green; the flag turns it off.
        import io
        from contextlib import redirect_stdout
        reg = hist / "reg.json"
        reg.write_text(json.dumps(_fixture([surv_source("clean")])))
        out = io.StringIO()
        with redirect_stdout(out):
            code = main(["--registry", str(reg), "--history", str(hist), "--as-of", "2026-09-18", "--json"])
        blob = json.loads(out.getvalue())
        expect("main: surveillance credit lifts a credited source out of overdue (exit 0)",
               code == 0 and blob["counts"]["due-30d"] == 1
               and blob["surveillanceCredit"]["sourcesCredited"] == 1)
        with redirect_stdout(io.StringIO()):
            code = main(["--registry", str(reg), "--history", str(hist), "--as-of", "2026-09-18",
                         "--no-surveillance-credit"])
        expect("main: --no-surveillance-credit restores the faculty-only verdict (exit 1)", code == 1)
        with redirect_stdout(io.StringIO()):
            code = main(["--registry", str(reg), "--history", str(hist / "nope"), "--as-of", "2026-09-18"])
        expect("main: a missing history dir gives no credit and fails loudly (exit 1)", code == 1)

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
    ap.add_argument("--history", metavar="PATH", default=str(DEFAULT_HISTORY),
                    help="surveillance history dir holding baselines/ and guideline_delta_*.json")
    ap.add_argument("--issues-json", metavar="PATH", default=None,
                    help="issue snapshot (history/issue_snapshot.json shape, or raw gh issue list JSON)")
    ap.add_argument("--no-surveillance-credit", action="store_true",
                    help="ignore surveillance examinations; faculty lastReviewed only")
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
        surveillance = None if args.no_surveillance_credit else load_surveillance(
            Path(args.history), Path(args.issues_json) if args.issues_json else None)
        report = examine(sources, today, surveillance)
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
