# Anki Export — Psychiatry Clerkship Library

Two complementary decks, both built **only from attested content**:

| Deck | Source | Builder | Cards |
|---|---|---|---|
| **Question Bank** (vignette layer) | `question_bank.json` | `export_anki.py` | 143 attested items → 168 cards |
| **Concepts** (fact layer) | attested topic pages (`03_/04_/05_/…`) | `export_anki_content.py` | 141 cards (21 summaries · 17 cloze · 103 pearls) |

## Files
- `psychiatry_clerkship_library_ALL.apkg` — **recommended for students: one import → both subdecks** (`Psychiatry Clerkship Library (Moss)::Question Bank` + `::Concepts`).
- `psychiatry_clerkship_library.apkg` — vignette deck only (Q-bank).
- `psychiatry_clerkship_library.csv` — flat fallback for the Q-bank.
- `psychiatry_clerkship_concepts.apkg` — concepts deck only (pearls + one-liners).

## Rebuild
```bash
pip install genanki
python3 13_Faculty_Resources/_automation/site_build/export_anki.py                  # Q-bank, attested-only
python3 13_Faculty_Resources/_automation/site_build/export_anki.py --include-drafts # + watermarked drafts
python3 13_Faculty_Resources/_automation/site_build/export_anki_content.py          # concepts (attested pages)
python3 13_Faculty_Resources/_automation/site_build/export_anki_all.py              # combined subdeck package
# or all of the above + stage into a site output dir:
bash    13_Faculty_Resources/_automation/site_build/build_anki.sh [OUT_DIR]
```

## Auto-regeneration on the live sites
`build_and_check.sh` (the Netlify build command for both sites) calls `build_anki.sh`
**after** the QA gate, which regenerates all three `.apkg` and copies them to
`<published>/anki/` for download. It is **fail-soft**: it never exits non-zero, so a
missing `genanki` on Netlify's build image can't break a deploy — it falls back to the
`.apkg` committed here. Practically: regenerate + commit locally/in CI (where `genanki`
is installed); Netlify then just serves the committed decks. Because staging happens
after `check-static-site.mjs`, the `anki/` folder is invisible to the QA harness.

## Concepts deck — how cards are made (no LLM generation)
Cards are **extracted** from already-attested structured elements, never synthesized from prose — so every card stays inside the platform's attestation chain. A page contributes cards only if it carries the "attested by …" review line.
- **"In one line — …"** → one Basic summary card per topic.
- **"High-yield pearls"** bullets → **cloze** cards. The occlusion target (the clinical term blanked out) is curated per pearl in `pearl_cards.json` — the deletion is chosen editorially so every front is a real recall prompt (e.g. "___, not hypnotics, is first-line for chronic insomnia"), never a generic "pearl #N". Multiple targets on one pearl → multiple cloze cards. Only *occlusion of attested text* is allowed: the builder skips any target not found verbatim in the pearl (drift guard) and falls back to author-bolded terms, then a plain recall card. To re-curate, edit `pearl_cards.json` (index-aligned to each page's pearl bullets) and rebuild.
- Tags: `Deck::Concepts`, `Source::<page>`, `Type::summary|pearl`, `Format::cloze|basic`, `Status::attested`.
- Stable GUIDs = source slug + hash of card text: unrelated edits don't churn review history; a deliberate reword mints a fresh card.

To expand the concepts deck, add an `attested by …` line + a "High-yield pearls" / "In one line" section to more topic pages, then rerun the builder.

## What's in it
- **Attested-only by default** — the same gate the SPA enforces via `reviewed.json`. Draft items are excluded unless you pass `--include-drafts`, which title-prefixes them `[DRAFT — NOT ATTESTED]` and tags them `Status::draft`.
- **Vignette Basic (Q/A) cards** — front shows the stem + lettered options (no answer leak); back shows the best answer, trap notes per distractor, the `why` explanation, the `pearl`, the evidence cite, and a link back to the source page/tool.
- **Two-tier items emit two chained cards** — the tier-1 management card and a tier-2 mechanism card (`<id>::t2`).
- **Stable GUIDs keyed on item id** — re-importing an updated deck **updates** existing cards and preserves each learner's review history; it does not create duplicates. Never renumber item ids (per `question_bank.schema.json`).

## Tags (AnKing-style `::` hierarchy → drives the suspend/unsuspend workflow)
- `Psychiatry::<category>` — mood, psychosis, anxiety, substance, personality, neurocog, safety, pharm, childdev, ethics, otherdx, relational
- `Competency::<c>` · `Difficulty::<1-3>` · `Type::<sba|two-tier|relational>`
- `Source::<page>` (e.g. `Source::t_sud`) · `HighYield` · `Status::attested|draft` · `Tier2::mechanism`

**Recommended student workflow:** import, suspend everything, then unsuspend by week/topic tag as the rotation covers each block (cap ~20–30 new/day).

## Current export
- Bank: 192 items (143 attested / 49 draft)
- Default deck: 143 attested items → 168 cards (two-tier items add a second card)

_Joshua Moss, MD | Psychiatrist_
