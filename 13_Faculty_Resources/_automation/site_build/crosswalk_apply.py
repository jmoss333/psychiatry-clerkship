#!/usr/bin/env python3
"""Apply the curriculum crosswalk (shelfBlueprint + epa) to topic_meta.json.

Idempotent: re-running overwrites only the two crosswalk fields on the pages named
below, leaving everything else untouched and key order stable. See
CROSSWALK_TAXONOMY.md for the vocabulary, sources, and mapping rules.

Usage:  python3 crosswalk_apply.py [--check]
  --check : exit non-zero if topic_meta.json is out of sync with this mapping
            (for CI / pre-commit), changing nothing.
"""

import argparse
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TM_PATH = os.path.join(REPO, "topic_meta.json")

SHELF_VOCAB = ["mood", "psychosis", "anxiety", "substance", "neurocog", "pharm",
               "safety", "personality", "childdev", "otherdx", "ethics", "relational"]
EPA_VOCAB = ["EPA%d" % i for i in range(1, 14)]

# --- Dimension 1: shelfBlueprint (from QUESTION_BANK_BLUEPRINT.md source-page column,
#     extended to 5 obvious clinical pages the table did not enumerate). Authoritative. ---
SHELF = {
    "t_mood.md": ["mood"], "ect_neuromodulation.md": ["mood", "pharm"],
    "t_psychosis.md": ["psychosis"], "t_anxiety.md": ["anxiety"],
    "t_sud.md": ["substance"], "protocol_library.md": ["substance", "pharm"],
    "delirium.md": ["neurocog"], "t_neurocog.md": ["neurocog"], "t_geri.md": ["neurocog"],
    "catatonia.md": ["neurocog"], "exp_consult.md": ["neurocog", "ethics"],
    "psychopharm_primer.md": ["pharm"], "landmark_trials.md": ["pharm"],
    "pg_suicide.md": ["safety"], "agitation.md": ["safety"],
    "t_personality.md": ["personality"],
    "t_neurodev.md": ["childdev"], "t_impulse.md": ["childdev"],
    "t_eating.md": ["otherdx"], "t_somatic.md": ["otherdx"], "t_sleep.md": ["otherdx"],
    "t_dissociative.md": ["otherdx"], "t_sexual.md": ["otherdx"],
    "t_adjustment.md": ["otherdx"], "t_perinatal.md": ["otherdx"],
    "nutrition_metabolic.md": ["otherdx"],
    "ethics_legal.md": ["ethics"],
    "exp_family.md": ["relational"], "family_playbook.md": ["relational"],
    "family_modalities.md": ["relational"], "motivational_interviewing.md": ["relational"],
    "doc_oral.md": ["relational"], "brief_psychotherapy.md": ["relational"],
    "cultural_psychiatry.md": ["relational"],
    # extensions beyond the blueprint table (obvious clinical pages):
    "suicide.md": ["safety"], "violence.md": ["safety"],
    "toxidromes.md": ["neurocog", "pharm"], "medical_workup.md": ["neurocog"],
    "med_monitoring.md": ["pharm"],
}

