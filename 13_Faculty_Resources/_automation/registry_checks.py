#!/usr/bin/env python3
"""Checks every ReConnect-derived registry shares, stated once.

pharmacy/validate_pharmacy.py was the first gate of its kind and still carries its own copies
of these primitives (its J-hash is pinned by the promotion guard, so it is not rewired here).
The scales and therapies gates import from this module instead, and
test_registry_checks.py pins each function here byte-for-byte against the pharmacy copy, so
the two can never drift apart silently.

What is shared:
  j_hash              sha256 over a record's J-class fields (facultyReview.reviewedFieldsHash)
  fk_grade            Flesch-Kincaid grade with heuristic syllables (family text <= 8)
  walk / get_path     tree walking and dotted-path resolution
  resolve             'a.b[2].c' resolution for retrieval mappings
  retrieval_hash      sha256 over asks + ask->field mapping
  DOSE_RE             the dose-literal pattern (Option A: no dose literals anywhere)
  common_findings()   the checks whose rule is identical for every derived registry:
                      AC13 denylist, AC4' dose literals, AC5 evidence/qbank ids, SPAN verbatim
                      quotes, COVER every J/E field sourced or declared authored, AC7 family
                      text grade, RET retrieval mapping, AC6 review hash binding.

A dataset-specific gate adds its own findings on top (label receipt for drugs, custodian
sources and no-instrument-text for scales, guideline sources for therapies).
"""

import hashlib
import json
import re
from pathlib import Path

