#!/usr/bin/env python3
"""Count question-bank items whose keyed answer is the UNIQUELY longest option.

WHY (WP-7, curriculum-architecture remediation 2026-09-24). "Mastery" bars should measure
knowledge, not test-wiseness. The oldest shortcut in multiple-choice testing is "pick the
longest option", and in this bank it works: the keyed answer is the uniquely longest option
in 133 of 144 attested items (92%). The 2026-07-13 decision record set the rule for fixing it
-- trim the key to the bare decision, move the rationale into `why`, lengthen distractors to
parallel structure, keep the named traps -- and the handoff's gate is attested <= 35%. The
faculty console's rule (faculty-console/qbank-rules.mjs) only warns above 2.25x the median
distractor plus 35 characters, so it sees 12 items; the pilot engine's test_qbank.py reads
the pilot file, not question_bank.json. Nothing measured the live bank until this.

THE METRIC. An item CUES when its keyed option (the one carrying `c: true`) is strictly
longer, in characters after stripping surrounding whitespace, than every other option. A tie
for longest is NOT a cue: a test-wise reader cannot tell the key from its twin. Tier-1
`options` only -- a two-tier item's `tier2` rationales are a separate question.

THE TWO SETS (both pinned):
  live      exactly check_qbank_coherence.py's live set -- every item that is not retired
            (`retired` or `retiredReason`). The function is IMPORTED from that file, not
            copied, so the two tools cannot disagree about what "live" means. Drafts count.
  attested  `status == "attested"`.
Both are pinned because each hides the other's shortcut: demoting a cueing item to draft
drops the ATTESTED count without fixing anything, and the LIVE count does not move until the
item is actually rewritten.

A RATCHETING GATE (docs/RATCHETS.md), the pattern of check_qbank_coherence.py: both counts
are pinned in bin/qbank_length_cue_baseline.json, a rise fails, a fall prints a note, and
--update-baseline lowers the pin after a reviewed reduction. The handoff recorded 133/144
attested and 158/192 "live" on 2026-09-24; its 192 counted the three retired drafts (two of
which cue), so under the coherence live set the same bank is 156/189 -- the pin is 156.

REPORT-ONLY (never pinned, never changes the exit code): the same metric over the
topic_meta.json page quizzes (`quiz.o[]`, keyed by `c`) and the practice-case JSONs
(communication_cases.json `cases[].choices[]`, reasoning_cases*.json
`cases[].steps[].choices[]`, keyed by `quality == "best"`). Those are WP-10's to fix.

Exit 0 clean (both counts at or below the pin), 1 a rise, 2 could not check: no bank file,
unparsable JSON, a bank that is not {"items": [...]}, an item whose options cannot be
measured (no keyed option, two keyed options, an option with no text), zero live items, zero
attested items, or a baseline that is missing or does not pin both keys. A pass over nothing
is not a pass (docs/SILENT_SHRINK_CHECKLIST.md C4/D4).

    python3 bin/check_qbank_length_cue.py                    # the gate (verify.sh runs it)
    python3 bin/check_qbank_length_cue.py --detail           # + key vs longest distractor
    python3 bin/check_qbank_length_cue.py --self-test        # fixtures 1/2; live bank 0
    python3 bin/check_qbank_length_cue.py --update-baseline  # LOWER the pin (reviewed)

The flagged-id listing (attested first, grouped by category) is the work list for the
`content/qbank-cue-batch-N` PRs: each batch demotes <= 10 attested items, rewrites them, and
lowers the pin once Josh has re-attested them through the console. --update-baseline never
refuses a higher number -- the JSON diff is in the PR and a reviewer reads it.
"""
import argparse, importlib.util, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
QB = os.path.join(ROOT, "question_bank.json")
TOPIC_META = os.path.join(ROOT, "topic_meta.json")
CASE_FILES = ("communication_cases.json", "reasoning_cases.json", "reasoning_cases_resident.json")
BASELINE = os.path.join(HERE, "qbank_length_cue_baseline.json")
RATCHET_KEYS = ("attested_uniquely_longest", "live_uniquely_longest")
TARGET_PCT = 35  # WP-7 acceptance: attested uniquely-longest <= 35%
UPDATE_HINT = "python3 bin/check_qbank_length_cue.py --update-baseline"


