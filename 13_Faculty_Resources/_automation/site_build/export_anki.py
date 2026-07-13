#!/usr/bin/env python3
"""Export question_bank.json to an Anki deck (.apkg) + CSV fallback.

Design notes (see brainstorm 2026-07-12):
- Attested-only by default. Draft items are excluded unless --include-drafts is
  passed, in which case they are tagged `Status::draft` and title-prefixed so a
  learner can never mistake an un-attested item for signed-off content. This is
  the same attestation gate the SPA enforces via reviewed.json.
- Vignette Basic (Q/A) cards, not cloze: these items are full clinical vignettes,
  and Basic Q&A mirrors how the shelf/COMAT actually tests (recognition of the
  best next step), which is the point of the bank.
- Two-tier items emit TWO chained notes (tier-1 management + tier-2 mechanism).
- Stable note GUIDs are derived from the item id (and `::t2` for tier-2), so
  re-importing an updated deck UPDATES existing cards instead of duplicating —
  honoring the schema's promise that ids are stable SRS keys forever.
- AnKing-style hierarchical `::` tags drive the suspend/unsuspend workflow:
  Psychiatry::<Category>, Competency::<c>, Difficulty::<n>, Type::<t>,
  Source::<page>, plus HighYield.

Usage:
  python3 export_anki.py [--bank PATH] [--out DIR] [--include-drafts]
"""

import argparse
import csv
import html
import json
import os
import sys

import genanki

# Stable IDs — NEVER change these once decks are in the wild, or Anki will treat
# the model/deck as new and orphan every learner's review history.
MODEL_ID = 1607392901          # PCL vignette model
DECK_ID = 2059400191           # single top-level deck (tag-driven, AnKing style)
DECK_NAME = "Psychiatry Clerkship Library (Moss)"

CATEGORY_LABELS = {
    "substance": "Substance & Withdrawal",
    "relational": "Relational & Family",
    "neurocog": "Neurocognitive",
    "mood": "Mood",
    "psychosis": "Psychosis",
    "anxiety": "Anxiety",
    "pharm": "Psychopharmacology",
    "safety": "Acute & Safety",
    "personality": "Personality",
    "childdev": "Child & Development",
    "otherdx": "Other Diagnoses",
    "ethics": "Ethics & Legal",
}

CARD_CSS = """
.card { font-family: -apple-system, Segoe UI, Roboto, sans-serif;
        font-size: 17px; line-height: 1.5; color: #1a1a1a;
        background: #fbf7f0; text-align: left; padding: 14px 18px; }
.stem { margin-bottom: 12px; }
.opts { margin: 0 0 6px 0; padding: 0; list-style: none; }
.opts li { margin: 4px 0; }
.answer { font-weight: 700; color: #1f6f54; }
.tag { display:inline-block; font-size:12px; font-weight:600; color:#8a5a1a;
       background:#f2e6d2; border-radius:4px; padding:1px 7px; margin:2px 4px 2px 0; }
.trap { color:#8a2b2b; }
.trap b { color:#8a2b2b; }
.why { margin-top:10px; }
.pearl { margin-top:10px; padding:8px 12px; background:#eaf3ee;
         border-left:3px solid #1f6f54; border-radius:4px; }
.evidence { margin-top:10px; font-size:14px; color:#555; }
.link { margin-top:10px; font-size:14px; }
.draft { color:#8a2b2b; font-weight:700; }
hr { border:none; border-top:1px solid #d9cdb8; margin:12px 0; }
"""

MODEL = genanki.Model(
    MODEL_ID,
    "PCL Vignette (Moss)",
    fields=[
        {"name": "UID"},
        {"name": "Question"},
        {"name": "Options"},
        {"name": "Answer"},
        {"name": "Why"},
        {"name": "Pearl"},
        {"name": "Evidence"},
        {"name": "Link"},
        {"name": "Meta"},
    ],
    templates=[
        {
            "name": "Card 1",
            "qfmt": '<div class="stem">{{Question}}</div>{{Options}}',
            "afmt": (
                '<div class="stem">{{Question}}</div>{{Options}}'
                '<hr id="answer">'
                '{{Answer}}'
                '{{#Why}}<div class="why">{{Why}}</div>{{/Why}}'
                '{{#Pearl}}<div class="pearl">💡 {{Pearl}}</div>{{/Pearl}}'
                '{{#Evidence}}<div class="evidence">📄 {{Evidence}}</div>{{/Evidence}}'
                '{{#Link}}<div class="link">🔗 {{Link}}</div>{{/Link}}'
                '{{#Meta}}<div>{{Meta}}</div>{{/Meta}}'
            ),
        }
    ],
    css=CARD_CSS,
)


