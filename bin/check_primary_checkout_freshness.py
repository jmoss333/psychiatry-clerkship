#!/usr/bin/env python3
"""ADVISORY: is the checkout you are working in far behind origin/main?

THE DEFECT. On 2026-10-04 the primary checkout was parked on a branch five days behind
main — behind the citation-attribution gate, among other things — and the gate looked
"missing" from where the owner sat: the tool was not in bin/, verify.sh did not run it, and
nothing said why. A stale checkout is not wrong, but it silently misreports what the
repository's rules ARE, and every session that starts from it inherits the misreading.

WHAT THIS DOES. Compares HEAD with the LOCAL origin/main ref (no fetch, no network — if the
ref is itself stale, the run says how old it is) and reports how far behind this checkout
is, in commits and in days: days = age of the merge-base against origin/main's tip, i.e. how
many days of main's history this checkout cannot see. Past the threshold it prints a NOTICE
with the rebase/merge command. It never fails the run: a feature branch is SUPPOSED to be
behind main, and a push must never be blocked for the branch being a week old. `--strict`
exists for deliberate use (exit 1 when stale) and nothing here invokes it.

    python3 bin/check_primary_checkout_freshness.py                 # advisory, default 7 days
    python3 bin/check_primary_checkout_freshness.py --max-days 3    # tighter
    python3 bin/check_primary_checkout_freshness.py --max-commits 50 # also by commit count
    python3 bin/check_primary_checkout_freshness.py --strict        # exit 1 when stale
    python3 bin/check_primary_checkout_freshness.py --self-test     # hermetic fixture repos
    CLERKSHIP_FRESHNESS_MAX_DAYS=14 …                                # env override of the default

Exit codes: 0 fresh, stale-but-advisory, or could-not-determine (said so, never silently);
1 stale under --strict; 2 self-test failure.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = "origin/main"
DEFAULT_MAX_DAYS = 7
ENV_MAX_DAYS = "CLERKSHIP_FRESHNESS_MAX_DAYS"


def _git(root, *args):
    """Run git under root; (returncode, stdout). Inherited GIT_* is dropped: this runs as a
    pre-push hook step, and git exports GIT_DIR into hooks, which would aim every query at the
    pushing worktree's gitdir rather than `root` (bin/verify.sh:30-38)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env["GIT_OPTIONAL_LOCKS"] = "0"
    proc = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True, env=env)
    return proc.returncode, proc.stdout.strip()


def measure(root, upstream=UPSTREAM, now=None):
    """How far behind `upstream` the checkout at `root` is. Returns a dict, or an `error` key.

    behind_commits  commits on upstream not reachable from HEAD
    ahead_commits   commits on HEAD not on upstream (a feature branch's own work)
    behind_days     days between the merge-base's commit date and upstream's tip date
    upstream_age_days  days since upstream's tip was committed — a large value with a small
                       behind_days means the LOCAL ref is what is stale: fetch first
    """
    now = now or datetime.now(timezone.utc)
    rc, branch = _git(root, "rev-parse", "--abbrev-ref", "HEAD")
    if rc != 0:
        return {"error": "not a git checkout (or HEAD unreadable)"}
    rc, up_sha = _git(root, "rev-parse", "--verify", "--quiet", f"{upstream}^{{commit}}")
    if rc != 0:
        return {"error": f"no local ref {upstream} — fetch first (GIT_LFS_SKIP_SMUDGE=1 git fetch origin main)"}
    rc, base = _git(root, "merge-base", "HEAD", upstream)
    if rc != 0:
        return {"error": f"HEAD and {upstream} share no history"}
    rc, counts = _git(root, "rev-list", "--left-right", "--count", f"HEAD...{upstream}")
    if rc != 0:
        return {"error": "rev-list failed"}
    ahead, behind = (int(x) for x in counts.split())
    _, base_ts = _git(root, "log", "-1", "--format=%ct", base)
    _, up_ts = _git(root, "log", "-1", "--format=%ct", up_sha)
    base_dt = datetime.fromtimestamp(int(base_ts), timezone.utc)
    up_dt = datetime.fromtimestamp(int(up_ts), timezone.utc)
    return {
        "branch": branch,
        "head": _git(root, "rev-parse", "--short", "HEAD")[1],
        "upstream": upstream,
        "upstream_short": up_sha[:8],
        "ahead_commits": ahead,
        "behind_commits": behind,
        "behind_days": max(0.0, (up_dt - base_dt).total_seconds() / 86400),
        "upstream_age_days": max(0.0, (now - up_dt).total_seconds() / 86400),
    }