DOSE_RE = re.compile(r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b", re.I)
FK_MAX = 8.0
TOKEN = re.compile(r"([A-Za-z0-9]+)|\[([0-9]+)\]")


def norm(text):
    return " ".join(text.split())


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8")), None
    except FileNotFoundError:
        return None, "missing: %s" % path
    except (ValueError, UnicodeDecodeError) as error:
        return None, "unreadable: %s (%s)" % (path, error)


def get_path(obj, dotted):
    """Resolve 'a.b' against a record; returns None when any hop is absent."""
    for part in dotted.split("."):
        if not isinstance(obj, dict) or part not in obj:
            return None
        obj = obj[part]
    return obj


def resolve(record, path):
    """Resolve 'a.b[2].c' against a record; None when any hop is absent."""
    node = record
    for name, index in TOKEN.findall(path):
        if name:
            if not isinstance(node, dict) or name not in node:
                return None
            node = node[name]
        else:
            i = int(index)
            if not isinstance(node, list) or i >= len(node):
                return None
            node = node[i]
    return node


def retrieval_hash(record):
    """sha256 over the ask→field mapping plus the asks it maps (a reworded ask re-opens it)."""
    payload = {"asks": record.get("attendingAsks", []), "retrieval": record.get("retrieval", [])}
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def j_hash(record):
    """sha256 over the record's J-class fields, canonical JSON, sorted by path."""
    classes = record.get("provenance", {}).get("fieldClasses", {})
    payload = {path: get_path(record, path) for path in sorted(classes) if classes[path] == "J"}
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def syllables(word):
    word = word.lower().strip(".,;:!?'\"()")
    if not word:
        return 0
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(1, count)


def fk_grade(text):
    sentences = max(1, len(re.findall(r"[.!?]+(?:\s|$)", text)))
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", text)
    if not words:
        return 0.0
    syl = sum(syllables(w) for w in words)
    return round(0.39 * len(words) / sentences + 11.8 * syl / len(words) - 15.59, 1)


def walk(value, trail=""):
    if isinstance(value, dict):
        for key, child in value.items():
            yield "%s/%s" % (trail, key), key, child
            yield from walk(child, "%s/%s" % (trail, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, "%s/%d" % (trail, index))


def common_findings(registry, fieldmap, root, *, family_path="familyExplainer.text"):
    """The findings every derived registry shares. Returns (findings, notes, pending_high)."""
    findings, notes = [], []
    denylist = set(fieldmap["denylist"])
    evidence = {s["id"] for s in json.loads((root / "evidence_registry.json").read_text(encoding="utf-8"))["sources"]}
    qbank = {q["id"] for q in json.loads((root / "question_bank.json").read_text(encoding="utf-8"))["items"]}
    page_cache = {}

    for path, key, child in walk(registry):
        if key in denylist:
            findings.append("AC13 denylisted key at %s" % path)
        if isinstance(child, str) and DOSE_RE.search(child):
            findings.append("AC4' dose literal at %s" % path)

    pending = 0
    seen_ids = set()
    for record in registry.get("records", []):
        rid = record.get("id", "?")
        if rid in seen_ids:
            findings.append("ID duplicate record id %r" % rid)
        seen_ids.add(rid)
        prov = record.get("provenance", {})

        # AC5: every off-record id resolves.
        for eid in record.get("evidenceIds", []):
            if eid not in evidence:
                findings.append("AC5 %s: evidence id %r not in evidence_registry.json" % (rid, eid))
        for qid in record.get("qbankIds", []):
            if qid not in qbank:
                findings.append("AC5 %s: qbank id %r not in question_bank.json" % (rid, qid))

        # SPAN: every quote is verbatim in the attested page it cites, or equals the carried value.
        carried = prov.get("carried", {})
        for field, sources in sorted(prov.get("jSources", {}).items()):
            for source in sources:
                page, quote = source["page"], source["quote"]
                if page.startswith("reconnect:"):
                    upstream = page.split(":", 1)[1]
                    if carried.get(upstream) != quote:
                        findings.append("SPAN %s.%s: quote does not equal carried %r" % (rid, field, upstream))
                    continue
                if page not in page_cache:
                    target = root / page
                    page_cache[page] = norm(target.read_text(encoding="utf-8")) if target.is_file() else None
                if page_cache[page] is None:
                    findings.append("SPAN %s.%s: cited page missing: %s" % (rid, field, page))
                elif norm(quote) not in page_cache[page]:
                    findings.append("SPAN %s.%s: quote not verbatim in %s: %r" % (rid, field, page, quote[:70]))

        # COVER: nothing judgment-bearing is silently unsourced.
        sourced = set(prov.get("jSources", {}))
        authored = {a.split("[")[0] for a in prov.get("authoredFields", [])}
        for path, cls in sorted(prov.get("fieldClasses", {}).items()):
            if cls not in ("J", "E") or get_path(record, path) is None:
                continue
            covered = any(path == s or path.startswith(s + ".") for s in sourced | authored)
            if not covered:
                findings.append("COVER %s: %s field %r is neither sourced nor declared authored" % (rid, cls, path))

        # AC7: family text reads at or below grade 8.
        text = get_path(record, family_path)
        if text:
            grade = fk_grade(text)
            notes.append("%s %s FK grade %.1f" % (rid, family_path.split(".")[0], grade))
            if grade > FK_MAX:
                findings.append("AC7 %s: %s reads at grade %.1f (> %.1f)" % (rid, family_path, grade, FK_MAX))

        # RET: the flashcard mapping may only point at existing, classified fields.
        classes = prov.get("fieldClasses", {})
        seen = set()
        for entry in record.get("retrieval", []):
            if entry["id"] in seen:
                findings.append("RET %s: duplicate retrieval id %r" % (rid, entry["id"]))
            seen.add(entry["id"])
            if entry["askIndex"] >= len(record.get("attendingAsks", [])):
                findings.append("RET %s.%s: askIndex %d has no ask" % (rid, entry["id"], entry["askIndex"]))
            for path in entry["revealFrom"]:
                value = resolve(record, path)
                if value in (None, "", [], {}):
                    findings.append("RET %s.%s: revealFrom %r resolves to nothing" % (rid, entry["id"], path))
                root_path = path.split("[")[0]
                if not any(root_path == c or root_path.startswith(c + ".") or c.startswith(root_path + ".")
                           for c in classes):
                    findings.append("RET %s.%s: revealFrom %r is not a classified field" % (rid, entry["id"], path))
        stored = record.get("facultyReview", {}).get("retrievalHash")
        if stored and stored != retrieval_hash(record):
            findings.append("AC6 %s: retrieval mapping or asks changed since review (hash mismatch)" % rid)

        # AC6: a reviewed record's J fields are the ones that were reviewed.
        review = record.get("facultyReview", {})
        if review.get("status") == "reviewed":
            if review.get("reviewedFieldsHash") != j_hash(record):
                findings.append("AC6 %s: J fields changed since review (hash mismatch)" % rid)
        elif record.get("safetyLevel") == "high":
            pending += 1

    return findings, notes, pending


PERCENT_RE = re.compile(r"\b\d{1,3}(?:\.\d+)?\s?%")
QUALIFIER_RE = re.compile(r"\b(at|cutoff|cut-off|threshold|≥|>=|>|score)\b", re.I)


def bare_percentages(value):
    """Percentages in a string that carry no qualifier (no 'at cutoff', no threshold)."""
    if not isinstance(value, str):
        return []
    return [m.group(0) for m in PERCENT_RE.finditer(value)] if not QUALIFIER_RE.search(value) else []


def main_for(validator_doc, registry_path, fieldmap_path, extra, root):
    """A shared CLI body: load, check, print findings and notes, exit 0/1/2."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(description=validator_doc.split("\n\n")[0])
    parser.add_argument("--hash", metavar="ID", help="print the current J-field hash for one record")
    args = parser.parse_args()
    registry, error = load(registry_path)
    fieldmap, error2 = load(fieldmap_path)
    for problem in (error, error2):
        if problem:
            print("could not check: %s" % problem)
            return 2
    if args.hash:
        for record in registry.get("records", []):
            if record.get("id") == args.hash:
                print(j_hash(record))
                return 0
        print("no record %r" % args.hash)
        return 2
    findings, notes = extra(registry, fieldmap, root)
    for note in notes:
        print("  note: %s" % note)
    for finding in findings:
        print("  FAIL  %s" % finding)
    print("%s: %s" % (Path(registry_path).name, "OK" if not findings else "%d finding(s)" % len(findings)))
    return 1 if findings else 0
