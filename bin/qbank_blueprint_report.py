#!/usr/bin/env python3
"""Report the attested question bank against the NBME and COMAT content-outline bands.

WHY (WP-8, curriculum-architecture remediation 2026-09-24). The attested pool should fall
within the bands the two exams publish. The 2026-09-24 review estimated it does not come close
-- diagnosis task ~31% against 65-70%, ambulatory ~6% against 60-65%, inpatient >= 44% against
5-10%, age 0-12 0.7% against 10-15%, COMAT depressive/bipolar 11% and anxiety/OCD/trauma 9%
against 20-25% each, scientific mechanisms ~0 against 8-10%, sexual-disorder items 0 -- but
those figures were read off untagged items by hand, because no item in question_bank.json
carries a blueprint tag. This tool is the measurement that replaces the estimate once items
are tagged.

WHAT IT READS.
  bin/data/exam_blueprint_bands.json  the published bands: NBME Systems, Physician Task, Site
      of Care and Patient Age; COMAT Dimension 1 (presentations) and Dimension 2 (physician
      tasks). Exact published category names, min/max percent, source URL and access date.
      Each category's `key` is the value an item carries.
  question_bank.json  the ATTESTED pool only (`status == "attested"`). An item is tagged when
      its optional `blueprint` object carries a known key in all six dimensions:
      {"nbme": {"system", "physician_task", "site_of_care", "patient_age"},
       "comat": {"presentation", "physician_task"}} -- the shape the pilot items in
      09_Exam_Prep/shelf_comat_bank/04_pilot_batch_01.json already use. question_bank.schema.json
      enumerates the same keys; --self-test fails if the schema and the bands file disagree.

THE MEASURE. Per dimension: the count and percentage of attested items in each category, set
against its band, and POINTS OUTSIDE BAND -- the sum over the dimension's categories of the
distance, in percentage points, from the observed percentage to the nearest band edge (0 inside
the band, edges inclusive). A category no item carries contributes its whole minimum.

A RATCHET (docs/RATCHETS.md) on the six per-dimension totals, pinned in
bin/qbank_blueprint_baseline.json: a rise fails, a fall prints a note, --update-baseline lowers
the pin. The handoff's WP-8 acceptance is stricter than the ratchet -- every category within
+/-5 points of its band midpoint, and age 0-12 >= 10% -- and is printed for context; the
ratchet only forbids getting worse.

VACUITY (docs/SILENT_SHRINK_CHECKLIST.md). No attested item is tagged today, and a
distribution over the tagged subset would describe a smaller set than the one it names. So:
whenever ANY attested item is untagged (or carries an unknown key) the tool says exactly what
it examined ("k of N attested items tagged"), prints what it has labelled PARTIAL, and exits
2 -- never 0. For the same reason NO BASELINE SHIPS with the tool (a missing baseline is exit
2 too), --update-baseline refuses to write one over a partial pool, and bin/verify.sh runs only
--self-test. The first content PR that leaves every attested item tagged creates the baseline
with --update-baseline and adds the report itself to bin/verify.sh.

Exit 0 every dimension at or below its pin, 1 a rise, 2 could not check (bank unreadable or
the wrong shape, zero attested items, any attested item untagged, bands file malformed,
baseline missing or not pinning all six dimensions).

    python3 bin/qbank_blueprint_report.py                    # the report + ratchet
    python3 bin/qbank_blueprint_report.py --self-test        # what bin/verify.sh runs
    python3 bin/qbank_blueprint_report.py --update-baseline  # only once all attested are tagged
"""
import argparse, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
QB = os.path.join(ROOT, "question_bank.json")
SCHEMA = os.path.join(ROOT, "question_bank.schema.json")
BANDS = os.path.join(HERE, "data", "exam_blueprint_bands.json")
BASELINE = os.path.join(HERE, "qbank_blueprint_baseline.json")
DIMENSIONS = (("nbme", "system"), ("nbme", "physician_task"), ("nbme", "site_of_care"),
              ("nbme", "patient_age"), ("comat", "presentation"), ("comat", "physician_task"))
