#!/usr/bin/env python3
"""Find question-bank items that contradict another item in the same bank.

WP-5j closed nine findings; four of them were one item disagreeing with another
item a few ids away, and nothing in the repo could see it:

  qb_mood_011  pearl: "antidepressants are contraindicated" (acute mania)
  qb_mood_014  keyed: "the antidepressant should not be continued as monotherapy"
               -- which reads as permission to keep it running with a stabiliser.

  qb_saf_011   keyed: "Signal a nearby staff member that you are approaching..."
  qb_saf_002   keyed: (near-identical scenario) approach alone, no staff told.

Every validator passed on all four. They are individually defensible and jointly
incoherent, which is the failure mode a per-item check cannot reach.

Two signatures, because those two pairs break differently:

  TWIN   Two items in one category whose stems share several BANK-RARE tokens
         ("pacing", "hallway") but whose keyed answers teach different steps.
         Rare-token overlap, not string similarity: qb_saf_002 and qb_saf_011
         describe the same scenario in different words and score only 0.42 by
         SequenceMatcher, so a ratio threshold that catches them drowns in noise.
  STANCE One item carries an UNQUALIFIED prohibition on a subject and another
         qualifies the same subject, in the same category -- judged per
         SENTENCE. Whole-item matching flags any page that says both things
         anywhere, which is most of them: qb_cog_002/003/004 are a coherent
         graded teaching about antipsychotics in delirium and must not fire.

Measured against the bank as it stood before WP-5j: it flags exactly those two
pairs and nothing else, and zero pairs on the corrected bank -- 2/2 recall, no
false positives across 189 live items. That precision is why it gates rather
than merely reports. A hit is still a question for a clinician first: two items
may legitimately differ when their stems differ in a way the token overlap
cannot see. Read the pair before changing either one.

    python3 bin/check_qbank_coherence.py
    python3 bin/check_qbank_coherence.py --self-test
"""
import argparse, difflib, itertools, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QB = os.path.join(ROOT, "question_bank.json")

PROHIBIT = re.compile(r"\b(contraindicated|never|must not|do not|don't|avoid|should not be (?:used|given|started))\b", re.I)
QUALIFIED = re.compile(r"\b(not .{0,30}as monotherapy|only if|may be (?:used|continued)|acceptable (?:if|when)|unless|so long as|provided that)\b", re.I)

# Safety/procedure steps whose ABSENCE from a twin's keyed answer is the finding.
STEPS = {
    "tell staff":      r"\b(signal|alert|notify|let .{0,20}staff|tell .{0,20}staff|inform .{0,20}staff)\b",
    "exit awareness":  r"\b(exit|doorway|block(?:ing)? (?:his|her|their|the patient)|line of sight)\b",
    "backup present":  r"\b(staff (?:member|nearby|present)|additional staff|not alone|backup)\b",
}
STOP = set("a an the and or of to in for with on at is are was were be been this that these those "
           "his her their he she they you your patient which most best next step following what".split())

def words(t):
    return [w for w in re.findall(r"[a-z0-9']+", (t or "").lower()) if w not in STOP and len(w) > 2]

def keyed(it):
    for o in it.get("options", []) or it.get("o", []):
        if o.get("c"):
            return o.get("t", "")
    return ""

def assertions(it):
    """Everything the item teaches, as one string."""
    parts = [keyed(it), it.get("pearl", ""), it.get("why", "")]
    for o in it.get("options", []) or it.get("o", []):
        parts.append(((o.get("trap") or {}).get("note")) or o.get("note") or "")
    return " ".join(p for p in parts if p)

def subjects(text):
    """Clinical subjects worth pairing on: multiword drug/action terms seen in the bank."""
    t = (text or "").lower()
    found = set()
    for term in ("antidepressant", "benzodiazepine", "lithium", "valproate", "haloperidol",
                 "clozapine", "naltrexone", "acamprosate", "thiamine", "restraint", "seclusion",
                 "buprenorphine", "methadone", "ect", "antipsychotic", "ssri", "maoi"):
        if re.search(rf"\b{term}s?\b", t):
            found.add(term)
    return found

# Canonical clinical context -> the surface forms that mean it. Grouping matters:
# "mania" and "manic" are one context, and treating them as two made the checker
# miss its own regression fixture even though it caught the live bank, where both
# items happened to contain both words.
_CONTEXTS = {
    "mania":       ("mania", "manic"),
    "delirium":    ("delirium", "delirious"),
    "withdrawal":  ("withdrawal", "withdrawing"),
    "pregnancy":   ("pregnan", "perinatal", "postpartum"),
    "agitation":   ("agitat",),
    "catatonia":   ("catatoni",),
    "psychosis":   ("psychosis", "psychotic"),
    "suicidality": ("suicid",),
}

def context(text):
    t = (text or "").lower()
    return {name for name, forms in _CONTEXTS.items() if any(f in t for f in forms)}

