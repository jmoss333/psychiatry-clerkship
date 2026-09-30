#!/usr/bin/env python3
"""DEV-ONLY, REPORT-ONLY: diff a clerkship registry against its upstream ReConnect dataset.

This is NOT part of the build. Netlify checks out only this repo (C4), so a ReConnect
working copy never exists on the build runner. Run it by hand on a machine that has
both repos:

    python3 13_Faculty_Resources/_automation/sync_from_reconnect.py \\
        --dataset crisis --reconnect ~/Code/reconnect-psychiatry-system

The ReConnect path is a REQUIRED ARGUMENT and is never hard-coded (CLAUDE.md; CI lints
for it). The tool reads and reports; it never writes. A registry changes only through a
human edit after clinical review (Gate 1). A value that is wrong upstream is filed as a
ReConnect issue instead of being edited here.

Datasets:
  crisis    data_all.json "crisis"       vs crisis_resources.json   legacy report, byte-identical
  meds      data_all.json "medications"  vs pharmacy.json           keyed by generic name
            (+ field-map coverage, Phase-1 roster, carried R-field drift; field map and
             denylist come from _automation/pharmacy/reconnect_meds_fieldmap.json)
  evidence  staged-citations.json        vs evidence_registry.json  keyed by PMID / DOI

When the provenance inventory has a `relation: derived` entry for a dataset, the report
also diffs that entry's fieldMap source fields between the pinned sourceRevision and the
checkout. Those diffs appear under "changed" and "removed".

Exit codes: 0 = no drift; 1 = drift (something changed, was removed, or conflicts);
2 = bad path or unreadable input. Records added upstream and stale records are listed
but do not count as drift.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEFAULT_INVENTORY = HERE / "provenance" / "reconnect_snapshot_provenance.json"
DATA_ALL = "databases/core/data_all.json"
STAGED = "databases/evidence/staged-citations.json"

# The G0-approved ReConnect -> pharmacy field map. Its `denylist` (spec v0.3 AC13, bridge
# check BR6) is the ONE list of keys that must never reach pharmacy.json: this engine and the
# build-time pharmacy/validate_pharmacy.py both read it; neither restates it.
DEFAULT_FIELDMAP = HERE / "pharmacy" / "reconnect_meds_fieldmap.json"

DATASETS = {
    "crisis": {"local": "crisis_resources.json", "source": DATA_ALL, "key": "crisis"},
    "meds": {"local": "pharmacy.json", "source": DATA_ALL, "key": "medications"},
    "evidence": {"local": "evidence_registry.json", "source": STAGED, "key": "staged"},
}

RECORD_REF = re.compile(r"^crisis\[(\d+)\]")
MEDS_REF = re.compile(r"^medications\[(\d+)\]")
# Phase 0 / G1 records cite upstream rows by key, which cannot silently shift like an index.
MEDS_NAME_REF = re.compile(r"^medications\[name=([^\]]+)\]$")


class InputError(Exception):
    """An input that cannot be read; reported on stderr with exit code 2."""


def default_local(dataset: str) -> Path:
    """The production registry for a dataset; --local only ever overrides it in tests."""
    return ROOT / DATASETS[dataset]["local"]


def digits(value):
    """Comparable digit-only form of a phone-ish string ('Text HOME to 741741' -> '741741').

    Strips the US country code so '1-888-568-1112' and '(888) 568-1112' compare equal —
    otherwise every toll-free number reports as drift and the report stops being read.
    """
    only = re.sub(r"\D", "", value or "")
    if len(only) == 11 and only.startswith("1"):
        only = only[1:]
    return only


def slug(value) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")


def med_id(record: dict) -> str:
    return slug(record.get("generic_name") or record.get("name"))


def crisis_id(record: dict) -> str:
    return slug(record.get("name"))


def refs_in(value):
    """Every reconnectRecord string anywhere in a registry record."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "reconnectRecord" and isinstance(item, str):
                yield item
            else:
                yield from refs_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from refs_in(item)


def read_json(path: Path, label: str):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InputError("cannot read %s %s: %s" % (label, path, error)) from None


