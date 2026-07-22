#!/usr/bin/env python3
"""Render a self-contained faculty clinic from a governed proposal."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from pcl_anki.review import ReviewPatchError, build_review_html


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--repo", required=True, type=Path)
    source = value.add_mutually_exclusive_group(required=True)
    source.add_argument("--candidate", type=Path)
    source.add_argument("--pilot", type=Path)
    value.add_argument("--out", required=True, type=Path)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        args.repo.resolve(strict=True)
        source = args.candidate or args.pilot
        value = json.loads(source.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ReviewPatchError("review candidate root must be an object")
        rendered = build_review_html(value)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered, encoding="utf-8")
    except (OSError, UnicodeError, json.JSONDecodeError, ReviewPatchError) as error:
        print(f"Anki review clinic blocked: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
