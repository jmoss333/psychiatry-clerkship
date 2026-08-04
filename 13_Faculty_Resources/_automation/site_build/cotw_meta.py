#!/usr/bin/env python3
"""Derive topic_meta entries for Case of the Week pages from cotw_registry.json.

WHY THIS EXISTS
    Every cotw page is generated weekly under a fresh slug (cotw_<YYYYMMDD>_<topic>_ms3.md).
    check-static-site.mjs warns `metadata missing (topic_meta): <slug>` for any nav markdown
    page with no topic_meta entry, so without this module someone has to hand-add two keys to
    topic_meta.json every single week — recurring toil, and the warning returns the moment it
    is forgotten. Instead the entry is DERIVED at build time from the registry the weekly
    automation already writes, and injected into the built site's topic_meta.json.

    Net effect: the weekly job keeps doing exactly what it does today (prepend one object to
    "weeks", drop two .md files) and the metadata gap never reappears.

OPTIONAL PER-WEEK REGISTRY FIELDS — every one has a safe default, so an entry written the
old way still builds and still clears the warning:

    "blueprint" : list[str]  shelfBlueprint codes — this is what joins cases to the
                             curriculum crosswalk (see CROSSWALK_TAXONOMY.md)
    "epa"       : list[str]  AAMC Core EPA codes, EPA1..EPA13
    "read"      : int        estimated read time in minutes
    "tldr"      : str        one-line summary rendered above the prose

Vocabulary matches validate_topic_meta.py exactly. Unknown codes are DROPPED rather than
shipped, so a typo in the registry degrades to "no crosswalk tag" instead of breaking a build.

safetyLevel is deliberately never "high" here: validate_topic_meta.py requires non-empty
evidenceIds + facultyReview.lastReviewed on high-risk pages, and cotw cases carry their own
inline reference lists rather than evidence_registry ids. Cases that warrant "high" should get
real evidenceIds first.
"""

import json
import os

# Controlled vocabulary — keep in sync with validate_topic_meta.py and crosswalk_apply.py.
SHELF_VOCAB = {"mood", "psychosis", "anxiety", "substance", "neurocog", "pharm",
               "safety", "personality", "childdev", "otherdx", "ethics", "relational"}
EPA_VOCAB = {"EPA%d" % i for i in range(1, 14)}

LEVELS = ("ms3", "res")
_LEVEL_LABEL = {"ms3": "MS3 / Step 2 CK level", "res": "Resident level"}
_DEFAULT_READ = {"ms3": 8, "res": 10}

REGISTRY_REL = "08_Cases_and_Simulation/case-of-the-week/cotw_registry.json"


def load_weeks(lib):
    """Read the registry's weeks array. Returns [] if the registry is absent."""
    path = os.path.join(lib, REGISTRY_REL)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return json.load(fh).get("weeks", [])


def cotw_slug(week, level):
    """Built page name. Mirrors _cotw_slug() in build_deploy.py / resident_section.py."""
    return "cotw_%s_%s_%s.md" % (week["date"].replace("-", ""), week["topic"], level)


def _clean(values, vocab):
    if not isinstance(values, list):
        return []
    return [v for v in values if isinstance(v, str) and v in vocab]


def entry_for(week, level):
    """Build one topic_meta entry for a single case at one learner level."""
    label = week.get("label") or week.get("topic", "Case of the Week")
    read = week.get("read")
    if not isinstance(read, int):
        read = _DEFAULT_READ[level]

    tldr = week.get("tldr")
    if not isinstance(tldr, str) or not tldr.strip():
        tldr = "Case of the Week — %s. Guided discussion questions, a ranked differential, and a workup-and-management ladder." % label

    entry = {
        "read": read,
        "hy": False,
        "tldr": tldr,
        "points": [
            "~20-30 minute small-group discussion - no pre-reading required.",
            "De-identified synthetic case; each discussion question is paired with a teaching point.",
            "%s. Facilitator notes are kept separate from the learner-facing stem." % _LEVEL_LABEL[level],
        ],
        "safetyLevel": "moderate",
        "facultyReview": {
            "status": "pending",
            "reviewer": "Joshua Moss, MD",
            "lastReviewed": week.get("date", ""),
        },
        "cotwLevel": level,
        "cotwDate": week.get("date", ""),
    }

    shelf = _clean(week.get("blueprint"), SHELF_VOCAB)
    if shelf:
        entry["shelfBlueprint"] = shelf
    epa = _clean(week.get("epa"), EPA_VOCAB)
    if epa:
        entry["epa"] = epa
    return entry


def inject(out_dir, weeks, level, prune_other_levels=True):
    """Merge derived cotw entries into <out_dir>/topic_meta.json.

    Existing hand-written entries win: if a slug is already present in topic_meta.json,
    it is left completely alone, so a case can always be curated by hand when it deserves
    more than the derived default.

    The resident build inherits the MS3 build tree wholesale, so by default we also drop
    the other level's cotw keys — they are dead weight in the published artifact.

    Returns (added, skipped, pruned, untagged) where `untagged` lists slugs that got no
    shelfBlueprint because the registry row omitted (or misspelled) "blueprint" — surfaced by
    the callers so a forgotten tag shows up in the build log instead of silently shipping a
    case that is missing from the curriculum crosswalk.
    """
    path = os.path.join(out_dir, "topic_meta.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            meta = json.load(fh)
    else:
        meta = {}

    pruned = 0
    if prune_other_levels:
        for other in (l for l in LEVELS if l != level):
            suffix = "_%s.md" % other
            for key in [k for k in meta if k.startswith("cotw_") and k.endswith(suffix)]:
                del meta[key]
                pruned += 1

    added = skipped = 0
    untagged = []
    for week in weeks:
        try:
            slug = cotw_slug(week, level)
        except (KeyError, TypeError, AttributeError):
            continue  # malformed registry row — the build scripts will surface it
        if slug in meta:
            skipped += 1
            continue
        entry = entry_for(week, level)
        meta[slug] = entry
        added += 1
        if not entry.get("shelfBlueprint"):
            untagged.append(slug)

    with open(path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False)
    return added, skipped, pruned, untagged
