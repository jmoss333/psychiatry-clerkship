#!/usr/bin/env python3
"""
qbank_form.py — Deterministic practice-form generator for the Shelf/COMAT
dual-exam psychiatry question bank.

Assembles reproducible practice forms from a pool of items and reports how
closely each form meets the selected blueprint constraints, including any
unavoidable deviation (e.g. when the pool is too small to satisfy a band).

Form types:
    topic       Topic-focused quiz (one --category)
    shelf       Mixed Shelf-style block (NBME site/task/age weighting)
    comat       Mixed COMAT-aligned block (Dimension-1 presentation weighting)
    full-comat  Full-length COMAT-aligned practice form
    cumulative  Cumulative clerkship review block (broad category spread)

Selection is greedy against target cell counts with a fixed RNG seed, so the
same (pool, type, size, seed) always yields the same form. It never fabricates
items; if a target cannot be met it fills with the best-available and records
the shortfall in `deviations`.

Usage:
    python3 qbank_form.py shelf --size 20 04_pilot_batch_01.json
    python3 qbank_form.py topic --category mood --size 5 04_pilot_batch_01.json
    python3 qbank_form.py full-comat --size 24 --json form.json 04_pilot_batch_01.json

No PHI; reads only. Author: technical-lead pass 2026-07-13.
"""
import argparse
import json
import random
from collections import Counter
from pathlib import Path

# COMAT Dimension-1 presentation midpoints (%), from the official blueprint.
COMAT_PRESENTATION_WEIGHT = {
    "Anxiety/Trauma/Dissociative/OCD": 22.5,
    "Neurocognitive": 9.5,
    "Neurodevelopmental/Gender Dysphoria/Disruptive-Impulse-Conduct": 12.0,
    "Depressive/Bipolar/Related": 22.5,
    "Personality": 6.5,
    "Schizophrenia Spectrum/Psychotic": 9.0,
    "Psychiatric Illness due to Medical Condition/Somatic/Sleep-Wake": 8.0,
    "Substance-Related/Addictive": 9.0,
    "Feeding-Eating-Elimination/Sexual-Paraphilic": 5.5,
}
# NBME site-of-care midpoints for shelf blocks.
NBME_SITE_WEIGHT = {"ambulatory": 62.5, "emergency-department": 25.0, "inpatient": 7.5}


def load_pool(paths):
    pool = []
    for p in paths:
        pool.extend(json.loads(Path(p).read_text()).get("items", []))
    return pool


def largest_remainder(weights, size):
    """Apportion `size` slots across keys by weight (Hamilton/largest-remainder)."""
    total = sum(weights.values())
    raw = {k: size * w / total for k, w in weights.items()}
    base = {k: int(v) for k, v in raw.items()}
    rem = size - sum(base.values())
    order = sorted(raw, key=lambda k: raw[k] - base[k], reverse=True)
    for k in order[:rem]:
        base[k] += 1
    return base


def greedy_fill(pool, target_counts, keyfn, size, rng):
    """Pick items so the count per key approaches target_counts; fill remainder."""
    buckets = {}
    for it in pool:
        buckets.setdefault(keyfn(it), []).append(it)
    for b in buckets.values():
        rng.shuffle(b)
    chosen, used = [], set()
    deviations = []
    # first pass: satisfy targets
    for k, want in target_counts.items():
        avail = buckets.get(k, [])
        take = avail[:want]
        if len(take) < want:
            deviations.append(f"{k}: wanted {want}, pool had {len(avail)} (short {want-len(take)})")
        for it in take:
            chosen.append(it); used.add(it["id"])
    # second pass: fill to size from anything unused
    if len(chosen) < size:
        leftover = [it for it in pool if it["id"] not in used]
        rng.shuffle(leftover)
        for it in leftover[:size - len(chosen)]:
            chosen.append(it); used.add(it["id"])
    # trim if over (targets summed > size)
    if len(chosen) > size:
        chosen = chosen[:size]
    rng.shuffle(chosen)
    return chosen, deviations


def build(form_type, pool, size, category, seed):
    rng = random.Random(seed)
    if form_type == "topic":
        if not category:
            raise SystemExit("topic form requires --category")
        pool = [it for it in pool if it.get("category") == category]
        chosen = pool[:] if len(pool) <= size else rng.sample(pool, size)
        return chosen, ([f"pool has only {len(pool)} in {category}"] if len(pool) < size else [])

    if form_type in ("comat", "full-comat"):
        tgt = largest_remainder(COMAT_PRESENTATION_WEIGHT, size)
        return greedy_fill(pool, tgt,
                           lambda it: it.get("blueprint", {}).get("comat", {}).get("presentation"),
                           size, rng)

    if form_type == "shelf":
        tgt = largest_remainder(NBME_SITE_WEIGHT, size)
        return greedy_fill(pool, tgt, lambda it: it.get("clinical_setting"), size, rng)

    if form_type == "cumulative":
        cats = sorted({it.get("category") for it in pool})
        per = largest_remainder({c: 1 for c in cats}, size)
        return greedy_fill(pool, per, lambda it: it.get("category"), size, rng)

    raise SystemExit(f"unknown form type {form_type}")


def summarize(chosen):
    return {
        "n": len(chosen),
        "by_category": dict(Counter(it.get("category") for it in chosen)),
        "by_site": dict(Counter(it.get("clinical_setting") for it in chosen)),
        "by_comat_presentation": dict(Counter(
            it.get("blueprint", {}).get("comat", {}).get("presentation") for it in chosen)),
        "by_difficulty": dict(Counter(it.get("difficulty") for it in chosen)),
        "item_ids": [it["id"] for it in chosen],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("form_type", choices=["topic", "shelf", "comat", "full-comat", "cumulative"])
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--size", type=int, default=20)
    ap.add_argument("--category", default=None)
    ap.add_argument("--seed", type=int, default=1729)
    ap.add_argument("--json", dest="json_out", default=None)
    args = ap.parse_args()

    pool = load_pool(args.paths)
    chosen, deviations = build(args.form_type, pool, args.size, args.category, args.seed)
    summ = summarize(chosen)

    print(f"FORM: {args.form_type}  size={args.size}  seed={args.seed}  pool={len(pool)}")
    print(f"  assembled {summ['n']} items")
    print(f"  by category:  {summ['by_category']}")
    print(f"  by site:      {summ['by_site']}")
    print(f"  by COMAT pres:{summ['by_comat_presentation']}")
    print(f"  by difficulty:{summ['by_difficulty']}")
    if deviations:
        print("  DEVIATIONS (pool-limited — unavoidable at this pool size):")
        for d in deviations:
            print(f"    - {d}")
    else:
        print("  DEVIATIONS: none — form meets target cell counts")
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(
            {"form_type": args.form_type, "size": args.size, "seed": args.seed,
             "summary": summ, "deviations": deviations}, indent=2))
        print(f"  wrote {args.json_out}")


if __name__ == "__main__":
    main()
