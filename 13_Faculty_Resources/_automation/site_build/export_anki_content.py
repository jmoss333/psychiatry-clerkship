#!/usr/bin/env python3
"""Export attested website *content* (topic pages) to an Anki deck.

Companion to export_anki.py (which handles question_bank.json). This deck is the
concept/fact layer; the qbank deck is the vignette layer.

SAFETY / ATTESTATION MODEL — this is the whole point of doing it this way:
- Cards are EXTRACTED from already-attested structured content, never
  LLM-generated from prose. A page contributes cards only if it carries the
  "attested by …" review line. This keeps the deck inside the same attestation
  chain the SPA enforces; nothing a learner sees was synthesized here.
- Two structured elements are harvested:
    * "In one line — …"      → one summary (Basic) card per topic.
    * "High-yield pearls" bullets → one card per pearl.
        - pearl containing **bold** spans → CLOZE card, hiding exactly the spans
          the author chose to emphasize (the author's bold IS the deletion —
          no model judgment about what to test).
        - pearl with no bold → Basic recall/consolidation card.
- Stable GUIDs are derived from the source slug + a hash of the normalized card
  text, so re-running after unrelated edits does not churn a learner's history;
  editing a pearl's wording intentionally mints a fresh card.

Usage:  python3 export_anki_content.py [--out DIR]
"""

import argparse
import glob
import hashlib
import html
import json
import os
import re

import genanki

MODEL_BASIC_ID = 1740111001
MODEL_CLOZE_ID = 1740111002
DECK_ID = 2059400192
DECK_NAME = "Psychiatry Clerkship Library — Concepts (Moss)"

CONTENT_ROOTS = [
    "03_Core_Topics", "04_Acute_and_Safety", "05_Psychopharmacology",
    "02_Clinical_Skills", "06_Family_and_Relational", "07_Evidence_and_Reading",
]

CSS = """
.card { font-family:-apple-system,Segoe UI,Roboto,sans-serif; font-size:18px;
        line-height:1.55; color:#1a1a1a; background:#fbf7f0;
        text-align:left; padding:16px 20px; }
.topic { font-size:13px; font-weight:700; letter-spacing:.04em;
         text-transform:uppercase; color:#8a5a1a; margin-bottom:10px; }
.cloze { font-weight:700; color:#1f6f54; }
.src { margin-top:14px; font-size:13px; color:#777; }
hr { border:none; border-top:1px solid #d9cdb8; margin:12px 0; }
"""

BASIC_MODEL = genanki.Model(
    MODEL_BASIC_ID, "PCL Concept Basic (Moss)",
    fields=[{"name": "UID"}, {"name": "Topic"}, {"name": "Front"},
            {"name": "Back"}, {"name": "Source"}],
    templates=[{
        "name": "Card 1",
        "qfmt": '<div class="topic">{{Topic}}</div>{{Front}}',
        "afmt": '<div class="topic">{{Topic}}</div>{{Front}}<hr>{{Back}}'
                '{{#Source}}<div class="src">{{Source}}</div>{{/Source}}',
    }],
    css=CSS,
)

CLOZE_MODEL = genanki.Model(
    MODEL_CLOZE_ID, "PCL Concept Cloze (Moss)",
    model_type=genanki.Model.CLOZE,
    fields=[{"name": "UID"}, {"name": "Topic"}, {"name": "Text"},
            {"name": "Source"}],
    templates=[{
        "name": "Cloze",
        "qfmt": '<div class="topic">{{Topic}}</div>{{cloze:Text}}',
        "afmt": '<div class="topic">{{Topic}}</div>{{cloze:Text}}'
                '{{#Source}}<div class="src">{{Source}}</div>{{/Source}}',
    }],
    css=CSS,
)


def guid(*parts):
    h = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()
    return genanki.guid_for(h)


def slug_of(path):
    return os.path.splitext(os.path.basename(path))[0]


def clean_md_inline(s):
    """Strip markdown links/anchors but keep readable text; escape HTML."""
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)      # [text](url) -> text
    s = re.sub(r"<a [^>]*>(.*?)</a>", r"\1", s, flags=re.S)
    s = re.sub(r"</?[^>]+>", "", s)                      # stray html tags
    return s.strip()


def bold_to_cloze(text):
    """Turn **bold** spans into sequential {{c1::…}} cloze deletions.
    Returns (cloze_text_html, n_clozes)."""
    n = [0]

    def repl(m):
        n[0] += 1
        inner = html.escape(m.group(1))
        return "{{c%d::%s}}" % (n[0], inner)

    # temporarily protect bold, escape the rest, then place clozes
    parts = re.split(r"\*\*(.+?)\*\*", text)
    out = []
    ci = 0
    for i, p in enumerate(parts):
        if i % 2 == 1:  # captured bold group
            ci += 1
            out.append("{{c%d::%s}}" % (ci, html.escape(p)))
        else:
            out.append(html.escape(p))
    return "".join(out), ci


