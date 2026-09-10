#!/usr/bin/env python3
"""Fail the monthly review when a decayable claim in this repo has gone unverified.

WHY: every guard in bin/ pins something a machine can recompute -- a ruleset, a token
palette, a decision registry. The failures that actually cost days here were a different
shape: a claim that was TRUE when written, silently became false, and no gate ever
re-checked it. Four of them in one week:

  - `clerkship-deploy` trap 3 said the Cowork Netlify MCP 404s these sites (2026-07-03).
    Re-verified 2026-09-10: it returns both sites. The line had routed every session away
    from a working API for two months.
  - `npm audit` in sp-proxy read 0 vulnerabilities while 4 HIGH sat in the dev tree,
    because this machine has `npm config omit=dev`.
  - `codex/agent-collision-sentinel` looked unmerged for nine days after its content
    landed on main under a different SHA, so a session nearly re-derived it.
  - 27 worktrees looked prunable in one shell and were all live in another.

The common shape is a NEGATIVE or DERIVED assertion that no test re-runs. A positive
claim fails loudly the first time someone leans on it; a negative claim is self-sealing,
because it tells the reader not to test the thing.

So this is check_ruleset_drift.py aimed at prose and metadata instead of API state. It
does not decide whether a claim is true -- it cannot. It asserts only that somebody
looked recently, and turns "someone should re-check that sometime" into a receipt the
monthly gate refuses to sign.

Every check degrades to `unknown` rather than to a false pass when its evidence is not
available, and `unknown` is a finding. A check that cannot see is never a check that
agrees.

Modes:
  (default)        run all four checks against the working tree; exit 1 on findings
  --json           same, as machine-readable JSON
  --write-receipt  on a clean run only, stamp receipts/stale-claims.json
  --self-test      prove each check can fail and stays silent on the good case
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECEIPT = (
    ROOT
    / "13_Faculty_Resources"
    / "_automation"
    / "maintenance"
    / "receipts"
    / "stale-claims.json"
)

# A claim is re-verified for this long before it goes stale. One quarter: long enough
# that stamping is not busywork, short enough that a two-month-old lie like trap 3
# would have been caught.
MAX_CLAIM_AGE_DAYS = 90

# A branch idle this long whose content already sits on main is probably landed.
MAX_BRANCH_IDLE_DAYS = 14

# ...but "already sits on main" has to mean nearly ALL of it. A first cut flagged any
# branch with one file matching main, which caught codex/rotation-url-cap-fix -- 86
# files, 30 matching, 56 genuinely unlanded. The orphan shape is different: the whole
# branch shipped bar a file or two changed during the cherry-pick (the real sentinel
# was 4 files, 3 identical). So the test is on the count of files still DIFFERING,
# not on a ratio, which would have to be tuned per branch size.
MAX_UNLANDED_FILES = 2

# A worktree whose branch is fully contained in main and untouched this long is litter.
MAX_WORKTREE_IDLE_DAYS = 30

SKILL_GLOB = ".claude/skills/*/SKILL.md"

# Lines carrying this marker are exempt. Timeless instructions ("never invent a
# cross-reference") are not decayable claims about the outside world. The marker is an
# HTML comment so it renders as nothing and greps as something: the count of
# suppressions is reported on every run, so the escape hatch stays visible.
SUPPRESS = "<!-- stale-claims: ignore -->"

# A claim is decayable when a NEGATION co-occurs with an EXTERNAL SYSTEM in the same
# block. Either signal alone is too broad: "do not stub it" is a house rule, and
# "`netlify.toml` sets ignore" is a fact about our own tree.
NEGATIONS = re.compile(
    r"""
    do \s+ not \s+ use
  | don't \s+ use
  | does \s* n[o']t \s+ work
  | w(?:ill \s+ not|on't) \s+ work
  | is \s+ not \s+ available
  | not \s+ installed
  | not \s+ in \s+ the \s+ allowlist
  | (?:is \s+ )?unavailable
  | 404s
  | authenticated \s+ to \s+ a \s+ different
  | cannot \s+ be \s+ (?:used|reached|prevented)
  | can't \s+ be \s+ (?:used|reached)
  | no \s+ longer \s+ (?:works|available|true|exists)
  | never \s+ will
    """,
    re.IGNORECASE | re.VERBOSE,
)

EXTERNAL = re.compile(
    r"""
    `[^`]*[/@.\-][^`]*`                      # a backticked path, scope, host or id
  | \b\w[\w-]*\.(?:com|net|org|app|io|dev)\b # a hostname
  | \b(?:netlify|github|npm|mcp|cli|api|chrome|extension|dashboard
       |cowork|desktop \s+ commander|git-lfs|pacer|actions?\s+runner)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

STAMP = re.compile(
    r"\b(?:re-?)?(?:verified|re-verified|checked|confirmed|found)\s+"
    r"(\d{4})-(\d{2})-(\d{2})\b",
    re.IGNORECASE,
)


class StaleClaimsError(RuntimeError):
    """The check could not be run at all."""


# ------------------------------------------------------------------ pure logic
# Everything below takes plain data so --self-test can drive it with no git, no
# network, and no filesystem. The collectors further down are the only code that
# touches the outside world.


LIST_ITEM = re.compile(r"^ {0,3}(?:[-*+]|\d{1,3}[.)])\s+\S")


def blocks(text: str) -> list[tuple[int, list[str]]]:
    """Split markdown into stamp-scoped blocks, keeping 1-based start lines.

    A "block" is the unit one stamp vouches for: a single trap in a numbered list, a
    single bullet, or a paragraph. A stamp on the third line of a five-line trap
    covers that trap, which is how people actually write them.

    Blocks break on a blank line AND at each top-level list marker. The list-marker
    rule is not cosmetic: markdown lists are usually written with no blank lines
    between items, so a naive blank-line split made all five `clerkship-deploy` traps
    one block -- and the single `re-verified 2026-09-10` stamp on trap 3 silently
    vouched for the four traps nobody had checked. That is the exact failure this
    tool exists to catch, reproduced inside the tool.

    Indented continuation lines stay with their item.
    """
    out: list[tuple[int, list[str]]] = []
    current: list[str] = []
    start = 0

    def flush() -> None:
        nonlocal current
        if current:
            out.append((start, current))
            current = []

    for i, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            flush()
            continue
        if LIST_ITEM.match(line):
            flush()
        if not current:
            start = i
        current.append(line)
    flush()
    return out


def newest_stamp(block: list[str]) -> date | None:
    """The most recent verification date anywhere in the block, or None."""
    found: list[date] = []
    for line in block:
        for y, m, d in STAMP.findall(line):
            try:
                found.append(date(int(y), int(m), int(d)))
            except ValueError:
                continue  # 2026-13-45 is not a stamp, it is a typo
    return max(found) if found else None


def claim_findings(
    path: str, text: str, today: date, max_age_days: int = MAX_CLAIM_AGE_DAYS
) -> tuple[list[dict], int]:
    """Findings for one skill file, plus how many blocks were suppressed."""
    findings: list[dict] = []
    suppressed = 0
    for start, block in blocks(text):
        joined = "\n".join(block)
        if SUPPRESS in joined:
            suppressed += 1
            continue
        if not (NEGATIONS.search(joined) and EXTERNAL.search(joined)):
            continue
        stamp = newest_stamp(block)
        if stamp is None:
            findings.append(
                {
                    "check": "claim",
                    "state": "unstamped",
                    "path": path,
                    "line": start,
                }
            )
        elif (today - stamp).days > max_age_days:
            findings.append(
                {
                    "check": "claim",
                    "state": "stale",
                    "path": path,
                    "line": start,
                    "stampedOn": stamp.isoformat(),
                    "ageDays": (today - stamp).days,
                }
            )
    return findings, suppressed


def audit_findings(reports: list[dict]) -> list[dict]:
    """Findings from one `npm audit --include=dev --json` result per manifest.

    Each report is {"dir": str, "ok": bool, "counts": {sev: n} | None}. ok=False means
    npm could not answer -- no network, no npm, a broken lock -- and that is `unknown`,
    never a pass.
    """
    findings: list[dict] = []
    for report in reports:
        if not report.get("ok"):
            findings.append(
                {"check": "audit", "state": "unknown", "dir": report.get("dir", "?")}
            )
            continue
        counts = report.get("counts") or {}
        bad = {k: v for k, v in counts.items() if k != "info" and v}
        if bad:
            findings.append(
                {
                    "check": "audit",
                    "state": "vulnerable",
                    "dir": report["dir"],
                    "counts": dict(sorted(bad.items())),
                }
            )
    return findings


def branch_findings(
    rows: list[dict], today: date, max_idle_days: int = MAX_BRANCH_IDLE_DAYS
) -> list[dict]:
    """Branches that look landed-but-undeleted, or fully merged.

    Rows carry the branch's OWN changed files (three-dot, against the merge-base) and,
    for each, whether main's blob is byte-identical. Comparing content rather than
    commits is what catches the cherry-pick orphan: `git branch --merged` and
    `git cherry` both still call such a branch unmerged, because amending the patch
    during the cherry-pick changed its patch-id.

    Two states, because they need different actions:

      fully-landed     every file the branch changed is byte-identical on main. The
                       content shipped. Safe to delete on sight.
      possibly-landed  no file is new to main, at most MAX_UNLANDED_FILES still
                       differ, the branch is idle, and it has no open PR. A human
                       confirms and deletes; the checker never deletes anything.

    A branch merely BEHIND main is not flagged: its own changed files exist on main but
    hold main's version, not the branch's, so `identical` stays 0. That distinction is
    the whole reason this uses a three-dot diff and blob equality instead of asking
    whether the paths exist.

    A row whose PR state is unknown yields `unknown` rather than a guess, because
    "no open PR" is exactly what makes an idle branch look abandoned.
    """
    findings: list[dict] = []
    for row in rows:
        name = row["name"]
        files = row.get("files") or []
        if row.get("ahead", 0) == 0 or not files:
            continue
        if row.get("novel", 0) > 0:
            continue
        identical = row.get("identical", 0)
        if identical == len(files):
            findings.append(
                {"check": "branch", "state": "fully-landed", "branch": name,
                 "files": len(files)}
            )
            continue
        unlanded = len(files) - identical
        if identical < 1 or unlanded > MAX_UNLANDED_FILES:
            continue
        idle = (today - row["lastCommit"]).days
        if idle <= max_idle_days:
            continue
        detail = {
            "check": "branch",
            "branch": name,
            "idleDays": idle,
            "identical": identical,
            "files": len(files),
        }
        if row.get("hasOpenPr") is None:
            findings.append({**detail, "state": "unknown"})
        elif not row["hasOpenPr"]:
            findings.append({**detail, "state": "possibly-landed"})
    return findings


def worktree_findings(
    rows: list[dict], today: date, max_idle_days: int = MAX_WORKTREE_IDLE_DAYS
) -> list[dict]:
    """Worktrees whose branch is contained in main and whose directory is cold."""
    findings: list[dict] = []
    for row in rows:
        if row.get("main") or row.get("locked"):
            continue
        if not row.get("merged"):
            continue
        idle = (today - row["mtime"]).days
        if idle > max_idle_days:
            findings.append(
                {
                    "check": "worktree",
                    "state": "merged-idle",
                    "branch": row.get("branch") or "(detached)",
                    "idleDays": idle,
                }
            )
    return findings


# ------------------------------------------------------------------ collectors


def _run(args: list[str], cwd: Path) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            args, cwd=str(cwd), capture_output=True, text=True, timeout=180
        )
    except (OSError, subprocess.SubprocessError):
        return 127, ""
    return proc.returncode, proc.stdout


def _blob_map(ls_tree_output: str) -> dict[str, str]:
    """`git ls-tree -r` lines -> {path: blob sha}.

    Format is `<mode> <type> <sha>\\t<path>`. Blob equality is how this tool decides
    that a branch's content already shipped, so a malformed line is skipped rather
    than guessed at.
    """
    out: dict[str, str] = {}
    for line in ls_tree_output.splitlines():
        meta, tab, path = line.partition("\t")
        if not tab:
            continue
        parts = meta.split()
        if len(parts) != 3 or parts[1] != "blob":
            continue
        out[path] = parts[2]
    return out


def collect_claims(root: Path, today: date) -> tuple[list[dict], int, int]:
    findings: list[dict] = []
    suppressed = 0
    paths = sorted(root.glob(SKILL_GLOB))
    for path in paths:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            findings.append(
                {
                    "check": "claim",
                    "state": "unknown",
                    "path": str(path.relative_to(root)),
                }
            )
            continue
        got, sup = claim_findings(str(path.relative_to(root)), text, today)
        findings.extend(got)
        suppressed += sup
    return findings, len(paths), suppressed


def collect_audit(root: Path) -> list[dict]:
    """One `npm audit --include=dev` per lockfile, dev tree INCLUDED.

    --include=dev is the whole point. This repo's Mac sets `npm config omit=dev`, so a
    bare `npm audit` reported 0 while 4 HIGH sat in sp-proxy's dev tree -- the tree
    bin/verify.sh and ci.yml actually install.
    """
    reports: list[dict] = []
    for lock in sorted(root.rglob("package-lock.json")):
        if "node_modules" in lock.parts:
            continue
        rel = str(lock.parent.relative_to(root)) or "."
        rc, out = _run(
            ["npm", "audit", "--include=dev", "--json"], cwd=lock.parent
        )
        if rc == 127 or not out.strip():
            reports.append({"dir": rel, "ok": False, "counts": None})
            continue
        try:
            counts = json.loads(out)["metadata"]["vulnerabilities"]
        except (ValueError, KeyError, TypeError):
            reports.append({"dir": rel, "ok": False, "counts": None})
            continue
        reports.append({"dir": rel, "ok": True, "counts": counts})
    return reports


def _open_pr_heads(root: Path) -> set[str] | None:
    rc, out = _run(
        ["gh", "pr", "list", "--state", "open", "--limit", "200",
         "--json", "headRefName"],
        cwd=root,
    )
    if rc != 0 or not out.strip():
        return None
    try:
        return {row["headRefName"] for row in json.loads(out)}
    except (ValueError, KeyError, TypeError):
        return None


def collect_branches(root: Path) -> list[dict]:
    open_heads = _open_pr_heads(root)
    # One ls-tree, not one cat-file per file per branch. The naive version spawned
    # thousands of subprocesses across 30 branches and did not finish inside the
    # monthly job's budget.
    rc_tree, tree_out = _run(
        ["git", "ls-tree", "-r", "origin/main"], cwd=root
    )
    if rc_tree != 0:
        raise StaleClaimsError("git ls-tree origin/main failed")
    main_blobs = _blob_map(tree_out)
    rc, out = _run(
        ["git", "for-each-ref", "--format=%(refname:short)%09%(committerdate:short)",
         "refs/heads"],
        cwd=root,
    )
    if rc != 0:
        raise StaleClaimsError("git for-each-ref failed")
    rows: list[dict] = []
    for line in out.splitlines():
        if "\t" not in line:
            continue
        name, datestr = line.split("\t", 1)
        if name in {"main", "master"}:
            continue
        try:
            last = date.fromisoformat(datestr.strip())
        except ValueError:
            continue
        _, ahead_out = _run(
            ["git", "rev-list", "--count", f"origin/main..{name}"], cwd=root
        )
        try:
            ahead = int(ahead_out.strip() or "0")
        except ValueError:
            ahead = 0
        # Three dots: only what THIS branch changed since the merge-base. A two-dot
        # diff also reports everything main gained meanwhile, which made every branch
        # that was merely behind main look landed.
        _, files_out = _run(
            ["git", "diff", "--name-only", f"origin/main...{name}"], cwd=root
        )
        files = [f for f in files_out.splitlines() if f.strip()]
        identical = novel = 0
        if files and ahead:
            _, branch_tree = _run(["git", "ls-tree", "-r", name], cwd=root)
            branch_blobs = _blob_map(branch_tree)
            for f in files:
                if f not in main_blobs:
                    novel += 1
                elif branch_blobs.get(f) == main_blobs[f]:
                    identical += 1
        rows.append(
            {
                "name": name,
                "ahead": ahead,
                "files": files,
                "identical": identical,
                "novel": novel,
                "lastCommit": last,
                "hasOpenPr": None if open_heads is None else name in open_heads,
            }
        )
    return rows


def collect_worktrees(root: Path) -> list[dict]:
    rc, out = _run(["git", "worktree", "list", "--porcelain"], cwd=root)
    if rc != 0:
        raise StaleClaimsError("git worktree list failed")
    rows: list[dict] = []
    current: dict = {}
    for line in out.splitlines() + [""]:
        if not line.strip():
            if current.get("path"):
                rows.append(current)
            current = {}
            continue
        key, _, value = line.partition(" ")
        if key == "worktree":
            current = {"path": value, "locked": False, "branch": None}
        elif key == "branch":
            current["branch"] = value.replace("refs/heads/", "")
        elif key == "locked":
            current["locked"] = True
    resolved_root = root.resolve()
    for row in rows:
        path = Path(row["path"])
        row["main"] = path.resolve() == resolved_root
        try:
            row["mtime"] = date.fromtimestamp(path.stat().st_mtime)
        except OSError:
            row["mtime"] = date.today()
        merged = False
        if row.get("branch"):
            # Three dots again: "this branch has nothing of its own left" -- being
            # behind main is not a reason to call a worktree litter.
            _, diff = _run(
                ["git", "diff", "--name-only", f"origin/main...{row['branch']}"],
                cwd=root,
            )
            merged = not diff.strip()
        row["merged"] = merged
    return rows


# ------------------------------------------------------------------ receipt


def write_receipt(summary: dict) -> None:
    """Attest that the sweep ran clean. Content-free: counts, never the claims."""
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "state": "success",
                "checkedAt": datetime.now(timezone.utc)
                .replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z"),
                "skillFilesScanned": summary["skillFilesScanned"],
                "suppressedBlocks": summary["suppressedBlocks"],
                "manifestsAudited": summary["manifestsAudited"],
                "branchesScanned": summary["branchesScanned"],
                "worktreesScanned": summary["worktreesScanned"],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


# ------------------------------------------------------------------ self-test


def self_test() -> int:
    checks: list[tuple[str, bool]] = []

    def expect(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))

    today = date(2026, 9, 10)

    # --- blocks() is the unit a stamp covers.
    expect("blocks splits on blank lines and keeps 1-based starts",
           blocks("a\nb\n\nc\n") == [(1, ["a", "b"]), (4, ["c"])])
    expect("blocks ignores trailing blanks", blocks("a\n\n\n") == [(1, ["a"])])
    # The bug this splitter exists to avoid: five numbered traps with no blank lines
    # between them must be five blocks, or one stamp vouches for all five.
    expect("blocks splits a tight numbered list into one block per item",
           [s for s, _ in blocks("1. one\n   cont\n2. two\n3. three\n")]
           == [1, 3, 4])
    expect("blocks keeps indented continuation with its item",
           blocks("1. one\n   cont\n2. two\n")[0][1] == ["1. one", "   cont"])
    expect("blocks splits bullets too",
           len(blocks("- a\n- b\n* c\n+ d\n")) == 4)
    expect("blocks does not split on a bare hyphen or an em-dash line",
           len(blocks("text\n-\n--- more\n")) == 1)

    # --- Check 1: a negation ALONE is not a decayable claim.
    house_rule = "Do not use a fabricated review date."
    expect("claim ignores a house rule with no external system",
           claim_findings("s.md", house_rule, today)[0] == [])
    # --- an external system ALONE is not either.
    fact = "The `netlify.toml` in this repo sets ignore to /bin/false."
    expect("claim ignores a positive fact about an external system",
           claim_findings("s.md", fact, today)[0] == [])
    # --- both together, unstamped, is the trap-3 shape.
    trap = "Do NOT use the Cowork Netlify MCP for these sites -- it 404s them."
    got, _ = claim_findings("s.md", trap, today)
    expect("claim flags negation + external system as unstamped",
           len(got) == 1 and got[0]["state"] == "unstamped" and got[0]["line"] == 1)
    # --- a fresh stamp clears it.
    fresh = trap + " (re-verified 2026-08-01)"
    expect("claim clears on a fresh stamp",
           claim_findings("s.md", fresh, today)[0] == [])
    # --- the ACTUAL 2026-07-03 stamp trap 3 carried was already 69 days old: fresh
    #     under a 90-day window, which is why the window is a floor and not the whole
    #     defence. At 91 days it must fire.
    old = trap + " (found 2026-06-01)"
    got, _ = claim_findings("s.md", old, today)
    expect("claim goes stale past the window",
           len(got) == 1 and got[0]["state"] == "stale" and got[0]["ageDays"] == 101)
    expect("claim reports the stamp it aged",
           got[0]["stampedOn"] == "2026-06-01")
    # --- a stamp anywhere in the block vouches for the block.
    multi = "Do NOT use the Netlify MCP\nfor these sites.\nRe-verified 2026-08-20."
    expect("claim accepts a stamp elsewhere in the same block",
           claim_findings("s.md", multi, today)[0] == [])
    # --- but not one in the NEXT block.
    split = "Do NOT use the Netlify MCP.\n\nRe-verified 2026-08-20."
    expect("claim does not borrow a stamp across a blank line",
           len(claim_findings("s.md", split, today)[0]) == 1)
    # --- suppression works and is counted, not silent.
    off = trap + " " + SUPPRESS
    got, sup = claim_findings("s.md", off, today)
    expect("claim honours the suppression marker", got == [])
    expect("claim counts suppressions so the hatch stays visible", sup == 1)
    # --- an impossible date is a typo, not a stamp.
    expect("newest_stamp rejects an impossible date",
           newest_stamp(["verified 2026-13-45"]) is None)
    expect("newest_stamp takes the newest of several",
           newest_stamp(["found 2026-01-01", "re-verified 2026-05-05"])
           == date(2026, 5, 5))

    # --- Check 2: audit. Silence is never a pass.
    expect("audit passes on all-zero counts",
           audit_findings([{"dir": "a", "ok": True,
                            "counts": {"high": 0, "low": 0}}]) == [])
    expect("audit ignores info-level noise",
           audit_findings([{"dir": "a", "ok": True,
                            "counts": {"info": 3, "high": 0}}]) == [])
    got = audit_findings([{"dir": "sp-proxy", "ok": True, "counts": {"high": 4}}])
    expect("audit flags a HIGH count",
           len(got) == 1 and got[0]["state"] == "vulnerable"
           and got[0]["counts"] == {"high": 4})
    got = audit_findings([{"dir": "sp-proxy", "ok": False, "counts": None}])
    expect("audit reports unknown when npm could not answer",
           len(got) == 1 and got[0]["state"] == "unknown")

    # --- _blob_map underpins every branch verdict, so it gets its own checks.
    expect("_blob_map parses a well-formed ls-tree line",
           _blob_map("100644 blob abc123\tbin/x.py") == {"bin/x.py": "abc123"})
    expect("_blob_map skips trees, submodules and malformed lines",
           _blob_map("040000 tree d\tsub\nnot a line\n160000 commit e\tmod") == {})
    expect("_blob_map keeps paths containing spaces",
           _blob_map("100644 blob f1\tdocs/a b.md") == {"docs/a b.md": "f1"})

    # --- Check 3: branches. The cherry-pick orphan is the case that matters.
    # This is the real codex/agent-collision-sentinel shape: 4 files, 3 landed
    # byte-identical, 1 differing only by the fixture fix made during the cherry-pick.
    orphan = {
        "name": "codex/agent-collision-sentinel",
        "ahead": 1,
        "files": ["a.py", "b.md", "c.py", "d.py"],
        "identical": 3,
        "novel": 0,
        "lastCommit": today - timedelta(days=30),
        "hasOpenPr": False,
    }
    got = branch_findings([orphan], today)
    expect("branch flags a cherry-pick orphan as possibly-landed",
           len(got) == 1 and got[0]["state"] == "possibly-landed"
           and got[0]["idleDays"] == 30 and got[0]["identical"] == 3)
    expect("branch does NOT flag one with an open PR",
           branch_findings([{**orphan, "hasOpenPr": True}], today) == [])
    expect("branch does NOT flag one that is still recent",
           branch_findings([{**orphan, "lastCommit": today}], today) == [])
    expect("branch does NOT flag one carrying a file main lacks",
           branch_findings([{**orphan, "novel": 1}], today) == [])
    # THE precision case: a branch merely BEHIND main. Its own files all exist on
    # main, but main holds main's version, so nothing is identical. Before the
    # three-dot/blob rewrite this was flagged, and it is the common case here.
    expect("branch does NOT flag one that is merely behind main",
           branch_findings([{**orphan, "identical": 0}], today) == [])
    # The real codex/rotation-url-cap-fix: 86 files, 30 already on main, 56 genuinely
    # unlanded. An `identical >= 1` rule flagged it; the unlanded-count rule must not.
    expect("branch does NOT flag one with real unlanded work",
           branch_findings([{**orphan, "files": [f"f{i}" for i in range(86)],
                             "identical": 30}], today) == [])
    expect("branch flags right up to the unlanded ceiling",
           len(branch_findings([{**orphan, "files": ["a", "b", "c", "d", "e"],
                                 "identical": 3}], today)) == 1)
    expect("branch stops one file past the ceiling",
           branch_findings([{**orphan, "files": ["a", "b", "c", "d", "e"],
                             "identical": 2}], today) == [])
    expect("branch reports unknown when gh could not answer",
           branch_findings([{**orphan, "hasOpenPr": None}], today)[0]["state"]
           == "unknown")
    got = branch_findings([{**orphan, "identical": 4, "hasOpenPr": True,
                            "lastCommit": today}], today)
    expect("branch flags an all-identical branch as fully-landed regardless of age/PR",
           len(got) == 1 and got[0]["state"] == "fully-landed")
    expect("branch ignores a branch with no commits ahead",
           branch_findings([{**orphan, "ahead": 0}], today) == [])
    expect("branch ignores a branch that changed nothing",
           branch_findings([{**orphan, "files": []}], today) == [])

    # --- Check 4: worktrees.
    cold = {
        "path": "/private/wt/x",
        "branch": "claude/done",
        "merged": True,
        "locked": False,
        "main": False,
        "mtime": today - timedelta(days=45),
    }
    got = worktree_findings([cold], today)
    expect("worktree flags a merged, cold tree",
           len(got) == 1 and got[0]["state"] == "merged-idle"
           and got[0]["idleDays"] == 45)
    expect("worktree spares the main checkout",
           worktree_findings([{**cold, "main": True}], today) == [])
    expect("worktree spares a LOCKED tree (someone is in it)",
           worktree_findings([{**cold, "locked": True}], today) == [])
    expect("worktree spares an unmerged tree",
           worktree_findings([{**cold, "merged": False}], today) == [])
    expect("worktree spares a warm tree",
           worktree_findings([{**cold, "mtime": today}], today) == [])

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