def esc(s):
    return html.escape(str(s or ""))


def render_options(options, draft=False):
    """Options list with correct answer marked and trap notes shown."""
    front_items = []
    back_items = []
    correct = None
    for opt in options:
        key = opt.get("key", "")
        text = esc(opt.get("t", ""))
        front_items.append(f"<li><b>{esc(key)}.</b> {text}</li>")
        if opt.get("c"):
            correct = (key, opt.get("t", ""))
            back_items.append(f'<li class="answer">✓ {esc(key)}. {text}</li>')
        else:
            trap = opt.get("trap") or {}
            note = trap.get("note")
            name = trap.get("name")
            frag = f"<li>{esc(key)}. {text}"
            if name or note:
                bits = []
                if name:
                    bits.append(f"<b>{esc(name)}</b>")
                if note:
                    bits.append(esc(note))
                frag += f'<br><span class="trap">Trap: {" — ".join(bits)}</span>'
            frag += "</li>"
            back_items.append(frag)
    front = '<ul class="opts">' + "".join(front_items) + "</ul>"
    back = '<ul class="opts">' + "".join(back_items) + "</ul>"
    return front, back, correct


def answer_html(correct):
    if not correct:
        return ""
    key, text = correct
    return f'<div class="answer">Best answer: {esc(key)}. {esc(text)}</div>'


def meta_html(item):
    cat = CATEGORY_LABELS.get(item.get("category"), item.get("category", ""))
    bits = [f'<span class="tag">{esc(cat)}</span>']
    if item.get("hy"):
        bits.append('<span class="tag">High-yield</span>')
    bits.append(f'<span class="tag">Difficulty {esc(item.get("difficulty",""))}</span>')
    for c in item.get("competency", []):
        bits.append(f'<span class="tag">{esc(c)}</span>')
    return '<div style="margin-top:10px">' + "".join(bits) + "</div>"


def link_html(item):
    lk = item.get("link") or {}
    label = lk.get("label")
    href = lk.get("href")
    if label and href:
        return f"{esc(label)} ({esc(href)})"
    return ""


def tags_for(item, tier2=False, draft=False):
    tags = ["PsychClerkship"]
    cat = item.get("category")
    if cat:
        tags.append(f"Psychiatry::{cat}")
    for c in item.get("competency", []):
        tags.append(f"Competency::{c}")
    tags.append(f"Difficulty::{item.get('difficulty','NA')}")
    tags.append(f"Type::{item.get('type','sba')}")
    if item.get("hy"):
        tags.append("HighYield")
    for p in item.get("pages", []):
        tags.append(f"Source::{p.replace('.md','')}")
    if tier2:
        tags.append("Tier2::mechanism")
    if draft:
        tags.append("Status::draft")
    else:
        tags.append("Status::attested")
    # Anki tags cannot contain spaces
    return [t.replace(" ", "_") for t in tags]


