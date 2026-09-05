#!/usr/bin/env python3
"""Find a fix that landed on one twin and not the other.

WP-5o found A2MS3-F001 still live for residents nine work packages after it was
closed for students. `delirium_vs_psychosis_001` exists twice under the same id
-- once in reasoning_cases.json (MS3), once in reasoning_cases_resident.json --
and the withdrawal fix reached only the MS3 copy. The resident twin kept a
delirium workup with no withdrawal in it while the SAME case's feedback on a
different option already said "Benzodiazepines can worsen non-withdrawal
delirium", presupposing a distinction it never asked the resident to draw.

Nothing in the repo could see it. Both files are individually schema-valid; the
review transcript for an `audience: "both"` finding is MS3+RES concatenated, so
a one-audience fix reads as applied. The defect is only visible by comparing the
twins to each other, which is what this does.

WP-5p swept the class. Two twin families exist, and they need different tests:

  EXACT   agitation.pack.json <-> rp-agitation.pack.json, matched by scenario id.
          Same content, two consumers (agitation-trainer.html and the shipping
          rp-agitation.html). Any field difference is drift. Zero false positives
          by construction, so this half exits non-zero.
  CONCEPT reasoning_cases.json <-> reasoning_cases_resident.json, matched by case
          id. Deliberately authored at two depths -- different facts, learnerGoal
          and biasChecks -- so a field diff is ~40 rows of pure noise. Only the
          safety vocabulary is compared: if one twin names a can't-miss concept
          and the other does not, that is worth a human look. Heuristic, so this
          half reports without failing.
  SNAPSHOT each agitation pack <-> the preview HTML that inlines a copy of it.
          A second drift axis, and the one #483 had to be read to notice: the
          previews carry the whole pack as a JS object literal, so a pack edit
          silently leaves them behind. At the start of WP-5p both previews were
          missing the nikooie2019 citation that RSAF-F005 added, and the MS3
          preview was additionally missing both RSAF text corrections. Exact,
          so it fails like EXACT.

Case-of-the-Week MS3/Resident files are deliberately NOT compared. They look
like twins and are not: 2026-07-20_mdd-*_MS3 is a 34-year-old on a first SSRI
trial, _Resident is a 41-year-old in her third lifetime episode. They are
different patients on a shared topic, so vocabulary parity across them produced
14 findings and all 14 were false. Do not add them back.

Measured on the corpus as it stood at the start of WP-5p: EXACT flags the two
scenarios that were missing RSAF-F005 and RSAF-F006, CONCEPT flags nothing, and
both are clean on the corrected corpus. `--self-test` reproduces that.

    python3 bin/check_twin_parity.py
    python3 bin/check_twin_parity.py --self-test
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Concepts whose silent absence from one audience's copy is a safety miss.
CONCEPTS = {
    "alcohol/sedative withdrawal": r"withdrawal|delirium tremens|\bDTs?\b|CIWA",
    "Wernicke/thiamine":           r"wernicke|thiamin",
    "catatonia":                   r"catatoni|lorazepam challenge|\bBFCRS\b",
    "NMS":                         r"\bNMS\b|neuroleptic malignant",
    "serotonin syndrome":          r"serotonin syndrome|cyproheptadine|\bclonus\b",
    "anticholinergic toxicity":    r"anticholinerg|diphenhydramine|physostigmine",
    "hypoglycemia":                r"hypoglyc|dextrose",
    "hypoxia":                     r"hypox|oxygen sat|\bSpO2\b",
    "infection/sepsis":            r"infection|sepsis|septic|\bUTI\b|meningitis|encephalitis",
    "lithium toxicity":            r"lithium (?:toxicity|level)|hemodialysis",
    "QTc/torsades":                r"\bQTc\b|torsade",
    "lethal means":                r"lethal means|firearm|means restriction|means safety",
    "prior suicidal behavior":     r"past attempt|prior attempt|previous attempt|preparatory|aborted attempt",
    "pregnancy/teratogenicity":    r"pregnan|teratogen|neural tube",
    "intracranial/head injury":    r"intracranial|head injury|head trauma|subdural",
    "respiratory depression":      r"respiratory depression|over-?sedation|naloxone",
}
CRX = {k: re.compile(v, re.I) for k, v in CONCEPTS.items()}

# Fields that legitimately differ between twins and carry no teaching.
SKIP_KEYS = {"facultyReview", "contentHashAtReview"}

# Asymmetries a human has looked at and judged correct. Keyed (unit, concept).
# These are still PRINTED, as ADJUDICATED -- the point is that a reader sees the
# reasoning, not that the row disappears. Add one only after establishing that no
# finding ever asked for the concept on the silent side; drift is the default
# reading of an asymmetry, and this list is not the place to park a real one.
ADJUDICATED = {
    ("case trauma_bpd_mood_001", "lethal means"):
        "The resident twin names means safety only inside its discharge_reasoning "
        "step, which is resident-only by design: WP-5e established that an MS3 does "
        "not own the disposition call, and the MS3 twin has no discharge step at "
        "all. No finding has ever touched this case, so the asymmetry is original "
        "audience scoping rather than a fix that failed to propagate.",
}


def _leaves(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in SKIP_KEYS:
                continue
            yield from _leaves(v, f"{path}/{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _leaves(v, f"{path}[{i}]")
    else:
        yield path, obj


def _text(obj):
    return "\n".join(str(v) for _, v in _leaves(obj) if isinstance(v, str))


def exact_rows(left, right, ln, rn, unit):
    """Every field that differs between two units that must be identical."""
    dl, dr = dict(_leaves(left)), dict(_leaves(right))
    rows = []
    for k in sorted(set(dl) | set(dr)):
        a, b = dl.get(k, "<MISSING>"), dr.get(k, "<MISSING>")
        if a != b:
            rows.append(("EXACT", unit, k, ln, str(a), rn, str(b)))
    return rows


def concept_rows(left, right, ln, rn, unit):
    """Can't-miss concepts named by one twin and not the other."""
    cl = {c for c, rx in CRX.items() if rx.search(_text(left))}
    cr = {c for c, rx in CRX.items() if rx.search(_text(right))}
    rows = []
    for c in sorted(cl - cr):
        rows.append(("CONCEPT", unit, c, ln, "names it", rn, "SILENT"))
    for c in sorted(cr - cl):
        rows.append(("CONCEPT", unit, c, rn, "names it", ln, "SILENT"))
    return rows


