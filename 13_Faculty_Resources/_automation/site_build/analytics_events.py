#!/usr/bin/env python3
"""Derive the analytics event allowlist.

Page keys come from shipped_pages.json, so "what can be measured" and "what
ships" are the same set by construction (ADR-002). Tool step keys come from the
hand-edited analytics_events.json. The result is bundled with the metrics
function so it can validate offline.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import shipped_pages as sp  # noqa: E402

REGISTRY = os.path.join(HERE, "analytics_events.json")
RELATIVE_ALLOWLIST = os.path.join("metrics", "allowlist.json")
VERSION = 1
SITES = ("ms3", "res")
SEGMENT = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")


class AnalyticsEventsError(Exception):
    pass


def _load_registry():
    try:
        with open(REGISTRY, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise AnalyticsEventsError("analytics_events.json unreadable: %s" % exc)


def _tool_keys(registry):
    """Every tool:<tool>:<step> key. Raises on a malformed tool or step name."""
    tools = registry.get("tools")
    if not isinstance(tools, dict) or not tools:
        raise AnalyticsEventsError("analytics_events.json: tools must be non-empty")
    keys = []
    for tool, steps in tools.items():
        if not SEGMENT.match(tool):
            raise AnalyticsEventsError("illegal tool name: %r" % tool)
        if not isinstance(steps, list) or not steps:
            raise AnalyticsEventsError("tool %s: steps must be a non-empty list" % tool)
        for step in steps:
            if not isinstance(step, str) or not SEGMENT.match(step):
                raise AnalyticsEventsError("tool %s: illegal step %r" % (tool, step))
            keys.append("tool:%s:%s" % (tool, step))
    return sorted(set(keys))


def derive(root=ROOT):
    """Return {"version": 1, "keys": {"ms3": [...], "res": [...]}}."""
    registry = _load_registry()
    tool_keys = _tool_keys(registry)
    document = sp.load_shipped_pages(root)
    keys = {}
    for site in SITES:
        page_keys = ["page:%s" % slug for slug in sp.slugs_for_site(document, site)]
        keys[site] = sorted(set(page_keys) | set(tool_keys))
    return {"version": VERSION, "keys": keys}


def serialize(document):
    return json.dumps(document, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def write(root=ROOT):
    path = os.path.join(os.fspath(root), RELATIVE_ALLOWLIST)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(serialize(derive(root)))
    print("analytics allowlist: wrote %s" % RELATIVE_ALLOWLIST)
    return 0


def check(root=ROOT):
    path = os.path.join(os.fspath(root), RELATIVE_ALLOWLIST)
    try:
        with open(path, encoding="utf-8") as fh:
            on_disk = fh.read()
    except OSError:
        print("analytics allowlist: %s missing — run --write" % RELATIVE_ALLOWLIST)
        return 1
    if on_disk != serialize(derive(root)):
        print("analytics allowlist: %s is stale — run --write" % RELATIVE_ALLOWLIST)
        return 1
    print("analytics allowlist OK — %d ms3 key(s), %d res key(s)"
          % (len(derive(root)["keys"]["ms3"]), len(derive(root)["keys"]["res"])))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Derive the analytics event allowlist.")
    parser.add_argument("--root", default=ROOT)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        return write(args.root) if args.write else check(args.root)
    except (AnalyticsEventsError, sp.ShippedPagesError) as exc:
        print("analytics allowlist: %s" % exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
