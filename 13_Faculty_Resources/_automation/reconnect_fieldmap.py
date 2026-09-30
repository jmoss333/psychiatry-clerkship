#!/usr/bin/env python3
"""The ReConnect field-map contract, shared by every derived registry.

A field map (`reconnect_<dataset>_fieldmap.json`) says how one ReConnect collection maps onto
one clerkship registry: which upstream keys are carried, verified or used as seed text, and
which are denylisted and may never reach the registry. The pharmacy map
(`pharmacy/reconnect_meds_fieldmap.json`, gate G0) was the first; this module is the ONE
statement of the shape every later map must hold, so a second dataset costs a JSON file and a
gate decision rather than a second engine.

Shape (schemaVersion 1):
  upstream     {path, field, keyField}  — the data_all.json collection and its natural key
  classes      {code: meaning}          — the map's own vocabulary; every fieldMap entry uses one
  fieldMap     {upstreamKey: {target, class, note?}}
                                        — target is a dotted registry path, or null for `meta`
  denylist     {upstreamKey: reason}    — keys that must never be carried; reason is required
  phase1Roster [{id, reconnectNames[], group?, rightsId?}]
                                        — optional; the first-wave records and the upstream
                                          names that cover them (a missing name is reported,
                                          never invented)

Rules the checker enforces:
  - fieldMap and denylist are disjoint, and both are non-empty;
  - every fieldMap class is declared in `classes`; a `meta` entry has a null target and every
    other entry a non-empty dotted target;
  - every denylist reason is non-empty text (a bare key is a rule with no rationale);
  - roster ids are unique slugs; `reconnectNames` is a list of non-empty names, and an EMPTY
    list is the deliberate statement "known absent upstream" (the meds map records four such
    agents), so the engine reports it as missing rather than the checker refusing it; a
    `rightsId` names an entry in the root instrument_rights.json when that file is given.

    python3 13_Faculty_Resources/_automation/reconnect_fieldmap.py --check [MAP ...]

Checks the production maps (all of them when none is named). Exit 0 clean, 1 a finding,
2 a map that cannot be read. Report-only; it never writes.
"""

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INSTRUMENT_RIGHTS = ROOT / "instrument_rights.json"

# The production maps, keyed by the sync engine's dataset name. sync_from_reconnect.py imports
# this table so the engine and the checker can never disagree about where a map lives.
PRODUCTION_FIELDMAPS = {
    "meds": HERE / "pharmacy" / "reconnect_meds_fieldmap.json",
    "screening_tools": HERE / "screening_tools" / "reconnect_screening_tools_fieldmap.json",
}

SCHEMA_VERSION = 1
META_CLASS = "meta"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TARGET = re.compile(r"^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$")
REQUIRED_TOP = ("schemaVersion", "upstream", "classes", "fieldMap", "denylist")


class FieldMapError(Exception):
    """A map that cannot be read at all (missing file, bad JSON, not an object)."""