# --- Dimension 2: epa (AAMC Core EPAs) — proposed teaching default, rule-based. ---
EPA = {
    # disease topic pages: history + differential
    "t_mood.md": ["EPA1", "EPA2", "EPA4"], "t_psychosis.md": ["EPA1", "EPA2", "EPA4"],
    "t_anxiety.md": ["EPA1", "EPA2"], "t_sud.md": ["EPA1", "EPA2", "EPA10"],
    "t_personality.md": ["EPA1", "EPA2"], "t_neurocog.md": ["EPA1", "EPA2", "EPA3"],
    "t_geri.md": ["EPA1", "EPA2", "EPA3"], "t_neurodev.md": ["EPA1", "EPA2"],
    "t_impulse.md": ["EPA1", "EPA2"], "t_eating.md": ["EPA1", "EPA2", "EPA10"],
    "t_somatic.md": ["EPA1", "EPA2"], "t_sleep.md": ["EPA1", "EPA2"],
    "t_dissociative.md": ["EPA1", "EPA2"], "t_sexual.md": ["EPA1", "EPA2"],
    "t_adjustment.md": ["EPA1", "EPA2"], "t_perinatal.md": ["EPA1", "EPA2", "EPA10"],
    # safety / emergency: recognize urgent care
    "pg_suicide.md": ["EPA1", "EPA2", "EPA10"], "suicide.md": ["EPA1", "EPA2", "EPA10"],
    "violence.md": ["EPA1", "EPA2", "EPA10"], "agitation.md": ["EPA2", "EPA4", "EPA10"],
    "delirium.md": ["EPA1", "EPA2", "EPA3", "EPA10"],
    "catatonia.md": ["EPA1", "EPA2", "EPA10"],
    "toxidromes.md": ["EPA2", "EPA3", "EPA10"],
    # capacity / ethics: informed consent
    "ethics_legal.md": ["EPA2", "EPA11"], "exp_consult.md": ["EPA2", "EPA8", "EPA11"],
    # diagnostic workup / labs / monitoring
    "medical_workup.md": ["EPA2", "EPA3"], "med_monitoring.md": ["EPA3", "EPA4"],
    "ddx.md": ["EPA2"], "case_formulation.md": ["EPA2"], "pg_formulation.md": ["EPA2"],
    # treatment / pharmacology / protocol
    "psychopharm_primer.md": ["EPA2", "EPA4"], "protocol_library.md": ["EPA4", "EPA10"],
    "ect_neuromodulation.md": ["EPA2", "EPA4"], "exp_tx.md": ["EPA2", "EPA4"],
    # documentation & presentation / interview
    "doc_oral.md": ["EPA5", "EPA6"], "pg_interview.md": ["EPA1"],
    # collateral / handoff / interprofessional / family
    "collateral_workflow.md": ["EPA8", "EPA9"], "exp_family.md": ["EPA9"],
    "family_playbook.md": ["EPA9"], "family_modalities.md": ["EPA9"],
    "cultural_psychiatry.md": ["EPA1", "EPA9"], "motivational_interviewing.md": ["EPA9"],
    "brief_psychotherapy.md": ["EPA9"], "rounds_questions.md": ["EPA6"],
    "psychotherapy.md": ["EPA2"],
    # evidence / reading
    "evidence_inpatient.md": ["EPA7"], "landmark_trials.md": ["EPA7"],
    "reading_map.md": ["EPA7"], "book_library.md": ["EPA7"], "podcast_library.md": ["EPA7"],
    "core_readings.md": ["EPA7"],
    "nutrition_metabolic.md": ["EPA2", "EPA4"],
}


def validate_vocab():
    bad = []
    for p, v in SHELF.items():
        for c in v:
            if c not in SHELF_VOCAB:
                bad.append("%s: bad shelf code %s" % (p, c))
    for p, v in EPA.items():
        for c in v:
            if c not in EPA_VOCAB:
                bad.append("%s: bad epa code %s" % (p, c))
    if bad:
        print("\n".join(bad)); sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    validate_vocab()

    tm = json.load(open(TM_PATH, encoding="utf-8"),
                   object_pairs_hook=collections.OrderedDict)

    changed, missing = [], []
    pages = set(SHELF) | set(EPA)
    for p in sorted(pages):
        if p not in tm or not isinstance(tm.get(p), dict):
            missing.append(p)
            continue
        entry = tm[p]
        want_shelf = SHELF.get(p)
        want_epa = EPA.get(p)
        if want_shelf is not None and entry.get("shelfBlueprint") != want_shelf:
            entry["shelfBlueprint"] = want_shelf; changed.append(p)
        if want_epa is not None and entry.get("epa") != want_epa:
            entry["epa"] = want_epa
            if p not in changed:
                changed.append(p)

    if args.check:
        if changed or missing:
            print("crosswalk OUT OF SYNC — run crosswalk_apply.py.")
            if changed:
                print("  would update: " + ", ".join(changed))
            if missing:
                print("  mapped pages absent from topic_meta: " + ", ".join(missing))
            sys.exit(1)
        print("crosswalk in sync (%d shelf pages, %d epa pages)." % (len(SHELF), len(EPA)))
        return

    json.dump(tm, open(TM_PATH, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("crosswalk applied: %d entries updated." % len(changed))
    print("  shelfBlueprint on %d pages, epa on %d pages." % (len(SHELF), len(EPA)))
    if missing:
        print("  WARNING mapped pages absent from topic_meta (skipped): " + ", ".join(missing))


if __name__ == "__main__":
    main()
