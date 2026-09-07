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
    "stages"    : list[str]  workflowStages override; defaults to a base set plus whatever
                             the row's "blueprint" codes imply (see _BLUEPRINT_STAGES)
    "workflow"  : dict       clinicalWorkflow override, merged OVER the derived default so a
                             row can replace just one key (e.g. only "safety") and inherit
                             the rest

WORKFLOW METADATA (workflowStages + clinicalWorkflow)
    check-static-site.mjs reports `workflow metadata coverage: N/M nav markdown pages` and
    names every page missing either field. Core topic pages carry both; without derivation
    each weekly case would land in that list forever, one more page per week. So both fields
    are derived here too, on the same terms as the rest of the entry.

    The derived clinicalWorkflow deliberately describes HOW TO USE THE CASE at each stage
    rather than asserting topic-specific clinical content. cotw_meta.py does not read the
    case prose, so anything topic-specific it emitted would be invention; the one genuinely
    case-specific line it can honestly carry is the registry's own "tldr", which is authored
    with the case. A week that deserves richer, topic-specific workflow text sets "workflow"
    in the registry and that wins, key by key.

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

# workflowStages enum (topic_meta.schema.json) — tuple, not set, so emitted order is stable
# and matches the schema's own ordering rather than hash order.
STAGE_VOCAB = ("encounter", "diagnosis", "safety", "treatment",
               "communication", "family", "team", "exam")

# clinicalWorkflow accepts exactly these keys; "actions" is the only non-string value.
WORKFLOW_KEYS = ("ask", "mse", "safety", "say", "collateral", "rounds", "exam", "actions")

# Every case, whatever its topic, has a stem to work, a ranked differential, a
# workup-and-management ladder, facilitator notes, and teaching points.
_BASE_STAGES = ("diagnosis", "treatment", "team", "exam")

# Extra stages implied by the row's shelfBlueprint codes. Blueprint codes with no entry here
# (mood, psychosis, anxiety, neurocog, pharm, ...) add nothing beyond the base set.
_BLUEPRINT_STAGES = {
    "safety": ("safety",),
    "substance": ("safety",),
    "personality": ("communication",),
    "relational": ("communication", "family"),
    "childdev": ("family",),
    "ethics": ("communication",),
}

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


# Built page name. Re-exported from the one shared formula (site_build/cotw_slug.py)
# rather than restated: this module's callers import cotw_meta.cotw_slug, and a private
# copy here is exactly the drift ADR-002 closes.
from cotw_slug import cotw_slug  # noqa: F401  (re-exported for this module's callers)


def _clean(values, vocab):
    if not isinstance(values, list):
        return []
    return [v for v in values if isinstance(v, str) and v in vocab]


def stages_for(week):
    """workflowStages for one case.

    Registry "stages" wins outright when it contains at least one valid code; otherwise the
    base set is unioned with whatever the row's blueprint codes imply. Emitted in schema-enum
    order so the field is stable across rebuilds (no spurious diffs in the built artifact).
    """
    override = _clean(week.get("stages"), set(STAGE_VOCAB))
    if override:
        chosen = set(override)
    else:
        chosen = set(_BASE_STAGES)
        for code in _clean(week.get("blueprint"), SHELF_VOCAB):
            chosen.update(_BLUEPRINT_STAGES.get(code, ()))
    return [s for s in STAGE_VOCAB if s in chosen]


def _clean_workflow(value):
    """Keep only schema-legal clinicalWorkflow keys/shapes from a registry override."""
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, val in value.items():
        if key not in WORKFLOW_KEYS:
            continue
        if key == "actions":
            acts = [a for a in val
                    if isinstance(a, dict)
                    and isinstance(a.get("label"), str)
                    and isinstance(a.get("href"), str)] if isinstance(val, list) else []
            if acts:
                out[key] = acts
        elif isinstance(val, str) and val.strip():
            out[key] = val
    return out


def workflow_for(week, level, tldr):
    """clinicalWorkflow for one case.

    Describes how to work the case at each stage. Topic-specific content comes only from the
    registry's own `tldr` (authored with the case) — see the module docstring on why nothing
    else here is topic-specific. A registry "workflow" object is merged over the result, so a
    row can override one key and inherit the rest.
    """
    is_ms3 = level == "ms3"
    derived = {
        "ask": "Work the stem cold: take your own history, commit to a differential, and name "
               "your next step before reading a single teaching point. The guided questions "
               "are written to be answered, not skimmed.",
        "mse": "Say out loud what each exam finding in the vignette rules in and rules out — "
               "the discrimination between look-alike syndromes is what the case is drilling.",
        "safety": "Safety content in every case is oriented to recognition, escalation, and "
                  "safety planning. Escalate to your supervising resident or attending rather "
                  "than managing acuity alone.",
        "say": "Before moving on, rehearse one sentence you would actually say to this patient "
               "or family, in plain language and out loud.",
        "collateral": "Ask yourself what collateral would change your differential here, and "
                      "who you would have to call to get it.",
        "rounds": ("Use the ranked differential and the workup-and-management ladder as the "
                   "spine of your presentation; lead with the finding that changes management."
                   if is_ms3 else
                   "If you are running the session, the facilitator notes flag the errors this "
                   "case most often surfaces and the evidence-quality distinctions worth "
                   "naming out loud."),
        "exam": ("Shelf-level takeaway: %s" if is_ms3 else "Teaching takeaway: %s") % tldr,
        "actions": [{"label": "All Case of the Week cases", "href": "?page=cotw_index.md"}],
    }
    derived.update(_clean_workflow(week.get("workflow")))
    return derived


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
        "workflowStages": stages_for(week),
        "clinicalWorkflow": workflow_for(week, level, tldr.rstrip(". ") + "."),
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
