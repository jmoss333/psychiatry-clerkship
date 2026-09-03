#!/usr/bin/env python3
"""PreToolUse hook for Bash: the Git-LFS "false modified" trap.

In a sandbox without git-lfs, every LFS-tracked media file (*.m4a *.mp3 *.wav *.mp4)
shows as modified because the smudge/clean filter is absent. Staging or "restoring" them
is always wrong there (see .claude/skills/clerkship-deploy/SKILL.md, trap 1). This hook
denies a git command that would touch them when git-lfs is not installed:

  * add / checkout / restore / stash / rm / mv that names a media file or sweeps the whole
    tree (-A, -u, --all, --update, --renormalize, ".", ":/", "*", a bare `git stash`), or
    reads its pathspecs from a file that does either (--pathspec-from-file is inspected,
    not assumed; stdin or an unreadable file counts as bulk);
  * ANY `git commit` while media files are already staged, whatever flags it carries —
    the pre-commit gate is opt-in, so this hook is the last line before history.

With git-lfs present it allows everything.

Set CLERKSHIP_FORCE_NO_LFS=1 to simulate the absent-LFS case (used by tests/hooks.test.mjs).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

MEDIA_EXTS = (".m4a", ".mp3", ".wav", ".mp4")
MEDIA_PATHSPECS = ["*" + ext for ext in MEDIA_EXTS]
GIT_WRITE_RE = re.compile(r"\bgit\b[^|;&]*\b(add|checkout|restore|stash|rm|mv)\b")
GIT_COMMIT_RE = re.compile(r"\bgit\b[^|;&]*\bcommit\b")
BULK_RE = re.compile(
    r"(\s-[a-zA-Z]*[Aau][a-zA-Z]*\b"                 # -A, -a, -u and combined short flags
    r"|\s--(?:all|update|renormalize|no-ignore-removal)\b"  # --no-ignore-removal is --all
    r"|\s\.(\s|$)|\s--\s+\.(\s|$)"                    # a bare "." pathspec
    r"|\s:/|\s:\(top\)"                               # whole-tree pathspec magic
    r"|\s\*(\s|$)|\s'\*'(\s|$)|\s\"\*\"(\s|$)"        # a glob for everything
    r"|\bstash\b(?!\s+(?:list|show|drop|pop|apply|branch|clear))"  # bare stash saves the tree
    r")"
)
MEDIA_RE = re.compile(r"\.(m4a|mp3|wav|mp4)\b", re.I)
PATHSPEC_FILE_RE = re.compile(r"--pathspec-from-file(?:=|\s+)(?P<q>[\'\"]?)(?P<path>[^\'\"\s]+)(?P=q)")
WHOLE_TREE_PATHSPECS = {".", ":/", ":(top)", "*", ":/*", "./*"}


def lfs_available() -> bool:
    if os.environ.get("CLERKSHIP_FORCE_NO_LFS") == "1":
        return False
    if not shutil.which("git"):
        return True
    try:
        return subprocess.run(
            ["git", "lfs", "version"], capture_output=True, text=True, timeout=5
        ).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def _git_lines(args: list[str], cwd: Path) -> list[str]:
    try:
        out = subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return []
    if out.returncode != 0:
        return []
    return [line for line in out.stdout.splitlines() if line.strip()]


def phantom_media(cwd: Path) -> list[str]:
    return [line[3:] for line in _git_lines(["status", "--porcelain", "--"] + MEDIA_PATHSPECS, cwd)]


def staged_media(cwd: Path) -> list[str]:
    return _git_lines(["diff", "--cached", "--name-only", "--"] + MEDIA_PATHSPECS, cwd)


def pathspec_file_is_bulk(command: str, cwd: Path) -> bool:
    """--pathspec-from-file stages whatever the file lists, so inspect the list rather than
    the option: media or a whole-tree pathspec inside it is bulk; stdin ("-") or a file that
    cannot be read is treated as bulk because it cannot be inspected."""
    m = PATHSPEC_FILE_RE.search(command)
    if not m:
        return False
    spec = m.group("path")
    if spec == "-":
        return True
    try:
        raw = (cwd / spec).read_bytes()
    except OSError:
        return True
    text = raw.decode("utf-8", errors="replace")
    entries = [e.strip() for e in re.split(r"[\x00\r\n]+", text) if e.strip()]
    for entry in entries:
        if entry in WHOLE_TREE_PATHSPECS or MEDIA_RE.search(entry) or entry.endswith("*"):
            return True
    return False


def deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    command = str((event.get("tool_input") or {}).get("command") or "")
    is_commit = bool(GIT_COMMIT_RE.search(command))
    is_write = bool(GIT_WRITE_RE.search(command))
    if not (is_commit or is_write):
        return 0
    cwd = Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd())
    if is_write and not is_commit and not (
        MEDIA_RE.search(command) or BULK_RE.search(command) or pathspec_file_is_bulk(command, cwd)
    ):
        return 0
    if lfs_available():
        return 0

    if is_commit:
        staged = staged_media(cwd)
        if staged:
            sample = ", ".join(staged[:3]) + (" …" if len(staged) > 3 else "")
            deny(
                "git-lfs is not installed here and %d media file(s) are staged (%s). Without the "
                "clean filter a commit would record raw audio or a phantom pointer diff, and the "
                "deploy's LFS gate fails on it. Unstage them (git restore --staged -- '*.m4a' "
                "'*.mp3' '*.wav' '*.mp4') before committing, or do this git work where git-lfs is "
                "installed (clerkship-deploy skill, trap 1)." % (len(staged), sample)
            )
            return 0
        if not (MEDIA_RE.search(command) or BULK_RE.search(command) or pathspec_file_is_bulk(command, cwd)):
            return 0

    phantoms = phantom_media(cwd)
    if not phantoms:
        return 0
    sample = ", ".join(phantoms[:3]) + (" …" if len(phantoms) > 3 else "")
    deny(
        "git-lfs is not installed here and %d LFS-tracked media file(s) show as modified (%s). "
        "That is the sandbox's missing smudge filter, not a real change. Never stage, commit, "
        "or checkout-restore them: a committed pointer stub in place of real media fails the "
        "deploy's LFS gate. Add explicit paths to the command that exclude *.m4a *.mp3 *.wav "
        "*.mp4, or do this git work where git-lfs is installed (clerkship-deploy skill, trap 1)."
        % (len(phantoms), sample)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
