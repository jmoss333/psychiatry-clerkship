#!/usr/bin/env python3
"""Render the Case-of-the-Week archive onto the index page at build time, grouped by topic.

WHY THIS EXISTS. In the learner shell the only way to browse the cases is the index page
(cotw_index.md, placed in the Library's "Evidence & exam" column): the case pages themselves
are not Library-placed, and the legacy nav section that listed them no longer renders. The
index's line-up was hand-written, and on 2026-10-17 it listed 12 of the 17 shipped editions
-- the Sep 7, Sep 23, Sep 28, Oct 5 and Oct 12 cases could be found by search and by the
topic hubs, but not by browsing. A hand-maintained list of a weekly artifact rots by one
line a week; this module makes the index a derivation of the registry, so a case appears
here the week it ships.

WHAT IT RENDERS, at the `<!-- cotw-archive -->` marker in index_ms3.md / index_resident.md:
  1. "Newest case" -- the most recent edition for this site, one line.
  2. "All cases, by topic" -- every shipped edition for this site, grouped under the topic
     hub that claims its registry `topic` (site_build/topic_hubs.json `cotwTopics`; a topic
     claimed by several hubs goes under the first in registry order; an unclaimed topic goes
     under "Other topics"), newest first within a group, each with the registry's own one-line
     summary (`tldr_<level>` / `tldr`, the line cotw_meta.py already renders above the case)
     and "(earlier edition)" on a topic's older editions.

It also hands Today its "new this week" row (newest(): the same newest edition, {slug, title,
date}), injected by build_deploy.py as FD_COTW_NEWEST and shown by fd_today.js only inside the
week after the registry date.

WHAT IT DOES NOT DO. It adds no clinical text: titles come from the shipped listing and the
one-liners are the registry's authored `tldr` fields, rendered a second time. Readers of
"what ships" go through shipped_pages.load_shipped_pages()
(ADR-002); the registry rows (for the blurbs) come through cotw_slug.cotw_weeks(), the one
shared reader, never a second path to the file.

FAILS CLOSED: a shipped case this site carries that the archive would not list, or a marker
absent from an index source, stops the build naming the slug. The unit checks live in
tests/cotw-archive-block.test.mjs (they drive this module through python3 -c), so they run
under `node --test` on every gate; this file deliberately carries no test mode of its own.

DETERMINISM. Nothing here reads the clock; same registries in, byte-identical markdown out.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from cotw_slug import cotw_slug, cotw_weeks  # noqa: E402
from shipped_pages import load_shipped_pages  # noqa: E402

MARKER = "<!-- cotw-archive -->"
INDEX_SLUG = "cotw_index.md"
HUBS = os.path.join(HERE, "topic_hubs.json")
SITES = ("ms3", "res")
OTHER = "Other topics"
NEWEST = "Newest case"
HEADING = "All cases, by topic"
EARLIER = "earlier edition"
# The registry's own one-line summary (cotw_meta.py renders the same field above the case
# prose): the per-level override first, then the shared line. Nothing here is authored twice.
TLDR_KEY = {"ms3": "tldr_ms3", "res": "tldr_res"}
COTW_SLUG_RE = re.compile(r"^cotw_(\d{8})_([a-z0-9]+)_(ms3|res)\.md$")
COTW_TITLE_SUFFIX_RE = re.compile(r"\s+—\s+(MS3|Resident)\s*$")
# "(Oct 12)" at the end of a label; two editions share a subject when their registry topic code
# matches OR their label stems match (the Oct 12 case is coded `safety`, the Jul 23 one
# `suiciderisk`, and both are "Suicide Risk & Safety Planning").
COTW_DATE_SUFFIX_RE = re.compile(r"\s*\([A-Z][a-z]{2} \d{1,2}\)\s*$")


def load(lib_root):
    lib_root = os.fspath(lib_root)
    shipped = {p["slug"]: p for p in load_shipped_pages(lib_root)["pages"]}
    with open(HUBS, encoding="utf-8") as handle:
        hubs = json.load(handle)
    return {"shipped": shipped, "weeks": cotw_weeks(lib_root), "hubs": hubs}


def _topic_groups(hubs):
    """Ordered [(group label, [topic codes])] from the hub registry; first claim wins."""
    claimed = {}
    order = []
    for hub in hubs.get("hubs", []):
        for code in hub.get("cotwTopics") or []:
            if code not in claimed:
                claimed[code] = hub["topic"]
                if hub["topic"] not in order:
                    order.append(hub["topic"])
    return claimed, order


def editions(data, site):
    """Every shipped edition for `site`, newest first, joined to its registry row."""
    rows = []
    by_slug = {}
    for week in data["weeks"]:
        by_slug[cotw_slug(week, site)] = week
    for slug, page in data["shipped"].items():
        match = COTW_SLUG_RE.match(slug)
        if not match or match.group(3) != site:
            continue
        week = by_slug.get(slug)
        if week is None:
            raise SystemExit("cotw archive: shipped case %s has no registry row" % slug)
        rows.append({
            "slug": slug, "date": match.group(1), "topic": match.group(2),
            "title": COTW_TITLE_SUFFIX_RE.sub("", page.get("title") or week.get("label") or slug),
            "blurb": (week.get(TLDR_KEY[site]) or week.get("tldr") or "").strip(),
        })
    rows.sort(key=lambda r: (r["date"], r["slug"]), reverse=True)
    return rows


def model(data, site):
    claimed, order = _topic_groups(data["hubs"])
    rows = editions(data, site)
    groups = {}
    for row in rows:
        label = claimed.get(row["topic"], OTHER)
        groups.setdefault(label, []).append(row)
    ordered = [(label, groups[label]) for label in order if label in groups]
    if OTHER in groups:
        ordered.append((OTHER, groups[OTHER]))
    for _label, items in ordered:
        seen_codes, seen_stems = set(), set()
        for row in items:
            stem = re.sub(r"[^a-z0-9]+", " ", COTW_DATE_SUFFIX_RE.sub("", row["title"]).lower()).strip()
            row["earlier"] = row["topic"] in seen_codes or stem in seen_stems
            seen_codes.add(row["topic"])
            seen_stems.add(stem)
    return {"site": site, "newest": rows[0] if rows else None, "groups": ordered, "count": len(rows)}


def newest(data, site):
    """The newest edition for `site`, reduced to what Today's announcement row needs (fd_today.js
    fdNewCase): {slug, title, date: YYYY-MM-DD}, or None when no edition ships. The registry date
    is the trigger -- the shell shows the row for its FD_NEWCASE_WINDOW_DAYS from that date and
    nothing afterwards -- so a late merge shortens the window rather than extending it. Injected
    by build_deploy.py as FD_COTW_NEWEST; resident_section.py swaps in this site's value."""
    row = model(data, site)["newest"]
    if not row:
        return None
    d = row["date"]
    return {"slug": row["slug"], "title": row["title"], "date": "%s-%s-%s" % (d[:4], d[4:6], d[6:8])}


