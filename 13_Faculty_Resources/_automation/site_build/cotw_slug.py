"""The one Case-of-the-Week slug formula.

WHY THIS MODULE EXISTS: until 2026-09 five files carried their own copy of

    "cotw_%s_%s_%s.md" % (week["date"].replace("-", ""), week["topic"], level)

-- build_deploy.py, resident_section.py, cotw_meta.py,
validate_attestation_consistency.py, and (in JavaScript) content-universe.mjs.
Each copy was correct; the risk was never that one was wrong on the day it was
written, but that a change to the shape would land in four places and not the
fifth. That is the same class of failure that hid 22 pending pages from faculty
attestation for two months (see ADR-002).

The JavaScript side (faculty-console/content-universe.mjs) cannot import this,
so it keeps its own implementation and a parity test that extracts THIS file's
expression and runs it over the real registry.

DECISION: shipped-pages-single-source
"""

__all__ = ["COTW_DIR", "COTW_REGISTRY", "cotw_slug", "cotw_weeks"]

import json
import os

# Where the registry and the weekly case sources live, relative to the repo root.
COTW_DIR = "08_Cases_and_Simulation/case-of-the-week"
COTW_REGISTRY = os.path.join(COTW_DIR, "cotw_registry.json")


def cotw_slug(week, level):
    """Built page name for one registry week at one audience level.

    ``level`` is "ms3" or "res". Python's str.replace with no count replaces
    EVERY hyphen -- the JavaScript twin therefore needs the /g flag.
    """
    return "cotw_%s_%s_%s.md" % (week["date"].replace("-", ""), week["topic"], level)


def cotw_weeks(root):
    """The registry's weeks list, or [] when there is no registry.

    An absent registry means no weekly cases, matching how both build scripts
    read it (``json.load(...).get("weeks", [])``): a repository that has not
    started publishing weekly cases, and the synthetic roots the validator test
    suites build, both land here.
    """
    path = os.path.join(root, COTW_REGISTRY)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as handle:
        registry = json.load(handle)
    weeks = registry.get("weeks", []) if isinstance(registry, dict) else []
    return weeks if isinstance(weeks, list) else []
