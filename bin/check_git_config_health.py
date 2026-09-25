#!/usr/bin/env python3
"""check_git_config_health.py — is the SHARED .git/config still this repository's own?

Every worktree of this repo (the primary checkout, .claude/worktrees/*, .worktrees/*) reads one
.git/config. A test fixture that inherits a hook's GIT_DIR writes its throwaway settings there
instead of into its temp repo, and twice that has broken every session at once:

  2026-08-20  core.bare = true, [user] Fixture / fixture@example.invalid
  2026-09-24  core.bare = true, [user] Synthetic Tester / synthetic@example.invalid, and
              [filter "lfs"] clean = smudge = process = cat, required = false

core.bare=true (with extensions.worktreeConfig on) makes every linked worktree report "must be
run in a work tree", which the pre-push hook of the day read as "no gate here" and waved pushes
through. A fixture [user] silently re-authors commits. A repo-level `filter.lfs.* = cat`
overrides the global git-lfs filters: checkouts produce pointer stubs and `git add` of media
would commit raw binaries past LFS. None of the three announces itself.

This checks for exactly those three shapes, in the common config and in this worktree's
config.worktree:
  * core.bare = true;
  * a repository-level user.name / user.email that is a fixture's — an address on a domain
    reserved for testing and documentation (RFC 2606 / RFC 6761: *.invalid, *.test,
    *.example, *.localhost, example.com/.net/.org) or a one-letter TLD (a@b.c), or a name
    containing "fixture" / "synthetic", or the bare fixture names "t" and "test";
  * a repository-level filter.lfs.clean / smudge / process that is not a git-lfs command, or
    filter.lfs.required = false.
It locates the config by reading .git files, not by asking git, so it still works when
core.bare=true is exactly what broke git.

Exit 0 healthy · 1 a finding (each printed with the command that repairs it) · 2 could not
check (no .git, an unreadable config). bin/verify.sh runs it FIRST, so a broken config is named
before forty steps fail for no stated reason, and LAST, so a suite that corrupts the config
during the run fails the run instead of leaving the damage for the next session. The
SessionStart hook prints it too. It repairs nothing: the shared config is every session's, and
the right [user] values are the owner's to restore.

    python3 bin/check_git_config_health.py [--root DIR]
    python3 bin/check_git_config_health.py --self-test
"""

import argparse
import contextlib
import io
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

RESERVED_EMAIL = re.compile(
    r"@(?:[^@\s]+\.)?(?:invalid|test|example|localhost)$"   # RFC 2606 / 6761 TLDs
    r"|@(?:[^@\s]+\.)?example\.(?:com|net|org)$"            # RFC 2606 second-level names
    r"|@(?:[^@\s]+\.)+[a-z]$",                              # one-letter TLD: a@b.c
    re.IGNORECASE)
FIXTURE_NAME = re.compile(r"fixture|synthetic|^(?:t|test)$", re.IGNORECASE)
LFS_COMMANDS = ("clean", "smudge", "process")


class CannotCheck(Exception):
    pass


def config_files(root):
    """(common config, this worktree's config.worktree or None), read from the .git on disk."""
    dot_git = Path(root) / ".git"
    if dot_git.is_dir():
        git_dir = common = dot_git
    elif dot_git.is_file():
        line = dot_git.read_text(encoding="utf-8").strip()
        if not line.startswith("gitdir:"):
            raise CannotCheck(f"{dot_git} is not a gitdir pointer: {line[:80]!r}")
        git_dir = (dot_git.parent / line.split(":", 1)[1].strip()).resolve()
        pointer = git_dir / "commondir"
        common = (git_dir / pointer.read_text(encoding="utf-8").strip()).resolve() if pointer.is_file() else git_dir
    else:
        raise CannotCheck(f"no .git under {root}")
    config = common / "config"
    if not config.is_file():
        raise CannotCheck(f"no config at {config}")
    worktree = git_dir / "config.worktree"
    return config, (worktree if worktree.is_file() else None)


