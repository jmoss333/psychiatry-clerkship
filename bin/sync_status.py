#!/usr/bin/env python3
"""Report checkout divergence from origin/main; never merge, reset, or change files.

Default: offline, explicitly cached report. --refresh fetches only the named remote
branch (bounded to 15 seconds). --check exits 1 for differences, 2 if unknown.
Ordinary report mode exits 0 for differences and 2 if it cannot check.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess


def git(repo, *args):
    # A caller may be a Git hook: its GIT_DIR must not override --repo.
    env = {key: value for key, value in os.environ.items() if key not in {
        "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_SHALLOW_FILE",
    }}
    env["GIT_TERMINAL_PROMPT"] = "0"
    result = subprocess.run(
        ["git", "-C", str(repo), *args], env=env, capture_output=True,
        text=True, timeout=15, check=False,
    )
    if result.returncode:
        # Do not echo stderr: a remote URL can contain authentication material.
        raise RuntimeError(f"git {args[0]} failed (exit {result.returncode})")
    return result.stdout.strip() if "-z" not in args else result.stdout


def collect(args):
    report = {"state": "unknown", "remote_evidence": "cached",
              "reference": f"{args.remote}/{args.branch}", "repo": str(args.repo.resolve())}
    try:
        if args.remote.startswith("-") or args.branch.startswith("-"):
            raise ValueError("Remote and branch names must not start with a dash")
        git(args.repo, "check-ref-format", f"refs/heads/{args.branch}")
        ref = f"refs/remotes/{args.remote}/{args.branch}"
        git(args.repo, "check-ref-format", ref)
        if args.refresh:
            report["remote_evidence"] = "refresh-failed"
            git(args.repo, "fetch", "--no-tags", "--no-recurse-submodules", args.remote,
                f"+refs/heads/{args.branch}:{ref}")
            report["remote_evidence"] = "refreshed"
        if git(args.repo, "rev-parse", "--is-shallow-repository") == "true":
            raise RuntimeError("Shallow history: fetch full history before comparing")
        head = git(args.repo, "rev-parse", "--verify", "HEAD^{commit}")
        remote_head = git(args.repo, "rev-parse", "--verify", f"{ref}^{{commit}}")
        # Unrelated histories must not be presented as ordinary divergence.
        git(args.repo, "merge-base", head, remote_head)
        ahead, behind = map(int, git(args.repo, "rev-list", "--left-right", "--count",
                                    f"{head}...{remote_head}").split())
        changed = set()
        for flags in ([], ["--cached"]):
            changed.update(filter(None, git(args.repo, "diff", *flags, "--no-renames",
                                            "--name-only", "-z").split("\0")))
        untracked = list(filter(None, git(args.repo, "ls-files", "--others",
                                         "--exclude-standard", "-z").split("\0")))
        state = "diverged" if ahead and behind else "ahead" if ahead else "behind" if behind else "in-sync"
        report.update(state=state, branch=git(args.repo, "branch", "--show-current") or None,
                      head=head, remote_head=remote_head, ahead=ahead, behind=behind,
                      tracked_changes=len(changed), untracked_files=len(untracked))
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        # TimeoutExpired embeds argv (potentially a remote); keep that message generic.
        report["error"] = "Git command timed out after 15 seconds" if isinstance(error, subprocess.TimeoutExpired) else str(error)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--branch", default="main", help="remote branch to compare (default: main)")
    parser.add_argument("--refresh", action="store_true", help="fetch the remote branch before reporting")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--check", action="store_true", help="exit 1 on commit or working-tree differences")
    args = parser.parse_args()
    report = collect(args)
    if args.json:
        print(json.dumps(report, indent=2))
    elif report["state"] == "unknown":
        print(f"sync: UNKNOWN vs {report['reference']} — {report['error']} ({report['remote_evidence']})")
    else:
        print(f"sync: {report['state'].upper()} — {report['branch'] or 'detached HEAD'} @ {report['head'][:7]} "
              f"vs {report['reference']} @ {report['remote_head'][:7]} "
              f"({report['ahead']} ahead, {report['behind']} behind)")
        print(f"sync: {report['tracked_changes']} changed tracked path(s), {report['untracked_files']} untracked file(s); "
              + ("remote refreshed now" if report["remote_evidence"] == "refreshed"
                 else "CACHED reference — run python3 bin/sync_status.py --refresh for a live comparison"))
    if report["state"] == "unknown":
        return 2
    return int(args.check and (report["ahead"] or report["behind"] or
                               report["tracked_changes"] or report["untracked_files"]) != 0)


if __name__ == "__main__":
    raise SystemExit(main())