# Topic and track tags on every row (C2, 2026-10-17): the topic is the hub label the row is grouped
# under; the track is the edition's own site. Build output only, like the rest of this block.
TRACK_TAG = {"ms3": "MS3", "res": "Resident"}


def _line(row, label=None, site=None):
    text = "[%s](?page=%s)" % (row["title"], row["slug"])
    tags = [t for t in (label, TRACK_TAG.get(site)) if t]
    if tags:
        text += " — *%s*" % " · ".join(tags)
    if row["blurb"]:
        text += " — " + row["blurb"]
    if row.get("earlier"):
        text += " *(%s)*" % EARLIER
    return text


def render(data, site):
    m = model(data, site)
    if not m["newest"]:
        return ""
    label_of = {row["slug"]: label for label, items in m["groups"] for row in items}
    newest = m["newest"]
    out = ["**%s:** %s" % (NEWEST, _line(dict(newest, earlier=False), label_of.get(newest["slug"]), site)), ""]
    out.append("### %s" % HEADING)
    out.append("")
    for label, items in m["groups"]:
        out.append("**%s**" % label)
        out.append("")
        for row in items:
            out.append("- " + _line(row, label, site))
        out.append("")
    out.append("*%d cases. Listed from the registry on every build; newest first within each topic.*" % m["count"])
    return "\n".join(out).rstrip("\n")


def inject_markdown(text, data, dst, site):
    """Replace the marker on the index page. Returns (text, injected). Other pages untouched."""
    if os.path.basename(dst) != INDEX_SLUG or MARKER not in text:
        return text, False
    return text.replace(MARKER, render(data, site), 1), True


def assert_complete(text, data, site):
    """Every shipped edition for the site must be linked from the rendered index."""
    missing = [row["slug"] for row in editions(data, site) if "?page=%s)" % row["slug"] not in text]
    if missing:
        raise SystemExit("cotw archive (%s): shipped case(s) not listed on the index: %s"
                         % (site, ", ".join(missing)))


def _lib_root():
    return os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--site", choices=SITES, default="ms3")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    data = load(_lib_root())
    if args.json:
        print(json.dumps({site: model(data, site) for site in SITES}, indent=1, ensure_ascii=False))
        return 0
    print(render(data, args.site))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
