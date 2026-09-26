#!/usr/bin/env python3
"""Who else is working here, what would collide with this branch, and what is about to be lost.

Three agents (Claude Code, Codex, cloud sessions) share this repository through ~100 linked
worktrees. The costs this report exists to prevent all happened in September 2026: a cleanup
removed a worktree a live session was committing to; parallel PRs conflicted on the same
registry tails; a rescue PR (#691) recovered commits that were on no remote; a prototype sat
uncommitted for three weeks. None of that needs a claims registry nobody keeps — every fact is
already in git. This DERIVES the board from it:

  active   other worktrees with their own work touched within --active-hours
  overlap  paths this checkout changes that another worktree (or, with --prs, an open PR)
           also changes — the conflict you are about to write
  at risk  worktrees holding uncommitted files or never-pushed commits, idle >= --stale-hours

Report-only: it never fetches, switches, commits, removes, prunes or locks anything. Remote
knowledge is whatever the last fetch left in refs/remotes (it says so). A branch whose work
already landed is not "at risk" and overlaps nothing; it is recognised two ways — offline, when
every path it changed is identical on the base (squash-merged, remote branch deleted); and with
--prs, when its HEAD is, or is an ancestor of, the head of a MERGED pull request (the base has
since moved on, so the content test alone would miss it).

Exit: 0 report; 2 could not check (not a repository, base ref missing, or — only with
--check — a --budget cut the sweep short); with --check, 1 when anything overlaps or is at risk.
A sweep cut short by --budget always prints PARTIAL with the count examined: a report over fewer
worktrees than exist must never read as a clean one (docs/SILENT_SHRINK_CHECKLIST.md).
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, wait
import json
import os
from pathlib import Path
import subprocess
import time

MEDIA = (".m4a", ".mp3", ".wav", ".mp4")  # without git-lfs these read as modified; not work
SCRUBBED = {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "GIT_COMMON_DIR",
            "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_SHALLOW_FILE"}
SHOW = 5  # rows per section in --vitals


class CannotCheck(RuntimeError):
    """A fact the report depends on could not be established."""


def git(cwd, *args, ok=(0,)):
    # A caller may be a Git hook: its GIT_DIR must not override -C (see bin/_git_env.py).
    env = {k: v for k, v in os.environ.items() if k not in SCRUBBED}
    env["GIT_TERMINAL_PROMPT"] = "0"
    r = subprocess.run(["git", "-C", str(cwd), *args], env=env, capture_output=True,
                       text=True, timeout=20, check=False)
    if r.returncode not in ok:
        raise CannotCheck(f"git {args[0]} failed in {cwd} (exit {r.returncode})")
    return r.stdout if ok == (0,) else r.returncode


def list_worktrees(repo):
    rows, cur = [], None
    for line in git(repo, "worktree", "list", "--porcelain").splitlines() + [""]:
        if line.startswith("worktree "):
            cur = {"path": line[9:], "branch": None, "head": None, "locked": False,
                   "missing": False}
        elif cur is None:
            continue
        elif line.startswith("HEAD "):
            cur["head"] = line[5:]
        elif line.startswith("branch "):
            cur["branch"] = line[7:].removeprefix("refs/heads/")
        elif line == "bare":
            cur["bare"] = True
        elif line.startswith("locked"):
            cur["locked"] = line[7:] or True
        elif line.startswith("prunable"):
            cur["missing"] = True
        elif line == "":
            if not cur.get("bare"):
                rows.append(cur)
            cur = None
    return rows


def recency(path):
    """Newest mtime of the worktree's index/HEAD — git touches them on status, add, commit."""
    dotgit = Path(path) / ".git"
    try:
        if dotgit.is_file():
            gitdir = Path(dotgit.read_text().split("gitdir:", 1)[1].strip())
            if not gitdir.is_absolute():
                gitdir = (Path(path) / gitdir).resolve()
        else:
            gitdir = dotgit
        return max((gitdir / f).stat().st_mtime for f in ("index", "HEAD")
                   if (gitdir / f).exists())
    except (OSError, IndexError, ValueError):
        return 0.0