def _load_coherence():
    """check_qbank_coherence.py, loaded by FILE PATH (not sys.path) so the live-set rule is
    the one in that file and no other module of the same name can stand in for it."""
    path = os.path.join(HERE, "check_qbank_coherence.py")
    spec = importlib.util.spec_from_file_location("_qbank_coherence_for_length_cue", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


live = _load_coherence().live


class CouldNotCheck(Exception):
    """The run cannot measure what it claims to measure -- exit 2, never a pass."""


# ---------------------------------------------------------------- the metric

def uniquely_longest(texts, keyed_index):
    """True when texts[keyed_index] is strictly longer (stripped) than every other text."""
    lengths = [len(t.strip()) for t in texts]
    key = lengths[keyed_index]
    return all(n < key for i, n in enumerate(lengths) if i != keyed_index)


def item_cues(item):
    """(cues: bool, key_len, longest_other_len) for one bank item; CouldNotCheck if the
    item's tier-1 options cannot be measured."""
    iid = item.get("id") or "<item with no id>"
    opts = item.get("options")
    if not isinstance(opts, list) or len(opts) < 2:
        raise CouldNotCheck(f"{iid}: tier-1 `options` is not a list of two or more options")
    texts, keyed = [], []
    for n, opt in enumerate(opts):
        if not isinstance(opt, dict) or not isinstance(opt.get("t"), str):
            raise CouldNotCheck(f"{iid}: option {n} has no text `t` to measure")
        texts.append(opt["t"])
        if opt.get("c"):
            keyed.append(n)
    if len(keyed) != 1:
        raise CouldNotCheck(f"{iid}: {len(keyed)} keyed options -- "
                            f"exactly one `c: true` is required")
    k = keyed[0]
    lengths = [len(t.strip()) for t in texts]
    longest_other = max(n for i, n in enumerate(lengths) if i != k)
    return uniquely_longest(texts, k), lengths[k], longest_other


def measure_bank(doc):
    """Both pinned sets over a loaded question_bank.json document.

    Every item in either set is measured; one that cannot be measured is CouldNotCheck, not
    a silent skip -- a skipped item is a smaller set reported as the whole one."""
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        raise CouldNotCheck("question bank is not an object with an `items` list (wrong shape)")
    items = doc["items"]
    stray = [n for n, it in enumerate(items) if not isinstance(it, dict)]
    if stray:
        raise CouldNotCheck(f"items[{stray[0]}] is not an object ({len(stray)} such entr(y/ies))")
    live_items = live(items)
    attested = [it for it in items if it.get("status") == "attested"]
    # Keyed by OBJECT, not by id: two items sharing an id must still count as two.
    measured = {}
    for it in live_items + attested:
        if id(it) in measured:
            continue
        if not isinstance(it.get("id"), str) or not it["id"]:
            raise CouldNotCheck(f"an item has no string `id` (status {it.get('status')!r}) -- "
                                f"it could be counted but never named")
        cues, key_len, other_len = item_cues(it)
        measured[id(it)] = {"cues": cues, "key": key_len, "other": other_len,
                            "category": it.get("category") or "?", "status": it.get("status")}
    return {
        "live_n": len(live_items),
        "attested_n": len(attested),
        "live_flagged": [it["id"] for it in live_items if measured[id(it)]["cues"]],
        "attested_flagged": [it["id"] for it in attested if measured[id(it)]["cues"]],
        # for printing only (--detail, category grouping); a duplicated id prints its last copy
        "detail": {it["id"]: measured[id(it)] for it in live_items + attested},
    }


# ---------------------------------------------------------------- report-only surfaces
# Measured with the same rule, printed, and NEVER pinned: the page quizzes and practice-case
# choice sets are WP-10's (shuffle + attestation binding), and a gate here would let a
# report block a clinical correction. A surface that cannot be read says so on its line.

def _summarise(sets):
    """sets: [(label, texts, keyed_index) or (label, None, None) for an unmeasurable set]."""
    flagged, unmeasurable, n = [], [], 0
    for label, texts, keyed in sets:
        if texts is None:
            unmeasurable.append(label)
            continue
        n += 1
        if uniquely_longest(texts, keyed):
            flagged.append(label)
    return {"n": n, "flagged_n": len(flagged), "flagged": flagged, "unmeasurable": unmeasurable}


def _choice_set(label, options, text_key, is_key):
    if not isinstance(options, list) or len(options) < 2 or not all(
            isinstance(o, dict) and isinstance(o.get(text_key), str) for o in options):
        return (label, None, None)
    keyed = [i for i, o in enumerate(options) if is_key(o)]
    if len(keyed) != 1:
        return (label, None, None)
    return (label, [o[text_key] for o in options], keyed[0])


def measure_topic_meta(doc):
    """topic_meta.json: one `quiz` per page slug, options in `o`, keyed by `c`."""
    if not isinstance(doc, dict):
        raise CouldNotCheck("topic_meta.json is not an object")
    sets = [_choice_set(slug, entry["quiz"].get("o") if isinstance(entry["quiz"], dict) else None,
                        "t", lambda o: bool(o.get("c")))
            for slug, entry in doc.items() if isinstance(entry, dict) and "quiz" in entry]
    return _summarise(sets)


def measure_cases(doc):
    """communication/reasoning case JSONs: `cases[].choices[]` and `cases[].steps[].choices[]`,
    text in `text`, keyed by `quality == "best"`."""
    if not isinstance(doc, dict) or not isinstance(doc.get("cases"), list):
        raise CouldNotCheck("not an object with a `cases` list")
    is_best = lambda o: o.get("quality") == "best"
    sets = []
    for case in doc["cases"]:
        if not isinstance(case, dict):
            sets.append(("<non-object case>", None, None))
            continue
        cid = case.get("id") or "<case with no id>"
        if "choices" in case:
            sets.append(_choice_set(cid, case["choices"], "text", is_best))
        for step in case.get("steps") or []:
            if isinstance(step, dict) and "choices" in step:
                label = f"{cid}/{step.get('id')}"
                sets.append(_choice_set(label, step["choices"], "text", is_best))
    return _summarise(sets)


def collect_report(root=ROOT):
    """[(label, summary or None, error or None)] for every report-only surface."""
    out = []
    targets = [("topic_meta.json quizzes", os.path.join(root, "topic_meta.json"),
                measure_topic_meta)]
    targets += [(f"{name} choice sets", os.path.join(root, name), measure_cases)
                for name in CASE_FILES]
    for label, path, fn in targets:
        try:
            with open(path, encoding="utf-8") as fh:
                out.append((label, fn(json.load(fh)), None))
        except (OSError, ValueError, CouldNotCheck, AttributeError, TypeError) as e:
            out.append((label, None, f"unreadable: {e}"))
    return out


# ---------------------------------------------------------------- ratchet

def load_baseline(path):
    """(counts, None) or (None, error). A missing key is an error, not an unpinned key."""
    rel = os.path.relpath(path, ROOT)
    if not os.path.exists(path):
        return None, f"no baseline at {rel} -- run `{UPDATE_HINT}` (reviewed) to pin one"
    try:
        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
    except (OSError, ValueError) as e:
        return None, f"baseline {rel} unreadable: {e}"
    counts = payload.get("counts") if isinstance(payload, dict) else None
    if not isinstance(counts, dict):
        return None, f"baseline {rel} has no `counts` object -- run `{UPDATE_HINT}` (reviewed)"
    missing = [k for k in RATCHET_KEYS
               if not isinstance(counts.get(k), int) or isinstance(counts.get(k), bool)]
    if missing:
        return None, (f"baseline {rel} does not pin {', '.join(missing)} as a count -- "
                      f"run `{UPDATE_HINT}` (reviewed) to pin every key")
    return {k: counts[k] for k in RATCHET_KEYS}, None


def write_baseline(path, counts):
    payload = {
        "_note": "Pinned by bin/check_qbank_length_cue.py (WP-7). Counts may fall, never rise. "
                 "Regenerate with --update-baseline as part of a reviewed reduction, never to "
                 "absorb a rise -- the diff is in the PR. See docs/RATCHETS.md.",
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
            fails.append(f"R  {key} rose {was} -> {now}. Trim the keyed option of the new "
                         f"item(s) above to the bare decision and move the rationale into `why` "
                         f"(2026-07-13 decision record), or lengthen the distractors; "
                         f"do not re-pin.")
        elif now < was:
            notes.append(f"R  {key} improved {was} -> {now} -- run `{UPDATE_HINT}` to lock the "
                         f"gain in (a DEMOTION lowers only the attested count; the live count is "
                         f"what proves a rewrite).")
    return fails, notes


def _pct(k, n):
    return f"{100.0 * k / n:.1f}%"


# WP-7 step 2: "Order batches by blueprint priority ... mood and anxiety first, then childdev
# and otherdx." The listing follows that order so a batch author reads it top-down.
_BATCH_ORDER = ("mood", "anxiety", "childdev", "otherdx")


def _by_category(ids, detail):
    groups = {}
    for iid in ids:
        groups.setdefault(detail[iid]["category"], []).append(iid)
    rank = lambda c: (_BATCH_ORDER.index(c) if c in _BATCH_ORDER else len(_BATCH_ORDER), c)
    return [(cat, groups[cat]) for cat in sorted(groups, key=rank)]


def gate(doc, baseline, out=print, report=None, detail=False):
    """The whole exit contract, in-process so --self-test can drive it.
    0 clean, 1 a rise above baseline, 2 could not check. `report` lines never move the exit."""
    try:
        m = measure_bank(doc)
    except CouldNotCheck as e:
        out(f"qbank length cue: COULD NOT CHECK -- {e}")
        return 2
    if not m["live_n"]:
        out("qbank length cue: NO LIVE ITEMS loaded -- a pass over an empty bank is not a pass "
            "(docs/SILENT_SHRINK_CHECKLIST.md D4).")
        return 2
    if not m["attested_n"]:
        out(f"qbank length cue: NO ATTESTED ITEMS among {m['live_n']} live -- the attested pin "
            f"would pass over nothing (docs/SILENT_SHRINK_CHECKLIST.md D4).")
        return 2

    a, an = len(m["attested_flagged"]), m["attested_n"]
    l, ln = len(m["live_flagged"]), m["live_n"]
    allowed = (TARGET_PCT * an) // 100
    met = "met" if a <= allowed else "NOT met"
    out("qbank length cue -- keyed option is the UNIQUELY longest "
        "(stripped characters; ties are not cues)")
    out(f"  attested  {a} of {an} ({_pct(a, an)})   WP-7 target <= {TARGET_PCT}% "
        f"(<= {allowed} of {an}): {met}")
    out(f"  live      {l} of {ln} ({_pct(l, ln)})   "
        f"live = not retired, as check_qbank_coherence.py")

    attested_ids = set(m["attested_flagged"])
    rest = [i for i in m["live_flagged"] if i not in attested_ids]
    sections = ((f"flagged ATTESTED ({a}) -- the WP-7 batch work list, by category",
                 m["attested_flagged"]),
                (f"flagged live, not attested ({len(rest)})", rest))
    for title, ids in sections:
        out(f"\n{title}:")
        for cat, group in _by_category(ids, m["detail"]):
            out(f"  {cat} ({len(group)}): " + " ".join(group))
            if detail:
                for iid in group:
                    d = m["detail"][iid]
                    out(f"      {iid:<16} key {d['key']:>3} vs longest distractor {d['other']:>3} "
                        f"(+{d['key'] - d['other']})")

    if report:
        out("\nreport-only (not pinned; never changes the exit code -- WP-10 fixes these):")
        for label, summary, err in report:
            if err:
                out(f"  {label:<44} {err}")
                continue
            line = f"  {label:<44} {summary['flagged_n']} of {summary['n']}"
            if summary["n"]:
                line += f" ({_pct(summary['flagged_n'], summary['n'])})"
            if summary["unmeasurable"]:
                bad = summary["unmeasurable"]
                line += f"; {len(bad)} unmeasurable: {', '.join(bad[:5])}"
            out(line)
            if detail and summary["flagged"]:
                out("      " + " ".join(summary["flagged"]))

    out("")
    if baseline is None:
        out(f"FAIL -- no baseline to ratchet against. Run `{UPDATE_HINT}` (reviewed) and commit "
            f"bin/qbank_length_cue_baseline.json.")
        return 2
    fails, notes = compare({"attested_uniquely_longest": a, "live_uniquely_longest": l}, baseline)
    for note in notes:
        out("note: " + note)
    if fails:
        out(f"FAIL -- {len(fails)} finding(s):")
        for f in fails:
            out("  - " + f)
        return 1
    # The tally rides on the LAST line on purpose: bin/verify.sh shows only a step's last line.
    out(f"OK -- attested {a}/{an}, live {l}/{ln}: at or below pin")
    return 0


# ---------------------------------------------------------------- self-test

def _opt(text, keyed=False):
    o = {"key": "X", "t": text}
    if keyed:
        o["c"] = True
    return o


def _item(iid, lengths, keyed, status="attested", category="mood", **extra):
    """A bank item whose options have the given lengths; `keyed` indexes the key."""
    it = {"id": iid, "status": status, "category": category,
          "options": [_opt("x" * n, keyed=(i == keyed)) for i, n in enumerate(lengths)]}
    it.update(extra)
    return it


# A: attested cue · B: attested, key shorter · C: attested, key TIED for longest
# D: draft cue · E: retired draft cue (must be excluded from live)
_FX = {"_note": "fixture", "version": 1, "items": [
    _item("qb_mood_001", [40, 10, 12, 11], 0),
    _item("qb_mood_002", [5, 30, 8, 9], 0),
    _item("qb_anx_001", [30, 30, 8, 9], 0, category="anxiety"),
    _item("qb_anx_002", [9, 50, 8, 9], 1, status="draft", category="anxiety"),
    _item("qb_sud_001", [60, 1, 1, 1], 0, status="draft", category="substance",
          retired=True, retiredReason="duplicate"),
]}


def self_test():
    import tempfile
    checks = []

    def expect(label, cond):
        checks.append((label, bool(cond)))

    def run(doc, baseline, report=None):
        lines = []
        try:
            rc = gate(doc, baseline, out=lines.append, report=report)
        except Exception as e:  # a crash is a failed check, not a pass
            lines.append(f"CRASH {type(e).__name__}: {e}")
            rc = None
        return rc, "\n".join(lines)

    # a. the metric: strict, stripped, ties are not cues
    try:
        expect("key uniquely longest is a cue",
               uniquely_longest(["long answer", "short", "tiny"], 0))
        expect("key shorter than a distractor is not a cue", not uniquely_longest(["ab", "abc"], 0))
        expect("a tie for longest is NOT a cue", not uniquely_longest(["abcd", "wxyz", "a"], 0))
        expect("surrounding whitespace is stripped before measuring",
               not uniquely_longest(["   abc   ", "abcd"], 0)
               and uniquely_longest(["abcde", "  abcd  "], 0))
    except Exception as e:
        expect(f"metric runs ({type(e).__name__}: {e})", False)

    # b. the two sets: live is coherence's live set (retired excluded), attested is status
    try:
        m = measure_bank(_FX)
        expect("live excludes the retired item (4 live)", m["live_n"] == 4)
        expect("attested counts status == 'attested' (3)", m["attested_n"] == 3)
        expect("attested cues = {qb_mood_001}", m["attested_flagged"] == ["qb_mood_001"])
        expect("live cues = {qb_mood_001, qb_anx_002}; the retired cue is not counted",
               sorted(m["live_flagged"]) == ["qb_anx_002", "qb_mood_001"])
    except Exception as e:
        expect(f"measure_bank runs ({type(e).__name__}: {e})", False)
    coh = _load_coherence()
    expect("the live rule is IMPORTED from check_qbank_coherence.py, not copied",
           live.__code__.co_code == coh.live.__code__.co_code
           and live.__module__ == "_qbank_coherence_for_length_cue")

    pinned = {"attested_uniquely_longest": 1, "live_uniquely_longest": 2}

    # c. at the pin -> 0; the last line carries the tally (verify.sh shows only the last line)
    rc, out = run(_FX, pinned)
    expect("fixture at its pin exits 0", rc == 0 and "FAIL" not in out)
    expect("output prints count, denominator, percentage and the <= 35% target",
           "1 of 3" in out and "33.3%" in out and "35%" in out)
    expect("flagged ids are printed, attested first",
           "qb_mood_001" in out and "qb_anx_002" in out
           and out.index("qb_mood_001") < out.index("qb_anx_002"))

    # d. a rise in EITHER key fails, naming the key
    rc, out = run(_FX, dict(pinned, attested_uniquely_longest=0))
    expect("attested rise exits 1 naming the key",
           rc == 1 and "attested_uniquely_longest rose 0 -> 1" in out)
    rc, out = run(_FX, dict(pinned, live_uniquely_longest=1))
    expect("live rise exits 1 naming the key",
           rc == 1 and "live_uniquely_longest rose 1 -> 2" in out)

    # e. a fall is a note naming the lowering command
    rc, out = run(_FX, {"attested_uniquely_longest": 5, "live_uniquely_longest": 9})
    expect("a fall exits 0 with an improvement note and the --update-baseline hint",
           rc == 0 and "improved 5 -> 1" in out and "--update-baseline" in out)

    # f. could-not-check is exit 2, never a pass (SILENT_SHRINK C4/D4)
    rc, out = run(_FX, None)
    expect("missing baseline exits 2", rc == 2 and "--update-baseline" in out)
    rc, out = run({"items": []}, pinned)
    expect("zero items exits 2", rc == 2 and "NO LIVE ITEMS" in out)
    rc, out = run({"items": [dict(i, retired=True) for i in _FX["items"]]}, pinned)
    expect("an all-retired bank exits 2", rc == 2)
    rc, out = run({"items": [dict(i, status="draft") for i in _FX["items"]]}, pinned)
    expect("zero attested items exits 2", rc == 2 and "NO ATTESTED ITEMS" in out)
    for label, bad in (("a bare list", list(_FX["items"])), ("no items key", {"entries": []}),
                       ("items not a list", {"items": {"a": 1}})):
        rc, out = run(bad, pinned)
        expect(f"wrong shape ({label}) exits 2", rc == 2)
    for label, it in (
        ("no keyed option", {"id": "qb_x_001", "status": "attested",
                             "options": [_opt("a"), _opt("b")]}),
        ("two keyed options", {"id": "qb_x_001", "status": "attested",
                               "options": [_opt("a", True), _opt("b", True)]}),
        ("an option with no text", {"id": "qb_x_001", "status": "attested",
                                    "options": [_opt("a", True), {"key": "B"}]}),
        ("no options", {"id": "qb_x_001", "status": "attested"}),
    ):
        rc, out = run({"items": _FX["items"] + [it]}, pinned)
        expect(f"an unmeasurable item ({label}) exits 2 naming its id",
               rc == 2 and "qb_x_001" in out)
    anonymous = {"status": "attested", "options": [_opt("a", True), _opt("b")]}
    rc, out = run({"items": _FX["items"] + [anonymous]}, pinned)
    expect("an item with no id exits 2 (it could be counted but never named)",
           rc == 2 and "no string `id`" in out)
    twin = dict(_FX["items"][0], options=[_opt("a", True), _opt("longer")])  # same id, does NOT cue
    m = measure_bank({"items": _FX["items"] + [twin]})
    expect("two items sharing an id are measured separately (one cues, one does not)",
           m["attested_n"] == 4 and m["attested_flagged"] == ["qb_mood_001"])

    # g. baseline file contract: a missing key is an error naming it; a bool is not a count
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "b.json")
        for label, payload, needle in (
            ("missing live key", {"counts": {"attested_uniquely_longest": 1}},
             "live_uniquely_longest"),
            ("boolean is not a count", {"counts": {"attested_uniquely_longest": True,
                                                   "live_uniquely_longest": 2}},
             "attested_uniquely_longest"),
            ("no counts object", {"attested_uniquely_longest": 1, "live_uniquely_longest": 2},
             "counts"),
        ):
            with open(p, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            try:
                counts, err = load_baseline(p)
            except Exception as e:
                counts, err = None, None
                expect(f"load_baseline runs ({type(e).__name__}: {e})", False)
            expect(f"baseline {label} is an error naming {needle}",
                   counts is None and err and needle in err)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        try:
            counts, err = load_baseline(p)
            expect("unparsable baseline is an error", counts is None and err)
        except Exception as e:
            expect(f"load_baseline survives bad JSON ({type(e).__name__})", False)
        # update-baseline round-trips both keys
        try:
            write_baseline(p, {"attested_uniquely_longest": 7, "live_uniquely_longest": 9})
            counts, err = load_baseline(p)
            expect("write_baseline round-trips both keys",
                   err is None
                   and counts == {"attested_uniquely_longest": 7, "live_uniquely_longest": 9})
        except Exception as e:
            expect(f"write_baseline runs ({type(e).__name__}: {e})", False)

    # h. report-only surfaces: measured, labelled, and they NEVER change the exit code
    tm = {"_note": "x",
          "a.md": {"quiz": {"q": "?", "o": [{"t": "the long keyed answer", "c": True},
                                             {"t": "no"}]}},
          "b.md": {"quiz": {"q": "?", "o": [{"t": "yes", "c": True}, {"t": "a longer no"}]}},
          "c.md": {"title": "no quiz"}}
    cases = {"cases": [
        {"id": "comm_1", "choices": [{"id": "a", "text": "short", "quality": "missed"},
                                     {"id": "b", "text": "the best, longest reply",
                                      "quality": "best"}]},
        {"id": "reas_1", "steps": [{"id": "s1", "choices": [
            {"id": "a", "text": "best", "quality": "best"},
            {"id": "b", "text": "a longer partial", "quality": "partial"}]}]},
    ]}
    try:
        r = measure_topic_meta(tm)
        expect("topic_meta quizzes: 1 of 2 cue",
               (r["flagged_n"], r["n"]) == (1, 2) and r["flagged"] == ["a.md"])
        r = measure_cases(cases)
        expect("case choice sets: 1 of 2 cue (choices and steps[].choices)",
               (r["flagged_n"], r["n"]) == (1, 2) and r["flagged"] == ["comm_1"])
    except Exception as e:
        expect(f"report-only measures run ({type(e).__name__}: {e})", False)
    rc, out = run(_FX, pinned, report=[("topic_meta.json quizzes", None, "unreadable: boom")])
    expect("a broken report-only surface does not change the exit code, and says report-only",
           rc == 0 and "report-only" in out and "unreadable" in out)

    # i. the LIVE bank agrees with the committed baseline (so --self-test certifies the pin)
    try:
        with open(QB, encoding="utf-8") as fh:
            doc = json.load(fh)
        baseline, err = load_baseline(BASELINE)
        rc, out = run(doc, baseline)
        expect("live question_bank.json vs committed baseline exits 0", err is None and rc == 0)
    except Exception as e:
        expect(f"live bank check runs ({type(e).__name__}: {e})", False)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--bank", default=QB)
    ap.add_argument("--baseline", default=BASELINE)
    ap.add_argument("--detail", action="store_true",
                    help="print each flagged item's key length vs its longest distractor")
    ap.add_argument("--update-baseline", action="store_true",
                    help="rewrite the baseline from the current bank (reviewed reductions only -- "
                         "the diff is in the PR)")
    ap.add_argument("--self-test", action="store_true",
                    help="prove fixtures exit 1/2 as designed and the live bank exits 0")
    a = ap.parse_args()
    if a.self_test:
        return self_test()

    try:
        with open(a.bank, encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"qbank length cue: COULD NOT CHECK -- cannot read {a.bank}: {e}")
        return 2
    if a.update_baseline:
        try:
            m = measure_bank(doc)
        except CouldNotCheck as e:
            print(f"FAIL -- nothing written: {e}")
            return 2
        if not (m["live_n"] and m["attested_n"]):
            print("FAIL -- nothing written: no live or no attested items to pin")
            return 2
        counts = {"attested_uniquely_longest": len(m["attested_flagged"]),
                  "live_uniquely_longest": len(m["live_flagged"])}
        write_baseline(a.baseline, counts)
        print(f"baseline written to {os.path.relpath(a.baseline, ROOT)}: "
              + ", ".join(f"{k}={v}" for k, v in counts.items()))
    baseline, err = load_baseline(a.baseline)
    if err:
        print(f"FAIL -- {err}")
        return 2
    return gate(doc, baseline, report=collect_report(), detail=a.detail)


if __name__ == "__main__":
    sys.exit(main())
