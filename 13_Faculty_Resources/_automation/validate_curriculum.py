#!/usr/bin/env python3
"""Validate curriculum.json — the front door's week/library structure.

curriculum.json holds STRUCTURE ONLY. Everything about an item (minutes,
summary, key points, attestation) joins from topic_meta.json at render time,
so this file must never duplicate those facts. What it must guarantee is that
every ref it names is a page the build actually ships:

  - weeks are exactly 1..6, each present once
  - every item ref resolves to a slug in site_manifest.json
  - item kind agrees with the slug's type (.html => tool, .md => read)
  - refs within a week are unique

Exits non-zero and prints every violation.
Usage:  python3 validate_curriculum.py [curriculum.json] [site_manifest.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

cur_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "curriculum.json")
man_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    REPO, "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json")

if not os.path.exists(cur_path):
    print("curriculum.json not found at %s — nothing to validate (skipping)." % cur_path)
    sys.exit(0)

cur = json.load(open(cur_path, encoding="utf-8"))
man = json.load(open(man_path, encoding="utf-8"))

tool_slugs = {e[1] for e in man.get("tools", [])}
md_slugs = {e[1] for e in man.get("md", [])}
shipped = tool_slugs | md_slugs

errs = []


def bad(where, msg):
    errs.append("%s: %s" % (where, msg))


# ---- weeks are exactly 1..6, each present once ----
weeks = cur.get("weeks")
if not isinstance(weeks, list):
    bad("weeks", "must be a list")
    weeks = []
seen_n = []
for idx, w in enumerate(weeks):
    if not isinstance(w, dict):
        continue
    n = w.get("n")
    # bool is a subclass of int in Python, so isinstance(True, int) is True —
    # exclude it explicitly or a week with "n": true would silently count as week 1.
    if isinstance(n, bool) or not isinstance(n, int):
        bad("weeks", "week at index %d has a missing or non-integer 'n' (got %r)" % (idx, n))
        continue
    seen_n.append(n)
if sorted(seen_n) != [1, 2, 3, 4, 5, 6]:
    bad("weeks", "week numbers must be exactly 1..6 with no gaps or duplicates, got %s"
        % sorted(seen_n))

# ---- every item ref is shipped, and kind agrees with slug type ----
for w in weeks:
    if not isinstance(w, dict):
        bad("weeks", "each week must be an object")
        continue
    label = "week %s" % w.get("n")
    for field in ("title", "theme"):
        if not isinstance(w.get(field), str) or not w.get(field):
            bad(label, "'%s' must be a non-empty string" % field)
    items = w.get("items")
    if not isinstance(items, list):
        bad(label, "'items' must be a list")
        continue
    seen_refs = set()
    for it in items:
        if not isinstance(it, dict):
            bad(label, "each item must be an object")
            continue
        ref, kind = it.get("ref"), it.get("kind")
        if ref in seen_refs:
            bad(label, "duplicate ref '%s' within the week" % ref)
        seen_refs.add(ref)
        if ref not in shipped:
            bad(label, "ref '%s' is not a shipped slug in site_manifest.json" % ref)
            continue
        expected = "tool" if ref in tool_slugs else "read"
        if kind != expected:
            bad(label, "ref '%s' has kind '%s' but the manifest ships it as '%s'"
                % (ref, kind, expected))

# ---- library totality: every shipped slug is placed or explicitly excluded ----
# The front-door analogue of the build's orphaned-source check. Once the sidebar is
# gone the Library is the only browse surface, so an unplaced page is an unreachable
# page. The exclude list keeps this a HARD failure instead of a rule that gets quietly
# weakened for the handful of pages that genuinely are not library content.
placed = set()
columns = cur.get("libraryColumns")
if not isinstance(columns, list):
    bad("libraryColumns", "must be a list")
    columns = []
for col in columns:
    if not isinstance(col, dict):
        bad("libraryColumns", "each column must be an object")
        continue
    name = col.get("name") or "?"
    refs = col.get("refs")
    if not isinstance(refs, list):
        bad("column %s" % name, "'refs' must be a list")
        continue
    for ref in refs:
        if ref not in shipped:
            bad("column %s" % name, "ref '%s' is not a shipped slug" % ref)
        else:
            placed.add(ref)

excluded = set()
exclude = cur.get("libraryExclude")
if not isinstance(exclude, list):
    bad("libraryExclude", "must be a list")
    exclude = []
for ent in exclude:
    if not isinstance(ent, dict):
        bad("libraryExclude", "each entry must be an object")
        continue
    ref = ent.get("ref")
    if not isinstance(ent.get("reason"), str) or not ent.get("reason").strip():
        bad("libraryExclude", "entry '%s' needs a non-empty 'reason'" % ref)
    if ref not in shipped:
        bad("libraryExclude", "ref '%s' is not a shipped slug" % ref)
    else:
        excluded.add(ref)

for ref in sorted(shipped - placed - excluded):
    bad("library", "shipped slug '%s' appears in no column and no libraryExclude entry"
        % ref)

if errs:
    print("curriculum.json INVALID — %d issue(s):" % len(errs))
    for e in errs:
        print("  -", e)
    sys.exit(1)

total = sum(len(w.get("items", [])) for w in weeks if isinstance(w, dict))
print("curriculum.json OK — 6 weeks, %d week items, %d pages placed, %d excluded."
      % (total, len(placed), len(excluded)))
