#!/usr/bin/env python3
"""Promote the newest fully-green main commit to the `release` branch.

WHY THIS EXISTS. Netlify bills every production deploy (15 credits, ~$0.10) no
matter how small the change, and the two learner sites (une-ms3-psychiatry,
mmc-psychiatry-residents-sanford) used to publish from `main` -- so every merge
cost two deploys. 135 merges in the fortnight to 2026-09-24 = ~270 deploys,
~4,000 credits against a 3,000/month plan. Both sites now publish from
`release`, and this script moves `release` forward on a schedule (3x/day) or on
demand ("publish now"). Production deploys are capped by the schedule, not by
the merge rate. Plan: 13_Faculty_Resources/_automation/NETLIFY_COST_REDUCTION_PLAN.md B1.

WHAT IT PROMOTES. Only a FIRST-PARENT commit of origin/main whose required
checks both concluded `success` on the post-merge (push) run. If the newest
commit's CI is still running, cancelled or red, it walks back to the newest
green one, so a half-tested or failing tree is never published. It only ever
FAST-FORWARDS `release`; if `release` is not an ancestor of the target it
refuses rather than rewrite what learners were served.

Exit codes: 0 promoted, or nothing new to publish (also 0 -- no deploy, no
cost); 1 refused (no green commit in the window, or not a fast-forward);
2 could not check (API/git failure, bad input).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REQUIRED_CHECKS = (
    "build-test-validate",
    "Smoke tests (nav crawl · faculty console · LFS · visual)",
)
RELEASE_BRANCH = "release"
MAIN_BRANCH = "main"
WINDOW = 40  # first-parent commits of main examined, newest first
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


class CouldNotCheck(RuntimeError):
    """A fact the decision depends on could not be read."""


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise CouldNotCheck(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def check_conclusions(repository: str, sha: str, token: str, fetch=None) -> dict:
    """Return {check name: conclusion} for the required checks on `sha`.

    When a check ran more than once on the same commit (a re-run), the newest
    run wins. A missing check maps to None, never to success.
    """
    fetch = fetch or _fetch_json
    url = f"https://api.github.com/repos/{repository}/commits/{sha}/check-runs?per_page=100"
    payload = fetch(url, token)
    runs = payload.get("check_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        raise CouldNotCheck(f"check-runs for {sha[:7]} unreadable")
    newest: dict = {}
    for run in runs:
        name = run.get("name")
        if name not in REQUIRED_CHECKS:
            continue
        started = run.get("started_at") or ""
        if name not in newest or started > newest[name][0]:
            newest[name] = (started, run.get("conclusion"))
    return {name: newest.get(name, (None, None))[1] for name in REQUIRED_CHECKS}


def is_green(conclusions: dict) -> bool:
    return all(conclusions.get(name) == "success" for name in REQUIRED_CHECKS)


def choose_target(candidates, conclusions_for):
    """Newest candidate (newest-first list) whose required checks are all success.

    Returns (sha, skipped) where skipped lists (sha, conclusions) for the newer
    commits passed over, so the log says WHY the newest merge did not ship.
    """
    skipped = []
    for sha in candidates:
        conclusions = conclusions_for(sha)
        if is_green(conclusions):
            return sha, skipped
        skipped.append((sha, conclusions))
    return None, skipped


def _fetch_json(url: str, token: str):
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "psychiatry-clerkship-release-train/1",
    })
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read(4_000_000))
    except (HTTPError, URLError, OSError, ValueError) as exc:
        raise CouldNotCheck(f"GitHub API read failed: {exc}") from exc


def _emit(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{key}={value}\n")


def _summary(lines) -> None:
    text = "\n".join(lines)
    print(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")


def run(repository: str, token: str, *, dry_run: bool, reason: str) -> int:
    if not REPO_RE.fullmatch(repository or ""):
        raise CouldNotCheck("repository must be owner/name")
    if not token:
        raise CouldNotCheck("GITHUB_TOKEN is required to read check runs")
    git("fetch", "--quiet", "origin",
        f"+refs/heads/{MAIN_BRANCH}:refs/remotes/origin/{MAIN_BRANCH}",
        f"+refs/heads/{RELEASE_BRANCH}:refs/remotes/origin/{RELEASE_BRANCH}")
    release_sha = git("rev-parse", f"origin/{RELEASE_BRANCH}")
    candidates = git("rev-list", "--first-parent", f"--max-count={WINDOW}",
                     f"origin/{MAIN_BRANCH}").split()
    if not candidates or not all(SHA_RE.fullmatch(sha) for sha in candidates):
        raise CouldNotCheck("could not list main's first-parent commits")

    target, skipped = choose_target(
        candidates, lambda sha: check_conclusions(repository, sha, token))
    lines = [f"## Release train{' (dry run)' if dry_run else ''}",
             f"- release is at `{release_sha[:7]}`"]
    if reason:
        lines.append(f"- reason given: {reason}")
    for sha, conclusions in skipped:
        state = ", ".join(f"{k.split(' ')[0]}={v}" for k, v in conclusions.items())
        lines.append(f"- passed over `{sha[:7]}` (not fully green: {state})")
    if target is None:
        lines.append(f"- REFUSED: no fully green commit among main's last {WINDOW}")
        _summary(lines)
        _emit("promoted", "false")
        return 1
    if target == release_sha or subprocess.run(
            ["git", "merge-base", "--is-ancestor", target, release_sha]).returncode == 0:
        lines.append(f"- nothing new to publish (newest green `{target[:7]}` is already live)")
        _summary(lines)
        _emit("promoted", "false")
        return 0
    if subprocess.run(["git", "merge-base", "--is-ancestor", release_sha, target]).returncode != 0:
        lines.append(f"- REFUSED: `{target[:7]}` does not fast-forward `{release_sha[:7]}`")
        _summary(lines)
        _emit("promoted", "false")
        return 1
    count = git("rev-list", "--count", "--first-parent", f"{release_sha}..{target}")
    lines.append(f"- promoting `{target[:7]}` ({count} merge(s) since the last publish)")
    if not dry_run:
        git("push", "origin", f"{target}:refs/heads/{RELEASE_BRANCH}")
        lines.append("- pushed; Netlify now builds both learner sites once")
    _summary(lines)
    _emit("promoted", "false" if dry_run else "true")
    _emit("sha", target)
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reason", default=os.environ.get("RELEASE_REASON", ""))
    args = parser.parse_args(argv)
    try:
        return run(args.repository, os.environ.get("GITHUB_TOKEN", ""),
                   dry_run=args.dry_run, reason=args.reason.strip()[:200])
    except CouldNotCheck as exc:
        print(f"release train: could not check -- {exc}", file=sys.stderr)
        _emit("promoted", "false")
        return 2


if __name__ == "__main__":
    sys.exit(main())
