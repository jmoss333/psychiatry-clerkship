#!/usr/bin/env python3
"""Build ONE combined .apkg containing both decks as subdecks.

Students import a single file and get:
  Psychiatry Clerkship Library (Moss)
    ├─ Question Bank   (vignette cards from question_bank.json)
    └─ Concepts        (pearls + one-liners from attested topic pages)

Reuses build_deck() from export_anki.py and export_anki_content.py so there is
one source of truth for card logic. Distinct subdeck IDs (not the standalone
deck IDs) keep the combined package self-contained: a student can import the
combined file and/or either standalone deck without deck-identity collisions.
The shared note-type (model) IDs are intentionally reused so cards look and
behave identically across packages.

Usage:  python3 export_anki_all.py [--out DIR]
"""

import argparse
import json
import os

import genanki

import export_anki as qb
import export_anki_content as concepts

PARENT = "Psychiatry Clerkship Library (Moss)"
COMBINED_QB_DECK_ID = 2059400193
COMBINED_CONCEPTS_DECK_ID = 2059400194


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", ".."))
    ap.add_argument("--out", default=os.path.join(repo, "09_Exam_Prep", "anki_export"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    with open(os.path.join(repo, "question_bank.json")) as f:
        items = json.load(f)["items"]

    qb_deck, _, qb_notes = qb.build_deck(
        items, include_drafts=False,
        deck_id=COMBINED_QB_DECK_ID, deck_name=f"{PARENT}::Question Bank")
    concept_deck, cstats = concepts.build_deck(
        repo, deck_id=COMBINED_CONCEPTS_DECK_ID, deck_name=f"{PARENT}::Concepts")

    apkg = os.path.join(args.out, "psychiatry_clerkship_library_ALL.apkg")
    genanki.Package([qb_deck, concept_deck]).write_to_file(apkg)

    print("Combined deck (one import → two subdecks):")
    print(f"  ::Question Bank  {qb_notes} cards")
    print(f"  ::Concepts       {cstats['total']} cards "
          f"({cstats['summary']} summary / {cstats['cloze']} cloze / {cstats['basic']} pearl)")
    print(f"  .apkg: {apkg}")


if __name__ == "__main__":
    main()