# ------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--write-receipt", action="store_true",
                    help="on a clean run only, stamp the monthly receipt")
    ap.add_argument("--self-test", action="store_true",
                    help="prove each check can fail, and stays silent on the good case")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    today = date.today()
    try:
        claims, skill_files, suppressed = collect_claims(ROOT, today)
        audits = collect_audit(ROOT)
        branches = collect_branches(ROOT)
        worktrees = collect_worktrees(ROOT)
    except StaleClaimsError as exc:
        print(f"stale-claims: cannot run ({exc})", file=sys.stderr)
        return 2

    findings = (
        claims
        + audit_findings(audits)
        + branch_findings(branches, today)
        + worktree_findings(worktrees, today)
    )
    summary = {
        "skillFilesScanned": skill_files,
        "suppressedBlocks": suppressed,
        "manifestsAudited": len(audits),
        "branchesScanned": len(branches),
        "worktreesScanned": len(worktrees),
    }

    if args.json:
        print(json.dumps(
            {"schemaVersion": 1, "asOf": today.isoformat(),
             "summary": summary, "findings": findings},
            indent=2, sort_keys=True))
    else:
        scope = (
            f"{summary['skillFilesScanned']} skill file(s), "
            f"{summary['manifestsAudited']} manifest(s), "
            f"{summary['branchesScanned']} branch(es), "
            f"{summary['worktreesScanned']} worktree(s)"
        )
        if findings:
            print(f"stale-claims: {len(findings)} finding(s) across {scope}\n")
            for f in findings:
                where = f.get("path") or f.get("dir") or f.get("branch") or "?"
                line = f":{f['line']}" if "line" in f else ""
                extra = ""
                if "ageDays" in f:
                    extra = f" (stamped {f['stampedOn']}, {f['ageDays']}d old)"
                elif "idleDays" in f:
                    extra = f" (idle {f['idleDays']}d)"
                elif "counts" in f:
                    extra = f" ({json.dumps(f['counts'], sort_keys=True)})"
                print(f"  {f['check']:9s} {f['state']:16s} {where}{line}{extra}")
            print(f"\n{summary['suppressedBlocks']} block(s) suppressed with "
                  f"'{SUPPRESS}'.")
        else:
            print(f"OK — no stale claims across {scope}; "
                  f"{summary['suppressedBlocks']} block(s) suppressed.")

    if findings:
        return 1
    if args.write_receipt:
        write_receipt(summary)
        print(f"receipt written to {os.path.relpath(RECEIPT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
