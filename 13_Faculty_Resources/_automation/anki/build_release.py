#!/usr/bin/env python3
"""Build an internal, prepared, or reviewed governed Anki candidate."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
import sys

from pcl_anki.contract import HistoryRegistry
from pcl_anki.history import load_history
from pcl_anki.release import (
    ReleaseOrchestrationError,
    load_release_inputs,
    require_clean_tracked_worktree,
    run_profile,
    validate_history_baseline,
)


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--profile", required=True, choices=("maintenance", "authoring", "prepare", "release"))
    value.add_argument("--repo", required=True, type=Path)
    value.add_argument("--out", required=True, type=Path)
    value.add_argument("--review-out", required=True, type=Path)
    value.add_argument("--candidate-date", type=date.fromisoformat)
    value.add_argument("--build-epoch", type=int)
    value.add_argument("--history-baseline", type=Path)
    value.add_argument("--prior-release-dir", type=Path)
    value.add_argument("--fail-on-hard", action="store_true")
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        repo = args.repo.resolve(strict=True)
        if args.profile in {"prepare", "release"}:
            require_clean_tracked_worktree(repo)
        inputs = load_release_inputs(repo)
        if args.profile == "authoring":
            baseline = HistoryRegistry((), ())
        else:
            if args.history_baseline is None:
                raise ReleaseOrchestrationError(
                    "non-authoring profiles require --history-baseline"
                )
            baseline = load_history(args.history_baseline)
            current = load_history(
                repo / "13_Faculty_Resources" / "anki" / "release_history.json"
            )
            validate_history_baseline(baseline, current)
        run_profile(
            inputs,
            profile=args.profile,
            out=args.out,
            review_out=args.review_out,
            baseline_history=baseline,
            candidate_date=args.candidate_date,
            build_epoch=args.build_epoch,
            fail_on_hard=args.fail_on_hard,
            prior_release_dir=args.prior_release_dir,
            history_baseline_path=args.history_baseline,
        )
    except (OSError, ValueError, ReleaseOrchestrationError) as error:
        print(f"Anki release blocked: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