def read_config(path):
    """[(key, value)] exactly as the file says, via git's own parser, blind to any repo env."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    proc = subprocess.run(["git", "config", "--file", str(path), "--list", "-z"],
                          capture_output=True, text=True, cwd=tempfile.gettempdir(), env=env)
    if proc.returncode != 0:
        raise CannotCheck(f"git could not read {path}: {proc.stderr.strip()}")
    pairs = []
    for record in filter(None, proc.stdout.split("\0")):
        key, _, value = record.partition("\n")
        pairs.append((key.lower(), value))
    return pairs


def findings_for(path, pairs):
    out, shown = [], f'"{path}"'
    for key, value in pairs:
        if key == "core.bare" and value.strip().lower() in ("true", "yes", "on", "1"):
            out.append(f"{path}: core.bare = {value} — every linked worktree now reports 'must be run in "
                       f"a work tree'.\n    repair: git config --file {shown} core.bare false")
        elif key == "user.email" and RESERVED_EMAIL.search(value.strip()):
            out.append(f"{path}: user.email = {value} is a test fixture's address, set at repository "
                       f"level.\n    repair: restore this repo's own identity if it had one "
                       f"(git config --file {shown} user.email <yours>), else "
                       f"git config --file {shown} --unset user.email")
        elif key == "user.name" and FIXTURE_NAME.search(value.strip()):
            out.append(f"{path}: user.name = {value} is a test fixture's name, set at repository "
                       f"level.\n    repair: restore this repo's own identity if it had one "
                       f"(git config --file {shown} user.name <yours>), else "
                       f"git config --file {shown} --unset user.name")
        elif key in (f"filter.lfs.{c}" for c in LFS_COMMANDS) and not value.strip().startswith("git-lfs "):
            out.append(f"{path}: {key} = {value!r} overrides git-lfs for every worktree (checkouts "
                       f"become pointer stubs; `git add` of media bypasses LFS).\n    repair: "
                       f"git config --file {shown} --remove-section filter.lfs")
        elif key == "filter.lfs.required" and value.strip().lower() in ("false", "no", "off", "0"):
            out.append(f"{path}: filter.lfs.required = {value} lets a missing git-lfs pass silently.\n"
                       f"    repair: git config --file {shown} --remove-section filter.lfs")
    return out


def check(root):
    """(findings, the files examined). Raises CannotCheck."""
    files = [p for p in config_files(root) if p]
    findings = []
    for path in files:
        findings.extend(findings_for(path, read_config(path)))
    return findings, files


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", default=str(REPO), help="worktree to check (default: this one)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    try:
        findings, files = check(args.root)
    except (CannotCheck, OSError) as exc:
        print(f"git config health: COULD NOT CHECK — {exc}")
        return 2
    examined = " + ".join(str(p) for p in files)
    if not findings:
        print(f"git config healthy — {examined}: no core.bare=true, fixture identity or non-git-lfs filter")
        return 0
    print(f"GIT CONFIG CORRUPTED — {len(findings)} finding(s) in {examined}")
    print("  Shared by every worktree of this repo. Most likely a test fixture ran git with an inherited")
    print("  GIT_DIR (bin/verify.sh's header explains how). Repair per line, never by restoring a whole-file")
    print("  backup — other sessions append [branch] sections to this file while you work:")
    for finding in findings:
        print("  - " + finding)
    # Last line too: bin/verify.sh shows only the tail of a failing step.
    print(f"GIT CONFIG CORRUPTED — {len(findings)} finding(s) above; repair each line, then re-run")
    return 1


# ------------------------------------------------------------------------- self-test

def self_test():
    failures, total = [], []

    def expect(name, got, want):
        total.append(name)
        if got != want:
            failures.append(f"{name}: got {got!r}, want {want!r}")

    def repo_with(tmp, name, lines, worktree_lines=None, linked=False):
        root = Path(tmp) / name
        common = root / ".git"
        common.mkdir(parents=True)
        (common / "config").write_text("\n".join(lines) + "\n", encoding="utf-8")
        if not linked:
            return root
        wt = Path(tmp) / f"{name}-wt"
        gitdir = common / "worktrees" / "wt"
        gitdir.mkdir(parents=True)
        (gitdir / "commondir").write_text("../..\n", encoding="utf-8")
        if worktree_lines is not None:
            (gitdir / "config.worktree").write_text("\n".join(worktree_lines) + "\n", encoding="utf-8")
        wt.mkdir()
        (wt / ".git").write_text(f"gitdir: {gitdir}\n", encoding="utf-8")
        return wt

    def run(root):
        try:
            findings, _ = check(root)
        except CannotCheck:
            return "cannot-check"
        return sorted({f.split(": ", 1)[1].split(" ", 1)[0] for f in findings})

    healthy = ["[core]", "\tbare = false", "[user]", "\tname = jmoss333",
               "\temail = 208358262+jmoss333@users.noreply.github.com",
               '[filter "lfs"]', "\tclean = git-lfs clean -- %f", "\tsmudge = git-lfs smudge --skip -- %f",
               "\tprocess = git-lfs filter-process --skip", "\trequired = true"]
    incident = ["[core]", "\tbare = true", "[user]", "\temail = synthetic@example.invalid",
                "\tname = Synthetic Tester", '[filter "lfs"]', "\tclean = cat", "\tsmudge = cat",
                "\tprocess = cat", "\trequired = false"]
    with tempfile.TemporaryDirectory() as tmp:
        expect("the owner's identity and git-lfs's own filters are healthy",
               run(repo_with(tmp, "healthy", healthy)), [])
        expect("the 2026-09-24 config: all five keys found",
               run(repo_with(tmp, "incident", incident)),
               ["core.bare", "filter.lfs.clean", "filter.lfs.process", "filter.lfs.required",
                "filter.lfs.smudge", "user.email", "user.name"])
        expect("the 2026-08-20 identity",
               run(repo_with(tmp, "aug20", ["[user]", "\tname = Fixture", "\temail = fixture@example.invalid"])),
               ["user.email", "user.name"])
        expect("the 09-23 author (t <a@b.c>) as a config identity",
               run(repo_with(tmp, "sep23", ["[user]", "\tname = t", "\temail = a@b.c"])),
               ["user.email", "user.name"])
        for email in ("x@example.test", "x@sub.example.com", "x@localhost.localhost", "x@example"):
            expect(f"reserved address {email}",
                   run(repo_with(tmp, "e" + str(len(total)), ["[user]", f"\temail = {email}"])), ["user.email"])
        for email in ("someone@tufts.edu", "a@b.co", "208358262+jmoss333@users.noreply.github.com"):
            expect(f"a real address is not a fixture: {email}",
                   run(repo_with(tmp, "r" + str(len(total)), ["[user]", f"\temail = {email}"])), [])
        expect("a linked worktree resolves the COMMON config through .git + commondir",
               run(repo_with(tmp, "linked", ["[core]", "\tbare = true"], linked=True)), ["core.bare"])
        expect("this worktree's config.worktree is examined too",
               run(repo_with(tmp, "wtcfg", healthy, worktree_lines=["[core]", "\tbare = true"], linked=True)),
               ["core.bare"])
        expect("no .git at all is could-not-check, never healthy", run(Path(tmp) / "nowhere"), "cannot-check")
        bad = Path(tmp) / "badptr"
        bad.mkdir()
        (bad / ".git").write_text("not a pointer\n", encoding="utf-8")
        expect("a malformed .git pointer is could-not-check", run(bad), "cannot-check")
        garbled = repo_with(tmp, "garbled", ["[core", "bare = true"])
        expect("a config git cannot parse is could-not-check", run(garbled), "cannot-check")
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            expect("CLI: healthy exits 0", main(["--root", str(Path(tmp) / "healthy")]), 0)
            expect("CLI: the incident exits 1", main(["--root", str(Path(tmp) / "incident")]), 1)
            expect("CLI: could-not-check exits 2", main(["--root", str(Path(tmp) / "nowhere")]), 2)
        expect("CLI: the incident's report names the repair command",
               "core.bare false" in printed.getvalue() and "--remove-section filter.lfs" in printed.getvalue(), True)
    for failure in failures:
        print("FAIL " + failure)
    print(f"self-test: {len(total) - len(failures)}/{len(total)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