RATCHET_KEYS = tuple(f"{exam}.{dim}" for exam, dim in DIMENSIONS)
MIDPOINT_TOLERANCE = 5   # WP-8 acceptance, context only: within +/-5 points of band midpoint
AGE_0_12_FLOOR = 10      # WP-8 acceptance, context only: age 0-12 >= 10%
UPDATE_HINT = "python3 bin/qbank_blueprint_report.py --update-baseline"


class CouldNotCheck(Exception):
    """The run cannot measure what it claims to measure -- exit 2, never a pass."""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def load_bands(path=BANDS):
    """{(exam, dim): [{"key", "name", "min", "max"}, ...]} or CouldNotCheck.

    Validated, not trusted: a dimension missing, a duplicate key, min above max, or bands that
    cannot hold a 100% allocation would each let the report measure against the wrong thing."""
    rel = os.path.relpath(path, ROOT)
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError) as e:
        raise CouldNotCheck(f"bands file {rel} unreadable: {e}")
    exams = doc.get("exams") if isinstance(doc, dict) else None
    if not isinstance(exams, dict):
        raise CouldNotCheck(f"bands file {rel} has no `exams` object")
    out = {}
    for exam, dim in DIMENSIONS:
        e = exams.get(exam)
        if not isinstance(e, dict):
            raise CouldNotCheck(f"bands file {rel}: no exam `{exam}`")
        for field in ("source_url", "accessed"):
            if not isinstance(e.get(field), str) or not e[field]:
                raise CouldNotCheck(f"bands file {rel}: {exam} has no `{field}`")
        d = (e.get("dimensions") or {}).get(dim) if isinstance(e.get("dimensions"), dict) else None
        cats = d.get("categories") if isinstance(d, dict) else None
        if not isinstance(cats, list) or len(cats) < 2:
            raise CouldNotCheck(f"bands file {rel}: {exam}.{dim} is missing or has fewer "
                                f"than two categories")
        seen = set()
        for c in cats:
            if not (isinstance(c, dict) and isinstance(c.get("key"), str) and c["key"]
                    and isinstance(c.get("name"), str) and c["name"]
                    and _num(c.get("min")) and _num(c.get("max"))):
                raise CouldNotCheck(f"bands file {rel}: {exam}.{dim} has a category without "
                                    f"key/name/min/max")
            if not 0 <= c["min"] <= c["max"] <= 100:
                raise CouldNotCheck(f"bands file {rel}: {exam}.{dim} '{c['key']}' band "
                                    f"{c['min']}-{c['max']} is not 0 <= min <= max <= 100")
            if c["key"] in seen:
                raise CouldNotCheck(f"bands file {rel}: {exam}.{dim} repeats key '{c['key']}'")
            seen.add(c["key"])
        lo, hi = sum(c["min"] for c in cats), sum(c["max"] for c in cats)
        if not lo <= 100 <= hi:
            raise CouldNotCheck(f"bands file {rel}: {exam}.{dim} bands sum to {lo}-{hi}% and "
                                f"cannot hold a 100% allocation")
        out[(exam, dim)] = [{k: c[k] for k in ("key", "name", "min", "max")} for c in cats]
    extra = sorted(f"{x}.{y}" for x, e in exams.items() if isinstance(e, dict)
                   for y in (e.get("dimensions") or {}) if (x, y) not in DIMENSIONS)
    if extra:
        raise CouldNotCheck(f"bands file {rel} has dimension(s) this tool does not measure: "
                            f"{extra}")
    return out


def points_outside(pct, lo, hi):
    """Distance in percentage points from pct to the band [lo, hi]; 0 inside (inclusive)."""
    if pct < lo:
        return lo - pct
    if pct > hi:
        return pct - hi
    return 0


def _tag(item, exam, dim):
    bp = item.get("blueprint")
    sub = bp.get(exam) if isinstance(bp, dict) else None
    return sub.get(dim) if isinstance(sub, dict) else None