# --- git (read-only: --no-optional-locks keeps even `status` from touching the index) ---
# Every inherited GIT_* is dropped for these calls: a hook-exported GIT_DIR outranks `-C` and
# would silently point "the ReConnect checkout" at the clerkship repository instead.


def git(reconnect: Path, *args):
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    try:
        return subprocess.run(
            ["git", "--no-optional-locks", "-C", str(reconnect), *args],
            check=False,
            capture_output=True,
            env=env,
        )
    except OSError:
        return None


def checkout_state(reconnect: Path, source: str):
    """(HEAD, working-tree-modified) when `reconnect` is itself a git checkout root."""
    top = git(reconnect, "rev-parse", "--show-toplevel")
    if top is None or top.returncode != 0:
        return None, None
    if Path(top.stdout.decode("utf-8").strip()).resolve() != reconnect.resolve():
        return None, None
    head = git(reconnect, "rev-parse", "HEAD")
    status = git(reconnect, "status", "--porcelain", "--", source)
    return head.stdout.decode("utf-8").strip() or None, bool(status.stdout.strip())


def find_pinned(inventory: dict, spec: dict):
    for record in inventory.get("records", []):
        if (
            record.get("relation") == "derived"
            and record.get("dataset") == spec["key"]
            and record.get("sourcePath") == spec["source"]
        ):
            return record
    return None


def pinned_records(reconnect: Path, entry: dict, key: str, conflicts: list):
    """The dataset's records at the pinned revision, or None (with a conflict) if untrusted."""
    revision, path = entry["sourceRevision"], entry["sourcePath"]
    shown = git(reconnect, "show", "%s:%s" % (revision, path))
    if shown is None or shown.returncode != 0:
        conflicts.append({
            "kind": "pinned-revision-missing",
            "detail": "%s is not in the ReConnect checkout" % revision,
        })
        return None
    if hashlib.sha256(shown.stdout).hexdigest() != entry.get("sourceSha256"):
        conflicts.append({
            "kind": "pinned-hash-mismatch",
            "detail": "%s at %s does not hash to the pinned sourceSha256" % (path, revision[:12]),
        })
        return None
    return json.loads(shown.stdout.decode("utf-8")).get(key, [])


def pinned_diff(baseline, current, entry, key, identity, conflicts):
    changed, removed = [], []
    for index in sorted(entry.get("sourceRecords", [])):
        if index >= len(baseline):
            conflicts.append({
                "kind": "pinned-record-missing",
                "detail": "%s[%d] is not in the pinned revision" % (key, index),
            })
            continue
        before = baseline[index]
        if index >= len(current):
            removed.append({"record": index, "id": identity(before)})
            continue
        after = current[index]
        if identity(before) != identity(after):
            conflicts.append({
                "kind": "identity-changed",
                "id": identity(before),
                "detail": "%s[%d] was %s, is now %s" % (key, index, identity(before), identity(after)),
            })
            continue
        for target, sources in sorted(entry.get("fieldMap", {}).items()):
            for field in [sources] if isinstance(sources, str) else sources:
                if before.get(field) != after.get(field):
                    changed.append({
                        "record": index,
                        "id": identity(after),
                        "field": field,
                        "target": target,
                        "before": before.get(field),
                        "after": after.get(field),
                        "basis": "pinned",
                    })
    return changed, removed


# --- dataset adapters: each returns the dataset-specific sections of the report ---


