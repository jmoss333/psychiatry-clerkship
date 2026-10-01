#!/usr/bin/env python3
"""Offline gate for screening_tools.json (the Scales & Screeners registry, crossover v2 #12).
No network; safe for CI and verify.sh.

Shared checks (registry_checks.common_findings): AC13 denylist, AC4' dose literals, AC5
evidence / qbank ids, SPAN verbatim quotes, COVER every J/E field sourced or declared
authored, AC7 family text grade, RET retrieval mapping, AC6 review-hash binding.

Scale-specific checks:
  SRC     every record has a custodian_sources.json entry; rights.custodianUrl equals the
          entry's URL and that URL is `verified` — an unverified custodian link never ships;
  RIGHTS  a roster entry with a rightsId binds the record: rights.rightsId must match, must
          resolve in instrument_rights.json, and the record must be linkOnly (INV-IR2: a
          retired or restricted instrument carries facts and the official route, nothing else);
  ITEMS   no instrument text anywhere — no key that names items, stems, anchors or a form
          (itemCount excepted) and no string that reads as a numbered item list (CLAUDE.md:
          the library teaches administration; it does not reproduce instruments);
  PSY     psychometrics.evidenceIds resolve; a bare percentage in a J field (one with no
          cutoff / population qualifier) is a finding (decision D-S2);
  MON     monitoringFor ids exist in pharmacy.json.

    python3 13_Faculty_Resources/_automation/screening_tools/validate_screening_tools.py [--hash ID]

Exit 0 clean, 1 a finding, 2 could not check.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
from registry_checks import bare_percentages, get_path, load, main_for, walk, common_findings  # noqa: E402

REGISTRY = ROOT / "screening_tools.json"
FIELDMAP = HERE / "reconnect_screening_tools_fieldmap.json"
SOURCES = HERE / "custodian_sources.json"
INSTRUMENT_RIGHTS = ROOT / "instrument_rights.json"
PHARMACY = ROOT / "pharmacy.json"

ITEM_KEY = re.compile(r"(?i)^(items?|itemstems?|itemtext|stems?|anchors?|anchortext|scoringform|form)$")
NUMBERED_LIST = re.compile(r"(?:(?:^|\s)\d{1,2}[.)]\s+\S[^\n]{3,}){3,}")


def check(registry, fieldmap, root=ROOT, *, sources_path=SOURCES, rights_path=INSTRUMENT_RIGHTS,
          pharmacy_path=PHARMACY):
    findings, notes, pending = common_findings(registry, fieldmap, root)
    sources, error = load(sources_path)
    rights, error2 = load(rights_path)
    pharmacy, error3 = load(pharmacy_path)
    if error or error2 or error3:
        findings.append("SRC could not read: %s" % (error or error2 or error3))
        return findings, notes
    by_source = {entry["id"]: entry for entry in sources.get("entries", [])}
    rights_ids = {entry.get("id") for entry in rights.get("instruments", [])}
    roster = {entry["id"]: entry for entry in fieldmap.get("phase1Roster", [])}
    drug_ids = {record.get("id") for record in pharmacy.get("records", [])}
    evidence = {s["id"] for s in json.loads((root / "evidence_registry.json").read_text(encoding="utf-8"))["sources"]}

    for path, key, child in walk(registry):
        if ITEM_KEY.match(str(key)) and key != "itemCount":
            findings.append("ITEMS key %r at %s names instrument text" % (key, path))
        if isinstance(child, str) and NUMBERED_LIST.search(child):
            findings.append("ITEMS numbered item list at %s" % path)

    for record in registry.get("records", []):
        rid = record.get("id", "?")
        classes = record.get("provenance", {}).get("fieldClasses", {})

        # SRC
        source = by_source.get(rid)
        if source is None:
            findings.append("SRC %s: no custodian_sources.json entry" % rid)
        else:
            url = get_path(record, "rights.custodianUrl")
            if url != source.get("custodianUrl"):
                findings.append("SRC %s: rights.custodianUrl %r != custodian_sources %r" % (rid, url, source.get("custodianUrl")))
            if source.get("urlStatus") != "verified":
                findings.append("SRC %s: custodian URL is %r in custodian_sources.json; verify before shipping" % (rid, source.get("urlStatus")))

        # RIGHTS
        entry = roster.get(rid, {})
        wanted = entry.get("rightsId")
        have = get_path(record, "rights.rightsId")
        if wanted and have != wanted:
            findings.append("RIGHTS %s: roster binds rightsId %r, record has %r" % (rid, wanted, have))
        if have and have not in rights_ids:
            findings.append("RIGHTS %s: rightsId %r is not in instrument_rights.json" % (rid, have))
        if have and get_path(record, "rights.linkOnly") is not True:
            findings.append("RIGHTS %s: a rights-bound instrument must be linkOnly" % rid)

        # PSY
        for eid in get_path(record, "psychometrics.evidenceIds") or []:
            if eid not in evidence:
                findings.append("PSY %s: psychometrics evidence id %r not in evidence_registry.json" % (rid, eid))
        for path, cls in sorted(classes.items()):
            if cls == "J":
                for value in flatten(get_path(record, path)):
                    for pct in bare_percentages(value):
                        findings.append("PSY %s: bare %s in J field %r needs a cutoff/population qualifier (D-S2)" % (rid, pct, path))

        # MON
        for did in record.get("monitoringFor", []):
            if did not in drug_ids:
                findings.append("MON %s: monitoringFor %r is not a pharmacy.json id" % (rid, did))

    notes.append("%d record(s), %d high-safety pending faculty review" % (len(registry.get("records", [])), pending))
    return findings, notes


def flatten(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from flatten(child)
    elif isinstance(value, list):
        for child in value:
            yield from flatten(child)


def main():
    return main_for(__doc__, REGISTRY, FIELDMAP, lambda r, f, root: check(r, f, root), ROOT)


if __name__ == "__main__":
    sys.exit(main())
