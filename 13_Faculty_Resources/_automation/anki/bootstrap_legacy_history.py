#!/usr/bin/env python3
"""Mechanically bootstrap truthful Anki history from both frozen legacy packages."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from pcl_anki.history import (
    LegacyBootstrapError,
    bootstrap_legacy_history,
    write_history,
)


def _package(value: str) -> tuple[str, Path]:
    label, separator, raw_path = value.partition("=")
    if not separator or label not in {"standalone", "combined"} or not raw_path:
        raise argparse.ArgumentTypeError(
            "package must be standalone=PATH or combined=PATH"
        )
    return label, Path(raw_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", action="append", type=_package, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--released-at", type=date.fromisoformat, required=True)
    parser.add_argument("--release-epoch", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    packages = dict(args.package)
    if len(packages) != len(args.package):
        parser.error("each legacy package label may be supplied only once")
    try:
        history = bootstrap_legacy_history(
            packages,
            source_commit=args.source_commit,
            shipped_at=args.released_at,
            release_id=args.release_id,
            release_epoch=args.release_epoch,
        )
        write_history(args.out, history)
    except LegacyBootstrapError as error:
        parser.error(str(error))
    print(
        f"wrote {args.out}: {len(history.identity_entries)} unique identities, "
        f"{len(history.releases)} legacy release"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
