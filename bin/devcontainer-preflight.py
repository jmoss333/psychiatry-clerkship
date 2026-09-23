#!/usr/bin/env python3
"""Read-only setup diagnosis, not a build/credential/security verification receipt.

Exit 0: checked, possibly with advisory warnings; 1: confirmed setup blocker;
2: could not check. Never repairs, downloads media, or invokes credential helpers.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess


ROOT = Path(__file__).resolve().parents[1]
GIB = 1024**3
# A configured 6 GiB Colima VM exposes less than 6 GiB to Linux. Warn below
# 5 GiB, not at an asserted universal minimum. The real failure was at 2 GiB.
MEMORY_WARNING_BYTES = 5 * GIB
PROBE_ERRORS = (OSError, ValueError, subprocess.SubprocessError)


def run_command(args, cwd):
    return subprocess.run(
        args, cwd=cwd, capture_output=True, text=True, timeout=10,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"},
    )


def add(rows, name, status, message, remedy="", **details):
    rows.append({"id": name, "status": status, "message": message,
                 "remedy": remedy, **details})


def output(runner, args, root):
    result = runner(args, root)
    if result.returncode != 0:
        raise ValueError("probe failed")  # Never repeat raw stderr or config.
    return result.stdout.strip()


def git_layout(root, rows, runner):
    try:
        paths = [
            Path(output(runner, ["git", "rev-parse", *flags], root))
            for flags in (["--show-toplevel"], ["--absolute-git-dir"],
                          ["--path-format=absolute", "--git-common-dir"])
        ]
        if any(not path.is_absolute() for path in paths):
            raise ValueError("invalid Git path")
        top, git_dir, common = (path.resolve() for path in paths)
        if top != root or any(not p.is_relative_to(root) or not p.is_dir() for p in (git_dir, common)):
            add(rows, "git-layout", "fail", "Git metadata is missing or outside the folder VS Code mounts.",
                "Open a full clone at its repository root, not a linked worktree; leave the existing checkout untouched.")
            return None
        add(rows, "git-layout", "pass", "Git metadata is accessible inside this repository root.")
        return common
    except PROBE_ERRORS:
        add(rows, "git-layout", "unknown", "Could not resolve this checkout's Git metadata.",
            "Check the selected root and Git availability; use a full clone for Reopen in Container.")
        return None


def lfs_check(root, common, rows, runner):
    if common is None:
        add(rows, "lfs-media", "unknown", "LFS readiness cannot be checked until Git metadata is accessible.")
        return
    try:
        config = runner(["git", "config", "--get", "lfs.storage"], root)
        if config.returncode not in (0, 1):
            raise ValueError("unreadable config")
        storage = Path(config.stdout.strip()) if config.returncode == 0 else Path("lfs")
        storage = (common / storage).resolve()
        if not storage.is_relative_to(root):
            add(rows, "lfs-media", "fail", "LFS storage points outside the folder mounted into the container.",
                "Use a full clone with its own local .git/lfs cache; see the onboarding instructions. No media was downloaded.")
            return
        if runner(["git", "lfs", "version"], root).returncode != 0:
            add(rows, "lfs-media", "fail", "Git LFS is unavailable.",
                "Install Git LFS through your approved tooling, then rerun preflight. This command installs nothing.")
            return
        # Git LFS owns pointer recognition and the tracked-file inventory; do not
        # walk nested worktrees or maintain another list of media extensions.
        inventory = json.loads(output(runner, ["git", "lfs", "ls-files", "--json"], root))
        files = inventory.get("files") if isinstance(inventory, dict) else None
        if not isinstance(files, list) or not files:
            raise ValueError("missing LFS inventory")
        missing = 0
        seen = set()
        for item in files:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str) or type(item.get("checkout")) is not bool:
                raise ValueError("invalid LFS entry")
            name = item["name"]
            path = (root / name).resolve()
            if not name or Path(name).is_absolute() or not path.is_relative_to(root) or name in seen:
                raise ValueError("invalid LFS path")
            seen.add(name)
            if not path.is_file() or not item["checkout"]:
                missing += 1
            else:
                with path.open("rb") as handle:
                    handle.read(1)  # Unreadable bytes must not look materialized.
        if missing:
            add(rows, "lfs-media", "fail", f"{missing} of {len(files)} tracked LFS files are missing or still pointers.",
                "Try git lfs checkout to use cached objects. If objects are missing, authorize git lfs pull separately (metered download).",
                count=len(files))
        else:
            add(rows, "lfs-media", "pass", f"{len(files)} tracked LFS files are materialized and readable (not a content hash audit).",
                count=len(files))
    except PROBE_ERRORS:
        add(rows, "lfs-media", "unknown", "Could not check the complete tracked LFS inventory.",
            "Check Git LFS availability, repository access, and supported git lfs ls-files --json output; no repair was attempted.")


def container_memory(read_text=lambda path: Path(path).read_text()):
    match = re.search(r"^MemTotal:\s+(\d+) kB$", read_text("/proc/meminfo"), re.MULTILINE)
    if not match or int(match[1]) <= 0:
        raise ValueError("invalid MemTotal")
    limits = [int(match[1]) * 1024]
    entries = [line.split(":", 2) for line in read_text("/proc/self/cgroup").splitlines()]
    entry = next((e for e in entries if len(e) == 3 and e[0] == "0" and e[1] == ""), None)
    base, filename = Path("/sys/fs/cgroup"), "memory.max"
    if entry is None:
        entry = next((e for e in entries if len(e) == 3 and "memory" in e[1].split(",")), None)
        base, filename = base / "memory", "memory.limit_in_bytes"
    if entry is None or not entry[2].startswith("/") or ".." in Path(entry[2]).parts:
        raise ValueError("unreadable memory cgroup")
    current = base / entry[2].lstrip("/")
    while True:
        value = read_text(str(current / filename)).strip()
        if value != "max":
            limit = int(value)
            if limit <= 0:
                raise ValueError("invalid memory limit")
            limits.append(limit)
        if current == base:
            break
        current = current.parent
    return min(limits)


def memory_check(root, context, rows, runner, memory_reader):
    try:
        amount = (memory_reader() if context == "container" else
                  json.loads(output(runner, ["docker", "info", "--format", "{{json .MemTotal}}"], root)))
        if type(amount) is not int or amount <= 0:
            raise ValueError("invalid memory capacity")
        low = amount < MEMORY_WARNING_BYTES
        add(rows, "memory", "warn" if low else "pass",
            f"Observed {'container/VM' if context == 'container' else 'Docker daemon'} memory capacity: {amount / GIB:.2f} GiB.",
            "This repo's VS Code proof failed with OOM at 2 GiB and passed with a 6 GiB Colima allocation. Consider 6 GiB; this is advisory, not a proven minimum." if low else "Capacity is not a guarantee against OOM under concurrent workloads.",
            bytes=amount)
    except PROBE_ERRORS:
        add(rows, "memory", "unknown", "Could not measure the selected container runtime's memory capacity.",
            "Check the active Docker daemon on the host, or Linux memory/cgroup access inside the container. Do not mount the Docker socket to fix this.")


def credentials_check(root, rows, runner, environ):
    try:
        result = runner(["git", "config", "--null", "--get-regexp", r"^credential(\..*)?\.helper$"], root)
        if result.returncode not in (0, 1):
            raise ValueError("config unavailable")
        helpers = []
        if result.returncode == 0:
            for record in result.stdout.split("\0"):
                if not record:
                    continue
                key, value = record.split("\n", 1)
                if not key.startswith("credential"):
                    raise ValueError("unexpected config")
                if value.strip():
                    helpers.append(value.strip())
        broken = False
        for helper in helpers:
            try:
                tokens = shlex.split(helper.lstrip("!"))
                if tokens and Path(tokens[0]).is_absolute() and not os.access(tokens[0], os.X_OK):
                    broken = True
            except ValueError:
                pass  # Arbitrary shell helpers are explicitly unverified, not run.
        forwarded = bool(environ.get("SSH_AUTH_SOCK"))
        if helpers or forwarded:
            message = "Git helper or SSH-agent access is configured; credentials may be forwarded. Authentication was not tested."
            if broken:
                message += " A recognizable helper executable is unavailable in this environment."
            add(rows, "credentials", "warn", message,
                "Review host-controlled forwarding and helper executable paths before pushing. No helper was invoked and no credential or socket values are displayed.")
        else:
            add(rows, "credentials", "pass", "No configured Git helpers or SSH_AUTH_SOCK observed; this is not a credential/security audit.")
    except PROBE_ERRORS:
        add(rows, "credentials", "unknown", "Could not inspect credential-forwarding configuration safely.",
            "Review Git configuration privately; preflight never prints raw configuration or authenticates.")


def collect(root, context, runner=run_command, environ=None, memory_reader=container_memory):
    root = Path(root).resolve()
    rows = []
    common = git_layout(root, rows, runner)
    lfs_check(root, common, rows, runner)
    memory_check(root, context, rows, runner, memory_reader)
    credentials_check(root, rows, runner, os.environ if environ is None else environ)
    states = {row["status"] for row in rows}
    status, code = (("blocked", 1) if "fail" in states else ("unknown", 2) if "unknown" in states
                    else ("warnings", 0) if "warn" in states else ("ready", 0))
    return {"schemaVersion": 1, "context": context, "status": status, "exitCode": code, "checks": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--context", choices=("host", "container"),
                        default="container" if os.environ.get("CLERKSHIP_DEVCONTAINER") == "1" else "host")
    parser.add_argument("--json", action="store_true", help="Print the versioned report; same exit codes as text")
    args = parser.parse_args()
    report = collect(args.root, args.context)
    if args.json:
        print(json.dumps(report))
    else:
        print(f"Dev Container preflight: {report['status']} ({report['context']}; not full verification)")
        for row in report["checks"]:
            print(f"  {row['status'].upper()} {row['id']}: {row['message']}")
            if row["remedy"]:
                print(f"    {row['remedy']}")
    return report["exitCode"]


if __name__ == "__main__":
    raise SystemExit(main())
