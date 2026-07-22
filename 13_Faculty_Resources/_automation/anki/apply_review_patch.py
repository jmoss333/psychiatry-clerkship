#!/usr/bin/env python3
"""Apply one named, optimistic faculty review patch."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from pcl_anki.review import ReviewPatchError, apply_review_patch


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--repo", required=True, type=Path)
    value.add_argument("--patch", required=True, type=Path)
    value.add_argument("--candidate-dir", type=Path)
    value.add_argument("--history-baseline", type=Path)
    value.add_argument("--prior-release-dir", type=Path)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        changed = apply_review_patch(
            args.repo,
            args.patch,
            candidate_dir=args.candidate_dir,
            history_baseline=args.history_baseline,
            prior_release_dir=args.prior_release_dir,
        )
    except (OSError, ValueError, ReviewPatchError) as error:
        print(f"Anki review patch blocked: {error}", file=sys.stderr)
        return 1
    for key in changed:
        print(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