def extract(path):
    t = open(path, encoding="utf-8", errors="ignore").read()
    if not re.search(r"attested by", t, re.I):
        return None
    m = re.search(r"^#\s+(.+)$", t, re.M)
    topic = clean_md_inline(m.group(1)) if m else slug_of(path)
    one = re.search(r"\*\*In one line\*\*\s*[—-]\s*(.+)", t)
    oneliner = clean_md_inline(one.group(1)) if one else None
    pearls = []
    hp = re.search(r"\*\*High-yield pearls\*\*.*?(?=\n\n\*\*|\n\n[A-Z]|\Z)", t, re.S)
    if hp:
        for b in re.findall(r"^\s*[-*]\s+(.+)$", hp.group(0), re.M):
            pearls.append(b.strip())
    return {"path": path, "slug": slug_of(path), "topic": topic,
            "oneliner": oneliner, "pearls": pearls}


_PEARL_CARDS = None


def pearl_cards():
    """Curated cloze occlusion targets (pearl_cards.json, co-located)."""
    global _PEARL_CARDS
    if _PEARL_CARDS is None:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pearl_cards.json")
        try:
            _PEARL_CARDS = json.load(open(p, encoding="utf-8"))
        except Exception:
            _PEARL_CARDS = {}
    return _PEARL_CARDS


def _strip_links(s):
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)   # [text](url) -> text
    s = re.sub(r"</?[^>]+>", "", s)                   # stray html
    return s


def occlude(text, targets):
    """text = de-bolded pearl. Wrap each found target (first occurrence, left-to-right,
    non-overlapping) as a sequential cloze deletion. Targets that don't appear verbatim
    are skipped (drift guard). Returns (cloze_html, n_clozes)."""
    marks = []
    for t in targets:
        idx = text.find(t)
        if idx >= 0:
            marks.append((idx, idx + len(t), t))
    if not marks:
        return None, 0
    marks.sort()
    out, cur, ci = [], 0, 0
    for (s, e, t) in marks:
        if s < cur:
            continue  # overlaps a prior target — skip
        out.append(html.escape(_strip_links(text[cur:s])))
        ci += 1
        out.append("{{c%d::%s}}" % (ci, html.escape(t)))
        cur = e
    out.append(html.escape(_strip_links(text[cur:])))
    return "".join(out), ci


def build_deck(repo, deck_id=DECK_ID, deck_name=DECK_NAME):
    """Build (and return) the concepts genanki.Deck plus a stats dict.
    Importable by export_anki_all.py so the combined package reuses this logic."""
    files = []
    for root in CONTENT_ROOTS:
        files += glob.glob(os.path.join(repo, root, "**", "*.md"), recursive=True)

    deck = genanki.Deck(deck_id, deck_name)
    n_one = n_cloze = n_basic = n_files = 0
    for path in sorted(files):
        rec = extract(path)
        if not rec or (not rec["oneliner"] and not rec["pearls"]):
            continue
        n_files += 1
        base_tags = ["PsychClerkship", "Deck::Concepts",
                     f"Source::{rec['slug']}", "Status::attested"]
        src = f"Source: {rec['slug']}.md · attested (Moss)"

        if rec["oneliner"]:
            deck.add_note(genanki.Note(
                model=BASIC_MODEL,
                fields=[rec["slug"] + "::oneline",
                        html.escape(rec["topic"]),
                        "In one line?",
                        html.escape(rec["oneliner"]), src],
                tags=base_tags + ["Type::summary"],
                guid=guid(rec["slug"], "oneline", rec["oneliner"]),
            ))
            n_one += 1

        cur_targets = pearl_cards().get(rec["slug"]) or []
        for idx, pearl in enumerate(rec["pearls"]):
            debolded = pearl.replace("**", "")
            gk = guid(rec["slug"], "pearl", debolded)
            uid = f"{rec['slug']}::pearl{idx + 1}"
            tlist = cur_targets[idx] if idx < len(cur_targets) else []
            text, nfound = (occlude(debolded, tlist) if tlist else (None, 0))
            if not nfound and re.search(r"\*\*.+?\*\*", pearl):
                text, nfound = bold_to_cloze(pearl)   # fallback: author-bolded terms
            if nfound:
                deck.add_note(genanki.Note(
                    model=CLOZE_MODEL,
                    fields=[uid, html.escape(rec["topic"]), text, src],
                    tags=base_tags + ["Type::pearl", "Format::cloze"],
                    guid=gk))
                n_cloze += 1
            else:
                # fallback (should be rare — curated map covers all attested pearls)
                deck.add_note(genanki.Note(
                    model=BASIC_MODEL,
                    fields=[uid, html.escape(rec["topic"]),
                            "Recall the key point:",
                            html.escape(_strip_links(debolded)), src],
                    tags=base_tags + ["Type::pearl", "Format::basic"],
                    guid=gk))
                n_basic += 1

    stats = {"pages": n_files, "summary": n_one, "cloze": n_cloze,
             "basic": n_basic, "total": n_one + n_cloze + n_basic}
    return deck, stats


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", ".."))
    ap.add_argument("--out", default=os.path.join(repo, "09_Exam_Prep", "anki_export"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    deck, s = build_deck(repo)
    apkg = os.path.join(args.out, "psychiatry_clerkship_concepts.apkg")
    genanki.Package(deck).write_to_file(apkg)
    print(f"Attested content pages used: {s['pages']}")
    print(f"  summary cards:      {s['summary']}")
    print(f"  pearl cloze cards:  {s['cloze']}  (curated occlusions + author-bolded fallback)")
    print(f"  pearl basic cards:  {s['basic']}  (fallback — should be 0)")
    print(f"  TOTAL concept cards:{s['total']}")
    print(f"  .apkg: {apkg}")


if __name__ == "__main__":
    main()
