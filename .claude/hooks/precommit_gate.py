#!/usr/bin/env python3
"""pre-commit fast gate (< 2 s). Installed by bin/install-hooks.sh.

Checks STAGED content only, so it is exact about what would enter history:

  block  - a staged media blob that is not a Git-LFS pointer (raw audio would bloat the
           repo; a stub where real media was meant fails the deploy's LFS gate)
  block  - CLAUDE.md and AGENTS.md staged out of parity
  block  - a machine path in a staged .py (CI lint)
  block  - a crisis contact hard-coded on a learner surface (crisis_resources.json only)
  block  - a dose literal in a staged rp-*/-trainer tool or *.pack.json
  block  - a localStorage key outside cw_*/rp_* on a learner surface
  warn   - the PHI heuristic on a learner surface (judgment call; commit proceeds)

Exit 1 blocks the commit. Bypass with `git commit --no-verify` and say so in the PR.
The full gate (validators, node suite, both builds) stays in bin/verify.sh at pre-push.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import clerkship_guards as G  # noqa: E402


def git(args: list[str], root: Path, binary: bool = False):
    proc = subprocess.run(["git"] + args, cwd=root, capture_output=True, timeout=30)
    if proc.returncode != 0:
        return None
    return proc.stdout if binary else proc.stdout.decode("utf-8", "replace")


def staged_blob(rel: str, root: Path) -> bytes | None:
    return git(["show", ":" + rel], root, binary=True)


def main() -> int:
    top = git(["rev-parse", "--show-toplevel"], Path.cwd())
    root = Path(top.strip() if top else ".").resolve()
    listing = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], root)
    if listing is None:
        return 0
    staged = [p for p in listing.split("\0") if p]
    if not staged:
        return 0

    blocks: list[str] = []
    warns: list[str] = []

    if "CLAUDE.md" in staged or "AGENTS.md" in staged:
        a = staged_blob("CLAUDE.md", root)
        b = staged_blob("AGENTS.md", root)
        if a is None or b is None or a != b:
            blocks.append("CLAUDE.md and AGENTS.md are staged out of parity. Run: cp CLAUDE.md AGENTS.md && git add AGENTS.md")

    for rel in staged:
        suffix = Path(rel).suffix.lower()
        if suffix in G.MEDIA_EXTS:
            blob = staged_blob(rel, root)
            if blob is not None and not G.is_lfs_pointer(blob):
                blocks.append(
                    "%s is staged as raw media (%d bytes), not a Git-LFS pointer. Media must be added "
                    "with git-lfs installed so the clean filter stores a pointer; never commit raw audio "
                    "or a hand-made stub." % (rel, len(blob))
                )
            continue
        if suffix not in (".md", ".html", ".js", ".mjs", ".json", ".py", ".txt", ".css"):
            continue
        blob = staged_blob(rel, root)
        if blob is None:
            continue
        text = blob.decode("utf-8", "replace")
        for severity, rule, message in G.run_text_checks(text, rel, root):
            line = "%s: [%s] %s" % (rel, rule, message)
            if severity == "deny":
                blocks.append(line)
            elif rule == "phi-heuristic":
                warns.append(line)
            # instrument-reproduction is an agent-time "ask"; at commit time a human is present.

    for line in warns:
        print("pre-commit WARN  " + line)
    for line in blocks:
        print("pre-commit BLOCK " + line)
    if blocks:
        print("\n%d blocking finding(s). Fix, or `git commit --no-verify` and say so in the PR." % len(blocks))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
