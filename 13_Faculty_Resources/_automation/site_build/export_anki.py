#!/usr/bin/env python3
"""Compatibility CLI for the frozen legacy question-bank Anki export.

The reusable projection and rendering helpers now live in ``pcl_anki.qbank`` so
governed package generation and this historical CLI cannot silently diverge.
"""

import argparse
import csv
import json
import os
import sys

import genanki


ANKI_AUTOMATION = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "anki"))
if ANKI_AUTOMATION not in sys.path:
    sys.path.insert(0, ANKI_AUTOMATION)

from pcl_anki.qbank import (  # noqa: E402,F401 - compatibility re-exports
    CARD_CSS,
    CATEGORY_LABELS,
    DECK_ID,
    DECK_NAME,
    MODEL,
    MODEL_ID,
    answer_html,
    build_deck,
    build_note,
    csv_rows,
    esc,
    link_html,
    meta_html,
    render_options,
    tags_for,
)


def main():
    parser = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", ".."))
    parser.add_argument("--bank", default=os.path.join(repo, "question_bank.json"))
    parser.add_argument(
        "--out", default=os.path.join(repo, "09_Exam_Prep", "anki_export")
    )
    parser.add_argument(
        "--include-drafts",
        action="store_true",
        help="include un-attested draft items (tagged/watermarked)",
    )
    args = parser.parse_args()

    with open(args.bank, encoding="utf-8") as bank_file:
        bank = json.load(bank_file)
    items = bank["items"]
    os.makedirs(args.out, exist_ok=True)

    deck, selected, note_count = build_deck(items, args.include_drafts)

    suffix = "_with_drafts" if args.include_drafts else ""
    package_path = os.path.join(
        args.out, f"psychiatry_clerkship_library{suffix}.apkg"
    )
    genanki.Package(deck).write_to_file(package_path)

    csv_path = os.path.join(args.out, f"psychiatry_clerkship_library{suffix}.csv")
    fields = [
        "id",
        "status",
        "category",
        "type",
        "difficulty",
        "high_yield",
        "competency",
        "source_pages",
        "stem",
        "options",
        "answer_key",
        "answer_text",
        "why",
        "pearl",
        "evidence",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fields)
        writer.writeheader()
        for item in selected:
            for row in csv_rows(item, args.include_drafts):
                writer.writerow(row)

    attested_count = sum(1 for item in items if item.get("status") == "attested")
    draft_count = sum(1 for item in items if item.get("status") != "attested")
    print(
        f"Items in bank: {len(items)}  "
        f"(attested {attested_count}, draft {draft_count})"
    )
    print(
        f"Exported items: {len(selected)}  ->  {note_count} Anki notes "
        "(two-tier items emit a second card)"
    )
    print(f"  .apkg: {package_path}")
    print(f"  .csv : {csv_path}")
    if not args.include_drafts:
        print(
            "Attested-only (default). Re-run with --include-drafts to include "
            f"the {draft_count} draft items (watermarked)."
        )


if __name__ == "__main__":
    main()