def crisis_sections(upstream: list, local: dict) -> dict:
    rows, conflicts, stale, notes = [], [], [], []
    for resource in local.get("resources", []):
        rid = resource["id"]
        ref = resource.get("reconnectRecord")
        if not ref:
            rows.append({"id": rid, "kind": "local-only"})
            notes.append("local-only: %s" % rid)
            continue
        match = RECORD_REF.match(ref)
        if not match or int(match.group(1)) >= len(upstream):
            rows.append({"id": rid, "kind": "unresolvable", "ref": ref})
            conflicts.append({"kind": "unresolvable-ref", "id": rid, "ref": ref})
            continue
        record = upstream[int(match.group(1))]
        up_phone = record.get("phone") or ""
        up_verified = record.get("last_verified_date") or "unknown"
        differ = bool(digits(up_phone)) and digits(up_phone) != digits(resource["contact"])
        if differ:
            conflicts.append({
                "kind": "digits-differ",
                "id": rid,
                "local": resource["contact"],
                "upstream": up_phone,
            })
        if up_verified < resource["verifiedOn"]:
            stale.append({
                "id": rid,
                "upstream_verified": up_verified,
                "local_verified": resource["verifiedOn"],
            })
        rows.append({
            "id": rid,
            "kind": "compared",
            "local": resource["contact"],
            "local_verified": resource["verifiedOn"],
            "upstream": up_phone,
            "upstream_verified": up_verified,
            "digits_differ": differ,
        })
    return {
        "rows": rows,
        "conflicts": conflicts,
        "stale": stale,
        "notes": notes,
        "known_discrepancies": local.get("upstreamDiscrepancies", []),
    }


def local_refs(record: dict) -> list:
    """Every upstream reference a pharmacy record makes: Phase 0's provenance.reconnectRecords
    (name-keyed) plus any reconnectRecord string anywhere (index-keyed, #901 style)."""
    refs = set(refs_in(record))
    listed = record.get("provenance", {}).get("reconnectRecords", [])
    if isinstance(listed, list):
        refs.update(ref for ref in listed if isinstance(ref, str))
    return sorted(refs)


