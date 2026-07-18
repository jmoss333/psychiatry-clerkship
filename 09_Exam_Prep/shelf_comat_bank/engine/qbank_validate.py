#!/usr/bin/env python3
"""
qbank_validate.py — Data-quality gate + coverage engine for the Shelf/COMAT
dual-exam psychiatry question bank.

Runs deterministic, offline checks over one or more bank files against the
canonical superset schema (02_ITEM_SCHEMA.json) and the blueprint crosswalk
quotas (01_BLUEPRINT_CROSSWALK.md, encoded in BLUEPRINT below). It is designed
to be wired into CI: it exits non-zero when any HARD gate fails, prints a
human-readable report, and (with --json) writes a machine-readable report.

It does NOT touch the live bank, the SPA, or reviewed.json. It reads only.

Usage:
    python3 qbank_validate.py 04_pilot_batch_01.json
    python3 qbank_validate.py --json report.json 04_pilot_batch_01.json
    python3 qbank_validate.py --target 24 04_pilot_batch_01.json   # coverage vs a 24-item target

Verdict classes referenced by the audit (not decided here — this tool flags,
faculty decides): publishable_after_faculty_attestation | revise |
evidence_review_required | duplicate | retire.

Author: technical-lead audit pass, 2026-07-13. No PHI. Original content only.
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE.parent / "02_ITEM_SCHEMA.json"

# ---------------------------------------------------------------------------
# Blueprint quotas (verbatim access date 2026-07-13; NBME & NBOME pages last
# modified 2026-06-17; re-verify against the official pages before scaling).
# Percent bands are (low, high) inclusive; category quotas are integer targets.
# ---------------------------------------------------------------------------
CATEGORY_QUOTA = {  # from 01_BLUEPRINT_CROSSWALK.md §5
    180: {"mood": 22, "anxiety": 20, "neurocog": 16, "pharm": 20, "substance": 14,
          "safety": 16, "psychosis": 12, "childdev": 12, "otherdx": 14,
          "relational": 16, "personality": 8, "ethics": 10},
    360: {"mood": 44, "anxiety": 40, "neurocog": 32, "pharm": 40, "substance": 28,
          "safety": 32, "psychosis": 24, "childdev": 24, "otherdx": 28,
          "relational": 32, "personality": 16, "ethics": 20},
    480: {"mood": 59, "anxiety": 53, "neurocog": 43, "pharm": 53, "substance": 37,
          "safety": 43, "psychosis": 32, "childdev": 32, "otherdx": 37,
          "relational": 43, "personality": 21, "ethics": 27},
}
CATEGORIES = list(CATEGORY_QUOTA[180].keys())

# Cross-cutting NBME/COMAT bands (percent of bank), from §6.
SITE_BANDS = {"ambulatory": (60, 65), "emergency-department": (20, 30), "inpatient": (5, 10)}
NBME_TASK_BANDS = {"Diagnosis": (65, 70), "Pharmacotherapy/Intervention/Management": (30, 35)}
AGE_BANDS = {"birth-12": (10, 15), "13+": (85, 90)}   # normalized below
TYPE_BANDS = {"sba": (60, 70), "two-tier": (15, 25), "relational": (8, 14)}
DIFFICULTY_BANDS = {1: (20, 30), 2: (50, 60), 3: (15, 25)}  # §6f 25/55/20 with tolerance
EXAM_BANDS = {"both": (60, 75), "shelf": (10, 20), "comat": (10, 20)}

VALID_NBME_SYSTEMS = {
    "General Principles", "Behavioral Health", "Nervous System & Special Senses",
    "Other Systems", "Social Sciences",
}
VALID_COMAT_PRESENTATIONS = {
    "Anxiety/Trauma/Dissociative/OCD", "Neurocognitive",
    "Neurodevelopmental/Gender Dysphoria/Disruptive-Impulse-Conduct",
    "Depressive/Bipolar/Related", "Personality", "Schizophrenia Spectrum/Psychotic",
    "Psychiatric Illness due to Medical Condition/Somatic/Sleep-Wake",
    "Substance-Related/Addictive", "Feeding-Eating-Elimination/Sexual-Paraphilic",
}
# Strings that would falsely imply official endorsement or reproduce brands.
PROHIBITED_PATTERNS = [
    r"\bNBME[- ]?approved\b", r"\bNBOME[- ]?approved\b", r"\bofficial (NBME|NBOME|USMLE|COMLEX) item\b",
    r"\bendorsed by (the )?(NBME|NBOME)\b", r"\bUWorld\b", r"\bAMBOSS\b",
    r"\bactual exam question\b", r"\brecalled item\b",
]
PLACEHOLDER_PATTERNS = [r"\bTODO\b", r"\bTBD\b", r"\bFIXME\b", r"\bXXX\b", r"\bLOREM IPSUM\b",
                        r"\[\s*placeholder\s*\]", r"\bpending text\b"]

# Similarity thresholds for duplicate detection.
STEM_JACCARD_WARN = 0.55     # token-set Jaccard on stems
STEM_SEQ_WARN = 0.72         # SequenceMatcher ratio on normalized stems
LONGEST_CUE_BATCH_MAX = 0.35 # fraction of items whose key is the SOLE longest option


def load_bank(path):
    d = json.loads(Path(path).read_text())
    return d, d.get("items", [])


def norm_text(s):
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower())


def token_set(s):
    return set(norm_text(s).split())


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def pct(n, d):
    return 0.0 if d == 0 else round(100.0 * n / d, 1)


def in_band(p, band):
    return band[0] <= p <= band[1]


# ---------------------------------------------------------------------------
# Per-item structural gates
# ---------------------------------------------------------------------------
def check_items(items):
    hard, soft = [], []
    ids = Counter()
    for it in items:
        iid = it.get("id", "<no-id>")
        ids[iid] += 1
        opts = it.get("options", [])
        keys = [o.get("key") for o in opts]

        # exactly one keyed answer
        flagged = [o for o in opts if o.get("c") is True]
        if len(flagged) != 1:
            hard.append((iid, f"{len(flagged)} options flagged correct (need exactly 1)"))
        # correct_option matches the c flag
        co = it.get("correct_option")
        if flagged and flagged[0].get("key") != co:
            hard.append((iid, f"correct_option={co} but c-flag on {flagged[0].get('key')}"))
        # 4 options, unique labels A-D
        if len(opts) != 4:
            hard.append((iid, f"{len(opts)} options (expected 4)"))
        if sorted(k for k in keys if k) != ["A", "B", "C", "D"]:
            hard.append((iid, f"option keys not A-D: {keys}"))

        # every distractor has an explanation
        de = it.get("explanation_for_each_distractor", {})
        distractors = [k for k in keys if k != co]
        missing = [k for k in distractors if not de.get(k)]
        if missing:
            hard.append((iid, f"distractor explanation missing for {missing}"))
        # every option carries a trap OR the key
        for o in opts:
            if not o.get("c") and "trap" not in o:
                soft.append((iid, f"option {o.get('key')} lacks a 'trap' annotation"))

        # references present
        refs = it.get("references", [])
        if not refs:
            hard.append((iid, "no references"))
        for r in refs:
            if isinstance(r, dict) and not (r.get("citation") or r.get("title")):
                soft.append((iid, "reference lacks citation/title text"))

        # blueprint tags valid
        bp = it.get("blueprint", {})
        nb_sys = bp.get("nbme", {}).get("system")
        if nb_sys and nb_sys not in VALID_NBME_SYSTEMS:
            hard.append((iid, f"invalid NBME system: {nb_sys!r}"))
        cm_pres = bp.get("comat", {}).get("presentation")
        if cm_pres and cm_pres not in VALID_COMAT_PRESENTATIONS:
            hard.append((iid, f"invalid COMAT presentation: {cm_pres!r}"))

        # category / difficulty sanity
        if it.get("category") not in CATEGORIES:
            hard.append((iid, f"unknown category: {it.get('category')!r}"))
        if it.get("difficulty") not in (1, 2, 3):
            hard.append((iid, f"difficulty not in 1-3: {it.get('difficulty')!r}"))

        # two-tier items carry a tier2 with a keyed answer
        if it.get("type") == "two-tier":
            t2 = it.get("tier2")
            if not (isinstance(t2, dict) and any(o.get("c") for o in t2.get("options", []))):
                hard.append((iid, "type=two-tier but tier2 missing or has no keyed answer"))

        blob = " ".join(str(it.get(f, "")) for f in ("stem", "lead_in", "why",
                        "complete_correct_answer_explanation", "pearl", "key_takeaway"))
        for pat in PROHIBITED_PATTERNS:
            if re.search(pat, blob, re.I):
                hard.append((iid, f"prohibited/branding text matches /{pat}/"))
        for pat in PLACEHOLDER_PATTERNS:
            if re.search(pat, blob, re.I):
                hard.append((iid, f"unresolved placeholder matches /{pat}/"))

        # coaching text embedded in stem/lead-in that telegraphs the key
        if re.search(r"consider the function of the best reply|the best reply should|"
                     r"the correct answer|hint:", blob, re.I):
            soft.append((iid, "stem/lead-in contains answer-telegraphing coaching text"))

    for iid, c in ids.items():
        if c > 1:
            hard.append((iid, f"duplicate id appears {c}×"))
    return hard, soft


# ---------------------------------------------------------------------------
# Item-writing statistical flaws (batch-level)
# ---------------------------------------------------------------------------
def check_item_writing(items):
    soft = []
    n = len(items)
    # key position balance
    keypos = Counter(it.get("correct_option") for it in items)
    if n >= 8:
        expected = n / 4
        for k in "ABCD":
            if abs(keypos.get(k, 0) - expected) > max(2, 0.15 * n):
                soft.append(("BATCH", f"key-position imbalance: {dict(keypos)} (expected ~{expected:.1f} each)"))
                break
    # longest-answer cue
    sole_longest = []
    for it in items:
        opts = it.get("options", [])
        lens = {o["key"]: len(o.get("t", "")) for o in opts}
        co = it.get("correct_option")
        if not lens or co not in lens:
            continue
        mx = max(lens.values())
        if lens[co] == mx and list(lens.values()).count(mx) == 1:
            sole_longest.append(it["id"])
    frac = pct(len(sole_longest), n) / 100
    if frac > LONGEST_CUE_BATCH_MAX:
        soft.append(("BATCH", f"longest-answer cue: correct option is the SOLE longest in "
                     f"{len(sole_longest)}/{n} items ({frac*100:.0f}%); target <={int(LONGEST_CUE_BATCH_MAX*100)}%. "
                     f"Items: {', '.join(sole_longest)}"))
    # negative / 'avoid' lead-ins (NBME discourages)
    for it in items:
        li = it.get("lead_in", "").lower()
        if re.search(r"\bnot\b|except|least|most important to avoid|avoid", li):
            soft.append((it["id"], f"negatively-phrased lead-in: {it.get('lead_in')!r}"))
    return soft


# ---------------------------------------------------------------------------
# Duplicate / near-duplicate detection (lexical + concept signature)
# ---------------------------------------------------------------------------
def check_duplicates(items):
    soft = []
    sigs = []
    for it in items:
        stem = it.get("stem", "")
        sigs.append((it["id"], token_set(stem), norm_text(stem),
                     (it.get("category"), it.get("correct_option"))))
    for i in range(len(sigs)):
        for j in range(i + 1, len(sigs)):
            id_a, tok_a, nrm_a, ca = sigs[i]
            id_b, tok_b, nrm_b, cb = sigs[j]
            jac = jaccard(tok_a, tok_b)
            seq = SequenceMatcher(None, nrm_a, nrm_b).ratio()
            if jac >= STEM_JACCARD_WARN or seq >= STEM_SEQ_WARN:
                soft.append(("DUP", f"{id_a} ~ {id_b}: stem Jaccard={jac:.2f} seq={seq:.2f}"
                             + ("  [same category+key]" if ca == cb else "")))
    return soft


# ---------------------------------------------------------------------------
# Coverage vs blueprint
# ---------------------------------------------------------------------------
def normalize_age(v):
    v = (v or "").lower()
    return "birth-12" if "birth" in v or v.startswith("child") else "13+"


def coverage(items, target):
    n = len(items)
    cat = Counter(it.get("category") for it in items)
    site = Counter(it.get("clinical_setting") for it in items)
    age = Counter(normalize_age(it.get("patient_age_group")) for it in items)
    typ = Counter(it.get("type") for it in items)
    diff = Counter(it.get("difficulty") for it in items)
    exam = Counter(it.get("exam_alignment") for it in items)
    nbme_task = Counter(it.get("blueprint", {}).get("nbme", {}).get("physician_task") for it in items)

    rep = {"n": n, "target": target, "category": {}, "cross_cutting": {}}
    quota = CATEGORY_QUOTA.get(target)
    for c in CATEGORIES:
        have = cat.get(c, 0)
        want = quota.get(c) if quota else None
        rep["category"][c] = {"have": have, "target": want,
                              "status": None if want is None else
                              ("under" if have < want else "ok" if have == want else "over")}

    def band_block(counter, bands, labeler=lambda k: k):
        out = {}
        for k, band in bands.items():
            got = counter.get(k, 0)
            p = pct(got, n)
            out[labeler(k)] = {"n": got, "pct": p, "band": band, "in_band": in_band(p, band)}
        return out

    rep["cross_cutting"]["site_of_care"] = band_block(site, SITE_BANDS)
    rep["cross_cutting"]["nbme_task"] = band_block(nbme_task, NBME_TASK_BANDS)
    rep["cross_cutting"]["age"] = band_block(age, AGE_BANDS)
    rep["cross_cutting"]["type"] = band_block(typ, TYPE_BANDS)
    rep["cross_cutting"]["difficulty"] = band_block(diff, {str(k): v for k, v in DIFFICULTY_BANDS.items()},
                                                    labeler=str) if False else \
        {str(k): {"n": diff.get(k, 0), "pct": pct(diff.get(k, 0), n), "band": b,
                  "in_band": in_band(pct(diff.get(k, 0), n), b)} for k, b in DIFFICULTY_BANDS.items()}
    rep["cross_cutting"]["exam_alignment"] = band_block(exam, EXAM_BANDS)
    return rep


def missing_assignments(cov):
    """Deterministic next-item assignments for underfilled category cells."""
    out = []
    for c, d in cov["category"].items():
        if d["status"] == "under":
            out.append({"category": c, "need": d["target"] - d["have"]})
    out.sort(key=lambda x: -x["need"])
    return out


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def run(paths, target, json_out):
    all_items = []
    per_file = {}
    for p in paths:
        _, items = load_bank(p)
        per_file[p] = len(items)
        all_items.extend(items)

    hard, soft = check_items(all_items)
    soft += check_item_writing(all_items)
    soft += check_duplicates(all_items)
    cov = coverage(all_items, target)
    miss = missing_assignments(cov)

    print("=" * 72)
    print(f"QBANK VALIDATION — {sum(per_file.values())} items across {len(paths)} file(s)")
    print("=" * 72)
    for p, c in per_file.items():
        print(f"  {Path(p).name}: {c} items")

    print(f"\nHARD GATES: {'FAIL' if hard else 'PASS'} ({len(hard)} failure(s))")
    for iid, msg in hard:
        print(f"  [HARD] {iid}: {msg}")

    print(f"\nSOFT FLAGS: {len(soft)} (review; not build-blocking)")
    for iid, msg in soft:
        print(f"  [soft] {iid}: {msg}")

    print(f"\nCOVERAGE vs target={target} (n={cov['n']}):")
    print("  Category           have / target   status")
    for c, d in cov["category"].items():
        print(f"    {c:16s} {str(d['have']):>4s} / {str(d['target']):<6s}  {d['status']}")
    print("  Cross-cutting bands (pct of bank):")
    for block, data in cov["cross_cutting"].items():
        print(f"    {block}:")
        for k, v in data.items():
            mark = "ok " if v["in_band"] else "OUT"
            print(f"      {mark} {k:28s} {v['pct']:>5.1f}%  band={v['band'][0]}-{v['band'][1]}%")
    if miss:
        print("\n  Missing-item assignments (underfilled cells, largest first):")
        for m in miss:
            print(f"    +{m['need']:>3d}  {m['category']}")

    if json_out:
        Path(json_out).write_text(json.dumps(
            {"files": per_file, "hard": hard, "soft": soft, "coverage": cov,
             "missing_assignments": miss}, indent=2))
        print(f"\nWrote machine report: {json_out}")

    print("\nRESULT:", "FAIL (hard gate)" if hard else "PASS")
    return 1 if hard else 0


def main():
    ap = argparse.ArgumentParser(description="Validate psychiatry qbank files.")
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--target", type=int, default=180, choices=[24, 180, 360, 480],
                    help="coverage target (24 = pilot scale, uses 180 quotas scaled by /7.5 conceptually; "
                         "for pilot use 180 to see the gap to V1)")
    ap.add_argument("--json", dest="json_out", default=None)
    args = ap.parse_args()
    # target=24 is a convenience: compare against 180 quotas but label pilot scale
    tgt = 180 if args.target == 24 else args.target
    sys.exit(run(args.paths, tgt, args.json_out))


if __name__ == "__main__":
    main()
