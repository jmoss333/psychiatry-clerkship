#!/usr/bin/env python3
"""Build the FD_PRESENTING payload: "Presenting tomorrow" (F4, 2026-10-18).

THE CLINICAL JOB. "I'm presenting a new admission with first-episode psychosis tomorrow" /
"my mania patient is day 4". The night before, a learner needs the syndrome's own what-to-ask,
what-to-examine, what-to-rule-out, how-to-present, the words for the patient, the collateral
plan -- and the one case, the one conversation drill, the one family scenario that match.

WHERE IT LIVES. Under Today's "What am I preparing for?" chooser: choosing "Before rounds"
offers "Presenting a specific patient? Pick the syndrome", then a hospital phase. The shell
renders the card (fd_today.js fdPrepCard) from data it already has at first paint:
  - the syndrome's attested topic_meta record (FD_TOPIC_META): clinicalWorkflow, firstMove,
    ruleOut, epa -- the SAME text the topic page's "On the unit" card shows, never re-authored;
  - the hub's Case-of-the-Week editions (FD_INDEX.cotwForTopic, C2);
  - this payload: which fields and links each phase shows (presenting_tomorrow.json), the
    syndromes that qualify on this site, and the case titles the registries carry.

WHAT QUALIFIES. A topic hub (topic_hubs.json) that ships on the site and whose record carries a
clinicalWorkflow block, minus presenting_tomorrow.json `exclude`. A hub without the block simply
does not appear -- it is never padded. The build FAILS if any syndrome x phase cell would render
fewer than `minItems` items on either site, so the chooser can never offer a thin card.

NO NEW CONTENT, NO ATTESTATION MOVEMENT: this reads registries and writes a needle into the
built shell (build_deploy.py / resident_section.py). Deterministic: nothing reads the clock.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from shipped_pages import load_shipped_pages  # noqa: E402
from topic_hub_block import cotw_for_topics  # noqa: E402

REGISTRY = os.path.join(HERE, "presenting_tomorrow.json")
HUBS = os.path.join(HERE, "topic_hubs.json")
SITES = ("ms3", "res")
TOOL_COMM = "communication-practice.html"
TOOL_FAMILY = "family-systems.html"
WORKFLOW_KEYS = ("ask", "mse", "safety", "say", "collateral", "rounds", "exam")
TEXT_FIELDS = WORKFLOW_KEYS + ("firstMove", "ruleOut")
LINK_KINDS = ("guide", "cotw", "comm", "family", "actions")
AUDIENCE_RE = re.compile(r"MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford", re.I)
HREF_RE = re.compile(r"^\?(page|tool)=([^&#]+)")


def _read(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def load(lib_root):
    lib_root = os.fspath(lib_root)
    return {
        "registry": _read(REGISTRY),
        "hubs": _read(HUBS),
        "shipped": {p["slug"]: p for p in load_shipped_pages(lib_root)["pages"]},
        "topic_meta": _read(os.path.join(lib_root, "topic_meta.json")),
        "comm": {c["id"]: c for c in _read(os.path.join(lib_root, "communication_cases.json")).get("cases", [])},
        "family": {s["id"]: s for s in _read(os.path.join(lib_root, "family_systems_scenarios.json")).get("scenarios", [])},
    }


def _ships(data, ref, site):
    return site in (data["shipped"].get(ref) or {}).get("sites", [])


def _href_target(href):
    m = HREF_RE.match(href or "")
    return m.group(2) if m else None


def _meta_hrefs(meta):
    out = []
    cta = meta.get("cta")
    for row in (cta if isinstance(cta, list) else [cta] if isinstance(cta, dict) else []):
        if isinstance(row, dict) and isinstance(row.get("href"), str):
            out.append(row["href"])
    for row in ((meta.get("clinicalWorkflow") or {}).get("actions") or []):
        if isinstance(row, dict) and isinstance(row.get("href"), str):
            out.append(row["href"])
    return out


def syndromes(data, site):
    """Hubs that qualify on `site`, in registry order, with their joined case titles."""
    reg, out = data["registry"], []
    excluded = set(reg.get("exclude") or [])
    for hub in data["hubs"]["hubs"]:
        ref = hub["ref"]
        meta = data["topic_meta"].get(ref) or {}
        if ref in excluded or not _ships(data, ref, site):
            continue
        if not isinstance(meta.get("clinicalWorkflow"), dict) or not meta["clinicalWorkflow"]:
            continue
        comm = None
        for cid in meta.get("communicationCases") or []:
            if cid in data["comm"] and _ships(data, TOOL_COMM, site):
                comm = {"id": cid, "title": data["comm"][cid].get("title") or cid}
                break
        family = None
        for href in _meta_hrefs(meta):
            m = re.search(r"family-systems\.html&scenario=([^&#]+)", href)
            if m and m.group(1) in data["family"] and _ships(data, TOOL_FAMILY, site):
                family = {"id": m.group(1), "title": data["family"][m.group(1)].get("title") or m.group(1)}
                break
        actions = []
        for row in (meta["clinicalWorkflow"].get("actions") or []):
            target = _href_target(row.get("href"))
            if target and _ships(data, target, site):
                actions.append({"label": row.get("label") or target, "href": row["href"]})
        out.append({"ref": ref, "topic": hub["topic"], "comm": comm, "family": family,
                    "actions": actions[:3], "epa": list(meta.get("epa") or [])})
    return out


def cell_items(data, site, syndrome, phase, cotw_rows):
    """The items a (syndrome, phase) card renders, in order -- the renderer's contract.

    Text fields come from the attested record; links are guide / cotw / comm / family / actions.
    fd_today.js fdPrepCard draws exactly this list (tests/presenting-tomorrow.test.mjs pins parity).
    """
    meta = data["topic_meta"].get(syndrome["ref"]) or {}
    cw = meta.get("clinicalWorkflow") or {}
    items = []
    for field in phase["fields"]:
        if field in WORKFLOW_KEYS and isinstance(cw.get(field), str) and cw[field].strip():
            items.append(("text", field))
        elif field == "firstMove" and isinstance(meta.get("firstMove"), str) and meta["firstMove"].strip():
            items.append(("text", field))
        elif field == "ruleOut" and isinstance(meta.get("ruleOut"), list) and meta["ruleOut"]:
            items.append(("text", field))
    for kind in phase["links"]:
        if kind == "guide":
            items.append(("link", "guide"))
        elif kind == "cotw" and cotw_rows:
            items.append(("link", "cotw"))
        elif kind == "comm" and syndrome["comm"]:
            items.append(("link", "comm"))
        elif kind == "family" and syndrome["family"]:
            items.append(("link", "family"))
        elif kind == "actions":
            items.extend(("link", "action") for _ in syndrome["actions"])
    return items


def validate(data):
    """Every problem at once, or an empty list. The build stops on any."""
    reg, problems = data["registry"], []
    labels = reg.get("labels") or {}
    for text in (reg.get("heading"), reg.get("prompt"), reg.get("phasePrompt")) + tuple(labels.values()):
        if not isinstance(text, str) or not text.strip():
            problems.append("empty heading/prompt/label")
        elif AUDIENCE_RE.search(text):
            problems.append("audience-specific copy ships to both sites: %r" % text)
    ids = set()
    for phase in reg.get("phases") or []:
        if phase.get("id") in ids:
            problems.append("duplicate phase id %r" % phase.get("id"))
        ids.add(phase.get("id"))
        for text in (phase.get("label"), phase.get("lead")):
            if not isinstance(text, str) or not text.strip() or AUDIENCE_RE.search(text):
                problems.append("phase %r: bad label/lead" % phase.get("id"))
        for field in phase.get("fields") or []:
            if field not in TEXT_FIELDS:
                problems.append("phase %r: unknown field %r" % (phase.get("id"), field))
            elif field not in labels:
                problems.append("phase %r: field %r has no label" % (phase.get("id"), field))
        for kind in phase.get("links") or []:
            if kind not in LINK_KINDS:
                problems.append("phase %r: unknown link kind %r" % (phase.get("id"), kind))
            elif kind not in labels:
                problems.append("phase %r: link %r has no label" % (phase.get("id"), kind))
    if len(ids) < 2:
        problems.append("at least two phases are required")
    for ref in reg.get("exclude") or []:
        if ref not in data["topic_meta"]:
            problems.append("exclude names an unknown topic %r" % ref)
    if problems:
        return problems
    for site in SITES:
        rows = syndromes(data, site)
        if len(rows) < 3:
            problems.append("%s: only %d syndrome(s) qualify" % (site, len(rows)))
        cotw = cotw_for_topics(data["hubs"], data["shipped"], site)
        for syn in rows:
            for phase in reg["phases"]:
                n = len(cell_items(data, site, syn, phase, cotw.get(syn["ref"]) or []))
                if n < int(reg.get("minItems") or 3):
                    problems.append("%s: %s x %s renders %d item(s), fewer than %d"
                                    % (site, syn["ref"], phase["id"], n, reg.get("minItems") or 3))
    return problems


def resolve(data):
    problems = validate(data)
    if problems:
        raise SystemExit("presenting tomorrow:\n  - " + "\n  - ".join(problems))
    return data


def payload(data, site):
    """The FD_PRESENTING value for one site (validated data in)."""
    reg = data["registry"]
    return {
        "heading": reg["heading"], "prompt": reg["prompt"], "phasePrompt": reg["phasePrompt"],
        "labels": dict(reg["labels"]),
        "phases": [{"id": p["id"], "label": p["label"], "lead": p["lead"],
                    "fields": list(p["fields"]), "links": list(p["links"])} for p in reg["phases"]],
        "syndromes": syndromes(data, site),
    }


def matrix(data, site):
    """{ref: {phaseId: item count}} -- what the tests and the PR body report."""
    cotw = cotw_for_topics(data["hubs"], data["shipped"], site)
    return {syn["ref"]: {p["id"]: len(cell_items(data, site, syn, p, cotw.get(syn["ref"]) or []))
                         for p in data["registry"]["phases"]} for syn in syndromes(data, site)}


def _lib_root():
    return os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--site", choices=SITES, default="ms3")
    parser.add_argument("--json", action="store_true", help="print the payload")
    parser.add_argument("--matrix", action="store_true", help="print the syndrome x phase item counts")
    parser.add_argument("--check", action="store_true", help="validate only")
    args = parser.parse_args(argv)
    data = load(_lib_root())
    problems = validate(data)
    if problems:
        print("presenting tomorrow INVALID:\n  - " + "\n  - ".join(problems))
        return 1
    if args.check:
        print("presenting tomorrow OK — %s" % ", ".join(
            "%s: %d syndromes" % (s, len(syndromes(data, s))) for s in SITES))
        return 0
    if args.matrix:
        print(json.dumps({s: matrix(data, s) for s in SITES}, indent=1))
        return 0
    print(json.dumps(payload(data, args.site), indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
