#!/usr/bin/env python3
"""gate_report.py — what the pre-push gate actually costs, and which gates never fire.

bin/verify.sh appends one JSON line per step (and one per run) to a machine-local ledger:
    ${CLERKSHIP_VERIFY_LEDGER:-${XDG_STATE_HOME:-~/.local/state}/clerkship/verify-ledger.jsonl}
This report reads it and answers three questions nobody could answer before 2026-10-17
(architecture review, finding F2 / recommendation R2):

  1. How long does the gate take, and which steps are the cost?   (slowest by median)
  2. Which steps fail, how often, and when did each last fail?      (the gates doing work)
  3. Which steps have NEVER failed in the window?                   (perfect, or vacuous —
     docs/SILENT_SHRINK_CHECKLIST.md §D: a check that cannot go red is not known to check)

Report-only: exit 0 always, never a gate. A missing or empty ledger is reported as UNKNOWN,
never as zero steps — "unknown is not zero" (bin/what_can_i_do_today.py). `--json` for tooling.

    python3 bin/gate_report.py                 # last 90 days, top 10
    python3 bin/gate_report.py --days 30 --top 15
    python3 bin/gate_report.py --ledger PATH --json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median


def default_ledger() -> Path:
    env = os.environ.get("CLERKSHIP_VERIFY_LEDGER")
    if env:
        return Path(env)
    state = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
    return Path(state) / "clerkship" / "verify-ledger.jsonl"


def parse_ts(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def load(ledger: Path, since: datetime) -> tuple[list[dict], list[dict], int]:
    """(step records, run records, malformed-line count) within the window."""
    steps, runs, bad = [], [], 0
    with ledger.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                bad += 1
                continue
            ts = parse_ts(rec.get("ts", ""))
            if ts is None or ts < since:
                continue
            rec["_ts"] = ts
            if rec.get("type") == "step" and isinstance(rec.get("step"), str):
                steps.append(rec)
            elif rec.get("type") == "run":
                runs.append(rec)
    return steps, runs, bad


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    k = max(0, min(len(xs) - 1, int(round(p * (len(xs) - 1)))))
    return xs[k]


def summarise(steps: list[dict], runs: list[dict], days: int, top: int) -> dict:
    by_step: dict[str, dict] = defaultdict(lambda: {"runs": 0, "fails": 0, "leaks": 0,
                                                     "seconds": [], "last_fail": None})
    for s in steps:
        d = by_step[s["step"]]
        d["runs"] += 1
        try:
            d["seconds"].append(float(s.get("seconds", 0)))
        except (TypeError, ValueError):
            pass
        failed = s.get("exit", 0) != 0 or bool(s.get("leak"))
        if s.get("leak"):
            d["leaks"] += 1
        if failed:
            d["fails"] += 1
            if d["last_fail"] is None or s["_ts"] > d["last_fail"]:
                d["last_fail"] = s["_ts"]

    rows = []
    for name, d in by_step.items():
        rows.append({
            "step": name,
            "runs": d["runs"],
            "fails": d["fails"],
            "leaks": d["leaks"],
            "last_fail": d["last_fail"].strftime("%Y-%m-%d") if d["last_fail"] else None,
            "median_s": round(median(d["seconds"]), 2) if d["seconds"] else None,
            "p90_s": round(percentile(d["seconds"], 0.9), 2) if d["seconds"] else None,
            "total_s": round(sum(d["seconds"]), 1),
        })
    slowest = sorted((r for r in rows if r["median_s"] is not None),
                     key=lambda r: (-r["median_s"], r["step"]))[:top]
    failing = sorted((r for r in rows if r["fails"]), key=lambda r: (-r["fails"], r["step"]))
    never = sorted(r["step"] for r in rows if r["fails"] == 0)
    run_secs = [float(r.get("seconds", 0)) for r in runs if r.get("seconds") is not None]
    full_runs = [r for r in runs if not r.get("quick")]
    full_secs = [float(r.get("seconds", 0)) for r in full_runs if r.get("seconds") is not None]
    return {
        "window_days": days,
        "runs": len(runs),
        "full_runs": len(full_runs),
        "run_median_s": round(median(run_secs), 1) if run_secs else None,
        "full_run_median_s": round(median(full_secs), 1) if full_secs else None,
        "steps_distinct": len(rows),
        "step_records": len(steps),
        "slowest": slowest,
        "failing": failing,
        "never_failed": never,
    }


def render(rep: dict, ledger: Path) -> str:
    L = [f"gate report — {ledger} — last {rep['window_days']} days"]
    med = rep["full_run_median_s"]
    L.append(f"  runs: {rep['runs']} ({rep['full_runs']} full) · median full run: "
             f"{'%.0f s' % med if med is not None else 'unknown'} · "
             f"{rep['steps_distinct']} distinct steps, {rep['step_records']} step records")
    L.append("")
    L.append(f"  slowest {len(rep['slowest'])} steps (median seconds; p90; share of records):")
    for r in rep["slowest"]:
        L.append(f"    {r['median_s']:8.2f}s  p90 {r['p90_s']:8.2f}s  ×{r['runs']:<4} {r['step']}")
    L.append("")
    if rep["failing"]:
        L.append(f"  steps that failed in the window ({len(rep['failing'])}):")
        for r in rep["failing"]:
            L.append(f"    {r['fails']:3d}/{r['runs']:<4} last {r['last_fail']}  {r['step']}"
                     + (f"  (leaks {r['leaks']})" if r["leaks"] else ""))
    else:
        L.append("  steps that failed in the window: none")
    L.append("")
    n = len(rep["never_failed"])
    L.append(f"  steps that NEVER failed in the window: {n} of {rep['steps_distinct']} — "
             f"perfect, or vacuous (SILENT_SHRINK_CHECKLIST §D). Each should have a --self-test "
             f"or a falsification on record; bin/check_vacuity.py knows which do.")
    for name in rep["never_failed"]:
        L.append(f"    {name}")
    return "\n".join(L)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="what the pre-push gate costs, and which gates never fire")
    ap.add_argument("--ledger", type=Path, default=None)
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--now", default=None, help=argparse.SUPPRESS)   # tests pin the window edge
    a = ap.parse_args(argv)
    ledger = a.ledger or default_ledger()
    now = parse_ts(a.now) if a.now else datetime.now(timezone.utc)
    if now is None:
        print(f"--now must be YYYY-MM-DDTHH:MM:SSZ, got {a.now!r}")
        return 0
    since = now - timedelta(days=a.days)
    if not ledger.is_file():
        msg = {"status": "unknown", "reason": f"no ledger at {ledger}; run bash bin/verify.sh once"}
        print(json.dumps(msg) if a.json else f"gate report: UNKNOWN — {msg['reason']}")
        return 0
    steps, runs, bad = load(ledger, since)
    if not steps:
        msg = {"status": "unknown", "reason": f"no step records in the last {a.days} days at {ledger}"
               + (f" ({bad} malformed lines skipped)" if bad else "")}
        print(json.dumps(msg) if a.json else f"gate report: UNKNOWN — {msg['reason']}")
        return 0
    rep = summarise(steps, runs, a.days, a.top)
    rep["status"] = "ok"
    rep["malformed_lines"] = bad
    if a.json:
        print(json.dumps(rep, indent=2))
    else:
        print(render(rep, ledger))
        if bad:
            print(f"  ({bad} malformed line(s) skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