def _by_id(items):
    return {x["id"]: x for x in items if isinstance(x, dict) and "id" in x}


def load_agitation(root):
    def scen(p):
        with open(os.path.join(root, p), encoding="utf-8") as fh:
            return _by_id(json.load(fh)["content"]["scenarios"])
    return scen("_prototypes/agitation-trainer/agitation.pack.json"), \
           scen("_prototypes/agitation-trainer/rp-agitation.pack.json")


# preview HTML -> the marker after which the inlined pack literal begins
PREVIEWS = [
    ("_prototypes/agitation-trainer/agitation.pack.json",
     "_prototypes/agitation-trainer/agitation-trainer.preview.html", "window.__PACK__="),
    ("_prototypes/agitation-trainer/rp-agitation.pack.json",
     "_prototypes/agitation-trainer/rp-agitation.preview.html", "var PACK_INLINE ="),
]


def inlined_pack(path, marker):
    """Pull the pack literal out of a preview by brace-matching from the marker."""
    with open(path, encoding="utf-8") as fh:
        s = fh.read()
    j = s.index("{", s.index(marker) + len(marker))
    depth = k = 0
    instr = esc = False
    k = j
    while k < len(s):
        c = s[k]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(s[j:k + 1])
        k += 1
    raise ValueError(f"{path}: unbalanced pack literal after {marker!r}")


def load_reasoning(root):
    def cases(p):
        with open(os.path.join(root, p), encoding="utf-8") as fh:
            return _by_id(json.load(fh)["cases"])
    return cases("reasoning_cases.json"), cases("reasoning_cases_resident.json")


