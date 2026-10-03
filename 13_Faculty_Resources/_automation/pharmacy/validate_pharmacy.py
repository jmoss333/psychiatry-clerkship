#!/usr/bin/env python3
"""Offline gate for pharmacy.json (spec 02, section 7). No network; safe for CI and verify.sh.

Checks, by acceptance-criterion id:
  AC2/AC3  label facts equal the committed label receipt (rxcui, DailyMed set id, label date,
           boxed-warning presence) — the receipt is written by verify_pharmacy_labels.py;
  AC4'     no dose literal anywhere in pharmacy.json (spec 4a, Option A); a laboratory or
           physiology value (CRP mg/L, glucose mg/dL, GFR mL/min, a drug LEVEL in mcg/mL)
           is not a dose (revision 2, 2026-10-03) — see dose_literals();
  AC5      every evidenceIds / qbankIds / interactionCardIds (interaction-cards.html) /
           oeAudioIds (audio_oe MANIFEST.csv) / perinatalSnapshotRef / monitoring.sourcePage
           resolves, and dosing.labelLink points at the record's own DailyMed set id;
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
import csv
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
# AC5 resolution targets for the two id lists that point off the card (#898).
INTERACTION_CARDS = Path("05_Psychopharmacology/Monitoring_and_Labs/interaction-cards.html")
AUDIO_OE_MANIFEST = Path("12_Media/audio_oe/MANIFEST.csv")

# AC4' (spec 4a, Option A): a number carrying a dose unit is a dose literal, with ONE class of
# exception decided in revision 2 (2026-10-03, OE run log decision AC4'): a laboratory or
# physiology value is not a dose. In the 25 OpenEvidence draft cards of 2026-10-02 the old bare
# regex matched 15 times and 14 were lab values — CRP "100 mg/L", valproate trough "85-125
# mcg/mL", duloxetine "GFR <30 mL/min" — while the one real dose ("200 mg bid") is still
# caught below. The exception is deliberately NARROW, because the same units also write
# product strengths and rates, and those ARE doses:
#   * mg|mcg per L or dL ............ lab value, always exempt (no product strength is per L/dL);
#   * mL per min/minute ............. renal clearance (GFR, CrCl), always exempt;
#   * mg|mcg per mL ................. exempt ONLY when the same sentence names a level before the
#                                     number ("serum", "trough", "level", "concentration", ...):
#                                     "5 mg/mL" with no such cue is an injectable strength and
#                                     stays a dose literal — fail closed, reword to name the level;
#   * anything else (mg/kg, mg/day, mg/min, mg/h, a bare "mg") stays a dose literal.
# Every caller goes through dose_literals() / has_dose_literal() / mask_dose_literals(); there
# is deliberately no public regex, so no caller can silently keep the stricter or looser rule.
_DOSE_CANDIDATE_RE = re.compile(r"\b\d+(?:\.\d+)?\s?(mg|mcg|mL|mg/kg)\b", re.I)
_PER_LAB_VOLUME_RE = re.compile(r"\s?/\s?d?L\b", re.I)
_PER_MINUTE_RE = re.compile(r"\s?/\s?min(?:ute)?s?\b", re.I)
_PER_ML_RE = re.compile(r"\s?/\s?mL\b", re.I)
_LEVEL_CUE_RE = re.compile(
    r"\b(?:levels?|concentrations?|troughs?|peaks?|serum|plasma|range|therapeutic)\b", re.I)
_SENTENCE_BREAK_RE = re.compile(r"[.!?](?=\s)|\n")
LEVEL_CUE_WINDOW = 160  # characters searched back from the number, never past a sentence break


def _sentence_before(text, start):
    """The text from the start of the current sentence (bounded by LEVEL_CUE_WINDOW) to start."""
    window_start = max(0, start - LEVEL_CUE_WINDOW)
    window = text[window_start:start]
    breaks = list(_SENTENCE_BREAK_RE.finditer(window))
    return window[breaks[-1].end():] if breaks else window


def _is_lab_value(text, match):
    unit = match.group(1).lower()
    after = text[match.end():]
    if unit in ("mg", "mcg") and _PER_LAB_VOLUME_RE.match(after):
        return True
    if unit == "ml" and _PER_MINUTE_RE.match(after):
        return True
    if unit in ("mg", "mcg") and _PER_ML_RE.match(after):
        return bool(_LEVEL_CUE_RE.search(_sentence_before(text, match.start())))
    return False


def dose_literals(text):
    """Every dose literal in text, as (start, end, literal); lab/physiology values excluded."""
    return [(m.start(), m.end(), m.group(0)) for m in _DOSE_CANDIDATE_RE.finditer(text or "")
            if not _is_lab_value(text, m)]


def has_dose_literal(text):
    return bool(dose_literals(text))


def mask_dose_literals(text, mask="[dose]"):
    """text with every dose literal replaced by mask; lab/physiology values are left as written."""
    text = text or ""
    out, last = [], 0
    for start, end, _ in dose_literals(text):
        out.append(text[last:start])
        out.append(mask)
        last = end
    out.append(text[last:])
    return "".join(out)
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


TOKEN = re.compile(r"([A-Za-z0-9]+)|\[([0-9]+)\]")


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


def retrieval_reviewed(record):
    review = record.get("facultyReview", {})
    return bool(record.get("retrieval")) and review.get("retrievalHash") == retrieval_hash(record)


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


def interaction_card_ids(root):
    """The card keys interaction-cards.html renders (its ORDER list); None if unreadable."""
    try:
        text = (root / INTERACTION_CARDS).read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(r"var ORDER = \[([^\]]*)\]", text)
    return set(re.findall(r'"([^"]+)"', match.group(1))) if match else None


def audio_brief_key(value):
    """Landmark audio briefs are keyed by manifest number, leading zeros ignored — the same
    convention pairings.json uses for its audio_oe refs."""
    return str(value).strip().lstrip("0") or "0"


def audio_brief_ids(root):
    """Every brief number in the audio_oe manifest; None if unreadable."""
    try:
        with (root / AUDIO_OE_MANIFEST).open(encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    except OSError:
        return None
    return {audio_brief_key(row["number"]) for row in rows if (row.get("number") or "").strip()}


def check(pharmacy, receipt, fieldmap, root=ROOT):
    findings, notes = [], []
    # The field map's denylist is the ONE statement of this rule: the dev-only sync engine
    # reads the same file (test_sync_from_reconnect pins that), so nothing here imports it.
    denylist = set(fieldmap["denylist"])
    evidence = {s["id"] for s in json.loads((root / "evidence_registry.json").read_text())["sources"]}
    qbank = {q["id"] for q in json.loads((root / "question_bank.json").read_text())["items"]}
    topics = set(json.loads((root / "topic_meta.json").read_text()))
    cards, briefs = interaction_card_ids(root), audio_brief_ids(root)
    page_cache = {}

    for path, key, child in walk(pharmacy):
        if key in denylist:
            findings.append("AC13 denylisted key at %s" % path)
        if isinstance(child, str) and has_dose_literal(child):
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
        # An unreadable target fails every id that needs it: a card cannot link a page or a
        # brief nobody can confirm exists.
        for cid in get_path(record, "interactions.interactionCardIds") or []:
            if cards is None or cid not in cards:
                findings.append("AC5 %s: interaction card %r is not on %s"
                                % (rid, cid, INTERACTION_CARDS.name))
        for aid in record.get("oeAudioIds", []):
            if briefs is None or audio_brief_key(aid) not in briefs:
                findings.append("AC5 %s: audio brief %r is not in %s"
                                % (rid, aid, AUDIO_OE_MANIFEST.as_posix()))
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

        # RET: the flashcard mapping may only point at existing, classified card fields ----
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
                    findings.append("RET %s.%s: revealFrom %r is not a classified card field" % (rid, entry["id"], path))
        stored = record.get("facultyReview", {}).get("retrievalHash")
        if stored and stored != retrieval_hash(record):
            findings.append("AC6 %s: retrieval mapping or asks changed since review (hash mismatch)" % rid)

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
    parser.add_argument("--retrieval-hash", metavar="ID", help="print the current retrieval-mapping hash")
    parser.add_argument("--pharmacy", type=Path, default=PHARMACY, help=argparse.SUPPRESS)
    parser.add_argument("--receipt", type=Path, default=RECEIPT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    pharmacy, error = load(args.pharmacy)
    receipt, error2 = load(args.receipt)
    fieldmap, error3 = load(FIELDMAP)
    if error or error2 or error3:
        print("could not check: %s" % (error or error2 or error3), file=sys.stderr)
        return 2
    wanted = args.hash or args.retrieval_hash
    if wanted:
        for record in pharmacy.get("records", []):
            if record.get("id") == wanted:
                print(j_hash(record) if args.hash else retrieval_hash(record))
                return 0
        print("could not check: no record %r" % wanted, file=sys.stderr)
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