def meds_sections(upstream: list, local: dict, fieldmap: dict) -> dict:
    records = local.get("records", [])
    local_ids = {record.get("id") for record in records}
    added, conflicts, stale, changed, notes = [], [], [], [], []
    field_map, denylist = fieldmap["fieldMap"], fieldmap["denylist"]
    key_field = fieldmap["upstream"]["keyField"]

    by_name, counts = {}, {}
    for index, record in enumerate(upstream):
        name = record.get(key_field)
        counts[name] = counts.get(name, 0) + 1
        by_name.setdefault(name, index)
    for name, count in sorted(counts.items(), key=lambda item: str(item[0])):
        if count > 1:
            conflicts.append({"kind": "duplicate-upstream-name", "id": slug(name),
                              "detail": "%r appears %d times upstream" % (name, count)})

    # Field-map coverage: every upstream key must be classified (fieldMap or denylist).
    upstream_keys = sorted({key for record in upstream for key in record})
    for key in upstream_keys:
        if key not in field_map and key not in denylist:
            present = sum(1 for record in upstream if record.get(key) not in (None, "", [], {}))
            conflicts.append({"kind": "unclassified-upstream-key",
                              "detail": "%r (present on %d records) is in neither fieldMap nor "
                                        "denylist" % (key, present)})
    absent = sorted(key for key in list(field_map) + list(denylist) if key not in upstream_keys)
    if absent:
        notes.append("mapped but absent upstream: %s" % ", ".join(absent))

    # Phase-1 roster coverage (listed, never drift).
    missing, used = [], set()
    for agent in fieldmap["phase1Roster"]:
        found = [name for name in agent["reconnectNames"] if name in by_name]
        used.update(found)
        if not found:
            missing.append(agent["id"])
    roster = {
        "size": len(fieldmap["phase1Roster"]),
        "covered": len(fieldmap["phase1Roster"]) - len(missing),
        "missingUpstream": missing,
        "phase2Pool": sorted(str(name) for name in by_name if name not in used),
    }
    # A name-keyed ref covers its upstream row even when the local id differs from the upstream
    # generic (Lithium's generic_name is "lithium carbonate/citrate"; the record id is lithium).
    named = {match.group(1) for record in records for ref in local_refs(record)
             for match in [MEDS_NAME_REF.match(ref)] if match}
    for index, record in enumerate(upstream):
        if med_id(record) not in local_ids and record.get(key_field) not in named:
            added.append({"record": index, "id": med_id(record), "name": record.get("name")})
        if record.get("freshness_status") == "red":
            stale.append({
                "record": index,
                "id": med_id(record),
                "last_verified_date": record.get("last_verified_date"),
            })
    targets = {name: spec["target"] for name, spec in field_map.items()}
    for record in sorted(records, key=lambda item: str(item.get("id"))):
        rid = record.get("id")
        listed = record.get("provenance", {}).get("reconnectRecords", [])
        order = {ref: i for i, ref in enumerate(listed if isinstance(listed, list) else [])}
        rows = []  # (index, row) for each resolved name ref, in the record's own listed order
        for ref in sorted(local_refs(record), key=lambda item: (order.get(item, len(order)), item)):
            named = MEDS_NAME_REF.match(ref)
            if named:
                if named.group(1) not in by_name:
                    conflicts.append({"kind": "unresolvable-ref", "id": rid, "ref": ref,
                                      "detail": "no upstream record named %r" % named.group(1)})
                else:
                    rows.append((by_name[named.group(1)], upstream[by_name[named.group(1)]]))
                continue
            match = MEDS_REF.match(ref)
            if not match:
                conflicts.append({"kind": "unresolvable-ref", "id": rid, "ref": ref,
                                  "detail": "%s is not a medications[N] or medications[name=…] "
                                            "reference" % ref})
            elif int(match.group(1)) >= len(upstream):
                conflicts.append({"kind": "unresolvable-ref", "id": rid, "ref": ref,
                                  "detail": "medications has %d records" % len(upstream)})
            elif med_id(upstream[int(match.group(1))]) != rid:
                conflicts.append({
                    "kind": "index-shift",
                    "id": rid,
                    "ref": ref,
                    "detail": "%s is %s, not %s" % (ref, med_id(upstream[int(match.group(1))]), rid),
                })
        # Every carried value is checked, whatever its class: R drift means the copy is stale,
        # J-seed drift means the reviewed prose may need another look, and L drift is a label
        # question (the label, not ReConnect, stays authoritative). A card that cites several
        # rows (buprenorphine and buprenorphine/naloxone) carried each value from one of them,
        # so a value drifts only when NO cited row still holds it; the report shows the
        # record's first-listed row as "after".
        carried = record.get("provenance", {}).get("carried", {})
        if not isinstance(carried, dict):
            continue
        for field in sorted(carried):
            if field in denylist:
                # validate_pharmacy.py fails the build on this; the report names the key but
                # never prints either value (BR6 holds for the console too).
                conflicts.append({"kind": "denylisted-carried-field", "id": rid,
                                  "detail": "%r is denylisted and must not be carried" % field})
            elif rows and all(carried[field] != row.get(field) for _, row in rows):
                changed.append({
                    "record": rows[0][0],
                    "id": rid,
                    "field": field,
                    "target": targets.get(field, "(unmapped)"),
                    "before": carried[field],
                    "after": rows[0][1].get(field),
                    "basis": "carried",
                })
    denylisted = {}
    for record in upstream:
        for key in denylist:
            if key in record:
                denylisted[key] = denylisted.get(key, 0) + 1
    return {
        "added": added,
        "changed": changed,
        "conflicts": conflicts,
        "stale": stale,
        "notes": notes,
        "roster": roster,
        "denylisted_upstream": dict(sorted(denylisted.items())),
    }


