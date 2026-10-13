#!/usr/bin/env python3
"""Read-only, offline status of the Library's active Git hooks. Always advisory."""

import os
from pathlib import Path
import re
import stat
import subprocess


def git(*args, cwd=None, check=True):
    return subprocess.run(
        ["git", *args], cwd=cwd, check=check, timeout=2,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )


def git_path(*args, cwd=None):
    value = git(*args, cwd=cwd).stdout.decode().rstrip("\n")
    if not value:
        raise ValueError("empty Git path")
    path = Path(value)
    return path if path.is_absolute() else Path(cwd or Path.cwd()) / path


def reference(root):
    # Worktrees share installed hooks, but can carry older installers. Prefer the latest
    # locally known main; never fetch, and label a local-checkout fallback explicitly.
    cached = git("show-ref", "--verify", "--quiet", "refs/remotes/origin/main", cwd=root, check=False)
    if cached.returncode == 0:
        source = git("show", "refs/remotes/origin/main:bin/install-hooks.sh", cwd=root).stdout
        label = "cached origin/main; offline"
    elif cached.returncode == 1:
        source = (root / "bin/install-hooks.sh").read_bytes()
        label = "this checkout; no cached origin/main"
    else:
        raise ValueError("cannot inspect cached main")
    # Parse the installer's literal heredocs, never execute it or an installed hook.
    blocks = re.findall(
        rb'^cat > "\$HOOK_DIR/(pre-commit|pre-push)" <<\'HOOK\'\n(.*?)^HOOK\n',
        source, re.MULTILINE | re.DOTALL,
    )
    if len(blocks) != 2 or {name for name, _ in blocks} != {b"pre-commit", b"pre-push"}:
        raise ValueError("unrecognized installer definitions")
    return {name.decode(): body for name, body in blocks}, label


def hook_status(path, expected):
    try:
        mode = path.stat().st_mode
        if not stat.S_ISREG(mode):
            return "UNAVAILABLE (not a regular file)"
        if not mode & 0o111 or not os.access(path, os.X_OK):
            return "NOT EXECUTABLE"
        if path.read_bytes() != expected:
            return "OUTDATED OR MODIFIED"
        return "current"
    except FileNotFoundError:
        return "MISSING"
    except OSError:
        return "UNAVAILABLE (unreadable)"


def main():
    try:
        root = git_path("rev-parse", "--show-toplevel")
        expected, label = reference(root)
        # --git-path honors core.hooksPath, including a relative directory with spaces.
        active = git_path("rev-parse", "--git-path", "hooks", cwd=root)
        common = git_path("rev-parse", "--git-common-dir", cwd=root) / "hooks"
        statuses = {name: hook_status(active / name, expected[name]) for name in ("pre-commit", "pre-push")}
        print("git hooks: " + " · ".join(f"{name} {state}" for name, state in statuses.items()) + f" ({label})")
        if any(state != "current" for state in statuses.values()):
            if active.resolve() != common.resolve():
                print("git hooks: warning only — review core.hooksPath and preserve custom hooks; "
                      "the Library installer writes to the shared hooks directory.")
            else:
                print("git hooks: warning only — update this checkout, then review and run "
                      "bash bin/install-hooks.sh; preserve any custom hooks.")
    except (OSError, ValueError, subprocess.SubprocessError):
        print("git hooks: UNAVAILABLE (could not inspect the reference or hook paths; work continues)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
