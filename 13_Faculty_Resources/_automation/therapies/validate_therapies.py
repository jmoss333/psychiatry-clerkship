#!/usr/bin/env python3
"""Offline gate for therapies.json (the Psychotherapy & EBP registry, crossover v2 #13).
No network; safe for CI and verify.sh.

Shared checks (registry_checks.common_findings): AC13 denylist, AC4' dose literals, AC5
evidence / qbank ids, SPAN verbatim quotes, COVER every J/E field sourced or declared
authored, AC7 family text grade, RET retrieval mapping, AC6 review-hash binding.

Therapy-specific checks:
  GL      every record has a guideline_sources.json entry and evidence.guideline names the
          guideline that entry resolves (its upstreamSource, or publisher + id);
  BARE    a bare percentage in a J field (no qualifier) is a finding unless the record carries
          evidence ids that license it (decision D-E2: upstream key_components embeds outcome
          figures that need their own evidenceIds before they ship);
  KEY     evidence.keyEvidenceIds resolve in evidence_registry.json;
  LINK    relatedDrugIds exist in pharmacy.json and relatedScaleIds in screening_tools.json.

    python3 13_Faculty_Resources/_automation/therapies/validate_therapies.py [--hash ID]

Exit 0 clean, 1 a finding, 2 could not check.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
from registry_checks import bare_percentages, get_path, load, main_for, common_findings  # noqa: E402

REGISTRY = ROOT / "therapies.json"
FIELDMAP = HERE / "reconnect_ebp_fieldmap.json"
SOURCES = HERE / "guideline_sources.json"
PHARMACY = ROOT / "pharmacy.json"
SCALES = ROOT / "screening_tools.json"


def guideline_names(entry):
    names = set()
    if entry.get("upstreamSource"):
        names.add(entry["upstreamSource"])
    guideline = entry.get("guideline") or {}
    if guideline.get("id"):
        names.add(guideline["id"])
        if guideline.get("publisher"):
            names.add("%s %s" % (guideline["publisher"], guideline["id"]))
    return names


def flatten(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from flatten(child)
    elif isinstance(value, list):
        for child in value:
            yield from flatten(child)


def check(registry, fieldmap, root=ROOT, *, sources_path=SOURCES, pharmacy_path=PHARMACY, scales_path=SCALES):
    findings, notes, pending = common_findings(registry, fieldmap, root)
    sources, error = load(sources_path)
    pharmacy, error2 = load(pharmacy_path)
    scales, error3 = load(scales_path)
    if error or error2 or error3:
        findings.append("GL could not read: %s" % (error or error2 or error3))
        return findings, notes
    by_source = {entry["id"]: entry for entry in sources.get("entries", [])}
    drug_ids = {record.get("id") for record in pharmacy.get("records", [])}
    scale_ids = {record.get("id") for record in scales.get("records", [])}
    evidence = {s["id"] for s in json.loads((root / "evidence_registry.json").read_text(encoding="utf-8"))["sources"]}

    for record in registry.get("records", []):
        rid = record.get("id", "?")
        classes = record.get("provenance", {}).get("fieldClasses", {})

        # GL
        source = by_source.get(rid)
        named = get_path(record, "evidence.guideline")
        if source is None:
            findings.append("GL %s: no guideline_sources.json entry" % rid)
        elif named not in guideline_names(source):
            findings.append("GL %s: evidence.guideline %r is not the guideline guideline_sources.json resolves (%s)"
                            % (rid, named, ", ".join(sorted(guideline_names(source))) or "none"))

        # KEY
        for eid in get_path(record, "evidence.keyEvidenceIds") or []:
            if eid not in evidence:
                findings.append("KEY %s: keyEvidenceIds %r not in evidence_registry.json" % (rid, eid))

        # BARE
        licensed = bool(record.get("evidenceIds")) or bool(get_path(record, "evidence.keyEvidenceIds"))
        for path, cls in sorted(classes.items()):
            if cls == "J":
                for value in flatten(get_path(record, path)):
                    for pct in bare_percentages(value):
                        if not licensed:
                            findings.append("BARE %s: %s in J field %r has no evidence id behind it (D-E2)" % (rid, pct, path))

        # LINK
        for did in record.get("relatedDrugIds", []):
            if did not in drug_ids:
                findings.append("LINK %s: relatedDrugIds %r is not a pharmacy.json id" % (rid, did))
        for sid in record.get("relatedScaleIds", []):
            if sid not in scale_ids:
                findings.append("LINK %s: relatedScaleIds %r is not a screening_tools.json id" % (rid, sid))

    notes.append("%d record(s), %d high-safety pending faculty review" % (len(registry.get("records", [])), pending))
    return findings, notes


def main():
    return main_for(__doc__, REGISTRY, FIELDMAP, lambda r, f, root: check(r, f, root), ROOT)


if __name__ == "__main__":
    sys.exit(main())
