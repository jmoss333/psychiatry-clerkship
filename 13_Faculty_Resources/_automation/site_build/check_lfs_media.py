#!/usr/bin/env python3
"""Fail fast when a built site ships Git LFS pointer stubs as media.

Netlify can clone a repo with the text pointer files but without the real LFS
objects. The generic static QA catches this later; this preflight gives a
targeted error that points directly to the LFS recovery steps.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


MEDIA_EXTS = {".m4a", ".mp3", ".wav", ".mp4"}
LFS_HEADER = b"version https://git-lfs"


def is_soft_context() -> bool:
    return os.environ.get("GITHUB_ACTIONS") == "true" or os.environ.get("CONTEXT") == "deploy-preview"


# Directories a worktree scan must not descend into: build output and vendored trees
# carry copies whose stub-ness says nothing about whether git-lfs materialised SOURCE.
WORKTREE_SKIP_DIRS = {".git", "node_modules", "_build", ".venv", "venv", "__pycache__"}

REPO_ROOT = Path(__file__).resolve().parents[3]


def lfs_tracked_extensions(root) -> set[str]:
    """The file extensions .gitattributes actually routes through Git LFS.

    Derived rather than reused from MEDIA_EXTS above: that set is this module's own
    deploy-gate list, and a type added to .gitattributes but not to it would make a
    worktree scan quietly miss the very files git-lfs is failing to materialise.

    Returns an empty set when nothing is tracked or .gitattributes is unreadable.
    Callers must read that as "cannot tell", never as "no stubs" -- see
    worktree_stub_reason(), which turns it into RUN rather than SKIP.
    """
    extensions: set[str] = set()
    try:
        with open(os.path.join(root, ".gitattributes"), encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "filter=lfs" not in line:
                    continue
                pattern = line.split()[0]
                if pattern.startswith("*.") and len(pattern) > 2:
                    extensions.add(pattern[1:].lower())
    except OSError:
        return set()
    return extensions


def worktree_stub_reason(root=None) -> str | None:
    """Why a site build spawned against this working tree cannot run here, or None.

    build_deploy.py gates its required media through welcome_compass.require_real_files(),
    which hard-fails a Git-LFS pointer stub outside the soft contexts is_soft_context()
    names. A machine with no git-lfs installed has no smudge filter, so every LFS-tracked
    file checks out AS its ~133-byte pointer text -- and a build spawned there aborts for
    a reason that has nothing to do with whatever contract the caller meant to pin.

    This exists so such a caller can SKIP, naming the remedy, instead of reporting a
    failure nobody can act on. It is a test-side predicate and NEVER softens the deploy
    gate: production is not a soft context, main() below still exits 1 there, and nothing
    here is consulted on that path.

    Returns None whenever the build would proceed -- no stubs found, or a soft context
    that already tolerates them -- so the default is always to RUN the caller's
    assertions. A tree whose .gitattributes routes nothing through LFS returns None for
    the same reason: "cannot tell" must read as "run and fail loudly", never as "skip".
    """
    if is_soft_context():
        return None
    root = REPO_ROOT if root is None else root
    extensions = lfs_tracked_extensions(root)
    if not extensions:
        return None
    for directory, subdirectories, names in os.walk(root):
        subdirectories[:] = [d for d in subdirectories if d not in WORKTREE_SKIP_DIRS]
        for name in names:
            if os.path.splitext(name)[1].lower() not in extensions:
                continue
            path = os.path.join(directory, name)
            try:
                with open(path, "rb") as handle:
                    if handle.read(len(LFS_HEADER)) != LFS_HEADER:
                        continue
            except OSError:
                continue
            return (
                "git-lfs is not materialising this working tree: %s is a Git-LFS pointer "
                "stub, so a spawned site build aborts in "
                "welcome_compass.require_real_files() before reaching this contract. "
                "Fix with: git lfs install && git lfs pull"
                % os.path.relpath(path, root)
            )
    return None


def main() -> int:
    if len(sys.argv) in (2, 3) and sys.argv[1] == "--worktree-stubs":
        # The JS side of the repo consults this rather than re-deriving "is a pointer
        # stub" for itself; see tests/_lfs_media.mjs. Exit 1 means "a spawned build
        # cannot run here", which is a SKIP signal for tests, not a gate failure.
        # The optional root lets tests drive this predicate against fixture trees, so
        # what they pin is the code the guard actually runs rather than a stand-in.
        reason = worktree_stub_reason(sys.argv[2] if len(sys.argv) == 3 else None)
        if reason:
            print(reason)
            return 1
        return 0

    if len(sys.argv) != 2:
        print(
            "usage: check_lfs_media.py <built-site-dir> | --worktree-stubs [root]",
            file=sys.stderr,
        )
        return 2

    site = Path(sys.argv[1])
    if not site.exists():
        print(f"lfs-media: site dir not found: {site}", file=sys.stderr)
        return 2

    media_files = [p for p in site.rglob("*") if p.is_file() and p.suffix.lower() in MEDIA_EXTS]
    stubs: list[Path] = []
    tiny: list[Path] = []

    for path in media_files:
        try:
            size = path.stat().st_size
            with path.open("rb") as handle:
                head = handle.read(len(LFS_HEADER))
        except OSError as exc:
            print(f"lfs-media: could not read {path}: {exc}", file=sys.stderr)
            return 2
        if head == LFS_HEADER:
            stubs.append(path)
        elif size < 1024:
            tiny.append(path)

    if not stubs:
        print(f"lfs-media: OK — {len(media_files)} media file(s), no Git LFS pointer stubs")
        if tiny:
            print("lfs-media: note — tiny media-like file(s) found, verify intentionally small:")
            for path in tiny[:20]:
                print(f"  - {path.relative_to(site)} ({path.stat().st_size} bytes)")
            if len(tiny) > 20:
                print(f"  ... plus {len(tiny) - 20} more")
        return 0

    level = "WARN" if is_soft_context() else "ERROR"
    print(f"lfs-media: {level} — {len(stubs)} Git LFS pointer stub(s) found in {site}")
    for path in stubs[:40]:
        print(f"  - {path.relative_to(site)}")
    if len(stubs) > 40:
        print(f"  ... plus {len(stubs) - 40} more")
    print(
        "\n"
        "These files are LFS placeholders, not playable media.\n"
        "  0. FIRST check the GitHub Git-LFS BANDWIDTH QUOTA (per account, 10 GB/month, resets\n"
        "     on the 1st): a 90%/100% 'Git LFS bandwidth' email from GitHub means downloads are\n"
        "     refused and every production build fails until the reset or a data pack is bought\n"
        "     (github.com/settings/billing). The 2026-08-30 outage was exactly this. Look for the\n"
        "     'lfs-cache:' lines above — the build pulls media from Netlify's persistent cache and\n"
        "     reports MB downloaded; see NETLIFY_LFS_RUNBOOK.md, 'Incident pattern 2'.\n"
        "  Otherwise, for a genuinely missing object:\n"
        "  1. git lfs install\n"
        "  2. git lfs pull\n"
        "  3. git lfs fsck\n"
        "  4. git lfs push --all origin\n"
        "  5. Confirm the site is on the cached-pull path (lfs_pull_cached.sh runs in the build;\n"
        "     GIT_LFS_ENABLED removed from the site's env vars) — or, on the legacy path,\n"
        "     GIT_LFS_ENABLED=true and GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4\n"
        "  6. Retry the Netlify production deploy without cache if needed\n"
    )
    return 0 if is_soft_context() else 1


if __name__ == "__main__":
    raise SystemExit(main())