def dirty_paths(path):
    """Uncommitted paths that are work: not LFS media phantoms, not dependency installs.

    `tests/smoke/node_modules` is an untracked SYMLINK in most worktrees here, and the
    `node_modules/` ignore pattern (trailing slash) matches directories only — so without this
    filter nearly every idle worktree reads as holding one uncommitted file.
    """
    out = git(path, "status", "--porcelain", "-z", "--no-renames")
    keep = []
    for entry in (e for e in out.split("\0") if len(e) > 3):
        rel = entry[3:]
        if rel.lower().endswith(MEDIA) or "node_modules" in rel.rstrip("/").split("/"):
            continue
        if entry.startswith("??") and os.path.islink(os.path.join(path, rel.rstrip("/"))):
            continue
        keep.append(rel)
    return keep


def examine(repo, wt, base):
    """Collect the raw git facts for one worktree; `settle` turns them into verdicts."""
    head, path = wt["head"], wt["path"]
    committed = [p for p in git(repo, "diff", "--name-only", f"{base}...{head}").splitlines()
                 if p]
    unpushed = int(git(repo, "rev-list", "--count", head, "--not", "--remotes").strip() or 0)
    dirty = dirty_paths(path)
    # Squash-merged, remote branch deleted: the commits are on no remote, but the content is.
    landed = bool(committed and not git(
        repo, "diff", "--name-only", base, head, "--", *committed).strip())
    dirty_times = []
    for p in dirty:
        try:
            dirty_times.append((Path(path) / p).stat().st_mtime)
        except OSError:
            pass
    wt.update(_committed=committed, _dirty=dirty, _dirty_times=dirty_times, unpushed=unpushed,
              _commit_time=float(git(repo, "log", "-1", "--format=%ct", head).strip() or 0),
              landed="content" if landed else False)
    return wt


def settle(wt, now):
    """Derive the reported fields; landed work contributes neither paths nor risk."""
    committed = [] if wt["landed"] else wt["_committed"]
    if wt["landed"]:
        wt["unpushed"] = 0
    stamps = list(wt["_dirty_times"]) + ([wt["_commit_time"]] if committed else [])
    last = max(stamps) if stamps else None
    wt.update(changed=sorted(set(committed) | set(wt["_dirty"])), dirty=len(wt["_dirty"]),
              idle_hours=None if last is None else round((now - last) / 3600, 1))
    for key in [k for k in wt if k.startswith("_")]:
        del wt[key]
    return wt


def gh_json(repo, limit, *args):
    """Run `gh ... --json`; None when gh is missing, unauthenticated or slow (never [])."""
    try:
        r = subprocess.run(["gh", *args], cwd=repo, capture_output=True, text=True,
                           timeout=limit, check=False)
        return json.loads(r.stdout) if r.returncode == 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def open_prs(repo, limit):
    rows = gh_json(repo, limit, "pr", "list", "--state", "open", "--limit", "60", "--json",
                   "number,title,headRefName,isDraft,files")
    return None if rows is None else [
        {"number": p["number"], "title": p["title"], "branch": p["headRefName"],
         "draft": p["isDraft"], "paths": [f["path"] for f in p.get("files") or []]}
        for p in rows]


def merged_heads(repo, limit):
    rows = gh_json(repo, limit, "pr", "list", "--state", "merged", "--limit", "300", "--json",
                   "headRefName,headRefOid")
    if rows is None:
        return None
    heads = {}
    for p in rows:
        heads.setdefault(p["headRefName"], []).append(p["headRefOid"])
    return heads


def landed_by_pr(repo, wt, heads):
    """HEAD is the head of a merged PR on this branch, or an ancestor of one."""
    for oid in heads.get(wt["branch"], []):
        if wt["head"] == oid:
            return True
        try:
            if git(repo, "merge-base", "--is-ancestor", wt["head"], oid, ok=(0, 1)) == 0:
                return True
        except CannotCheck:  # the PR head was never fetched here: cannot tell, so say nothing
            continue
    return False