def sweep(root, ag=None, rp=None, ms3=None, res=None):
    """Returns (rows, pair_count). Injected args let --self-test rewind the corpus."""
    rows, pairs = [], 0
    a, b = load_agitation(root) if ag is None else (ag, rp)
    for sid in sorted(set(a) & set(b)):
        pairs += 1
        rows += exact_rows(a[sid], b[sid], "agitation.pack.json",
                           "rp-agitation.pack.json", f"scenario {sid}")
    for packp, prevp, marker in PREVIEWS:
        pairs += 1
        with open(os.path.join(root, packp), encoding="utf-8") as fh:
            pack = json.load(fh)
        prev = inlined_pack(os.path.join(root, prevp), marker)
        rows += [("SNAPSHOT",) + r[1:] for r in
                 exact_rows(pack, prev, os.path.basename(packp),
                            os.path.basename(prevp), os.path.basename(prevp))]
    m, r = load_reasoning(root) if ms3 is None else (ms3, res)
    for cid in sorted(set(m) & set(r)):
        pairs += 1
        rows += concept_rows(m[cid], r[cid], "reasoning_cases.json",
                             "reasoning_cases_resident.json", f"case {cid}")
    return rows, pairs


def split_adjudicated(rows):
    """(open rows, adjudicated rows). Only CONCEPT rows can be adjudicated."""
    live, known = [], []
    for r in rows:
        if r[0] == "CONCEPT" and (r[1], r[2]) in ADJUDICATED:
            known.append(r)
        else:
            live.append(r)
    return live, known


def report(rows, pairs, quiet=False):
    live, known = split_adjudicated(rows)
    if not quiet:
        print(f"twin units compared: {pairs}")
    for kind, unit, what, has, hv, lacks, lv in live:
        print(f"\n[{kind}] {unit}\n    {what}")
        print(f"      {has}: {hv[:300]}")
        print(f"      {lacks}: {lv[:300]}")
    for _, unit, what, has, _, lacks, _ in known:
        print(f"\n[ADJUDICATED] {unit}\n    {what}: named by {has}, silent in {lacks}")
        print(f"      {ADJUDICATED[(unit, what)]}")
    n_exact = sum(1 for r in live if r[0] in ("EXACT", "SNAPSHOT"))
    n_conc = sum(1 for r in live if r[0] == "CONCEPT")
    if not quiet:
        print(f"\nEXACT+SNAPSHOT drift: {n_exact}   open CONCEPT asymmetries: {n_conc}"
              f"   adjudicated: {len(known)}")
        if not live:
            print("PASS — twins in parity")
    return n_exact


# The two drifts as they stood before WP-5p corrected them.
_PRE_WP5P = {
    "agit-delirium": ("teachingPoints", 1, "text",
                      "Benzodiazepines worsen non-withdrawal delirium; if an agent is needed for "
                      "dangerous agitation, a second-generation antipsychotic is generally preferred "
                      "over haloperidol for faster onset and fewer EPS. No medication is FDA-approved "
                      "for delirium."),
    "agit-parkinson": (None, None, "history",
                       "Parkinson disease on dopaminergic therapy; recent evening "
                       "confusion/hallucinations."),
}


def self_test(root):
    ag, rp = load_agitation(root)
    all_rows, _ = sweep(root)
    open_rows, _adj = split_adjudicated(all_rows)
    clean = not open_rows
    # rewind agitation.pack.json to its pre-WP-5p state and re-sweep
    import copy
    rewound = copy.deepcopy(ag)
    for sid, (container, idx, field, old) in _PRE_WP5P.items():
        target = rewound[sid][container][idx] if container else rewound[sid]
        target[field] = old
    rows, _ = sweep(root, ag=rewound, rp=rp)
    flagged = {r[1] for r in rows if r[0] == "EXACT"}
    want = {f"scenario {s}" for s in _PRE_WP5P}
    ok = clean and want <= flagged
    print(f"self-test: live corpus clean = {clean}")
    print(f"self-test: rewound corpus flags {sorted(flagged) or 'nothing'}")
    print(f"self-test: {'OK' if ok else 'FAILED'} — expected {sorted(want)} on the rewind, "
          f"and a clean live corpus")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=ROOT)
    ap.add_argument("--self-test", action="store_true",
                    help="rewind the two WP-5p drifts and prove they are caught")
    a = ap.parse_args()
    if a.self_test:
        return self_test(a.root)
    rows, pairs = sweep(a.root)
    return 1 if report(rows, pairs) else 0


if __name__ == "__main__":
    sys.exit(main())