def evidence_sections(staged: list, local: dict, reconnect: Path) -> dict:
    sources = local.get("sources", [])
    by_pmid, by_doi, unkeyed = {}, {}, 0
    for source in sources:
        citation = source.get("citation", {})
        pmid = str(citation.get("pmid") or "").strip()
        doi = str(citation.get("doi") or "").strip().lower()
        if pmid:
            by_pmid.setdefault(pmid, source)
        if doi:
            by_doi.setdefault(doi, source)
        if not pmid and not doi:
            unkeyed += 1
    added, conflicts, matched = [], [], 0
    for item in staged:
        pmid = str(item.get("pmid") or "").strip()
        doi = str(item.get("doi") or "").strip()
        source = by_pmid.get(pmid) if pmid else None
        if source is None and doi:
            source = by_doi.get(doi.lower())
        if source is None:
            added.append({"pmid": pmid, "doi": doi, "title": item.get("title") or "",
                          "year": str(item.get("year") or "")})
            continue
        citation = source.get("citation", {})
        local_pmid = str(citation.get("pmid") or "").strip()
        local_doi = str(citation.get("doi") or "").strip()
        if pmid and local_pmid and pmid != local_pmid:
            conflicts.append({"kind": "pmid-mismatch", "id": source.get("id"), "doi": doi,
                              "upstream_pmid": pmid, "local_pmid": local_pmid})
        elif doi and local_doi and doi.lower() != local_doi.lower():
            conflicts.append({"kind": "doi-mismatch", "id": source.get("id"), "pmid": pmid,
                              "upstream_doi": doi, "local_doi": local_doi})
        else:
            matched += 1
    notes = ["matched: %d" % matched, "local sources without PMID/DOI: %d" % unkeyed]
    data_all = reconnect / DATA_ALL
    if data_all.exists():
        modalities = read_json(data_all, "upstream").get("ebp_reference", [])
        notes.append("ebp_reference: %d modality record(s) have no PMID/DOI and are not compared"
                     % len(modalities))
    notes.append("pinned diff: not supported for evidence (keyed by PMID/DOI, not by index)")
    return {"added": sorted(added, key=lambda entry: (entry["pmid"], entry["doi"])),
            "conflicts": conflicts, "notes": notes}


# --- report assembly ---


def build_report(dataset: str, reconnect: Path, local_path: Path, inventory_path: Path,
                 fieldmap_path: Path = DEFAULT_FIELDMAP) -> dict:
    spec = DATASETS[dataset]
    upstream_path = reconnect / spec["source"]
    upstream_doc = read_json(upstream_path, "upstream")
    upstream = upstream_doc.get(spec["key"]) if isinstance(upstream_doc, dict) else None
    if not isinstance(upstream, list) or not all(isinstance(item, dict) for item in upstream):
        raise InputError("upstream %s has no %r list of records" % (upstream_path, spec["key"]))

    exists = local_path.exists()
    if exists:
        local = read_json(local_path, "local registry")
    elif dataset == "meds":
        local = {}  # the pharmacy registry may not exist yet: every upstream agent is a candidate
    else:
        raise InputError("local registry not found: %s" % local_path)

    if not inventory_path.exists():
        raise InputError("provenance inventory not found: %s" % inventory_path)
    entry = find_pinned(read_json(inventory_path, "provenance inventory"), spec)

    revision, modified = checkout_state(reconnect, spec["source"])
    report = {
        "dataset": dataset,
        "upstream": {"path": str(upstream_path), "key": spec["key"], "records": len(upstream),
                     "revision": revision, "modified": modified,
                     "sha256": hashlib.sha256(upstream_path.read_bytes()).hexdigest()},
        "local": {"path": str(local_path), "name": local_path.name, "exists": exists,
                  "records": len(local.get("resources", local.get("records", local.get("sources", []))))},
        "pinned": None,
        "added": [], "changed": [], "removed": [], "stale": [], "conflicts": [],
        "denylisted_upstream": {}, "known_discrepancies": [], "notes": [], "roster": None,
    }

    if dataset == "crisis":
        report.update(crisis_sections(upstream, local))
    elif dataset == "meds":
        if not fieldmap_path.exists():
            raise InputError("field map not found: %s" % fieldmap_path)
        report.update(meds_sections(upstream, local, read_json(fieldmap_path, "field map")))
    else:
        report.update(evidence_sections(upstream, local, reconnect))

    identity = {"crisis": crisis_id, "meds": med_id}.get(dataset)
    if entry is not None and identity is not None:
        report["pinned"] = {"revision": entry["sourceRevision"],
                            "sourceRecords": sorted(entry.get("sourceRecords", [])),
                            "fieldMap": entry.get("fieldMap", {})}
        baseline = pinned_records(reconnect, entry, spec["key"], report["conflicts"])
        if baseline is not None:
            changed, report["removed"] = pinned_diff(
                baseline, upstream, entry, spec["key"], identity, report["conflicts"])
            report["changed"] = report["changed"] + changed

    report["conflicts"].sort(key=lambda item: (item["kind"], str(item.get("id", "")),
                                                str(item.get("detail", ""))))
    report["changed"].sort(key=lambda item: (item["record"], str(item["id"]), item["field"],
                                             item.get("basis", "")))
    report["drift"] = bool(report["changed"] or report["removed"] or report["conflicts"])
    return report