def measure(doc, bands):
    """The attested pool against every band. `complete` is False unless every attested item
    carries a known key in all six dimensions -- the distribution is then PARTIAL."""
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        raise CouldNotCheck("question bank is not an object with an `items` list (wrong shape)")
    items = doc["items"]
    if any(not isinstance(it, dict) for it in items):
        raise CouldNotCheck("question bank `items` holds a non-object entry")
    attested = [it for it in items if it.get("status") == "attested"]
    known = {dim: {c["key"] for c in bands[dim]} for dim in DIMENSIONS}
    untagged, unknown, bad = [], [], 0
    for it in attested:
        name = str(it.get("id") or "<item with no id>")
        missing = invalid = False
        for dim in DIMENSIONS:
            v = _tag(it, *dim)
            if v is None:
                missing = True
            elif not (isinstance(v, str) and v in known[dim]):
                invalid = True
                unknown.append((name, f"{dim[0]}.{dim[1]}", v))
        if missing:
            untagged.append(name)
        bad += missing or invalid
    dims = {}
    for dim in DIMENSIONS:
        tags = (_tag(it, *dim) for it in attested)
        tagged = [t for t in tags if isinstance(t, str) and t in known[dim]]
        n = len(tagged)
        rows, total = [], 0.0
        for c in bands[dim]:
            k = tagged.count(c["key"])
            pct = 100.0 * k / n if n else None
            gap = points_outside(pct, c["min"], c["max"]) if n else None
            total += gap or 0
            rows.append({"key": c["key"], "n": k, "pct": pct,
                         "min": c["min"], "max": c["max"], "gap": gap})
        dims[dim] = {"n": n, "rows": rows, "points": round(total, 2) if n else None}
    return {
        "attested_n": len(attested),
        "tagged_n": len(attested) - bad,
        "untagged": untagged,
        "unknown": unknown,
        "complete": bool(attested) and not bad,
        "dims": dims,
        "points": {f"{e}.{d}": dims[(e, d)]["points"] for e, d in DIMENSIONS},
    }


def load_baseline(path):
    """(points, None) or (None, error). A missing dimension is an error, not an unpinned one."""
    rel = os.path.relpath(path, ROOT)
    if not os.path.exists(path):
        return None, (f"no baseline at {rel} -- none ships until every attested item is tagged; "
                      f"the first fully tagged batch runs `{UPDATE_HINT}` (reviewed) to pin one")
    try:
        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
    except (OSError, ValueError) as e:
        return None, f"baseline {rel} unreadable: {e}"
    counts = payload.get("counts") if isinstance(payload, dict) else None
    if not isinstance(counts, dict):
        return None, f"baseline {rel} has no `counts` object -- run `{UPDATE_HINT}` (reviewed)"
    missing = [k for k in RATCHET_KEYS if not _num(counts.get(k))]
    if missing:
        return None, (f"baseline {rel} does not pin {', '.join(missing)} as a number -- "
                      f"run `{UPDATE_HINT}` (reviewed) to pin every dimension")
    return {k: counts[k] for k in RATCHET_KEYS}, None