# Minimal reconstructions of the two WP-5j defects, so a future edit to the
# heuristics cannot silently stop detecting them.
SELF_TEST = [
    {"id": "t_mood_a", "category": "mood", "stem": "First acute manic episode. Framework?",
     "options": [{"t": "Lithium, valproate, or an SGA.", "c": True}],
     "pearl": "Acute mania: antidepressants are contraindicated."},
    {"id": "t_mood_b", "category": "mood", "stem": "Manic switch on sertraline. Interpretation?",
     "options": [{"t": "Reconsider as bipolar; the antidepressant should not be continued as monotherapy.", "c": True}],
     "pearl": "Manic symptoms on antidepressant monotherapy suggest unrecognised bipolar."},
    {"id": "t_saf_a", "category": "safety", "stem": "Patient pacing the hallway speaking loudly. You are the student. Best response?",
     "options": [{"t": "Approach calmly and offer him a choice.", "c": True}], "pearl": "De-escalate first."},
    {"id": "t_saf_b", "category": "safety", "stem": "Patient with mania pacing loudly in the hallway. You are the student. Best response?",
     "options": [{"t": "Signal a nearby staff member that you are approaching, not blocking his exit.", "c": True}],
     "pearl": "Tell staff before you engage; stay near your exit."},
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-shared-rare", type=int, default=3,
                    help="scenario tokens two stems must share, counting only bank-rare ones")
    ap.add_argument("--max-token-frequency", type=int, default=4,
                    help="a token in more than this many stems is not distinctive")
    ap.add_argument("--bank", default=QB)
    ap.add_argument("--self-test", action="store_true",
                    help="run the two known WP-5j defects through the heuristics")
    a = ap.parse_args()

    if a.self_test:
        items = SELF_TEST
    else:
        doc = json.load(open(a.bank, encoding="utf-8"))
        items = doc["items"] if isinstance(doc, dict) and "items" in doc else doc
    items = [i for i in items if not (i.get("retired") or i.get("retiredReason"))]

    findings = []

    # ---- TWIN: same category, shared bank-rare scenario tokens, divergent keyed steps ----
    df = {}
    for it in items:
        for w in set(words(it.get("stem") or it.get("q") or "")):
            df[w] = df.get(w, 0) + 1
    rare = {w for w, n in df.items() if n <= a.max_token_frequency}

    for x, y in itertools.combinations(items, 2):
        if x.get("category") != y.get("category"):
            continue
        rx = set(words(x.get("stem") or x.get("q") or "")) & rare
        ry = set(words(y.get("stem") or y.get("q") or "")) & rare
        shared = rx & ry
        if len(shared) < a.min_shared_rare:
            continue
        ax, ay = assertions(x), assertions(y)
        missing = {}
        for label, pat in STEPS.items():
            in_x, in_y = bool(re.search(pat, ax, re.I)), bool(re.search(pat, ay, re.I))
            if in_x != in_y:
                has, lacks = (x["id"], y["id"]) if in_x else (y["id"], x["id"])
                missing.setdefault((has, lacks), []).append(label)
        for (has, lacks), labels in missing.items():
            findings.append(("TWIN", has, lacks,
                             f"same category, scenario shares {sorted(shared)}; "
                             f"{has} teaches {sorted(labels)} and {lacks} does not"))

    # ---- STANCE: unqualified prohibition vs qualified permission, per sentence ----
    def stance(text, subj):
        """Per-sentence stance on `subj`. A prohibition that carries its own
        qualifier in the same sentence ("avoid X until Y is excluded") is NOT an
        unqualified prohibition -- that is ordinary clinical nuance."""
        hard = soft = False
        for sent in re.split(r"(?<=[.;])\s+", text or ""):
            if not re.search(rf"\b{subj}s?\b", sent, re.I):
                continue
            p, q = bool(PROHIBIT.search(sent)), bool(QUALIFIED.search(sent))
            if p and not q:
                hard = True
            elif q:
                soft = True
        return hard, soft

    for x, y in itertools.combinations(items, 2):
        if x.get("category") != y.get("category"):
            continue
        ax, ay = assertions(x), assertions(y)
        if not (context(ax) & context(ay)):
            continue
        for subj in subjects(ax) & subjects(ay):
            hx, sx_ = stance(ax, subj)
            hy, sy_ = stance(ay, subj)
            # Fire only when one side is unconditional and the other is not.
            if hx and sy_ and not (sx_ or hy):
                findings.append(("STANCE", x["id"], y["id"],
                                 f"'{subj}' in {sorted(context(ax) & context(ay))}: "
                                 f"{x['id']} prohibits without qualification, {y['id']} qualifies"))
            if hy and sx_ and not (sy_ or hx):
                findings.append(("STANCE", y["id"], x["id"],
                                 f"'{subj}' in {sorted(context(ax) & context(ay))}: "
                                 f"{y['id']} prohibits without qualification, {x['id']} qualifies"))

    seen, out = set(), []
    for kind, i, j, msg in findings:
        k = (kind, tuple(sorted((i, j))), msg)
        if k not in seen:
            seen.add(k); out.append((kind, i, j, msg))

    for kind, i, j, msg in sorted(out):
        print(f"{kind:<7} {i} <-> {j}\n        {msg}")
    if a.self_test:
        kinds = {k for k, _, _, _ in out}
        ok = kinds >= {"TWIN", "STANCE"}
        print(f"\nself-test: {'OK' if ok else 'FAILED'} — expected a TWIN and a STANCE hit, got {sorted(kinds) or 'none'}")
        return 0 if ok else 1

    print(f"\nqbank coherence: {len(items)} live item(s), {len(out)} pair(s) to read")
    return 1 if out else 0

if __name__ == "__main__":
    sys.exit(main())