def render_crisis(report: dict) -> str:
    """The legacy report, byte for byte (tests/fixtures/reconnect/crisis_report.golden.txt)."""
    lines = [
        "upstream: %s (%d crisis records)" % (report["upstream"]["path"], report["upstream"]["records"]),
        "local:    %s (%d resources)\n" % (report["local"]["name"], report["local"]["records"]),
    ]
    for row in report["rows"]:
        if row["kind"] == "local-only":
            lines.append("  %-22s no upstream record (local-only)" % row["id"])
        elif row["kind"] == "unresolvable":
            lines.append("  %-22s upstream record ref unresolvable: %s" % (row["id"], row["ref"]))
        else:
            lines.append(
                "  %-22s local %r (verified %s) | upstream %r (verified %s)%s"
                % (row["id"], row["local"], row["local_verified"], row["upstream"],
                   row["upstream_verified"], "  <-- DIGITS DIFFER" if row["digits_differ"] else "")
            )
    lines.append("")
    drift = [row for row in report["rows"] if row.get("digits_differ")]
    if drift:
        lines.append("DRIFT — review each against the official source before changing anything:")
        for row in drift:
            lines.append("  %s: local %r vs upstream %r" % (row["id"], row["local"], row["upstream"]))
    else:
        lines.append("No digit-level drift against upstream.")
    if report["stale"]:
        lines.append("\nUpstream is OLDER than this snapshot for %d record(s) — do not pull those back:"
                     % len(report["stale"]))
        for item in report["stale"]:
            lines.append("  %s: upstream %s < local %s"
                         % (item["id"], item["upstream_verified"], item["local_verified"]))
    for discrepancy in report["known_discrepancies"]:
        lines.append(
            "\nKNOWN UPSTREAM DISCREPANCY — %s\n  upstream %r vs verified %r (%s)\n  %s"
            % (discrepancy["reconnectRecord"], discrepancy["upstreamValue"],
               discrepancy["verifiedValue"], discrepancy["verificationSource"], discrepancy["action"])
        )
    if report["pinned"] is not None:
        lines.extend(pinned_lines(report))
    lines.append("\nReport only — nothing was written.")
    return "\n".join(lines) + "\n"


def describe(section: str, item, key: str) -> str:
    if section == "added" and "pmid" in item:
        return "PMID %s · %s · %s · %s" % (item["pmid"] or "-", item["doi"] or "-",
                                           item["year"] or "-", item["title"])
    if section == "added":
        return "%s (%s[%d])" % (item["id"], key, item["record"])
    if section == "changed":
        return "%s[%d] %s: %s → %s: %r → %r (since %s)" % (
            key, item["record"], item["id"], item["field"], item["target"], item["before"],
            item["after"], "carried" if item.get("basis") == "carried" else "pinned revision")
    if section == "removed":
        return "%s[%d] %s" % (key, item["record"], item["id"])
    if section == "stale":
        return "%s (last verified %s)" % (item["id"], item.get("last_verified_date") or "unknown")
    detail = item.get("detail") or ", ".join(
        "%s %s" % (name, value) for name, value in sorted(item.items()) if name != "kind")
    return "%s: %s" % (item["kind"], detail)


def pinned_lines(report: dict) -> list:
    pinned = report["pinned"]
    return [
        "\nPINNED — derived provenance at %s: %d changed, %d removed"
        % (pinned["revision"][:12], len(report["changed"]), len(report["removed"])),
        *["  - " + describe("changed", item, report["upstream"]["key"]) for item in report["changed"]],
        *["  - " + describe("removed", item, report["upstream"]["key"]) for item in report["removed"]],
    ]


