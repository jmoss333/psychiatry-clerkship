"""Shared _build/ freshness guard for the bin/ checkers that read the BUILT sites.

WHY IT EXISTS: `_build/` is a gitignored artifact whose age is invisible to `exists()`. A
checker guarded only on existence has two failure modes, and this repo has now been bitten
by both:

  absent  -> it checks nothing and prints a clean bill. `check_design_drift.py` reported
             "design system clean" on a tree with no `_build/` at all, because every
             build-reading rule iterated an empty list. That is a vacuous pass
             (docs/SILENT_SHRINK_CHECKLIST.md D2).
  stale   -> it checks LAST MONTH'S pages and reports today's source as broken. On
             2026-09-16 a `_build/` from 2026-09-03 produced 22 findings -- 10 C4 dark
             orphans and 12 C8 shadowed tokens -- against pages the current source no
             longer emits. Every one was fabricated, and they read as a real regression
             for two days, including in a comparison against clean `main` that "confirmed"
             them (both sides were reading the same stale tree).

The second is the more expensive: a vacuous pass loses coverage quietly, but a stale FAIL
sends someone editing CSS to satisfy findings that do not exist.

WHY mtime: the build writes no stamp of its own. But a build reads its inputs and then
writes its output, so output-mtime >= input-mtime holds for every input a build actually
consumed; only editing a source after the build can invert it. git rewrites mtimes only for
files whose content it changes, so a branch switch stales the build exactly when the sources
really differ.

`_build/<site>/index.html` is the stamp because it is the SPA shell every build regenerates.

This is the Python twin of tests/_build_freshness.mjs, kept deliberately parallel to it.
Each caller declares its OWN inputs -- what staleness means depends on what the caller
reads -- but the comparison itself lives here once.

This is a SKIP guard, never a pass: a caller must run its full assertions when
stale_reason() returns None, and must not report a clean result over what it skipped.
"""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REBUILD = "bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh {site}"


class Undeterminable(Exception):
    """The checker cannot establish what it is supposed to check."""


def newer_input(built_at: float, inputs) -> Path | None:
    """The first declared input that outran the build, or None. Pure, so it is falsifiable.

    A declared path that does not exist RAISES rather than being skipped: a typo in a
    caller's input list would otherwise make the freshness check vacuously "fresh" and
    retire the contract in silence (CLAUDE.md, staleBuildReason paragraph).
    """
    for src in inputs:
        if not src.exists():
            raise Undeterminable(f"declared input does not exist: {src}")
        if src.stat().st_mtime > built_at:
            return src
    return None


def stale_reason(site: str, inputs, build_root: Path | None = None,
                 repo: Path | None = None) -> str | None:
    """None when _build/<site> is current enough to mean something, else why it is not.

    Returning None is the assertion "what this caller is about to read was produced by a
    build that had already seen every input it depends on".
    """
    root = repo if repo is not None else REPO
    stamp = (build_root if build_root is not None else root / "_build" / site) / "index.html"
    if not stamp.exists():
        return f"_build/{site} is not built"
    src = newer_input(stamp.stat().st_mtime, inputs)
    if src is None:
        return None
    try:
        where = src.relative_to(root)
    except ValueError:
        where = src
    return f"_build/{site} is stale ({where} is newer than the build)"