def build_note(item, include_drafts):
    draft = item.get("status") != "attested"
    prefix = '<span class="draft">[DRAFT — NOT ATTESTED] </span>' if draft else ""
    front_opts, back_opts, correct = render_options(item.get("options", []))
    question = prefix + esc(item.get("stem", ""))
    # front/back Options field must be identical fragment; we swap correctness on back
    note = genanki.Note(
        model=MODEL,
        fields=[
            item["id"],
            question,
            back_opts,  # back shows marked answers; front template also uses {{Options}}
            answer_html(correct),
            esc(item.get("why", "")),
            esc(item.get("pearl", "")),
            esc(item.get("evidence", "")),
            link_html(item),
            meta_html(item),
        ],
        tags=tags_for(item, draft=draft),
        guid=genanki.guid_for(item["id"]),
    )
    # But front must show UNMARKED options — override by putting plain options in
    # the question and leaving Options for the back. Simpler: fold options into Q.
    note.fields[1] = question + front_opts
    note.fields[2] = ""  # not used on front
    # Rebuild back so the marked options still appear after the hr
    note.fields[3] = back_opts + answer_html(correct)
    notes = [note]

    t2 = item.get("tier2")
    if t2:
        f2, b2, c2 = render_options(t2.get("options", []))
        q2 = prefix + f'<b>Tier 2 — {esc(t2.get("q",""))}</b>'
        n2 = genanki.Note(
            model=MODEL,
            fields=[
                item["id"] + "::t2",
                q2 + f2,
                "",
                b2 + answer_html(c2),
                esc(t2.get("why", "")),
                "",
                "",
                "",
                meta_html(item),
            ],
            tags=tags_for(item, tier2=True, draft=draft),
            guid=genanki.guid_for(item["id"] + "::t2"),
        )
        notes.append(n2)
    return notes


def csv_rows(item, include_drafts):
    draft = item.get("status") != "attested"
    _, _, correct = render_options(item.get("options", []))
    ck, ct = correct if correct else ("", "")
    opts = " | ".join(f"{o.get('key')}. {o.get('t','')}" for o in item.get("options", []))
    yield {
        "id": item["id"],
        "status": item.get("status"),
        "category": item.get("category"),
        "type": item.get("type"),
        "difficulty": item.get("difficulty"),
        "high_yield": bool(item.get("hy")),
        "competency": ";".join(item.get("competency", [])),
        "source_pages": ";".join(item.get("pages", [])),
        "stem": item.get("stem", ""),
        "options": opts,
        "answer_key": ck,
        "answer_text": ct,
        "why": item.get("why", ""),
        "pearl": item.get("pearl", ""),
        "evidence": item.get("evidence", ""),
    }


def build_deck(items, include_drafts=False, deck_id=DECK_ID, deck_name=DECK_NAME):
    """Build (and return) a genanki.Deck plus (selected_items, note_count).
    Importable by export_anki_all.py so the combined package reuses this logic."""
    selected = [i for i in items
                if include_drafts or i.get("status") == "attested"]
    deck = genanki.Deck(deck_id, deck_name)
    note_count = 0
    for it in selected:
        for n in build_note(it, include_drafts):
            deck.add_note(n)
            note_count += 1
    return deck, selected, note_count


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", ".."))
    ap.add_argument("--bank", default=os.path.join(repo, "question_bank.json"))
    ap.add_argument("--out", default=os.path.join(repo, "09_Exam_Prep", "anki_export"))
    ap.add_argument("--include-drafts", action="store_true",
                    help="include un-attested draft items (tagged/watermarked)")
    args = ap.parse_args()

    with open(args.bank) as f:
        bank = json.load(f)
    items = bank["items"]
    os.makedirs(args.out, exist_ok=True)

    deck, selected, note_count = build_deck(items, args.include_drafts)

    suffix = "_with_drafts" if args.include_drafts else ""
    apkg = os.path.join(args.out, f"psychiatry_clerkship_library{suffix}.apkg")
    genanki.Package(deck).write_to_file(apkg)

    csv_path = os.path.join(args.out, f"psychiatry_clerkship_library{suffix}.csv")
    fields = ["id", "status", "category", "type", "difficulty", "high_yield",
              "competency", "source_pages", "stem", "options", "answer_key",
              "answer_text", "why", "pearl", "evidence"]
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for it in selected:
            for row in csv_rows(it, args.include_drafts):
                w.writerow(row)

    n_attested = sum(1 for i in items if i.get("status") == "attested")
    n_draft = sum(1 for i in items if i.get("status") != "attested")
    print(f"Items in bank: {len(items)}  (attested {n_attested}, draft {n_draft})")
    print(f"Exported items: {len(selected)}  ->  {note_count} Anki notes "
          f"(two-tier items emit a second card)")
    print(f"  .apkg: {apkg}")
    print(f"  .csv : {csv_path}")
    if not args.include_drafts:
        print("Attested-only (default). Re-run with --include-drafts to include "
              f"the {n_draft} draft items (watermarked).")


if __name__ == "__main__":
    main()
