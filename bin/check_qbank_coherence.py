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

A RATCHETING GATE since 2026-09-16, the pattern of bin/check_design_drift.py:
the pair count is pinned in bin/check_qbank_coherence_baseline.json (zero today),
a rise fails, a fall prints a note, and no baseline or an empty bank exits 2
rather than passing over nothing (docs/SILENT_SHRINK_CHECKLIST.md D4). The gate
already exited 1 on any pair; what this adds is a floor that is written down,
one documented command to move it, and a --self-test that asserts the gate's
EXIT CODE on the two WP-5j defects rather than only that the heuristics fire.

Exit 0 clean (pairs at or below baseline), 1 a rise, 2 could not check.

    python3 bin/check_qbank_coherence.py                    # the gate (bin/verify.sh runs it)
    python3 bin/check_qbank_coherence.py --self-test        # defects exit 1, the live bank exits 0
    python3 bin/check_qbank_coherence.py --update-baseline  # LOWER the ratchet after a reviewed reduction

--update-baseline rewrites the pin from the current bank. It locks in a reduction
you made on purpose; it is never for absorbing a rise. The JSON diff is in the PR
and a reviewer reads it. See docs/RATCHETS.md.
"""
import argparse, difflib, itertools, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QB = os.path.join(ROOT, "question_bank.json")
BASELINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check_qbank_coherence_baseline.json")
RATCHET_KEYS = ("pairs",)
UPDATE_HINT = "python3 bin/check_qbank_coherence.py --update-baseline"

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

def live(items):
    """Retired items teach nothing and are excluded before any pairing."""
    return [i for i in items if not (i.get("retired") or i.get("retiredReason"))]


def find_pairs(items, min_shared_rare, max_token_frequency):
    """TWIN + STANCE over the given items, deduplicated and sorted.

    The heuristics are the original checker verbatim; only the argparse namespace
    became parameters so --self-test can drive them on fixtures.
    """
    findings = []

    # ---- TWIN: same category, shared bank-rare scenario tokens, divergent keyed steps ----
    df = {}
    for it in items:
        for w in set(words(it.get("stem") or it.get("q") or "")):
            df[w] = df.get(w, 0) + 1
    rare = {w for w, n in df.items() if n <= max_token_frequency}

    for x, y in itertools.combinations(items, 2):
        if x.get("category") != y.get("category"):
            continue
        rx = set(words(x.get("stem") or x.get("q") or "")) & rare
        ry = set(words(y.get("stem") or y.get("q") or "")) & rare
        shared = rx & ry
        if len(shared) < min_shared_rare:
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
    return sorted(out)


# ---------------------------------------------------------------- ratchet
# The pattern of bin/check_design_drift.py (and bin/verify_spans.py): a committed JSON pins
# the count, a rise fails, a fall is a note, --update-baseline lowers the pin. The pin is
# zero today, so the gate behaves exactly as before; what changed is that the floor is now
# written down, lowering (or, visibly, raising) it is one documented command, and the
# self-test asserts the gate's EXIT CODE rather than only that the heuristics still fire.

def load_baseline(path):
    """(counts, None) or (None, error). A missing key is an error, not an unpinned key."""
    rel = os.path.relpath(path, ROOT)
    if not os.path.exists(path):
        return None, f"no baseline at {rel} -- run `{UPDATE_HINT}` (reviewed) to pin one"
    try:
        with open(path, encoding="utf-8") as fh:
            counts = json.load(fh).get("counts") or {}
    except (OSError, ValueError, AttributeError) as e:
        return None, f"baseline {rel} unreadable: {e}"
    missing = [k for k in RATCHET_KEYS if not isinstance(counts.get(k), int)]
    if missing:
        return None, (f"baseline {rel} does not pin {', '.join(missing)} -- "
                      f"run `{UPDATE_HINT}` (reviewed) to pin every key")
    return {k: counts[k] for k in RATCHET_KEYS}, None


def write_baseline(path, counts):
    payload = {
        "_note": "Pinned by bin/check_qbank_coherence.py. Counts may fall, never rise. Regenerate "
                 "with --update-baseline as part of a reviewed reduction, never to absorb a rise -- "
                 "the diff is in the PR. See docs/RATCHETS.md.",
        "counts": {k: counts[k] for k in RATCHET_KEYS},
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
        fh.write("\n")


def compare(counts, baseline):
    """Per key: a rise fails, a fall is a note."""
    fails, notes = [], []
    for key in RATCHET_KEYS:
        was, now = baseline[key], counts[key]
        if now > was:
            fails.append(f"R  {key} rose {was} -> {now}. Read the pair(s) above with a clinician "
                         f"and fix ONE item so the bank teaches one thing; do not re-pin.")
        elif now < was:
            notes.append(f"R  {key} improved {was} -> {now} -- run `{UPDATE_HINT}` to lock the gain in.")
    return fails, notes


def gate(items, baseline, min_shared_rare, max_token_frequency, out=print):
    """The whole exit contract, in-process so --self-test can drive it.
    0 clean, 1 a rise above baseline, 2 could not check."""
    items = live(items)
    if not items:
        out("qbank coherence: NO LIVE ITEMS loaded -- a pass over an empty bank is not a pass "
            "(docs/SILENT_SHRINK_CHECKLIST.md D4).")
        return 2
    pairs = find_pairs(items, min_shared_rare, max_token_frequency)
    for kind, i, j, msg in pairs:
        out(f"{kind:<7} {i} <-> {j}\n        {msg}")
    out(f"\nqbank coherence: {len(items)} live item(s), {len(pairs)} pair(s) to read")
    if baseline is None:
        out(f"FAIL -- no baseline to ratchet against. Run `{UPDATE_HINT}` (reviewed) and commit "
            f"bin/check_qbank_coherence_baseline.json.")
        return 2
    fails, notes = compare({"pairs": len(pairs)}, baseline)
    for note in notes:
        out("note: " + note)
    if fails:
        out(f"FAIL -- {len(fails)} finding(s):")
        for f in fails:
            out("  - " + f)
        return 1
    # The tally rides on the LAST line on purpose: bin/verify.sh shows only a step's last line.
    out(f"OK -- {len(items)} live item(s), {len(pairs)} pair(s) to read; at or below "
        f"baseline ({baseline['pairs']}).")
    return 0


# Two items that share a scenario and teach the SAME steps: the detector must stay silent.
_FX_COHERENT = [
    {"id": "c_saf_a", "category": "safety", "stem": "Patient pacing the hallway speaking loudly. Best response?",
     "options": [{"t": "Signal a nearby staff member before you approach; keep the exit clear.", "c": True}],
     "pearl": "Tell staff before you engage."},
    {"id": "c_saf_b", "category": "safety", "stem": "Patient with mania pacing loudly in the hallway. Best response?",
     "options": [{"t": "Alert a staff member that you are approaching and do not block the doorway.", "c": True}],
     "pearl": "Tell staff first; stay near your exit."},
]


def self_test() -> int:
    import tempfile
    checks = []

    def expect(label, cond):
        checks.append((label, bool(cond)))

    def run(items, baseline):
        lines = []
        rc = gate(items, baseline, 3, 4, out=lines.append)
        return rc, "\n".join(lines)

    # a. the two WP-5j defects are still detected (the original falsification)
    kinds = {k for k, _, _, _ in find_pairs(SELF_TEST, 3, 4)}
    expect("SELF_TEST yields a TWIN and a STANCE hit", kinds >= {"TWIN", "STANCE"})
    n = len(find_pairs(SELF_TEST, 3, 4))

    # b. against the zero baseline those hits are a rise -> exit 1
    rc, out = run(SELF_TEST, {"pairs": 0})
    expect("known defects vs zero baseline exit 1", rc == 1 and f"pairs rose 0 -> {n}" in out)

    # c. the same items against a baseline that pins them exit 0: the exit is baseline-driven
    rc, out = run(SELF_TEST, {"pairs": n})
    expect("pinned pair count exits 0 (exit is baseline-driven)", rc == 0 and "FAIL" not in out)

    # d. a fall is a note naming the lowering command
    rc, out = run(_FX_COHERENT, {"pairs": 2})
    expect("coherent twins vs a higher baseline exit 0 with an improvement note",
           rc == 0 and "improved 2 -> 0" in out and "--update-baseline" in out)

    # e. coherent twins against zero stay clean
    rc, out = run(_FX_COHERENT, {"pairs": 0})
    expect("coherent twins vs zero baseline exit 0", rc == 0)

    # f. no baseline is a broken run, not a pass
    rc, out = run(_FX_COHERENT, None)
    expect("missing baseline exits 2", rc == 2 and "--update-baseline" in out)

    # g. nothing loaded is a broken run, not a pass (SILENT_SHRINK D4)
    rc, out = run([], {"pairs": 0})
    expect("zero live items exits 2", rc == 2 and "NO LIVE ITEMS" in out)
    rc, out = run([dict(i, retired=True) for i in SELF_TEST], {"pairs": 0})
    expect("all-retired bank exits 2", rc == 2)

    # h. a malformed baseline cannot silently un-pin the count
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "b.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump({"counts": {}}, fh)
        counts, err = load_baseline(p)
        expect("baseline missing 'pairs' is an error naming the key", counts is None and err and "pairs" in err)

    # i. the LIVE bank agrees with the committed baseline
    doc = json.load(open(QB, encoding="utf-8"))
    items = doc["items"] if isinstance(doc, dict) and "items" in doc else doc
    baseline, err = load_baseline(BASELINE)
    rc, out = run(items, baseline)
    expect("live question_bank.json vs committed baseline exits 0", err is None and rc == 0)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--min-shared-rare", type=int, default=3,
                    help="scenario tokens two stems must share, counting only bank-rare ones")
    ap.add_argument("--max-token-frequency", type=int, default=4,
                    help="a token in more than this many stems is not distinctive")
    ap.add_argument("--bank", default=QB)
    ap.add_argument("--update-baseline", action="store_true",
                    help="rewrite bin/check_qbank_coherence_baseline.json from the current bank "
                         "(reviewed reductions only -- the diff is in the PR)")
    ap.add_argument("--self-test", action="store_true",
                    help="run the two known WP-5j defects through the heuristics and prove the "
                         "gate exits 1 on them and 0 on the live bank")
    a = ap.parse_args()
    if a.self_test:
        return self_test()

    doc = json.load(open(a.bank, encoding="utf-8"))
    items = doc["items"] if isinstance(doc, dict) and "items" in doc else doc
    if a.update_baseline:
        pairs = find_pairs(live(items), a.min_shared_rare, a.max_token_frequency)
        write_baseline(BASELINE, {"pairs": len(pairs)})
        print(f"baseline written to {os.path.relpath(BASELINE, ROOT)}: pairs={len(pairs)}")
    baseline, err = load_baseline(BASELINE)
    if err:
        print(f"FAIL -- {err}")
        return 2
    return gate(items, baseline, a.min_shared_rare, a.max_token_frequency)


if __name__ == "__main__":
    sys.exit(main())
