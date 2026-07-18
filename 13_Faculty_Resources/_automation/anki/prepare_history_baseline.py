#!/usr/bin/env python3
"""Prepare one explicit, before-release, or audited Anki history baseline."""

from __future__ import annotations

import argparse
from pathlib import Path

from pcl_anki.history import HistoryError, prepare_history_baseline


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    selectors = parser.add_mutually_exclusive_group(required=True)
    selectors.add_argument("--base-ref")
    selectors.add_argument("--before-release-id")
    selectors.add_argument("--audit-lineage", action="store_true")
    args = parser.parse_args()
    try:
        result = prepare_history_baseline(
            args.repo,
            args.out,
            base_ref=args.base_ref,
            before_release_id=args.before_release_id,
            audit_lineage=args.audit_lineage,
        )
    except (HistoryError, ValueError) as error:
        parser.error(str(error))
    print(f"wrote reviewed history baseline: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
