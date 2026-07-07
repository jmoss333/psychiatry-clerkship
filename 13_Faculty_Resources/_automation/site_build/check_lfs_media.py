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


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_lfs_media.py <built-site-dir>", file=sys.stderr)
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
        "These files are LFS placeholders, not playable media. For production deploys:\n"
        "  1. git lfs install\n"
        "  2. git lfs pull\n"
        "  3. git lfs fsck\n"
        "  4. git lfs push --all origin\n"
        "  5. Confirm Netlify env vars: GIT_LFS_ENABLED=true and "
        "GIT_LFS_FETCH_INCLUDE=*.m4a,*.mp4\n"
        "  6. Retry the Netlify production deploy without cache if needed\n"
    )
    return 0 if is_soft_context() else 1


if __name__ == "__main__":
    raise SystemExit(main())