def verdict(m, max_days, max_commits=None):
    """(stale: bool, one-line summary). Pure, so the self-test can pin the thresholds."""
    if "error" in m:
        return False, f"checkout freshness: could not determine — {m['error']}"
    by_days = m["behind_days"] > max_days
    by_commits = max_commits is not None and m["behind_commits"] > max_commits
    stale = by_days or by_commits
    line = (f"{m['branch']} @ {m['head']} is {m['behind_commits']} commit(s) / "
            f"{m['behind_days']:.1f} day(s) behind {m['upstream']} @ {m['upstream_short']}")
    if m["ahead_commits"]:
        line += f" (+{m['ahead_commits']} own)"
    if stale:
        why = []
        if by_days:
            why.append(f"> {max_days} day(s)")
        if by_commits:
            why.append(f"> {max_commits} commit(s)")
        line = "NOTICE stale checkout: " + line + f" [{', '.join(why)}]"
    else:
        line = "checkout freshness OK — " + line
    return stale, line


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--max-days", type=float,
                    default=float(os.environ.get(ENV_MAX_DAYS, DEFAULT_MAX_DAYS)),
                    help=f"days behind {UPSTREAM} before a NOTICE (default {DEFAULT_MAX_DAYS}; "
                         f"env {ENV_MAX_DAYS})")
    ap.add_argument("--max-commits", type=int, default=None,
                    help="also notice when behind by more than this many commits (off by default)")
    ap.add_argument("--upstream", default=UPSTREAM)
    ap.add_argument("--strict", action="store_true", help="exit 1 when stale (advisory otherwise)")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    m = measure(ROOT, args.upstream)
    stale, line = verdict(m, args.max_days, args.max_commits)
    if stale:
        print(f"  this checkout cannot see {m['behind_days']:.0f} day(s) of {m['upstream']} — gates,")
        print(f"  tools and rules added there look 'missing' from here. Bring it forward:")
        print(f"    GIT_LFS_SKIP_SMUDGE=1 git fetch origin main && git rebase {m['upstream']}   # or merge")
    if "error" not in m and m["upstream_age_days"] > args.max_days:
        print(f"  note: local {m['upstream']} itself is {m['upstream_age_days']:.0f} day(s) old — "
              f"fetch before trusting the number above")
    print(line)
    return 1 if (stale and args.strict) else 0


# --- self-test — hermetic: throwaway repos only, never the live tree ------------------------

