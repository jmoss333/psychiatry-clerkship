#!/usr/bin/env python3
"""Hydrate and publish the rolling, review-only surveillance report branch."""

import argparse
import json
import re
import subprocess
from pathlib import Path


SURV_ROOT = "13_Faculty_Resources/_automation/surveillance"
ALLOWED_PATHS = [
    f"{SURV_ROOT}/history",
    f"{SURV_ROOT}/STATUS.md",
    f"{SURV_ROOT}/status.html",
]
DEFAULT_BASE = "main"
DEFAULT_BRANCH = "automation/surveillance-inbox"
PR_TITLE = "surveillance: refresh maintenance inbox"
PR_BODY = "Automated, content-free surveillance reports for faculty review."
BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$")


def _subprocess_runner(command, **kwargs):
    return subprocess.run(command, **kwargs)


def _run(runner, command, repo_root, *, check=True):
    return runner(
        list(command),
        cwd=str(repo_root),
        check=check,
        capture_output=True,
        text=True,
    )


def _validate_branch(value, label):
    if not isinstance(value, str) or not BRANCH_RE.fullmatch(value):
        raise ValueError(f"{label} is not a valid branch name")
    return value


def _is_allowed(path):
    path = path.strip()
    if not path or path.startswith("/") or ".." in Path(path).parts:
        return False
    return (
        path == ALLOWED_PATHS[1]
        or path == ALLOWED_PATHS[2]
        or path.startswith(ALLOWED_PATHS[0] + "/")
    )


def _changed_paths(porcelain):
    paths = []
    for line in porcelain.splitlines():
        if not line:
            continue
        value = line[3:] if len(line) >= 4 else ""
        paths.extend(value.split(" -> "))
    return paths


def _require_allowed(paths, context):
    unexpected = sorted({path for path in paths if not _is_allowed(path)})
    if unexpected:
        raise ValueError(f"{context} contains out-of-scope paths: {', '.join(unexpected)}")


def _open_pr_number(runner, repo_root, branch, base):
    result = _run(
        runner,
        [
            "gh", "pr", "list",
            "--head", branch,
            "--base", base,
            "--state", "open",
            "--json", "number",
            "--limit", "2",
        ],
        repo_root,
    )
    items = json.loads(result.stdout or "[]")
    if not isinstance(items, list) or len(items) > 1:
        raise ValueError("expected at most one open surveillance inbox pull request")
    return items[0].get("number") if items else None


def hydrate(
    *,
    repo_root,
    state_path,
    base=DEFAULT_BASE,
    branch=DEFAULT_BRANCH,
    runner=_subprocess_runner,
):
    """Restore allowed generated state from the remote inbox into the base checkout."""
    repo_root = Path(repo_root)
    state_path = Path(state_path)
    base = _validate_branch(base, "base")
    branch = _validate_branch(branch, "branch")

    _run(
        runner,
        [
            "git", "fetch", "origin",
            f"+refs/heads/{base}:refs/remotes/origin/{base}",
        ],
        repo_root,
    )
    _run(
        runner,
        [
            "git", "fetch", "origin",
            f"+refs/heads/{branch}:refs/remotes/origin/{branch}",
        ],
        repo_root,
        check=False,
    )
    remote = _run(
        runner,
        ["git", "rev-parse", "--verify", f"refs/remotes/origin/{branch}"],
        repo_root,
        check=False,
    )
    expected_remote_sha = remote.stdout.strip() if remote.returncode == 0 else ""
    expected_remote_sha = expected_remote_sha or None
    open_pr_number = _open_pr_number(runner, repo_root, branch, base)

    if expected_remote_sha:
        diff = _run(
            runner,
            ["git", "diff", "--name-only", f"origin/{base}", f"origin/{branch}"],
            repo_root,
        )
        paths = [line.strip() for line in diff.stdout.splitlines() if line.strip()]
        _require_allowed(paths, "remote surveillance inbox diff")
        _run(
            runner,
            ["git", "restore", "--source", f"origin/{branch}", "--", *ALLOWED_PATHS],
            repo_root,
        )

    state = {
        "base": base,
        "branch": branch,
        "expectedRemoteSha": expected_remote_sha,
        "openPrNumber": open_pr_number,
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return state


def _load_state(state_path):
    with open(state_path, encoding="utf-8") as fh:
        state = json.load(fh)
    if not isinstance(state, dict) or set(state) != {
        "base", "branch", "expectedRemoteSha", "openPrNumber"
    }:
        raise ValueError("report branch state has an unrecognized shape")
    _validate_branch(state["base"], "base")
    _validate_branch(state["branch"], "branch")
    sha = state["expectedRemoteSha"]
    if sha is not None and (
        not isinstance(sha, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", sha)
    ):
        raise ValueError("expectedRemoteSha must be an exact 40-character Git SHA")
    number = state["openPrNumber"]
    if number is not None and (not isinstance(number, int) or isinstance(number, bool)):
        raise ValueError("openPrNumber must be an integer or null")
    return state


def publish(*, repo_root, state_path, runner=_subprocess_runner):
    """Publish only generated surveillance state with exact lease protection."""
    repo_root = Path(repo_root)
    state = _load_state(state_path)
    base = state["base"]
    branch = state["branch"]

    dirty = _run(
        runner,
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        repo_root,
    )
    _require_allowed(_changed_paths(dirty.stdout), "working tree")

    switched = False
    try:
        _run(runner, ["git", "switch", "-C", branch, f"origin/{base}"], repo_root)
        switched = True
        _run(runner, ["git", "add", "--", *ALLOWED_PATHS], repo_root)
        staged = _run(
            runner,
            ["git", "diff", "--cached", "--quiet"],
            repo_root,
            check=False,
        )
        if staged.returncode not in (0, 1):
            raise subprocess.CalledProcessError(
                staged.returncode,
                ["git", "diff", "--cached", "--quiet"],
                output=staged.stdout,
                stderr=staged.stderr,
            )
        if staged.returncode == 0:
            return {"changed": False, "pullRequest": state["openPrNumber"]}

        _run(runner, ["git", "config", "user.name", "surveillance-bot"], repo_root)
        _run(
            runner,
            [
                "git", "config", "user.email",
                "surveillance-bot@users.noreply.github.com",
            ],
            repo_root,
        )
        _run(runner, ["git", "commit", "-m", PR_TITLE], repo_root)

        push = ["git", "push", "origin", f"HEAD:refs/heads/{branch}"]
        if state["expectedRemoteSha"]:
            push.append(
                f"--force-with-lease=refs/heads/{branch}:{state['expectedRemoteSha']}"
            )
        _run(runner, push, repo_root)

        pr_number = state["openPrNumber"]
        if pr_number is None:
            created = _run(
                runner,
                [
                    "gh", "pr", "create",
                    "--base", base,
                    "--head", branch,
                    "--title", PR_TITLE,
                    "--body", PR_BODY,
                ],
                repo_root,
            )
            pr_number = created.stdout.strip() or None
        return {"changed": True, "pullRequest": pr_number}
    finally:
        if switched:
            _run(runner, ["git", "switch", base], repo_root)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("hydrate", "publish"))
    parser.add_argument("--state", required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    args = parser.parse_args()

    if args.command == "hydrate":
        hydrate(
            repo_root=args.repo_root,
            state_path=args.state,
            base=args.base,
            branch=args.branch,
        )
    else:
        state = _load_state(args.state)
        if state["base"] != args.base or state["branch"] != args.branch:
            raise ValueError("publish arguments do not match hydrated report branch state")
        publish(repo_root=args.repo_root, state_path=args.state)


if __name__ == "__main__":
    main()