def load_fieldmap(path) -> dict:
    """Read a field map, raising FieldMapError when the file is unusable."""
    path = Path(path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FieldMapError("cannot read field map %s: %s" % (path, error)) from None
    if not isinstance(data, dict):
        raise FieldMapError("field map %s is not a JSON object" % path)
    return data


def rights_ids(path=INSTRUMENT_RIGHTS):
    """The ids instrument_rights.json declares, or None when the file is absent or unreadable."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    entries = data.get("instruments") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        return None
    return {entry.get("id") for entry in entries if isinstance(entry, dict)}


def check_fieldmap(fieldmap: dict, *, rights=None) -> list:
    """Every way a field map can be malformed, as one finding per line. Empty means clean."""
    findings = []
    for key in REQUIRED_TOP:
        if key not in fieldmap:
            findings.append("missing top-level key %r" % key)
    if findings:
        return findings  # nothing below can be judged without the frame
    if fieldmap["schemaVersion"] != SCHEMA_VERSION:
        findings.append("schemaVersion is %r, expected %d" % (fieldmap["schemaVersion"], SCHEMA_VERSION))

    upstream = fieldmap["upstream"]
    if not isinstance(upstream, dict):
        findings.append("upstream must be an object")
    else:
        for key in ("path", "field", "keyField"):
            if not isinstance(upstream.get(key), str) or not upstream.get(key):
                findings.append("upstream.%s must be non-empty text" % key)

    classes = fieldmap["classes"]
    if not isinstance(classes, dict) or not classes:
        findings.append("classes must be a non-empty object of {code: meaning}")
        classes = {}
    elif META_CLASS not in classes:
        findings.append("classes must declare %r (provenance-only keys need a home)" % META_CLASS)

    field_map, denylist = fieldmap["fieldMap"], fieldmap["denylist"]
    if not isinstance(field_map, dict) or not field_map:
        findings.append("fieldMap must be a non-empty object")
        field_map = {}
    if not isinstance(denylist, dict) or not denylist:
        findings.append("denylist must be a non-empty object of {upstreamKey: reason}")
        denylist = {}

    for key in sorted(set(field_map) & set(denylist)):
        findings.append("%r is in both fieldMap and denylist" % key)

    for key, spec in sorted(field_map.items()):
        if not isinstance(spec, dict):
            findings.append("fieldMap[%r] must be an object" % key)
            continue
        klass, target = spec.get("class"), spec.get("target")
        if klass not in classes:
            findings.append("fieldMap[%r] class %r is not declared in classes" % (key, klass))
        if klass == META_CLASS:
            if target is not None:
                findings.append("fieldMap[%r] is meta but has target %r (must be null)" % (key, target))
        elif not isinstance(target, str) or not TARGET.match(target):
            findings.append("fieldMap[%r] target %r is not a dotted registry path" % (key, target))
        for extra in sorted(set(spec) - {"class", "target", "note"}):
            findings.append("fieldMap[%r] has unknown key %r" % (key, extra))

    for key, reason in sorted(denylist.items()):
        if not isinstance(reason, str) or not reason.strip():
            findings.append("denylist[%r] has no reason" % key)

    roster = fieldmap.get("phase1Roster")
    if roster is not None:
        if not isinstance(roster, list):
            findings.append("phase1Roster must be a list")
            roster = []
        seen = set()
        for position, entry in enumerate(roster):
            label = "phase1Roster[%d]" % position
            if not isinstance(entry, dict):
                findings.append("%s must be an object" % label)
                continue
            rid = entry.get("id")
            if not isinstance(rid, str) or not SLUG.match(rid):
                findings.append("%s id %r is not a slug" % (label, rid))
            elif rid in seen:
                findings.append("%s id %r is a duplicate" % (label, rid))
            seen.add(rid)
            names = entry.get("reconnectNames")
            if not isinstance(names, list) or not all(
                    isinstance(name, str) and name for name in names):
                findings.append("%s (%s) reconnectNames must be a list of non-empty names "
                                "(empty means: known absent upstream)" % (label, rid))
            for extra in sorted(set(entry) - {"id", "reconnectNames", "group", "rightsId", "note"}):
                findings.append("%s (%s) has unknown key %r" % (label, rid, extra))
            rights_id = entry.get("rightsId")
            if rights_id is not None:
                if not isinstance(rights_id, str) or not rights_id:
                    findings.append("%s (%s) rightsId must be text" % (label, rid))
                elif rights is not None and rights_id not in rights:
                    findings.append("%s (%s) rightsId %r is not in instrument_rights.json"
                                    % (label, rid, rights_id))
    return findings


def check_paths(paths, *, rights=None) -> tuple:
    """(exit code, lines) for a set of maps: 2 beats 1 beats 0."""
    code, lines = 0, []
    for path in paths:
        try:
            fieldmap = load_fieldmap(path)
        except FieldMapError as error:
            lines.append("ERROR %s" % error)
            code = 2
            continue
        findings = check_fieldmap(fieldmap, rights=rights)
        if findings:
            lines.append("FAIL  %s" % path)
            lines.extend("  - " + finding for finding in findings)
            code = max(code, 1)
        else:
            lines.append("OK    %s (%d mapped, %d denylisted, roster %s)" % (
                path, len(fieldmap["fieldMap"]), len(fieldmap["denylist"]),
                len(fieldmap["phase1Roster"]) if isinstance(fieldmap.get("phase1Roster"), list)
                else "none"))
    return code, lines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", required=True,
                        help="check the named maps (default: every production map)")
    parser.add_argument("maps", nargs="*", type=Path)
    parser.add_argument("--rights", type=Path, default=INSTRUMENT_RIGHTS,
                        help="instrument_rights.json to resolve roster rightsId against")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    paths = args.maps or [PRODUCTION_FIELDMAPS[name] for name in sorted(PRODUCTION_FIELDMAPS)]
    code, lines = check_paths(paths, rights=rights_ids(args.rights))
    sys.stdout.write("\n".join(lines) + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