def collect(args):
    now = time.time()
    repo = Path(git(args.repo, "rev-parse", "--show-toplevel").strip())
    try:
        git(repo, "rev-parse", "--verify", f"{args.base}^{{commit}}")
    except CannotCheck:
        raise CannotCheck(f"base {args.base} does not resolve — fetch it first") from None
    common = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").strip())
    here = os.path.realpath(repo)
    trees = list_worktrees(repo)
    for wt in trees:
        wt["self"] = os.path.realpath(wt["path"]) == here
    # This checkout first, then most recently touched: a budget drops the long-idle tail.
    order = sorted(trees, key=lambda w: (not w["self"], -recency(w["path"])))
    live = [w for w in order if not w["missing"] and w["head"]]
    skipped = len(order) - len(live)
    started = time.monotonic()
    gh_limit = 3 if args.vitals else 10
    pool = ThreadPoolExecutor(max_workers=8)
    # gh runs beside the sweep, not after it, so it spends none of the budget.
    gh_open = pool.submit(open_prs, repo, gh_limit) if args.prs else None
    gh_merged = pool.submit(merged_heads, repo, gh_limit) if args.prs else None
    futures = {pool.submit(examine, repo, wt, args.base): wt for wt in live}
    done, _ = wait(futures, timeout=args.budget or None)
    mine_future = next((f for f, w in futures.items() if w["self"]), None)
    if mine_future is not None and mine_future not in done:
        wait([mine_future])  # the budget never skips this checkout
        done.add(mine_future)
    prs = gh_open.result() if gh_open else None
    heads = gh_merged.result() if gh_merged else None
    pool.shutdown(wait=False, cancel_futures=True)
    examined = []
    for future in (f for f in futures if f in done):  # submission order: self first
        try:
            wt = future.result()
        except (CannotCheck, subprocess.TimeoutExpired):
            skipped += 1
            continue
        if heads and not wt["landed"] and landed_by_pr(repo, wt, heads):
            wt["landed"] = "merged-pr"
        examined.append(settle(wt, now))

    me = next((w for w in examined if w["self"]), None)
    others = [w for w in examined if not w["self"]]
    mine = set(me["changed"]) if me else set()
    overlap = []
    for w in others:
        shared = sorted(mine & set(w["changed"]))
        if shared:
            overlap.append({"source": "worktree", "branch": w["branch"], "path": w["path"],
                            "shared": shared})
    for pr in prs or []:
        if me and pr["branch"] == me["branch"]:
            continue
        shared = sorted(mine & set(pr["paths"]))
        if shared:
            overlap.append({"source": "pr", "number": pr["number"], "branch": pr["branch"],
                            "title": pr["title"], "shared": shared})

    has_work = [w for w in others if w["idle_hours"] is not None]
    active = sorted((w for w in has_work if w["idle_hours"] < args.active_hours),
                    key=lambda w: w["idle_hours"])
    at_risk = sorted((w for w in examined if w["idle_hours"] is not None
                      and w["idle_hours"] >= args.stale_hours
                      and (w["dirty"] or w["unpushed"])), key=lambda w: -w["idle_hours"])
    return {"repo": str(repo), "primary": str(common.parent), "base": args.base,
            "remote_evidence": "cached (last fetch)",
            "worktrees_total": len(trees), "worktrees_examined": len(examined),
            "worktrees_unreadable": skipped,
            "partial": len(examined) + skipped < len(trees),
            "elapsed_seconds": round(time.monotonic() - started, 1),
            "self": me, "prs_checked": prs is not None, "merged_prs_checked": heads is not None,
            "overlap": overlap, "active": active, "at_risk": at_risk,
            "unlocked_self": bool(me and not me["locked"])}


def ago(hours):
    if hours < 1:
        return f"{int(hours * 60)}m"
    return f"{hours:.0f}h" if hours < 48 else f"{hours / 24:.0f}d"


def short(path, root):
    """Display a worktree path relative to the primary checkout, where most of them live."""
    return "~primary/" + os.path.relpath(path, root) if path.startswith(root + os.sep) else path


