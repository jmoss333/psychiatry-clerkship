#!/usr/bin/env python3
"""prune_remote_branches.py — name the remote branches that are finished, and delete them on request.

bin/prune_worktrees.py keeps the Mac's worktrees lean and deliberately never touches a branch.
Nothing did the same for the remote: 206 branches on origin on 2026-10-17 after a prune of stale
tracking refs. Measured that day, 98 of them were the heads of pull requests GitHub records as
MERGED whose tips are NOT ancestors of main (the PR was merged in a way that did not keep the
branch commits, or the branch moved afterwards), 13 were closed without merging, 61 never had a
pull request at all. So "tip reachable from main" is the wrong test; GitHub's own PR state is the
authority, and reachability is only a second way to say merged. Architecture review 2026-10-17, R7.

Classification, per branch (the whole decision, so the test can pin it):
  protected   main · release · attest/pending · attestations          never listed
  open-pr     an open pull request has this head                      keep
  backup      backup/*                                                keep; listed for a human
  fresh       merged (PR MERGED, or tip in main) but younger than --days (30)   keep for now
  prunable    merged, older than --days, no open PR                   delete with --apply
  closed-pr   its only pull requests were closed unmerged             keep; listed — may hold work
  no-pr       never had a pull request                                keep; listed — stranded work,
                                                                      bin/coordination_report.py's territory
  unknown-pr  gh could not be asked                                   keep; nothing is prunable

Dry run by default and report-only: exit 0. `--apply` deletes the prunable set with
`git push origin --delete`, one branch per call, and refuses to run when the PR state is unknown
(an unknown PR state is never "no PR"). Run from the owner's Mac, never from a sandbox: the
sandbox cannot see origin's pull requests and must not delete anything.

    python3 bin/prune_remote_branches.py            # the table
    python3 bin/prune_remote_branches.py --days 14
    python3 bin/prune_remote_branches.py --apply    # delete the prunable set (host-side, owner's call)
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTECTED = {"main", "release", "attest/pending", "attestations", "HEAD"}
DAY = 86400


def classify(branch: str, in_main: bool, age_days: float, pr_state: str | None, days: int) -> str:
    """Pure: the one decision.

    pr_state: "open" | "merged" | "closed" | "none" | None (could not ask).
    """
    if branch in PROTECTED:
        return "protected"
    if pr_state == "open":
        return "open-pr"
    if branch.startswith("backup/"):
        return "backup"
    if pr_state is None:
        return "unknown-pr"
    merged = pr_state == "merged" or in_main
    if merged:
        return "fresh" if age_days < days else "prunable"
    if pr_state == "closed":
        return "closed-pr"
    return "no-pr"


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout


def pr_states() -> dict[str, str] | None:
    """head branch -> 'open' | 'merged' | 'closed' (open wins, then merged). None if gh cannot answer."""
    if not shutil.which("gh"):
        return None
    try:
        out = subprocess.run(["gh", "pr", "list", "--state", "all", "--limit", "2000",
                              "--json", "headRefName,state"], capture_output=True, text=True,
                             check=True, cwd=ROOT).stdout
        rows = json.loads(out)
    except (subprocess.CalledProcessError, ValueError, OSError):
        return None
    rank = {"OPEN": 3, "MERGED": 2, "CLOSED": 1}
    best: dict[str, str] = {}
    for p in rows:
        s = p.get("state", "")
        h = p.get("headRefName", "")
        if h and rank.get(s, 0) > rank.get(best.get(h, ""), 0):
            best[h] = s
    return {h: s.lower() for h, s in best.items()}


def survey(days: int) -> list[dict]:
    git("fetch", "--prune", "-q", "origin")
    states = pr_states()
    now = time.time()
    rows = []
    for line in git("for-each-ref", "--format=%(refname:short) %(committerdate:unix)",
                    "refs/remotes/origin/").splitlines():
        ref, _, ts = line.partition(" ")
        branch = ref[len("origin/"):]
        if branch in PROTECTED:
            continue
        in_main = subprocess.run(["git", "-C", str(ROOT), "merge-base", "--is-ancestor", ref,
                                  "origin/main"], capture_output=True).returncode == 0
        age = (now - int(ts)) / DAY if ts.isdigit() else 0.0
        pr = None if states is None else states.get(branch, "none")
        rows.append({"branch": branch, "in_main": in_main, "age_days": round(age, 1),
                     "pr_state": pr, "state": classify(branch, in_main, age, pr, days)})
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="finished remote branches: list them, delete on --apply")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    rows = survey(a.days)
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["state"]] = counts.get(r["state"], 0) + 1
    if a.json:
        print(json.dumps({"days": a.days, "counts": counts, "branches": rows}, indent=2))
    else:
        print(f"remote branches: {len(rows)} (excluding protected) — "
              + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
        for state, note in (("prunable", "merged pull requests older than the window"),
                            ("closed-pr", "closed without merging — a human decides"),
                            ("no-pr", "never had a pull request — stranded work or scratch; a human decides"),
                            ("backup", "kept by name"),
                            ("unknown-pr", "gh could not be asked")):
            sel = [r for r in rows if r["state"] == state]
            if sel:
                print(f"\n  {state} ({len(sel)}) — {note}:")
                for r in sorted(sel, key=lambda r: -r["age_days"])[:40]:
                    print(f"    {r['age_days']:6.0f} d  {r['branch']}")
                if len(sel) > 40:
                    print(f"    … and {len(sel) - 40} more (--json for all)")
    prunable = [r["branch"] for r in rows if r["state"] == "prunable"]
    if not a.apply:
        if prunable:
            print(f"\n  dry run — {len(prunable)} branch(es) would be deleted by --apply")
        return 0
    if any(r["state"] == "unknown-pr" for r in rows):
        print("refusing --apply: pull-request state unknown")
        return 2
    for b in prunable:
        subprocess.run(["git", "-C", str(ROOT), "push", "origin", "--delete", b], check=False)
        print(f"  deleted origin/{b}")
    print(f"deleted {len(prunable)} branch(es)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
