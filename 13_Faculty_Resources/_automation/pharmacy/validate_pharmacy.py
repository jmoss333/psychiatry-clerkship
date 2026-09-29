#!/usr/bin/env python3
"""Offline gate for pharmacy.json (spec 02, section 7). No network; safe for CI and verify.sh.

Checks, by acceptance-criterion id:
  AC2/AC3  label facts equal the committed label receipt (rxcui, DailyMed set id, label date,
           boxed-warning presence) — the receipt is written by verify_pharmacy_labels.py;
  AC4'     no dose literal anywhere in pharmacy.json (spec 4a, Option A);
  AC5      every evidenceIds / qbankIds / perinatalSnapshotRef / monitoring.sourcePage resolves,
           and dosing.labelLink points at the record's own DailyMed set id;
  AC6      a record marked reviewed carries a reviewedFieldsHash equal to the hash of its J
           fields as they stand now (edit a J field and the record stops counting as reviewed);
  AC7      familyExplainer text reads at or below grade 8 (Flesch-Kincaid, heuristic syllables);
  AC13     no denylisted ReConnect key anywhere;
  SPAN     every provenance.jSources quote appears verbatim (whitespace-normalised) in the cited
           attested page, or equals the carried ReConnect value it names;
  COVER    every field classed J or E is either sourced (jSources) or declared authored
           (authoredFields) — nothing judgment-bearing is silently unsourced.

    python3 13_Faculty_Resources/_automation/pharmacy/validate_pharmacy.py [--hash ID]

Exit 0 clean, 1 a finding, 2 could not check. Pending (unreviewed) high-safety records are
reported as a count, not a failure: pharmacy.json does not ship to a learner site yet, and
when it does the page's own attestation row is what gates it.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PHARMACY = ROOT / "pharmacy.json"
RECEIPT = HERE / "label_receipt.json"
FIELDMAP = HERE / "reconnect_meds_fieldmap.json"

DOSE_RE = re.compile(r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b", re.I)
FK_MAX = 8.0


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


def check(pharmacy, receipt, fieldmap, root=ROOT):
    findings, notes = [], []
    denylist = set(fieldmap["denylist"])
    evidence = {s["id"] for s in json.loads((root / "evidence_registry.json").read_text())["sources"]}
    qbank = {q["id"] for q in json.loads((root / "question_bank.json").read_text())["items"]}
    topics = set(json.loads((root / "topic_meta.json").read_text()))
    page_cache = {}

    for path, key, child in walk(pharmacy):
        if key in denylist:
            findings.append("AC13 denylisted key at %s" % path)
        if isinstance(child, str) and DOSE_RE.search(child):
            findings.append("AC4' dose literal at %s" % path)

    pending = 0
    for record in pharmacy.get("records", []):
        rid = record.get("id", "?")
        prov = record.get("provenance", {})

        # AC2 / AC3 ---------------------------------------------------------------------
        entry = receipt.get("agents", {}).get(prov.get("labelReceipt", rid))
        if not entry:
            findings.append("AC2 %s: no label receipt entry" % rid)
        else:
            ref = entry.get("reference", {})
            pairs = (
                ("rxcui", record.get("rxcui"), entry.get("rxnorm", {}).get("rxcui")),
                ("dailymedSetId", record.get("dailymedSetId"), ref.get("setId")),
                ("labelVersionDate", record.get("labelVersionDate"), ref.get("effectiveDate")),
                ("boxedWarning.present", get_path(record, "boxedWarning.present"),
                 ref.get("boxedWarningPresent")),
            )
            for name, have, want in pairs:
                if have != want:
                    findings.append("AC2 %s: %s is %r, receipt says %r" % (rid, name, have, want))
            if entry.get("problems"):
                findings.append("AC2 %s: receipt recorded problems %s" % (rid, entry["problems"]))

        # AC5 ---------------------------------------------------------------------------
        for eid in record.get("evidenceIds", []) + [
            e for use in record.get("inpatientUses", []) for e in use.get("evidenceIds", [])
        ]:
            if eid not in evidence:
                findings.append("AC5 %s: evidence id %r not in evidence_registry.json" % (rid, eid))
        for qid in record.get("qbankIds", []):
            if qid not in qbank:
                findings.append("AC5 %s: qbank id %r not in question_bank.json" % (rid, qid))
        ref_path = get_path(record, "populations.perinatalSnapshotRef")
        if ref_path and not (root / ref_path).is_file():
            findings.append("AC5 %s: perinatalSnapshotRef missing: %s" % (rid, ref_path))
        source_page = get_path(record, "monitoring.sourcePage")
        if source_page and source_page not in topics:
            findings.append("AC5 %s: monitoring.sourcePage %r is not a topic_meta key" % (rid, source_page))
        link = get_path(record, "dosing.labelLink")
        if link and record.get("dailymedSetId") and not link.endswith(record["dailymedSetId"]):
            findings.append("AC5 %s: dosing.labelLink does not point at its own set id" % rid)

        # SPAN --------------------------------------------------------------------------
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

        # COVER -------------------------------------------------------------------------
        sourced = set(prov.get("jSources", {}))
        authored = {a.split("[")[0] for a in prov.get("authoredFields", [])}
        for path, cls in sorted(prov.get("fieldClasses", {}).items()):
            if cls not in ("J", "E") or get_path(record, path) is None:
                continue
            # Self-or-ancestor only: a partly authored sub-field ("pearls.t2[1]") must not
            # launder the whole field ("pearls") as covered.
            covered = any(path == s or path.startswith(s + ".") for s in sourced | authored)
            if not covered:
                findings.append("COVER %s: %s field %r is neither sourced nor declared authored" % (rid, cls, path))

        # AC7 ---------------------------------------------------------------------------
        text = get_path(record, "familyExplainer.text")
        if text:
            grade = fk_grade(text)
            notes.append("%s familyExplainer FK grade %.1f" % (rid, grade))
            if grade > FK_MAX:
                findings.append("AC7 %s: familyExplainer reads at grade %.1f (> %.1f)" % (rid, grade, FK_MAX))

        # AC6 ---------------------------------------------------------------------------
        review = record.get("facultyReview", {})
        if review.get("status") == "reviewed":
            if review.get("reviewedFieldsHash") != j_hash(record):
                findings.append("AC6 %s: J fields changed since review (hash mismatch)" % rid)
        elif record.get("safetyLevel") == "high":
            pending += 1

    notes.append("%d record(s), %d high-safety pending faculty review" % (
        len(pharmacy.get("records", [])), pending))
    return findings, notes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--hash", metavar="ID", help="print the current J-field hash for one record")
    parser.add_argument("--pharmacy", type=Path, default=PHARMACY, help=argparse.SUPPRESS)
    parser.add_argument("--receipt", type=Path, default=RECEIPT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    pharmacy, error = load(args.pharmacy)
    receipt, error2 = load(args.receipt)
    fieldmap, error3 = load(FIELDMAP)
    if error or error2 or error3:
        print("could not check: %s" % (error or error2 or error3), file=sys.stderr)
        return 2
    if args.hash:
        for record in pharmacy.get("records", []):
            if record.get("id") == args.hash:
                print(j_hash(record))
                return 0
        print("could not check: no record %r" % args.hash, file=sys.stderr)
        return 2
    findings, notes = check(pharmacy, receipt, fieldmap)
    for note in notes:
        print("  " + note)
    for finding in findings:
        print("FAIL " + finding)
    print("pharmacy: %s" % ("%d finding(s)" % len(findings) if findings else "OK"))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