def render_generic(report: dict) -> str:
    upstream, local, key = report["upstream"], report["local"], report["upstream"]["key"]
    if upstream["revision"] is None:
        state = "not a git checkout"
    else:
        state = upstream["revision"][:12] + (" (working tree modified)" if upstream["modified"] else "")
    lines = [
        "ReConnect sync report — dataset: %s (report only)" % report["dataset"],
        "upstream: %s (%d %s records) @ %s" % (upstream["path"], upstream["records"], key, state),
        "local:    %s (%d records)%s" % (local["name"], local["records"],
                                          "" if local["exists"] else " — not found — treated as empty"),
    ]
    if report["pinned"] is None:
        lines.append("pinned:   none — no derived provenance entry for %s" % key)
    else:
        lines.append("pinned:   %s (%d source records, %d mapped fields)"
                     % (report["pinned"]["revision"][:12], len(report["pinned"]["sourceRecords"]),
                        len(report["pinned"]["fieldMap"])))
    titles = (
        ("added", "ADDED upstream, not in local"),
        ("changed", "CHANGED since carried / the pinned revision" if report["dataset"] == "meds"
         else "CHANGED since the pinned revision"),
        ("removed", "REMOVED since the pinned revision"),
        ("conflicts", "CONFLICTS"),
        ("stale", "STALE upstream (freshness red)"),
    )
    for section, title in titles:
        lines.append("\n%s — %d" % (title, len(report[section])))
        lines.extend("  - " + describe(section, item, key) for item in report[section])
    roster = report.get("roster")
    if roster:
        lines.append("\nPHASE-1 ROSTER — %d of %d covered upstream" % (roster["covered"], roster["size"]))
        if roster["missingUpstream"]:
            lines.append("  - missing upstream (L fields from the label): %s"
                         % ", ".join(roster["missingUpstream"]))
        lines.append("  - Phase-2 pool (%d): %s" % (len(roster["phase2Pool"]),
                                                    ", ".join(roster["phase2Pool"]) or "none"))
    if report["denylisted_upstream"]:
        lines.append("\nDENYLISTED fields present upstream (never copied) — %d"
                     % len(report["denylisted_upstream"]))
        lines.extend("  - %s ×%d" % (name, count) for name, count in report["denylisted_upstream"].items())
    if report["notes"]:
        lines.append("\nNOTES")
        lines.extend("  - " + note for note in report["notes"])
    if report["drift"]:
        lines.append("\nDrift: yes — %d changed, %d removed, %d conflict(s)"
                     % (len(report["changed"]), len(report["removed"]), len(report["conflicts"])))
    else:
        lines.append("\nDrift: none")
    lines.append("Report only — nothing was written.")
    return "\n".join(lines) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", required=True, choices=sorted(DATASETS))
    parser.add_argument("--reconnect", required=True, type=Path,
                        help="Path to a reconnect-psychiatry-system checkout")
    parser.add_argument("--format", choices=("md", "json"), default="md")
    parser.add_argument("--local", type=Path, default=None,
                        help="registry to compare (default: the dataset's registry at the repo root)")
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY,
                        help="provenance inventory (default: the production inventory)")
    parser.add_argument("--fieldmap", type=Path, default=DEFAULT_FIELDMAP,
                        help="meds field map (default: the G0-approved production map)")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    spec = DATASETS[args.dataset]
    reconnect = args.reconnect.expanduser()
    upstream_path = reconnect / spec["source"]
    if not upstream_path.exists():
        print("upstream not found: %s" % upstream_path, file=sys.stderr)
        print("pass --reconnect <path-to-reconnect-psychiatry-system>", file=sys.stderr)
        return 2
    try:
        report = build_report(args.dataset, reconnect,
                              args.local or default_local(args.dataset), args.inventory,
                              args.fieldmap)
    except InputError as error:
        print(error, file=sys.stderr)
        return 2
    if args.format == "json":
        sys.stdout.write(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    elif args.dataset == "crisis":
        sys.stdout.write(render_crisis(report))
    else:
        sys.stdout.write(render_generic(report))
    return 1 if report["drift"] else 0


if __name__ == "__main__":
    sys.exit(main())