def self_test():
    sys.path.insert(0, str(ROOT / "bin"))
    from _git_env import scrub_inherited_git_env
    scrub_inherited_git_env()  # builds repos: an inherited GIT_DIR would aim them at the real one

    import tempfile
    from datetime import timedelta

    failures, total = [], []

    def check(name, got, want):
        total.append(name)
        if got != want:
            failures.append(f"{name}: got {got!r}, want {want!r}")

    hermetic = {"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}

    def git(cwd, *args, when=None):
        env = {**os.environ, **hermetic}
        if when is not None:
            stamp = when.strftime("%Y-%m-%dT%H:%M:%S+0000")
            env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = stamp
        p = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=env)
        if p.returncode != 0:
            raise RuntimeError(f"git {' '.join(args)}: {p.stderr.strip()}")
        return p.stdout.strip()

    now = datetime(2026, 10, 4, 12, 0, tzinfo=timezone.utc)

    def commit(cwd, name, when):
        Path(cwd, name).write_text(name + "\n", encoding="utf-8")
        git(cwd, "add", name)
        git(cwd, "commit", "-qm", name, when=when)

    with tempfile.TemporaryDirectory() as tmp:
        # A "remote" with ten days of main, and a clone whose main stops at day 0.
        remote = os.path.join(tmp, "remote")
        git(tmp, "init", "-q", "--initial-branch=main", remote)
        git(remote, "config", "user.name", "Fixture")
        git(remote, "config", "user.email", "fixture@example.invalid")
        commit(remote, "day0", now - timedelta(days=10))
        clone = os.path.join(tmp, "clone")
        git(tmp, "clone", "-q", remote, clone)
        git(clone, "config", "user.name", "Fixture")
        git(clone, "config", "user.email", "fixture@example.invalid")

        # 1. Freshly cloned: 0 behind, fresh.
        m = measure(clone, now=now)
        check("fresh clone has no error", "error" in m, False)
        check("fresh clone is 0 behind", (m["behind_commits"], round(m["behind_days"])), (0, 0))
        stale, line = verdict(m, 7)
        check("fresh clone is not stale", stale, False)
        check("fresh line says OK", line.startswith("checkout freshness OK"), True)

        # 2. Main moves on for nine days; the clone fetches but does not advance.
        for d in range(1, 10):
            commit(remote, f"day{d}", now - timedelta(days=10 - d))
        git(clone, "fetch", "-q", "origin")
        m = measure(clone, now=now)
        check("behind by nine commits", m["behind_commits"], 9)
        check("behind by nine days", round(m["behind_days"]), 9)
        stale, line = verdict(m, 7)
        check("nine days > 7 is stale", stale, True)
        check("stale line is a NOTICE", line.startswith("NOTICE stale checkout:"), True)
        check("stale line names the threshold", "> 7 day(s)" in line, True)
        check("a wider threshold is not stale", verdict(m, 14)[0], False)

        # 3. Commit threshold, independently of days.
        check("commit cap alone trips", verdict(m, 14, max_commits=5), (True, verdict(m, 14, 5)[1]))
        check("commit cap names itself", "> 5 commit(s)" in verdict(m, 14, 5)[1], True)
        check("commit cap not exceeded is quiet", verdict(m, 14, max_commits=9)[0], False)
        check("exactly at the day threshold is not stale", verdict(m, m["behind_days"])[0], False)

        # 4. A feature branch with its own commits: ahead counted, behind unchanged.
        git(clone, "checkout", "-qb", "feature")
        commit(clone, "mine", now - timedelta(days=1))
        m = measure(clone, now=now)
        check("own commits are counted as ahead", m["ahead_commits"], 1)
        check("own commits do not reduce behind", m["behind_commits"], 9)
        check("branch name is reported", m["branch"], "feature")
        check("ahead shows in the line", "(+1 own)" in verdict(m, 7)[1], True)

        # 5. Rebased onto origin/main: fresh again, the defect's fix.
        git(clone, "rebase", "-q", "origin/main")
        m = measure(clone, now=now)
        check("after rebase, 0 behind", (m["behind_commits"], round(m["behind_days"])), (0, 0))
        check("after rebase, not stale", verdict(m, 7)[0], False)

        # 6. A stale LOCAL origin/main is reported as such, not as freshness.
        commit(remote, "day10", now)
        m = measure(clone, now=now + timedelta(days=20))  # no fetch
        check("unfetched ref: behind still 0", m["behind_commits"], 0)
        check("unfetched ref: its age is surfaced", m["upstream_age_days"] > 19, True)

        # 7. Could-not-determine is said, never silently 0 behind.
        git(clone, "branch", "-q", "-D", "main")
        git(clone, "update-ref", "-d", "refs/remotes/origin/main")
        m = measure(clone, now=now)
        check("missing upstream ref is an error", "error" in m, True)
        check("error names the fetch", "fetch first" in m["error"], True)
        stale, line = verdict(m, 7)
        check("error is not stale", stale, False)
        check("error line says could not determine", "could not determine" in line, True)
        m = measure(tmp, now=now)  # the temp dir holds repos but is not one
        check("non-repo is an error", "error" in m, True)

    # 8. The shipped default and the env override.
    check("default threshold is 7 days", DEFAULT_MAX_DAYS, 7)
    saved = os.environ.get(ENV_MAX_DAYS)
    try:
        os.environ[ENV_MAX_DAYS] = "3"
        ns = argparse.ArgumentParser()
        ns.add_argument("--max-days", type=float, default=float(os.environ.get(ENV_MAX_DAYS, DEFAULT_MAX_DAYS)))
        check("env override is read", ns.parse_args([]).max_days, 3.0)
    finally:
        if saved is None:
            os.environ.pop(ENV_MAX_DAYS, None)
        else:
            os.environ[ENV_MAX_DAYS] = saved

    for line in failures:
        print("FAIL  " + line, file=sys.stderr)
    if failures:
        print(f"self-test: {len(failures)}/{len(total)} failed", file=sys.stderr)
        return 2
    print(f"self-test: {len(total)}/{len(total)} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