def render(r, vitals):
    lines, n = [], SHOW if vitals else 10 ** 6
    where = lambda w: f"{w['branch'] or 'detached'} ({short(w['path'], r['primary'])})"  # noqa
    cover = f"examined {r['worktrees_examined']}/{r['worktrees_total']} worktrees"
    if r["partial"]:
        cover = f"PARTIAL — {cover} (budget hit; the rest were NOT checked)"
    lines.append(f"coordination: {cover} in {r['elapsed_seconds']}s · {len(r['active'])} active "
                 f"elsewhere · {len(r['overlap'])} overlap(s) · {len(r['at_risk'])} at risk")
    for w in r["active"][:n]:
        lines.append(f"  active: {where(w)} — {len(w['changed'])} path(s), "
                     f"touched {ago(w['idle_hours'])} ago")
    me = r["self"]
    if me is None:
        lines.append("  overlap: UNKNOWN — this checkout could not be examined")
    elif not me["changed"]:
        lines.append("  overlap: none yet — this checkout changes nothing (re-run once it does)")
    for o in r["overlap"][:n]:
        who = (f"PR #{o['number']} ({o['branch']})" if o["source"] == "pr"
               else f"worktree {where(o)}")
        more = f" +{len(o['shared']) - 3} more" if len(o["shared"]) > 3 else ""
        lines.append(f"  overlap: {who} also changes {', '.join(o['shared'][:3])}{more}")
    if me and me["changed"] and not r["overlap"]:
        scope = f"{r['worktrees_examined'] - 1} other worktree(s)"
        scope += " and open PRs" if r["prs_checked"] else ""
        lines.append(f"  overlap: none — {len(me['changed'])} changed path(s) vs {scope}")
    if me and me["changed"] and not r["prs_checked"]:
        lines.append("  overlap: open PRs NOT checked (pass --prs; needs an authenticated gh)")
    for w in r["at_risk"][:n]:
        what = " + ".join(x for x in (f"{w['dirty']} uncommitted" if w["dirty"] else "",
                                      f"{w['unpushed']} unpushed commit(s)" if w["unpushed"]
                                      else "") if x)
        lines.append(f"  at risk: {short(w['path'], r['primary'])} [{w['branch'] or 'detached'}]"
                     f" — {what}, idle {ago(w['idle_hours'])}")
    if r["unlocked_self"]:
        lines.append('  lock this worktree so no cleanup removes it under you: '
                     'git worktree lock --reason "<session>" .')
    if vitals and any(len(r[k]) > n for k in ("active", "overlap", "at_risk")):
        lines.append("  (truncated) full report: python3 bin/coordination_report.py --prs")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--repo", type=Path, default=Path.cwd())
    p.add_argument("--base", default="origin/main", help="ref branches are compared against")
    p.add_argument("--active-hours", type=float, default=6.0)
    p.add_argument("--stale-hours", type=float, default=24.0)
    p.add_argument("--budget", type=float, default=0.0,
                   help="stop examining worktrees after this many seconds (0 = no limit)")
    p.add_argument("--prs", action="store_true",
                   help="also check open PRs' paths and merged PRs' heads (uses gh)")
    p.add_argument("--vitals", action="store_true", help="compact output for the session hook")
    p.add_argument("--json", action="store_true")
    p.add_argument("--check", action="store_true",
                   help="exit 1 on any overlap or at-risk worktree; 2 when partial")
    args = p.parse_args()
    try:
        report = collect(args)
    except (CannotCheck, OSError, subprocess.TimeoutExpired) as error:
        msg = "git timed out" if isinstance(error, subprocess.TimeoutExpired) else str(error)
        print(json.dumps({"error": msg}) if args.json else f"coordination: UNKNOWN — {msg}")
        return 2
    print(json.dumps(report, indent=2) if args.json else render(report, args.vitals))
    if args.check:
        if report["partial"] or report["self"] is None:
            return 2
        return int(bool(report["overlap"] or report["at_risk"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