def write_baseline(path, points):
    payload = {
        "_note": "Pinned by bin/qbank_blueprint_report.py (WP-8): percentage points outside the "
                 "published band, summed per dimension, over the ATTESTED pool. May fall, never "
                 "rise. Regenerate with --update-baseline as part of a reviewed change, never to "
                 "absorb a rise -- the diff is in the PR. See docs/RATCHETS.md.",
        "counts": {k: points[k] for k in RATCHET_KEYS},
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
        fh.write("\n")


def _fmt(x):
    return f"{x:g}"


def _print_dims(m, out, partial):
    for dim in DIMENSIONS:
        d = m["dims"][dim]
        head = f"{dim[0]}.{dim[1]}"
        if not d["n"]:
            out(f"\n{head}: no tagged attested items -- nothing to distribute")
            continue
        label = "PARTIAL -- over the tagged subset only" if partial else "attested pool"
        out(f"\n{head} ({d['n']} items, {label}): points outside band {_fmt(d['points'])}")
        for r in d["rows"]:
            mid = (r["min"] + r["max"]) / 2
            mark = "in " if r["gap"] == 0 else "OUT"
            near = ("" if abs(r["pct"] - mid) <= MIDPOINT_TOLERANCE
                    else f"  (not within +/-{MIDPOINT_TOLERANCE} of midpoint)")
            gap = f"  {_fmt(round(r['gap'], 2))} pts out" if r["gap"] else ""
            out(f"   {mark} {r['key'][:52]:<52} {r['n']:>4} {r['pct']:>5.1f}%  band "
                f"{_fmt(r['min'])}-{_fmt(r['max'])}%" + gap + near)


def gate(doc, bands, baseline, out=print):
    """The whole exit contract, in-process so --self-test can drive it.
    0 at or below every pin, 1 a rise, 2 could not check (including ANY untagged attested item)."""
    try:
        m = measure(doc, bands)
    except CouldNotCheck as e:
        out(f"qbank blueprint: COULD NOT CHECK -- {e}")
        return 2
    n = m["attested_n"]
    if not n:
        out("qbank blueprint: NO ATTESTED ITEMS -- a distribution over nothing is not a report "
            "(docs/SILENT_SHRINK_CHECKLIST.md D4).")
        return 2
    out(f"qbank blueprint: examined the attested pool -- {m['tagged_n']} of {n} attested item(s) "
        f"tagged in all six dimensions")
    if not m["complete"]:
        _print_dims(m, out, partial=True)
        if m["unknown"]:
            out(f"\nunknown category key(s) ({len(m['unknown'])}; "
                f"keys are bin/data/exam_blueprint_bands.json's):")
            for iid, dim, v in m["unknown"][:10]:
                out(f"  {iid}: {dim} = {v!r}")
        if m["untagged"]:
            shown = " ".join(m["untagged"][:12]) + (" ..." if len(m["untagged"]) > 12 else "")
            out(f"\nuntagged attested item(s) ({len(m['untagged'])}): {shown}")
        out(f"\nPARTIAL -- {m['tagged_n']} of {n} attested items tagged; a band report over a "
            f"subset is not a report of the pool (exit 2)")
        return 2
    _print_dims(m, out, partial=False)
    age = next(r for r in m["dims"][("nbme", "patient_age")]["rows"] if r["key"] == "Birth to 12")
    out(f"\nWP-8 acceptance (context, not the ratchet): every category within "
        f"+/-{MIDPOINT_TOLERANCE} of its band midpoint; age 0-12 {age['pct']:.1f}% "
        f"(target >= {AGE_0_12_FLOOR}%)")
    if baseline is None:
        out(f"FAIL -- no baseline to ratchet against. Run `{UPDATE_HINT}` (reviewed) and commit "
            f"bin/qbank_blueprint_baseline.json.")
        return 2
    fails, notes = [], []
    for key in RATCHET_KEYS:
        was, now = round(baseline[key], 2), m["points"][key]
        if now > was:
            fails.append(f"R  {key} rose {_fmt(was)} -> {_fmt(now)} points outside band. Tag or "
                         f"write items toward the under-filled categories; do not re-pin.")
        elif now < was:
            notes.append(f"R  {key} improved {_fmt(was)} -> {_fmt(now)} -- run `{UPDATE_HINT}` to "
                         f"lock the gain in.")
    for note in notes:
        out("note: " + note)
    if fails:
        out(f"FAIL -- {len(fails)} finding(s):")
        for f in fails:
            out("  - " + f)
        return 1
    total = round(sum(m["points"].values()), 2)
    # The tally rides on the LAST line on purpose: bin/verify.sh shows only a step's last line.
    out(f"OK -- {n} attested, {_fmt(total)} pts outside band: at/below pin")
    return 0


def schema_enums(schema):
    """{(exam, dim): enum list} read from question_bank.schema.json's item `blueprint`."""
    bp = schema["properties"]["items"]["items"]["properties"]["blueprint"]["properties"]
    return {(exam, dim): bp[exam]["properties"][dim].get("enum") for exam, dim in DIMENSIONS}


# ---------------------------------------------------------------- self-test

# An attested pool of 100 items whose every dimension sits inside its band. Each dimension is
# assigned independently from these counts (they sum to 100 per dimension).
_IN_BAND = {
    ("nbme", "system"): {"Behavioral Health": 67, "Nervous System & Special Senses": 12,
                         "General Principles": 8, "Other Systems": 8, "Social Sciences": 5},
    ("nbme", "physician_task"): {"Diagnosis": 67, "Pharmacotherapy/Intervention/Management": 33},
    ("nbme", "site_of_care"): {"Ambulatory": 62, "Emergency Department": 30, "Inpatient": 8},
    ("nbme", "patient_age"): {"Birth to 12": 12, "13 and older": 88},
    ("comat", "presentation"): {
        "Anxiety/Trauma/Dissociative/OCD": 22, "Neurocognitive": 10,
        "Neurodevelopmental/Gender Dysphoria/Disruptive-Impulse-Conduct": 10,
        "Depressive/Bipolar/Related": 22, "Personality": 6, "Schizophrenia Spectrum/Psychotic": 9,
        "Psychiatric Illness due to Medical Condition/Somatic/Sleep-Wake": 7,
        "Substance-Related/Addictive": 9, "Feeding-Eating-Elimination/Sexual-Paraphilic": 5},
    ("comat", "physician_task"): {
        "Health Promotion/Prevention/Care Delivery": 12, "History & Physical (incl. Dx)": 38,
        "Diagnostic Technologies": 5, "Management": 37, "Scientific Mechanisms of Disease": 8},
}


def _pool(counts=_IN_BAND, n=100, status="attested"):
    columns = {}
    for dim, dist in counts.items():
        col = [key for key, k in dist.items() for _ in range(k)]
        assert len(col) == n, (dim, len(col))
        columns[dim] = col
    items = []
    for i in range(n):
        bp = {"nbme": {}, "comat": {}}
        for (exam, dim), col in columns.items():
            bp[exam][dim] = col[i]
        items.append({"id": f"qb_fx_{i:03d}", "status": status, "blueprint": bp})
    return items


def self_test():
    import copy, tempfile
    checks = []

    def expect(label, cond):
        checks.append((label, bool(cond)))

    def run(doc, bands, baseline):
        lines = []
        try:
            rc = gate(doc, bands, baseline, out=lines.append)
        except Exception as e:  # a crash is a failed check, not a pass
            lines.append(f"CRASH {type(e).__name__}: {e}")
            rc = None
        return rc, "\n".join(lines)

    # a. the committed bands file loads, and every dimension admits a 100% allocation
    try:
        bands = load_bands(BANDS)
        expect("bands file carries all six dimensions", set(bands) == set(DIMENSIONS))
    except Exception as e:
        bands = None
        expect(f"bands file loads ({type(e).__name__}: {e})", False)

    # b. ONE source of truth: the item schema's enums are exactly the bands-file keys
    try:
        with open(SCHEMA, encoding="utf-8") as fh:
            enums = schema_enums(json.load(fh))
        for dim in DIMENSIONS:
            keys = [c["key"] for c in bands[dim]] if bands else None
            expect(f"schema enum {dim[0]}.{dim[1]} == bands-file keys", enums.get(dim) == keys)
    except Exception as e:
        expect(f"schema enums readable ({type(e).__name__}: {e})", False)

    # c. a malformed bands file is could-not-check, not a pass
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "bands.json")
        with open(BANDS, encoding="utf-8") as fh:
            good = json.load(fh)
        def cats(b, exam, dim):
            return b["exams"][exam]["dimensions"][dim]["categories"]

        for label, mutate in (
            ("a missing dimension", lambda b: b["exams"]["nbme"]["dimensions"].pop("patient_age")),
            ("a duplicate key", lambda b: cats(b, "comat", "presentation").append(
                dict(cats(b, "comat", "presentation")[0]))),
            ("min above max", lambda b: cats(b, "nbme", "system")[0].update(min=50, max=10)),
            ("bands that cannot sum to 100",
             lambda b: cats(b, "nbme", "patient_age")[0].update(min=20, max=20)),
            ("no source URL", lambda b: b["exams"]["comat"].pop("source_url")),
        ):
            bad = copy.deepcopy(good)
            mutate(bad)
            with open(p, "w", encoding="utf-8") as fh:
                json.dump(bad, fh)
            try:
                load_bands(p)
                expect(f"bands with {label} is rejected", False)
            except CouldNotCheck:
                expect(f"bands with {label} is rejected", True)
            except Exception as e:
                expect(f"bands with {label} is rejected cleanly ({type(e).__name__}: {e})", False)

    # d. the arithmetic: distance to the nearest edge, inclusive edges
    try:
        expect("0% against 5-6% is 5 points out", points_outside(0, 5, 6) == 5)
        expect("40% against 20-25% is 15 points out", points_outside(40, 20, 25) == 15)
        expect("22% inside 20-25% is 0", points_outside(22, 20, 25) == 0)
        expect("band edges are inside (20% and 25% of 20-25%)",
               points_outside(20, 20, 25) == 0 and points_outside(25, 20, 25) == 0)
    except Exception as e:
        expect(f"points_outside runs ({type(e).__name__}: {e})", False)

    if bands is None:
        expect("fixture gates need the bands file", False)
    else:
        zero = {k: 0 for k in RATCHET_KEYS}
        full = {"items": _pool() + [{"id": "qb_fx_draft", "status": "draft"}]}

        # e. fully tagged, inside every band -> 0 (an untagged DRAFT is not examined)
        rc, out = run(full, bands, zero)
        expect("fully tagged pool inside every band exits 0", rc == 0 and "FAIL" not in out)
        expect("it says what it examined: 100 of 100 attested items tagged",
               "100 of 100 attested" in out)

        # f. untagged -> 2; partial -> 2 and labelled PARTIAL; an unknown key -> 2 naming it
        rc, out = run({"items": [dict(i, blueprint=None) for i in _pool()]}, bands, zero)
        bare = [{k: v for k, v in i.items() if k != "blueprint"} for i in _pool()]
        rc2, out2 = run({"items": bare}, bands, zero)
        expect("untagged pool exits 2 and says 0 of 100",
               rc == 2 and rc2 == 2 and "0 of 100 attested" in out2)
        partial = _pool()
        del partial[7]["blueprint"]
        rc, out = run({"items": partial}, bands, zero)
        expect("partially tagged pool exits 2, labelled PARTIAL, naming the untagged item",
               rc == 2 and "PARTIAL" in out and "99 of 100 attested" in out and "qb_fx_007" in out)
        unknown = _pool()
        unknown[3]["blueprint"]["nbme"]["site_of_care"] = "Nursing Home"
        rc, out = run({"items": unknown}, bands, zero)
        expect("an unknown category key exits 2 naming the item and the value",
               rc == 2 and "qb_fx_003" in out and "Nursing Home" in out)
        odd = _pool()
        odd[4]["blueprint"]["comat"]["presentation"] = ["Personality"]
        odd[5].pop("id")
        del odd[5]["blueprint"]["nbme"]
        rc, out = run({"items": odd}, bands, zero)
        expect("a non-string tag and an id-less untagged item exit 2 without crashing",
               rc == 2 and "qb_fx_004" in out and "<item with no id>" in out and "98 of 100" in out)

        # g. out of band vs a zero pin -> 1 naming the dimension; the arithmetic is the band gaps
        skewed = _pool()
        for it in skewed:
            it["blueprint"]["nbme"]["site_of_care"] = "Inpatient"
        rc, out = run({"items": skewed}, bands, zero)
        expect("all-inpatient pool rises 0 -> 170 on nbme.site_of_care and exits 1",
               rc == 1 and "nbme.site_of_care rose 0 -> 170" in out)
        rc, out = run({"items": skewed}, bands, dict(zero, **{"nbme.site_of_care": 170}))
        expect("the same pool at its pin exits 0 (exit is baseline-driven)", rc == 0)
        rc, out = run(full, bands, dict(zero, **{"nbme.site_of_care": 170}))
        expect("a fall exits 0 with an improvement note and the --update-baseline hint",
               rc == 0 and "improved 170 -> 0" in out and "--update-baseline" in out)

        # h. could-not-check: no baseline, zero attested, wrong shape
        rc, out = run(full, bands, None)
        expect("a fully tagged pool with no baseline exits 2",
               rc == 2 and "--update-baseline" in out)
        rc, out = run({"items": _pool(status="draft")}, bands, zero)
        expect("zero attested items exits 2", rc == 2 and "NO ATTESTED ITEMS" in out)
        for label, bad in (("a bare list", _pool()), ("items not a list", {"items": {}})):
            rc, out = run(bad, bands, zero)
            expect(f"wrong shape ({label}) exits 2", rc == 2)

        # i. baseline contract, and --update-baseline refuses a partial pool
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "b.json")
            for label, payload, needle in (
                ("missing a dimension", {"counts": {k: 0 for k in RATCHET_KEYS[:-1]}},
                 RATCHET_KEYS[-1]),
                ("a boolean pin", {"counts": dict(zero, **{"nbme.system": True})}, "nbme.system"),
                ("no counts object", zero, "counts"),
            ):
                with open(p, "w", encoding="utf-8") as fh:
                    json.dump(payload, fh)
                try:
                    counts, err = load_baseline(p)
                    expect(f"baseline {label} is an error naming {needle}",
                           counts is None and err and needle in err)
                except Exception as e:
                    expect(f"load_baseline runs ({type(e).__name__}: {e})", False)
            try:
                m = measure({"items": partial}, bands)
                expect("measure marks a partial pool as not complete", m["complete"] is False)
                m = measure(full, bands)
                write_baseline(p, m["points"])
                counts, err = load_baseline(p)
                expect("write_baseline round-trips all six dimensions",
                       err is None and counts == {k: 0 for k in RATCHET_KEYS})
            except Exception as e:
                expect(f"measure/write_baseline run ({type(e).__name__}: {e})", False)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--bank", default=QB)
    ap.add_argument("--bands", default=BANDS)
    ap.add_argument("--baseline", default=BASELINE)
    ap.add_argument("--update-baseline", action="store_true",
                    help="write the pin from the current bank -- refused unless every attested "
                         "item is tagged (the diff is in the PR)")
    ap.add_argument("--self-test", action="store_true",
                    help="bands file, schema enums and fixture exits (untagged/partial 2, "
                         "in-band 0, rise 1); what bin/verify.sh runs")
    a = ap.parse_args()
    if a.self_test:
        return self_test()

    try:
        bands = load_bands(a.bands)
        with open(a.bank, encoding="utf-8") as fh:
            doc = json.load(fh)
    except CouldNotCheck as e:
        print(f"qbank blueprint: COULD NOT CHECK -- {e}")
        return 2
    except (OSError, ValueError) as e:
        print(f"qbank blueprint: COULD NOT CHECK -- cannot read {a.bank}: {e}")
        return 2
    if a.update_baseline:
        try:
            m = measure(doc, bands)
        except CouldNotCheck as e:
            print(f"FAIL -- nothing written: {e}")
            return 2
        if not m["complete"]:
            print(f"FAIL -- nothing written: {m['tagged_n']} of {m['attested_n']} attested items "
                  f"tagged. A pin over a partial pool would ratchet a number that describes a "
                  f"different set (docs/SILENT_SHRINK_CHECKLIST.md).")
            return 2
        write_baseline(a.baseline, m["points"])
        print(f"baseline written to {os.path.relpath(a.baseline, ROOT)}: "
              + ", ".join(f"{k}={_fmt(v)}" for k, v in m["points"].items()))
    baseline, err = load_baseline(a.baseline)
    rc = gate(doc, bands, baseline)  # a None baseline is exit 2 inside gate(), whatever the pool
    if err:
        print(f"baseline: {err}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
